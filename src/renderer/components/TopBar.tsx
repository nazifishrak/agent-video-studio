import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileText,
  Film,
  FolderOpen,
  Moon,
  Plug,
  Sun,
  Terminal,
  X,
} from 'lucide-react';
import { StudioTab, useStudioStore } from '../store/studioStore';
import { buildUnifiedVideos, findActiveUnifiedVideo } from '../utils/unifiedVideos';

const TABS: Array<{ id: StudioTab; label: string; icon: React.ReactNode }> = [
  { id: 'planner', label: 'Plan', icon: <FileText size={14} /> },
  { id: 'editor', label: 'Edit', icon: <Film size={14} /> },
];

export const TopBar: React.FC = () => {
  const {
    activeVault,
    activeTab,
    setActiveTab,
    uiTheme,
    setUiTheme,
    ideas,
    projects,
    activeVideoKey,
    activeProjectSlug,
    selectedIdeaSlug,
    selectProject,
    selectVideo,
    openActiveVideoInEdit,
    contextChips,
    agentDrawerOpen,
    setAgentDrawerOpen,
    terminalSessionActive,
    setMcpModalOpen,
    setOnboardingOpen,
    setExportModalOpen,
    liveSyncNotice,
    setLiveSyncNotice,
    currentTimeSec,
  } = useStudioStore();

  const [copiedCtx, setCopiedCtx] = useState(false);

  const vaultName = activeVault ? activeVault.split('/').filter(Boolean).pop() : 'No Vault';

  const unifiedVideos = useMemo(() => buildUnifiedVideos(ideas, projects), [ideas, projects]);
  const activeVideo = useMemo(
    () => findActiveUnifiedVideo(unifiedVideos, activeVideoKey, activeProjectSlug, selectedIdeaSlug),
    [unifiedVideos, activeVideoKey, activeProjectSlug, selectedIdeaSlug]
  );

  const handleCopyContext = () => {
    const text = activeProjectSlug
      ? `Active Studio Video: "${activeProjectSlug}" @ ${currentTimeSec.toFixed(1)}s (Vault: ${activeVault ?? ''})`
      : activeVideo
        ? `Active Studio Video Plan: "${activeVideo.title}" (Vault: ${activeVault ?? ''})`
        : `Active Studio Vault: ${activeVault ?? ''}`;
    void navigator.clipboard.writeText(text);
    setCopiedCtx(true);
    setTimeout(() => setCopiedCtx(false), 1800);
  };

  return (
    <header
      className="drag-region h-14 shrink-0 flex items-center justify-between gap-2 px-4 border-b overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
        paddingLeft: navigator.platform.toLowerCase().includes('mac') ? '84px' : '16px',
      }}
    >
      <div className="no-drag flex items-center gap-2.5 min-w-0">
        <button
          onClick={() => setOnboardingOpen(true)}
          className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs max-w-[160px]"
          title={activeVault ?? 'Open Vault'}
        >
          <FolderOpen size={13} className="shrink-0" />
          <span className="truncate">{vaultName}</span>
        </button>

        <nav className="flex items-center gap-1 shrink-0">
          {TABS.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  if (t.id === 'editor') {
                    void openActiveVideoInEdit();
                  } else {
                    setActiveTab(t.id);
                  }
                }}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs ${
                  active ? 'pill-tab-active' : 'pill-tab'
                }`}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="no-drag flex items-center gap-1.5 min-w-0 shrink">
        {unifiedVideos.length > 0 && (
          <select
            value={activeVideo?.key ?? ''}
            onChange={(e) => {
              const chosen = unifiedVideos.find((v) => v.key === e.target.value);
              if (!chosen) return;
              if (activeTab === 'editor') {
                void openActiveVideoInEdit({
                  projectSlug: chosen.projectSlug,
                  ideaSlug: chosen.ideaSlug,
                });
              } else {
                void selectVideo({
                  projectSlug: chosen.projectSlug,
                  ideaSlug: chosen.ideaSlug,
                });
              }
            }}
            className="btn-secondary px-2.5 py-1.5 text-xs outline-none min-w-[100px] max-w-[200px] truncate"
            title="Switch Active Video"
          >
            {unifiedVideos.map((v) => (
              <option key={v.key} value={v.key}>
                {v.title}
              </option>
            ))}
          </select>
        )}

        {(activeProjectSlug || activeVideo) && (
          <button
            onClick={handleCopyContext}
            className="btn-secondary flex items-center gap-1 px-2.5 py-1.5 text-[11px] shrink-0"
            title="Live context synced to terminal agents — click to copy active video reference"
          >
            {copiedCtx ? <Check size={12} style={{ color: 'var(--accent-mint)' }} /> : <Copy size={12} />}
            <span className="hidden xl:inline">{copiedCtx ? 'Copied' : 'Live Sync'}</span>
          </button>
        )}

        {liveSyncNotice && (
          <div
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border max-w-[240px] shrink-0"
            style={{
              backgroundColor: 'var(--bg-surface-alt)',
              borderColor: 'var(--accent-mint)',
              color: 'var(--text-primary)',
            }}
          >
            <span className="truncate">{liveSyncNotice.message}</span>
            {liveSyncNotice.projectSlug && liveSyncNotice.projectSlug !== activeProjectSlug && (
              <button
                onClick={() => {
                  void selectProject(liveSyncNotice.projectSlug!);
                  setActiveTab('editor');
                  setLiveSyncNotice(null);
                }}
                className="underline font-semibold shrink-0"
                style={{ color: 'var(--accent-mint)' }}
              >
                Open
              </button>
            )}
            <button onClick={() => setLiveSyncNotice(null)} className="opacity-70 hover:opacity-100 shrink-0">
              <X size={11} />
            </button>
          </div>
        )}

        {activeProjectSlug && (
          <button
            onClick={() => setExportModalOpen(true)}
            className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs shrink-0"
            title="Render & Export Video"
          >
            <Download size={13} />
            <span className="hidden md:inline">Export</span>
          </button>
        )}

        <button
          onClick={() => setMcpModalOpen(true)}
          className="btn-secondary flex items-center gap-1.5 px-2.5 py-1.5 text-xs shrink-0"
          title="Connect MCP Clients"
        >
          <Plug size={13} />
          <span className="hidden lg:inline">MCP</span>
        </button>

        <button
          onClick={() => setAgentDrawerOpen(!agentDrawerOpen)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs shrink-0 ${
            agentDrawerOpen ? 'pill-tab-active' : 'btn-secondary'
          }`}
          title={
            terminalSessionActive && !agentDrawerOpen
              ? 'Resume running terminal session'
              : 'Toggle Terminal'
          }
        >
          <Terminal size={13} />
          <span className="hidden md:inline">Terminal</span>
          {terminalSessionActive && !agentDrawerOpen && (
            <span
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: uiTheme === 'dark' ? '#C4FF2E' : '#00A887',
              }}
            />
          )}
          {contextChips.length > 0 && (
            <span
              className="px-1.5 py-0.5 rounded-full caption-label t-num"
              style={{
                backgroundColor: agentDrawerOpen ? 'var(--bg-canvas)' : 'var(--accent-blue)',
                color: agentDrawerOpen ? 'var(--text-primary)' : 'var(--accent-blue-ink)',
              }}
            >
              {contextChips.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setUiTheme(uiTheme === 'dark' ? 'light' : 'dark')}
          className="btn-icon w-8 h-8 shrink-0"
          title="Toggle Studio Dark / Editorial Light"
        >
          {uiTheme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>
    </header>
  );
};
