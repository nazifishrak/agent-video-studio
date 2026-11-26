import React, { useEffect, useRef } from 'react';
import { useStudioStore } from './store/studioStore';
import { TopBar } from './components/TopBar';
import { OnboardingModal } from './components/OnboardingModal';
import { McpModal } from './components/McpModal';
import { ExportModal } from './components/ExportModal';
import { AgentDrawer } from './components/AgentDrawer';
import { PlannerView } from './views/PlannerView';
import { EditorView } from './views/EditorView';

export const App: React.FC = () => {
  const {
    initialized,
    activeVault,
    activeTab,
    activeProjectSlug,
    projectState,
    currentTimeSec,
    selectedItem,
    selectedIdeaSlug,
    editorLeftTab,
    contextChips,
    bootstrap,
    refreshVaultData,
    bumpMediaRevision,
    selectProject,
    setActiveTab,
    setCurrentTimeSec,
    setLiveSyncNotice,
  } = useStudioStore();

  const lastPlayheadSyncRef = useRef(0);

  useEffect(() => {
    void bootstrap();
    const offVault = window.studio.onVaultChanged((payload) => {
      void refreshVaultData();
      if (/\.(mp4|mov|webm|mkv|mp3|wav|m4a|png|jpg|jpeg|html|css|js)$/i.test(payload.path)) {
        bumpMediaRevision();
      }
    });
    const offUiCmd = window.studio.onUiCommand(async (cmd) => {
      await refreshVaultData();
      if (cmd.reloadMedia) {
        bumpMediaRevision();
      }
      const st = useStudioStore.getState();
      if (cmd.kind === 'focus_view' || cmd.kind === 'project_created') {
        if (cmd.projectSlug && cmd.projectSlug !== st.activeProjectSlug) {
          await selectProject(cmd.projectSlug);
        }
        if (cmd.tab) {
          setActiveTab(cmd.tab);
        } else if (cmd.kind === 'project_created') {
          setActiveTab('editor');
        }
        if (typeof cmd.playheadSec === 'number') {
          setCurrentTimeSec(cmd.playheadSec);
        }
      }
      if (cmd.summary) {
        setLiveSyncNotice({
          id: cmd.id,
          message: cmd.summary,
          projectSlug: cmd.projectSlug,
        });
      }
    });
    return () => {
      offVault();
      offUiCmd();
    };
  }, [bootstrap, refreshVaultData, bumpMediaRevision, selectProject, setActiveTab, setCurrentTimeSec, setLiveSyncNotice]);

  // Sync live Studio viewer state to .studio-live-context.json immediately on structural changes
  useEffect(() => {
    if (!initialized || !activeVault) return;
    void window.studio.syncStudioContext({
      activeTab,
      activeProjectSlug,
      activeProjectTitle: projectState?.manifest.title,
      aspectRatio: projectState?.manifest.aspectRatio,
      playheadSec: Number(currentTimeSec.toFixed(2)),
      selectedItem: selectedItem ? { ...selectedItem } : null,
      selectedIdeaSlug,
      editorLeftTab,
      pinnedContextChips: contextChips.map((c) => ({
        kind: c.kind,
        label: c.label,
        payload: c.payload,
      })),
    });
  }, [
    initialized,
    activeVault,
    activeTab,
    activeProjectSlug,
    projectState?.manifest.title,
    projectState?.manifest.aspectRatio,
    selectedItem,
    selectedIdeaSlug,
    editorLeftTab,
    contextChips,
  ]);

  // Throttled playhead sync (~350ms) during scrubbing/playback
  useEffect(() => {
    if (!initialized || !activeVault) return;
    const now = Date.now();
    const delay = Math.max(0, 350 - (now - lastPlayheadSyncRef.current));
    const timer = window.setTimeout(() => {
      lastPlayheadSyncRef.current = Date.now();
      const st = useStudioStore.getState();
      void window.studio.syncStudioContext({
        activeTab: st.activeTab,
        activeProjectSlug: st.activeProjectSlug,
        activeProjectTitle: st.projectState?.manifest.title,
        aspectRatio: st.projectState?.manifest.aspectRatio,
        playheadSec: Number(st.currentTimeSec.toFixed(2)),
        selectedItem: st.selectedItem ? { ...st.selectedItem } : null,
        selectedIdeaSlug: st.selectedIdeaSlug,
        editorLeftTab: st.editorLeftTab,
        pinnedContextChips: st.contextChips.map((c) => ({
          kind: c.kind,
          label: c.label,
          payload: c.payload,
        })),
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [initialized, activeVault, currentTimeSec]);

  if (!initialized) {
    return (
      <div className="h-screen w-screen flex items-center justify-center text-sm" style={{ color: 'var(--text-secondary)' }}>
        Loading Agent Video Studio...
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <TopBar />

      <div className="flex-1 flex min-h-0">
        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          {activeTab === 'planner' && <PlannerView />}
          {activeTab === 'editor' && <EditorView />}
        </main>

        <AgentDrawer />
      </div>

      <OnboardingModal />
      <McpModal />
      <ExportModal />
    </div>
  );
};
