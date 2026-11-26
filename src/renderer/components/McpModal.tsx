import React, { useEffect, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { useStudioStore } from '../store/studioStore';

export const McpModal: React.FC = () => {
  const { mcpModalOpen, setMcpModalOpen, activeVault } = useStudioStore();
  const [info, setInfo] = useState<{ serverScript: string; vaultRoot: string; nodeBin: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!mcpModalOpen) return;
    void window.studio.getMcpConfigInfo().then(setInfo);
  }, [mcpModalOpen, activeVault]);

  if (!mcpModalOpen) return null;

  const scriptPath = info?.serverScript ?? '/path/to/studio-app/dist/mcp/server.js';
  const vaultPath = info?.vaultRoot || activeVault || '/path/to/vault';

  const claudeCmd = `claude mcp add agent-video-studio -- node "${scriptPath}" --vault "${vaultPath}"`;
  const mcpJson = JSON.stringify(
    {
      mcpServers: {
        'agent-video-studio': {
          command: 'node',
          args: [scriptPath, '--vault', vaultPath],
        },
      },
    },
    null,
    2
  );

  const copy = (key: string, text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1600);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'var(--overlay-scrim)' }}
    >
      <div
        className="w-full max-w-2xl rounded-3xl border overflow-hidden"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="p-6 border-b" style={{ backgroundColor: 'var(--bg-surface-alt)', borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="eyebrow-label">MODEL CONTEXT PROTOCOL</div>
              <h2 className="display-editorial text-2xl">Connect Any AI Agent</h2>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Claude Code, Antigravity, Codex, and Cursor can drive your live studio with transactional undo.
              </p>
            </div>
            <button onClick={() => setMcpModalOpen(false)} className="btn-icon w-9 h-9 shrink-0">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div
            className="rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-3"
            style={{ backgroundColor: 'var(--bg-surface-alt)', borderColor: 'var(--border-subtle)' }}
          >
            <div className="space-y-0.5">
              <div className="caption-label">ONE-COMMAND SETUP</div>
              <div className="text-sm font-semibold">Register directly with Claude Code CLI</div>
            </div>
            <button
              onClick={() => copy('claude', claudeCmd)}
              className="btn-primary flex items-center gap-1.5 px-4 py-2 text-xs"
            >
              {copiedKey === 'claude' ? <Check size={13} /> : <Copy size={13} />}
              <span>{copiedKey === 'claude' ? 'Copied Command' : 'Copy CLI Command'}</span>
            </button>
          </div>

          <pre
            className="p-3.5 rounded-xl border text-xs overflow-x-auto select-all"
            style={{
              backgroundColor: 'var(--bg-canvas)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            {claudeCmd}
          </pre>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="caption-label">ANTIGRAVITY / CODEX / CURSOR JSON</span>
              <button
                onClick={() => copy('json', mcpJson)}
                className="btn-secondary flex items-center gap-1.5 px-3 py-1 text-xs"
              >
                {copiedKey === 'json' ? <Check size={12} /> : <Copy size={12} />}
                <span>{copiedKey === 'json' ? 'Copied' : 'Copy JSON'}</span>
              </button>
            </div>
            <pre
              className="p-3.5 rounded-xl border text-xs overflow-x-auto select-all"
              style={{
                backgroundColor: 'var(--bg-canvas)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              {mcpJson}
            </pre>
          </div>

          <div className="caption-label leading-relaxed">
            TOOLS: get_vault_overview · list_ideas · create_project_from_idea · search_motion_scenes · create_custom_motion_scene · update_brand_tokens · begin_project_edit · apply_timeline_ops · commit_project_edit · undo_last_project_edit
          </div>
        </div>
      </div>
    </div>
  );
};
