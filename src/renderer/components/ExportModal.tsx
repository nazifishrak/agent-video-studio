import React, { useEffect, useState } from 'react';
import { CheckCircle2, Download, Eye, FolderOpen, X } from 'lucide-react';
import { useStudioStore } from '../store/studioStore';

export const ExportModal: React.FC = () => {
  const {
    exportModalOpen,
    setExportModalOpen,
    activeProjectSlug,
    projectState,
    assetServerUrl,
    assetServerToken,
    refreshVaultData,
  } = useStudioStore();

  const [preset, setPreset] = useState<'preview-720p' | 'master-1080p'>('master-1080p');
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<{ pct: number; message: string } | null>(null);
  const [result, setResult] = useState<{
    outPath: string;
    relativePath: string;
    durationSec: number;
    sizeBytes: number;
    encoder: string;
  } | null>(null);
  const [contactSheetRel, setContactSheetRel] = useState<string | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const off = window.studio.onExportProgress((payload) => {
      if (payload.slug === activeProjectSlug) {
        setProgress({ pct: payload.pct, message: payload.message });
      }
    });
    return off;
  }, [activeProjectSlug]);

  if (!exportModalOpen || !activeProjectSlug || !projectState) return null;

  const handleExport = async () => {
    setExporting(true);
    setErrorMsg(null);
    setResult(null);
    setProgress({ pct: 2, message: 'Starting render...' });
    try {
      const res = await window.studio.exportVideo(activeProjectSlug, preset);
      setResult(res);
      await refreshVaultData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  };

  const handleInspect = async () => {
    setInspecting(true);
    setErrorMsg(null);
    try {
      const res = await window.studio.inspectTimeline(activeProjectSlug, 12);
      setContactSheetRel(res.relativePath);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setInspecting(false);
    }
  };

  const sheetUrl =
    contactSheetRel && assetServerUrl
      ? `${assetServerUrl}/project-media/${activeProjectSlug}/${contactSheetRel}?token=${assetServerToken}`
      : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ backgroundColor: 'var(--overlay-scrim)' }}
    >
      <div
        className="w-full max-w-2xl rounded-3xl border p-6 space-y-5 max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="caption-label">EXPORT & VISUAL VERIFICATION</div>
            <h2 className="display-editorial text-xl mt-1">{projectState.manifest.title}</h2>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              Compiles timeline shots, cuts, captions, color grade, and music into a ready-to-upload MP4.
            </p>
          </div>
          <button onClick={() => setExportModalOpen(false)} className="btn-icon w-8 h-8">
            <X size={14} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <button
            onClick={() => setPreset('preview-720p')}
            className={`p-3.5 rounded-2xl border text-left cursor-pointer transition ${
              preset === 'preview-720p' ? 'border-[#C4FF2E]' : ''
            }`}
            style={{
              backgroundColor: 'var(--bg-surface-alt)',
              borderColor: preset === 'preview-720p' ? 'var(--accent-primary)' : 'var(--border-subtle)',
            }}
          >
            <div className="font-semibold">Fast Draft (720p)</div>
            <div className="mt-1" style={{ color: 'var(--text-secondary)' }}>
              Quick review render for pacing & captions.
            </div>
          </button>

          <button
            onClick={() => setPreset('master-1080p')}
            className={`p-3.5 rounded-2xl border text-left cursor-pointer transition ${
              preset === 'master-1080p' ? 'border-[#C4FF2E]' : ''
            }`}
            style={{
              backgroundColor: 'var(--bg-surface-alt)',
              borderColor: preset === 'master-1080p' ? 'var(--accent-primary)' : 'var(--border-subtle)',
            }}
          >
            <div className="font-semibold">Master ({projectState.manifest.aspectRatio})</div>
            <div className="mt-1" style={{ color: 'var(--text-secondary)' }}>
              Full {projectState.editPlan.width}×{projectState.editPlan.height} @ {projectState.editPlan.fps}fps.
            </div>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => void handleExport()}
            disabled={exporting}
            className="btn-primary flex items-center gap-1.5 px-5 py-2 text-xs disabled:opacity-50"
          >
            <Download size={14} />
            <span>{exporting ? 'Rendering...' : 'Render MP4'}</span>
          </button>

          <button
            onClick={() => void handleInspect()}
            disabled={inspecting}
            className="btn-secondary flex items-center gap-1.5 px-4 py-2 text-xs disabled:opacity-50"
          >
            <Eye size={14} />
            <span>{inspecting ? 'Generating...' : '12-Frame Contact Sheet'}</span>
          </button>
        </div>

        {progress && (
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span style={{ color: 'var(--text-secondary)' }}>{progress.message}</span>
              <span className="t-num font-semibold">{progress.pct}%</span>
            </div>
            <div
              className="h-2 rounded-full overflow-hidden"
              style={{ backgroundColor: 'var(--bg-surface-alt)' }}
            >
              <div
                className="h-full transition-all duration-200"
                style={{
                  width: `${Math.min(100, progress.pct)}%`,
                  backgroundColor: 'var(--accent-primary)',
                }}
              />
            </div>
          </div>
        )}

        {errorMsg && (
          <div
            className="p-3 rounded-xl border text-xs"
            style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
          >
            {errorMsg}
          </div>
        )}

        {result && (
          <div
            className="p-4 rounded-2xl border flex items-center justify-between gap-3 text-xs"
            style={{ backgroundColor: 'var(--bg-surface-alt)', borderColor: 'var(--accent-mint)' }}
          >
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-1.5 font-semibold" style={{ color: 'var(--accent-mint)' }}>
                <CheckCircle2 size={14} /> Export Ready ({result.encoder})
              </div>
              <div className="truncate" style={{ color: 'var(--text-secondary)' }}>
                {result.relativePath} · {result.durationSec.toFixed(1)}s · {(result.sizeBytes / (1024 * 1024)).toFixed(1)} MB
              </div>
            </div>
            <button
              onClick={() => void window.studio.revealPath(result.outPath)}
              className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 shrink-0"
            >
              <FolderOpen size={13} /> Reveal
            </button>
          </div>
        )}

        {sheetUrl && (
          <div className="space-y-2">
            <div className="caption-label">VISUAL CONTACT SHEET (12 FRAMES)</div>
            <img
              src={sheetUrl}
              alt="12-frame timeline contact sheet"
              className="w-full rounded-2xl border"
              style={{ borderColor: 'var(--border-subtle)' }}
            />
          </div>
        )}
      </div>
    </div>
  );
};
