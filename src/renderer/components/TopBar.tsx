import React from 'react';
import {
  Download,
  Film,
  FolderOpen,
  Lightbulb,
  Moon,
  Plug,
  Sun,
  Terminal,
} from 'lucide-react';
import { StudioTab, useStudioStore } from '../store/studioStore';

const TABS: Array<{ id: StudioTab; label: string; icon: React.ReactNode }> = [
  { id: 'planner', label: 'Planner', icon: <Lightbulb size={14} /> },
  { id: 'editor', label: 'Editor', icon: <Film size={14} /> },
];

export const TopBar: React.FC = () => {
  const {
    activeVault,
    activeTab,
    setActiveTab,
    uiTheme,
    setUiTheme,
    projects,
    activeProjectSlug,
    selectProject,
    contextChips,
    agentDrawerOpen,
    setAgentDrawerOpen,
    terminalSessionActive,
    setMcpModalOpen,
    setOnboardingOpen,
    setExportModalOpen,
  } = useStudioStore();

  const vaultName = activeVault ? activeVault.split('/').filter(Boolean).pop() : 'No Vault';

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
                onClick={() => setActiveTab(t.id)}
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

      <div className="no-drag flex items-center gap-1.5 shrink-0">
        {projects.length > 0 && (
          <select
            value={activeProjectSlug ?? ''}
            onChange={(e) => {
              if (e.target.value) {
                void selectProject(e.target.value);
                setActiveTab('editor');
              }
            }}
            className="btn-secondary px-3 py-1.5 text-xs outline-none max-w-[200px] truncate"
            title="Switch Active Project"
          >
            {projects.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.title}
              </option>
            ))}
          </select>
        )}

        {activeProjectSlug && (
          <button
            onClick={() => setExportModalOpen(true)}
            className="btn-primary flex items-center gap-1.5 px-3.5 py-1.5 text-xs shrink-0"
            title="Render & Export Video"
          >
            <Download size={13} />
            <span>Export</span>
          </button>
        )}

        <button
          onClick={() => setMcpModalOpen(true)}
          className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs shrink-0"
          title="Connect MCP Clients"
        >
          <Plug size={13} />
          <span>MCP</span>
        </button>

        <button
          onClick={() => setAgentDrawerOpen(!agentDrawerOpen)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs shrink-0 ${
            agentDrawerOpen ? 'pill-tab-active' : 'btn-secondary'
          }`}
          title={
            terminalSessionActive && !agentDrawerOpen
              ? 'Resume running terminal session'
              : 'Toggle Terminal'
          }
        >
          <Terminal size={13} />
          <span>Terminal</span>
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
