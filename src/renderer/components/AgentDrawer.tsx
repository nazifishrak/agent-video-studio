import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import {
  ExternalLink,
  Maximize2,
  Minimize2,
  Minus,
  RotateCw,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useStudioStore } from '../store/studioStore';
import type { HarnessInfo } from '../types';

export const AgentDrawer: React.FC = () => {
  const {
    agentDrawerOpen,
    setAgentDrawerOpen,
    setTerminalSessionActive,
    contextChips,
    removeContextChip,
    clearContextChips,
    activeProjectSlug,
    activeVault,
    uiTheme,
  } = useStudioStore();

  const [wide, setWide] = useState(false);
  const [harness, setHarness] = useState<HarnessInfo | null>(null);
  const [ptyBackend, setPtyBackend] = useState<'native-pty' | 'python-pty' | null>(null);
  const [sessionMounted, setSessionMounted] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const webglRef = useRef<WebglAddon | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const startedVaultRef = useRef<string | null>(null);
  const activeSessionIdRef = useRef<number | null>(null);
  const nextSessionIdRef = useRef(1);
  const themeRef = useRef(uiTheme);
  themeRef.current = uiTheme;
  const drawerOpenRef = useRef(agentDrawerOpen);
  drawerOpenRef.current = agentDrawerOpen;

  const getXtermTheme = (mode: 'dark' | 'light') =>
    mode === 'dark'
      ? {
          background: '#090B0A',
          foreground: '#F4F7F5',
          cursor: '#C4FF2E',
          cursorAccent: '#090B0A',
          selectionBackground: 'rgba(196, 255, 46, 0.25)',
          black: '#141816',
          green: '#00D4AA',
          brightGreen: '#C4FF2E',
          blue: '#2E6BFF',
          brightBlue: '#60A5FA',
        }
      : {
          background: '#F6F9F4',
          foreground: '#0F1410',
          cursor: '#0F1410',
          cursorAccent: '#F6F9F4',
          selectionBackground: 'rgba(36, 88, 230, 0.2)',
          black: '#0F1410',
          green: '#00A887',
          brightGreen: '#00A887',
          blue: '#2458E6',
          brightBlue: '#2458E6',
        };

  const launchTerminal = async (initialCommand?: string): Promise<number | null> => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit || !activeVault) return null;
    term.reset();
    fit.fit();
    const sessionId = nextSessionIdRef.current++;
    activeSessionIdRef.current = sessionId;
    startedVaultRef.current = activeVault;

    const res = await window.studio.terminalStart({
      sessionId,
      cols: term.cols || 80,
      rows: term.rows || 24,
      initialCommand,
    });
    if (activeSessionIdRef.current === sessionId) {
      setHarness(res.harness);
      setPtyBackend(res.backend ?? null);
      setTerminalSessionActive(true);
      requestAnimationFrame(() => {
        if (!drawerOpenRef.current) return;
        fit.fit();
        window.studio.terminalResize(term.cols, term.rows);
      });
      term.focus();
    }
    return sessionId;
  };

  const quitTerminalSession = (closeDrawer = true) => {
    const sid = activeSessionIdRef.current;
    activeSessionIdRef.current = null;
    startedVaultRef.current = null;

    cleanupRef.current?.();
    cleanupRef.current = null;

    webglRef.current?.dispose();
    webglRef.current = null;

    termRef.current?.dispose();
    termRef.current = null;
    fitRef.current = null;

    setPtyBackend(null);
    setSessionMounted(false);
    setTerminalSessionActive(false);

    if (sid !== null) {
      void window.studio.terminalStop(sid);
    }
    if (closeDrawer) {
      setAgentDrawerOpen(false);
    }
  };

  const quitSessionRef = useRef(quitTerminalSession);
  quitSessionRef.current = quitTerminalSession;

  // Clean up PTY only when the whole app/drawer component unmounts
  useEffect(() => {
    return () => {
      quitSessionRef.current(false);
    };
  }, []);

  // Lazily create the terminal on first open; keep it alive when minimized
  useEffect(() => {
    if (!agentDrawerOpen) return;

    if (termRef.current && fitRef.current) {
      requestAnimationFrame(() => {
        const container = containerRef.current;
        if (!container || container.clientWidth < 40 || container.clientHeight < 40) return;
        fitRef.current?.fit();
        if (termRef.current) {
          window.studio.terminalResize(termRef.current.cols, termRef.current.rows);
          termRef.current.focus();
        }
      });
      return;
    }

    if (!containerRef.current) return;

    let cancelled = false;
    const term = new Terminal({
      allowProposedApi: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 12.5,
      lineHeight: 1.28,
      cursorBlink: true,
      scrollback: 5000,
      smoothScrollDuration: 0,
      theme: getXtermTheme(uiTheme),
    });
    const fit = new FitAddon();
    const unicode11 = new Unicode11Addon();
    const webLinks = new WebLinksAddon((_, uri) => {
      void window.studio.openExternalUrl(uri);
    });
    term.loadAddon(fit);
    term.loadAddon(unicode11);
    term.unicode.activeVersion = '11';
    term.loadAddon(webLinks);
    term.open(containerRef.current);

    let webgl: WebglAddon | null = null;
    try {
      webgl = new WebglAddon();
      webgl.onContextLoss(() => {
        webgl?.dispose();
        webgl = null;
        webglRef.current = null;
      });
      term.loadAddon(webgl);
    } catch {
      webgl = null;
    }

    fit.fit();

    termRef.current = term;
    fitRef.current = fit;
    webglRef.current = webgl;
    setSessionMounted(true);

    // Reply to OSC 10 (foreground) & OSC 11 (background) color queries from TUI agents
    const osc10 = term.parser.registerOscHandler(10, (data) => {
      if (data === '?') {
        const fg = themeRef.current === 'dark' ? 'rgb:f4f4/f7f7/f5f5' : 'rgb:0f0f/1414/1010';
        window.studio.terminalWrite(`\x1b]10;${fg}\x1b\\`);
        return true;
      }
      return false;
    });

    const osc11 = term.parser.registerOscHandler(11, (data) => {
      if (data === '?') {
        const bg = themeRef.current === 'dark' ? 'rgb:0909/0b0b/0a0a' : 'rgb:f6f6/f9f9/f4f4';
        window.studio.terminalWrite(`\x1b]11;${bg}\x1b\\`);
        return true;
      }
      return false;
    });

    const onInput = term.onData((data) => {
      window.studio.terminalWrite(data);
    });

    const offData = window.studio.onTerminalData((data) => {
      term.write(data);
    });

    const offExit = window.studio.onTerminalExit((code) => {
      term.writeln(`\r\n[Session exited with code ${code ?? 'null'}]`);
      setTerminalSessionActive(false);
    });

    const resizeObs = new ResizeObserver(() => {
      const el = containerRef.current;
      if (!drawerOpenRef.current || !el || el.clientWidth < 40 || el.clientHeight < 40) {
        return;
      }
      try {
        fit.fit();
        window.studio.terminalResize(term.cols, term.rows);
      } catch {
        // Ignore resize when unmounting
      }
    });
    resizeObs.observe(containerRef.current);

    cleanupRef.current = () => {
      resizeObs.disconnect();
      osc10.dispose();
      osc11.dispose();
      onInput.dispose();
      offData();
      offExit();
    };

    if (activeVault) {
      const sid = nextSessionIdRef.current++;
      activeSessionIdRef.current = sid;
      startedVaultRef.current = activeVault;
      void window.studio
        .terminalStart({
          sessionId: sid,
          cols: term.cols || 80,
          rows: term.rows || 24,
        })
        .then((res) => {
          if (!cancelled && activeSessionIdRef.current === sid) {
            setHarness(res.harness);
            setPtyBackend(res.backend ?? null);
            setTerminalSessionActive(true);
            requestAnimationFrame(() => {
              if (!drawerOpenRef.current) return;
              fit.fit();
              window.studio.terminalResize(term.cols, term.rows);
            });
            term.focus();
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [agentDrawerOpen]);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = getXtermTheme(uiTheme);
    }
  }, [uiTheme]);

  useEffect(() => {
    if (
      agentDrawerOpen &&
      termRef.current &&
      activeVault &&
      startedVaultRef.current !== activeVault
    ) {
      void launchTerminal();
    }
  }, [activeVault, agentDrawerOpen]);

  if (!agentDrawerOpen && !sessionMounted) return null;

  const formatPinsPrompt = () => {
    if (contextChips.length === 0) return '';
    const parts = contextChips.map((c) => {
      if (c.kind === 'time-range') {
        const at = typeof c.payload.atSec === 'number' ? `${c.payload.atSec}s` : '';
        return `In project "${c.payload.projectSlug}" at ${at}`;
      }
      if (c.kind === 'review-note') {
        return `Review note on "${c.payload.projectSlug}" at ${c.payload.atSec}s: "${c.payload.text}"`;
      }
      if (c.kind === 'motion-scene') {
        return `Motion scene "${c.payload.sceneId}" (${c.payload.name})`;
      }
      return `${c.label}: ${JSON.stringify(c.payload)}`;
    });
    const prefix = activeProjectSlug ? `[Project: ${activeProjectSlug}] ` : '';
    return `${prefix}${parts.join(' | ')}`;
  };

  const handleSendPins = () => {
    const prompt = formatPinsPrompt();
    if (!prompt) return;
    window.studio.terminalWrite(`${prompt} `);
    clearContextChips();
    termRef.current?.focus();
  };

  const vaultName = activeVault ? activeVault.split('/').filter(Boolean).pop() : 'No Vault';

  return (
    <aside
      className={`${agentDrawerOpen ? 'flex' : 'hidden'} ${wide ? 'w-[780px]' : 'w-[540px]'} shrink-0 border-l flex-col h-full transition-all duration-150`}
      style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
    >
      {/* Header */}
      <div
        className="px-4 py-2.5 border-b flex items-center justify-between gap-2"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <div className="min-w-0">
          <div className="caption-label">TERMINAL</div>
          <div
            className="text-xs font-semibold truncate mt-0.5"
            title={
              harness
                ? `Harness: ${harness.harnessDir}\nVault: ${harness.vaultRoot}${ptyBackend ? `\nBackend: ${ptyBackend}` : ''}`
                : activeVault ?? ''
            }
          >
            Skills Harness · Vault: {vaultName}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => void window.studio.openInExternalTerminal()}
            className="btn-icon w-7 h-7"
            title="Open Harness in External Terminal (Ghostty / Alacritty / iTerm / Terminal)"
          >
            <ExternalLink size={13} />
          </button>
          <button
            onClick={() => void launchTerminal()}
            className="btn-icon w-7 h-7"
            title="Restart Shell"
          >
            <RotateCw size={13} />
          </button>
          <button
            onClick={() => setWide(!wide)}
            className="btn-icon w-7 h-7"
            title={wide ? 'Compact Drawer' : 'Expand Drawer'}
          >
            {wide ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            onClick={() => setAgentDrawerOpen(false)}
            className="btn-icon w-7 h-7"
            title="Minimize Terminal (keeps session running)"
          >
            <Minus size={13} />
          </button>
          <button
            onClick={() => quitTerminalSession(true)}
            className="btn-icon w-7 h-7"
            title="Quit Terminal Session"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Pinned Context Chips (when present) */}
      {contextChips.length > 0 && (
        <div
          className="px-3.5 py-2 border-b space-y-2"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="caption-label">PINNED CONTEXT ({contextChips.length})</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleSendPins}
                className="btn-primary flex items-center gap-1 px-2.5 py-0.5 text-[11px]"
              >
                <Send size={10} /> Send to Terminal
              </button>
              <button
                onClick={clearContextChips}
                className="btn-secondary flex items-center gap-1 px-2 py-0.5 text-[11px]"
              >
                <Trash2 size={10} /> Clear
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {contextChips.map((chip) => (
              <span
                key={chip.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium"
                style={{
                  backgroundColor: 'var(--accent-blue)',
                  color: 'var(--accent-blue-ink)',
                }}
              >
                <span className="truncate max-w-[180px]">{chip.label}</span>
                <button onClick={() => removeContextChip(chip.id)} className="cursor-pointer">
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Real xterm.js GPU WebGL Canvas */}
      <div
        onClick={() => termRef.current?.focus()}
        className="flex-1 min-h-0 p-2 overflow-hidden cursor-text"
        style={{ backgroundColor: uiTheme === 'dark' ? '#090B0A' : '#F6F9F4' }}
      >
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </aside>
  );
};
