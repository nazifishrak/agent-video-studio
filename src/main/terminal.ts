import { ChildProcess, spawn } from 'node:child_process';
import fsSync from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

export type TerminalBackend = 'native-pty' | 'python-pty';

export interface TerminalStartOptions {
  sessionId: number;
  cwd: string;
  cols: number;
  rows: number;
  env?: Record<string, string>;
  initialCommand?: string;
  onData: (data: string) => void;
  onExit: (code: number | null) => void;
}

const PTY_BRIDGE_SCRIPT = `
import errno, fcntl, json, os, pty, select, signal, struct, sys, termios

cwd = sys.argv[1]
cols = int(sys.argv[2])
rows = int(sys.argv[3])
shell = os.environ.get("SHELL") or "/bin/zsh"

ctrl_fd = 3
stdin_fd = 0
stdout_fd = 1

pid, master_fd = pty.fork()
if pid == 0:
    try:
        os.close(ctrl_fd)
    except OSError:
        pass
    os.chdir(cwd)
    os.execvpe(shell, [shell, "-l"], os.environ)

def set_winsize(r, c):
    try:
        fcntl.ioctl(master_fd, termios.TIOCSWINSZ, struct.pack("HHHH", r, c, 0, 0))
    except OSError:
        pass
    try:
        fg_pgrp = os.tcgetpgrp(master_fd)
        if fg_pgrp > 0:
            os.killpg(fg_pgrp, signal.SIGWINCH)
    except OSError:
        try:
            os.kill(pid, signal.SIGWINCH)
        except OSError:
            pass

set_winsize(rows, cols)

os.set_blocking(master_fd, False)
os.set_blocking(stdin_fd, False)
os.set_blocking(ctrl_fd, False)

def write_all(fd, data):
    view = memoryview(data)
    total = 0
    while total < len(view):
        try:
            written = os.write(fd, view[total:])
            if written <= 0:
                return False
            total += written
        except BlockingIOError:
            select.select([], [fd], [], 0.1)
        except OSError as e:
            if e.errno in (errno.EAGAIN, errno.EWOULDBLOCK):
                select.select([], [fd], [], 0.1)
                continue
            return False
    return True

ctrl_buf = b""
while True:
    try:
        rlist, _, _ = select.select([master_fd, stdin_fd, ctrl_fd], [], [], 0.25)
    except (OSError, ValueError):
        break

    if master_fd in rlist:
        try:
            data = os.read(master_fd, 32768)
            if not data:
                break
            if not write_all(stdout_fd, data):
                break
        except BlockingIOError:
            pass
        except OSError as e:
            if e.errno not in (errno.EAGAIN, errno.EWOULDBLOCK):
                break

    if stdin_fd in rlist:
        try:
            inp = os.read(stdin_fd, 32768)
            if not inp:
                break
            if not write_all(master_fd, inp):
                break
        except BlockingIOError:
            pass
        except OSError as e:
            if e.errno not in (errno.EAGAIN, errno.EWOULDBLOCK):
                break

    if ctrl_fd in rlist:
        try:
            chunk = os.read(ctrl_fd, 4096)
            if chunk:
                ctrl_buf += chunk
                while b"\\n" in ctrl_buf:
                    line, ctrl_buf = ctrl_buf.split(b"\\n", 1)
                    try:
                        parts = line.decode("utf-8").strip().split()
                        if len(parts) == 2:
                            set_winsize(int(parts[1]), int(parts[0]))
                    except Exception:
                        pass
        except BlockingIOError:
            pass
        except OSError:
            pass

    done_pid, status = os.waitpid(pid, os.WNOHANG)
    if done_pid == pid:
        code = os.waitstatus_to_exitcode(status) if hasattr(os, "waitstatus_to_exitcode") else (status >> 8)
        sys.exit(code)

try:
    os.kill(pid, signal.SIGTERM)
except OSError:
    pass
`;

const STRIP_ENV_KEYS = [
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'ANTIGRAVITY_AGENT',
  'ANTIGRAVITY_CONVERSATION_ID',
  'ANTIGRAVITY_TRAJECTORY_ID',
  'ANTIGRAVITY_SOURCE_METADATA',
  'ANTIGRAVITY_CSRF_TOKEN',
  'ANTIGRAVITY_LS_ADDRESS',
];

function resolveNativePtyHelper(): string | null {
  const candidates = [
    path.resolve(__dirname, 'pty-helper'),
    path.resolve(process.cwd(), 'dist', 'main', 'pty-helper'),
  ];
  for (const bin of candidates) {
    try {
      fsSync.accessSync(bin, fsSync.constants.X_OK);
      return bin;
    } catch {
      // Try next candidate
    }
  }
  return null;
}

function resolvePythonBin(): string {
  const candidates = ['/usr/bin/python3', '/opt/homebrew/bin/python3', '/usr/local/bin/python3'];
  for (const c of candidates) {
    if (fsSync.existsSync(c)) return c;
  }
  return 'python3';
}

function buildCleanEnv(extraEnv?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !STRIP_ENV_KEYS.includes(k)) {
      env[k] = v;
    }
  }
  const extraPath = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];
  const current = (env.PATH ?? '').split(':').filter(Boolean);
  for (const dir of extraPath) {
    if (!current.includes(dir)) current.push(dir);
  }
  env.PATH = current.join(':');
  env.TERM = 'xterm-256color';
  env.COLORTERM = 'truecolor';
  env.TERM_PROGRAM = 'vscode';
  env.LANG = env.LANG && env.LANG !== 'C' ? env.LANG : 'en_US.UTF-8';
  env.LC_ALL = 'en_US.UTF-8';
  return { ...env, ...(extraEnv ?? {}) };
}

export class TerminalManager {
  private proc: ChildProcess | null = null;
  private ctrlStream: Writable | null = null;
  private initTimer: NodeJS.Timeout | null = null;
  private activeSessionId: number | null = null;
  private backend: TerminalBackend | null = null;

  public getBackend(): TerminalBackend | null {
    return this.backend;
  }

  public start(options: TerminalStartOptions): TerminalBackend {
    this.stop();
    this.activeSessionId = options.sessionId;

    const cols = Math.max(40, options.cols || 80);
    const rows = Math.max(12, options.rows || 24);
    const nativeHelper = resolveNativePtyHelper();
    const backend: TerminalBackend = nativeHelper ? 'native-pty' : 'python-pty';
    this.backend = backend;

    const child = nativeHelper
      ? spawn(nativeHelper, [options.cwd, String(cols), String(rows)], {
          cwd: options.cwd,
          stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
          env: buildCleanEnv(options.env),
        })
      : spawn(
          resolvePythonBin(),
          ['-u', '-c', PTY_BRIDGE_SCRIPT, options.cwd, String(cols), String(rows)],
          {
            cwd: options.cwd,
            stdio: ['pipe', 'pipe', 'pipe', 'pipe'],
            env: buildCleanEnv(options.env),
          }
        );

    this.proc = child;
    this.ctrlStream = (child.stdio[3] as Writable) ?? null;

    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');

    child.stdout?.on('data', (buf: Buffer) => {
      if (this.activeSessionId === options.sessionId) {
        const text = stdoutDecoder.write(buf);
        if (text) options.onData(text);
      }
    });

    child.stderr?.on('data', (buf: Buffer) => {
      if (this.activeSessionId === options.sessionId) {
        const text = stderrDecoder.write(buf);
        if (text) options.onData(text);
      }
    });

    child.on('error', (err) => {
      if (this.activeSessionId === options.sessionId) {
        options.onData(`\r\n[Terminal spawn error: ${err.message}]\r\n`);
      }
    });

    child.on('close', (code) => {
      if (this.proc === child) {
        this.proc = null;
        this.ctrlStream = null;
      }
      if (this.activeSessionId === options.sessionId) {
        const tail = stdoutDecoder.end() + stderrDecoder.end();
        if (tail) options.onData(tail);
        this.activeSessionId = null;
        options.onExit(code);
      }
    });

    if (options.initialCommand?.trim()) {
      const cmd = options.initialCommand.trim();
      this.initTimer = setTimeout(() => {
        if (this.proc === child && this.activeSessionId === options.sessionId) {
          this.write(`${cmd}\r`);
        }
      }, 220);
    }

    return backend;
  }

  public write(data: string): void {
    if (this.proc?.stdin && !this.proc.stdin.destroyed) {
      this.proc.stdin.write(data);
    }
  }

  public resize(cols: number, rows: number): void {
    if (this.ctrlStream && !this.ctrlStream.destroyed && cols > 0 && rows > 0) {
      this.ctrlStream.write(`${cols} ${rows}\n`);
    }
  }

  public stop(expectedSessionId?: number): void {
    if (expectedSessionId !== undefined && this.activeSessionId !== expectedSessionId) {
      return;
    }
    if (this.initTimer) {
      clearTimeout(this.initTimer);
      this.initTimer = null;
    }
    if (this.proc) {
      try {
        this.proc.kill('SIGTERM');
      } catch {
        // Ignore already exited
      }
      this.proc = null;
      this.ctrlStream = null;
    }
    this.activeSessionId = null;
    this.backend = null;
  }
}
