import React, { useEffect } from 'react';
import { useStudioStore } from './store/studioStore';
import { TopBar } from './components/TopBar';
import { OnboardingModal } from './components/OnboardingModal';
import { McpModal } from './components/McpModal';
import { ExportModal } from './components/ExportModal';
import { AgentDrawer } from './components/AgentDrawer';
import { PlannerView } from './views/PlannerView';
import { EditorView } from './views/EditorView';

export const App: React.FC = () => {
  const { initialized, activeTab, bootstrap, refreshVaultData } = useStudioStore();

  useEffect(() => {
    void bootstrap();
    const offVault = window.studio.onVaultChanged(() => {
      void refreshVaultData();
    });
    return () => {
      offVault();
    };
  }, [bootstrap, refreshVaultData]);

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
