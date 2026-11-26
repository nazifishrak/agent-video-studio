import React from 'react';
import { FolderOpen, FolderPlus, X } from 'lucide-react';
import { useStudioStore } from '../store/studioStore';

export const OnboardingModal: React.FC = () => {
  const { activeVault, recentVaults, onboardingOpen, setOnboardingOpen, refreshVaultData } = useStudioStore();
  if (!onboardingOpen) return null;

  const handleOpenFolder = async () => {
    const res = await window.studio.pickVaultFolder();
    if (res?.activeVault) {
      useStudioStore.setState({
        activeVault: res.activeVault,
        recentVaults: res.recentVaults,
        onboardingOpen: false,
      });
      await refreshVaultData();
    }
  };

  const handleCreateStarter = async () => {
    const res = await window.studio.createStarterVault();
    if (res?.activeVault) {
      useStudioStore.setState({
        activeVault: res.activeVault,
        recentVaults: res.recentVaults,
        onboardingOpen: false,
      });
      await refreshVaultData();
    }
  };

  const handleOpenRecent = async (vaultPath: string) => {
    const res = await window.studio.openVault(vaultPath);
    useStudioStore.setState({
      activeVault: res.activeVault,
      recentVaults: res.recentVaults,
      onboardingOpen: false,
    });
    await refreshVaultData();
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
        {/* Clean Matte Header */}
        <div className="p-7 border-b" style={{ backgroundColor: 'var(--bg-surface-alt)', borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="eyebrow-label">LOCAL-FIRST VIDEO STUDIO</div>
              <h2 className="display-editorial text-3xl">Agent Video Studio</h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                Open a local video vault folder or scaffold a clean starter workspace. Ideas, timelines, and motion scenes stay plain Markdown, JSON, and HTML on your disk.
              </p>
            </div>
            {activeVault && (
              <button onClick={() => setOnboardingOpen(false)} className="btn-icon w-9 h-9 shrink-0">
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="p-7 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div
              className="p-5 rounded-2xl border flex flex-col justify-between gap-4"
              style={{ backgroundColor: 'var(--bg-surface-alt)', borderColor: 'var(--border-subtle)' }}
            >
              <div className="space-y-1.5">
                <div className="caption-label">EXISTING WORKSPACE</div>
                <div className="text-lg font-semibold tracking-tight">Open Existing Vault</div>
                <div className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Select a folder containing your video ideas, projects, and motion library.
                </div>
              </div>
              <button
                onClick={handleOpenFolder}
                className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs self-start"
              >
                <FolderOpen size={13} /> Choose Folder
              </button>
            </div>

            <div
              className="p-5 rounded-2xl border flex flex-col justify-between gap-4"
              style={{ backgroundColor: 'var(--bg-surface-alt)', borderColor: 'var(--border-subtle)' }}
            >
              <div className="space-y-1.5">
                <div className="caption-label">FRESH SETUP</div>
                <div className="text-lg font-semibold tracking-tight">Create Starter Vault</div>
                <div className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  Generate a clean vault with starter ideas, brand kits, and 60 motion scenes.
                </div>
              </div>
              <button
                onClick={handleCreateStarter}
                className="btn-secondary inline-flex items-center gap-1.5 px-4 py-2 text-xs self-start"
              >
                <FolderPlus size={13} /> Create Vault
              </button>
            </div>
          </div>

          {recentVaults.length > 0 && (
            <div className="space-y-2.5 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="caption-label">RECENT VAULTS</div>
              <div className="space-y-1.5">
                {recentVaults.map((rv) => {
                  const isCurrent = rv === activeVault;
                  return (
                    <button
                      key={rv}
                      onClick={() => handleOpenRecent(rv)}
                      className={`w-full flex items-center justify-between px-4 py-2.5 text-xs text-left ${
                        isCurrent ? 'btn-primary' : 'btn-secondary'
                      }`}
                    >
                      <span className="truncate">{rv}</span>
                      {isCurrent && <span className="caption-label ml-2" style={{ color: 'inherit' }}>ACTIVE</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
