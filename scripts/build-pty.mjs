import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const srcPath = path.join(rootDir, 'native', 'pty-helper.c');
const outDir = path.join(rootDir, 'dist', 'main');
const outPath = path.join(outDir, 'pty-helper');

if (process.platform === 'win32') {
  console.log('[build:pty] Windows detected — skipping POSIX pty-helper.');
  process.exit(0);
}

try {
  fs.mkdirSync(outDir, { recursive: true });
  const args = ['-O2', '-Wall', '-Wextra', srcPath, '-o', outPath];
  if (process.platform === 'linux') {
    args.push('-lutil');
  }
  execFileSync('cc', args, { stdio: 'inherit' });
  fs.chmodSync(outPath, 0o755);
  console.log(`[build:pty] Compiled native PTY helper -> ${path.relative(rootDir, outPath)}`);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.warn(`[build:pty] Warning: native pty-helper build failed (${msg}); Python PTY fallback will be used.`);
}
