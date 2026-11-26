import React, { useEffect, useRef, useState } from 'react';
import { Check, Save, Sparkles } from 'lucide-react';
import { useStudioStore } from '../store/studioStore';
import {
  BrandTokens,
  BUILTIN_BRAND_PRESETS,
  DEFAULT_BRAND_TOKENS,
  getCaptionVisualSpec,
} from '../../shared/designTokens';

const DISPLAY_WEIGHT_OPTIONS = [
  { value: '300', label: 'Weight 300 (Light)' },
  { value: '400', label: 'Weight 400 (Regular)' },
  { value: '500', label: 'Weight 500 (Medium)' },
  { value: '600', label: 'Weight 600 (Semibold)' },
  { value: '700', label: 'Weight 700 (Bold)' },
  { value: '800', label: 'Weight 800 (ExtraBold)' },
];

export const BrandKitView: React.FC = () => {
  const {
    activeProjectSlug,
    projectState,
    brandKits,
    motionScenes,
    assetServerUrl,
    refreshVaultData,
    pinContextChip,
  } = useStudioStore();

  const [tokens, setTokens] = useState<BrandTokens>(
    projectState?.brandTokens ?? DEFAULT_BRAND_TOKENS
  );
  const [previewSceneId, setPreviewSceneId] = useState('01-kinetic-hook-mask');
  const [presetName, setPresetName] = useState('');
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (projectState?.brandTokens) {
      setTokens(projectState.brandTokens);
    }
  }, [projectState?.manifest.slug, projectState?.brandTokens]);

  const sendTokens = () => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'SET_TOKENS', tokens }, '*');
  };

  useEffect(() => {
    sendTokens();
  }, [tokens]);

  const updateToken = <K extends keyof BrandTokens>(key: K, value: BrandTokens[K]) => {
    setTokens((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveProject = async () => {
    if (!activeProjectSlug) return;
    await window.studio.saveProjectBrandKit(activeProjectSlug, tokens);
    await refreshVaultData();
    setSavedNotice('Saved to project brand/DESIGN.md');
    setTimeout(() => setSavedNotice(null), 2000);
  };

  const handleSaveGlobal = async () => {
    if (!presetName.trim()) return;
    await window.studio.saveGlobalBrandKit(presetName.trim(), tokens);
    setPresetName('');
    await refreshVaultData();
    setSavedNotice('Saved global Brand Kit preset');
    setTimeout(() => setSavedNotice(null), 2000);
  };

  const sceneMeta = motionScenes.find((s) => s.id === previewSceneId) ?? motionScenes[0];
  const iframeSrc = sceneMeta && assetServerUrl ? `${assetServerUrl}/scenes/${sceneMeta.file}` : '';

  return (
    <div className="flex-1 flex min-h-0">
      {/* Left Controls */}
      <div
        className="w-[430px] shrink-0 border-r overflow-y-auto p-5 space-y-5"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        {/* Clean Matte Header Card */}
        <div
          className="rounded-2xl border p-5 space-y-2"
          style={{ backgroundColor: 'var(--bg-surface-alt)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="caption-label">DESIGN.MD TOKEN CONTRACT</span>
              <button
                onClick={() =>
                  pinContextChip({
                    kind: 'brand-kit',
                    label: 'Active Brand Tokens',
                    payload: { projectSlug: activeProjectSlug, tokens },
                  })
                }
                className="btn-secondary flex items-center gap-1 px-2.5 py-1 text-[11px]"
              >
                <Sparkles size={11} /> Pin
              </button>
            </div>
            <h2 className="text-xl font-semibold tracking-tight">Visual Brand Kit</h2>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              One token contract drives all 60+ motion scenes and styled captions simultaneously.
            </p>
          </div>
        </div>

        {/* Presets */}
        <div className="space-y-2">
          <div className="caption-label">PRESETS</div>
          <div className="flex flex-wrap gap-1.5">
            {(brandKits.length > 0 ? brandKits : BUILTIN_BRAND_PRESETS).map((preset) => (
              <button
                key={preset.id}
                onClick={() => setTokens(preset.tokens)}
                className="btn-secondary px-3 py-1 text-xs"
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        {/* Colors */}
        <div className="space-y-2.5">
          <div className="caption-label">COLORS</div>
          <div className="grid grid-cols-2 gap-2.5">
            {(
              [
                ['stage_bg', 'Stage Background'],
                ['surface_card', 'Card Surface'],
                ['text_primary', 'Primary Text'],
                ['text_muted', 'Muted Text'],
                ['accent_primary', 'Primary Accent'],
                ['accent_warm', 'Warm Accent'],
              ] as Array<[keyof BrandTokens, string]>
            ).map(([k, label]) => (
              <label
                key={k}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs"
                style={{ backgroundColor: 'var(--bg-surface-alt)', borderColor: 'var(--border-subtle)' }}
              >
                <span className="truncate">{label}</span>
                <input
                  type="color"
                  value={tokens[k].startsWith('#') ? tokens[k] : '#C4FF2E'}
                  onChange={(e) => updateToken(k, e.target.value)}
                  className="w-6 h-5 rounded cursor-pointer bg-transparent border-0"
                />
              </label>
            ))}
          </div>
        </div>

        {/* Typography */}
        <div className="space-y-2.5">
          <div className="caption-label">TYPOGRAPHY & GEOMETRY</div>
          <div className="space-y-2">
            <select
              value={tokens.display_weight}
              onChange={(e) => updateToken('display_weight', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-xs outline-none"
              style={{
                backgroundColor: 'var(--bg-surface-alt)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              {DISPLAY_WEIGHT_OPTIONS.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs space-y-1">
                <span className="caption-label block">CARD RADIUS</span>
                <input
                  value={tokens.radius_card}
                  onChange={(e) => updateToken('radius_card', e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border text-xs outline-none"
                  style={{
                    backgroundColor: 'var(--bg-surface-alt)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
              </label>
              <label className="text-xs space-y-1">
                <span className="caption-label block">AURORA OPACITY</span>
                <input
                  value={tokens.aurora_opacity}
                  onChange={(e) => updateToken('aurora_opacity', e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border text-xs outline-none"
                  style={{
                    backgroundColor: 'var(--bg-surface-alt)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
              </label>
            </div>
          </div>
        </div>

        {/* Captions */}
        <div className="space-y-2.5">
          <div className="caption-label">CAPTIONS & SUBTITLES STYLE</div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={tokens.caption_style}
              onChange={(e) =>
                updateToken('caption_style', e.target.value as BrandTokens['caption_style'])
              }
              className="px-3 py-2 rounded-lg border text-xs outline-none"
              style={{
                backgroundColor: 'var(--bg-surface-alt)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="cinema-clean">Cinema Clean (SF Pro)</option>
              <option value="vlog-minimal">Daily Vlog Minimal (SF Pro)</option>
              <option value="editorial-glass">Editorial Glass (Figma)</option>
              <option value="editorial-serif">Editorial Serif (Instrument)</option>
            </select>

            <select
              value={tokens.caption_position}
              onChange={(e) =>
                updateToken('caption_position', e.target.value as BrandTokens['caption_position'])
              }
              className="px-3 py-2 rounded-lg border text-xs outline-none"
              style={{
                backgroundColor: 'var(--bg-surface-alt)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="bottom">Bottom Safe Zone</option>
              <option value="lower-third">Lower Third</option>
              <option value="center">Center</option>
            </select>
          </div>
        </div>

        {/* Save Actions */}
        <div className="pt-3 border-t space-y-2.5" style={{ borderColor: 'var(--border-subtle)' }}>
          {activeProjectSlug && (
            <button
              onClick={handleSaveProject}
              className="btn-primary w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs"
            >
              <Save size={14} /> Save to Active Project (DESIGN.md)
            </button>
          )}

          <div className="flex gap-2">
            <input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Save as reusable preset name..."
              className="flex-1 px-3 py-1.5 rounded-lg border text-xs outline-none"
              style={{
                backgroundColor: 'var(--bg-surface-alt)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
            <button
              onClick={handleSaveGlobal}
              disabled={!presetName.trim()}
              className="btn-secondary px-4 py-1.5 text-xs disabled:opacity-40"
            >
              Save Preset
            </button>
          </div>

          {savedNotice && (
            <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--accent-mint)' }}>
              <Check size={14} /> {savedNotice}
            </div>
          )}
        </div>
      </div>

      {/* Right Live Split Preview */}
      <div className="flex-1 p-6 flex flex-col gap-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="eyebrow-label">LIVE BRAND PREVIEW (MOTION SCENE + CAPTIONS)</div>
          <select
            value={previewSceneId}
            onChange={(e) => setPreviewSceneId(e.target.value)}
            className="btn-secondary px-3.5 py-1.5 text-xs outline-none"
          >
            {motionScenes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.number} / {s.name}
              </option>
            ))}
          </select>
        </div>

        <div
          className="relative w-full aspect-video rounded-3xl border overflow-hidden"
          style={{ borderColor: 'var(--border-subtle)', backgroundColor: tokens.stage_bg }}
        >
          {iframeSrc && (
            <iframe
              ref={iframeRef}
              key={sceneMeta?.id}
              src={iframeSrc}
              onLoad={sendTokens}
              className="w-full h-full border-0 block"
              title="Brand Kit Live Preview"
            />
          )}

          {/* Live Caption Sample Overlay */}
          {(() => {
            const spec = getCaptionVisualSpec(tokens);
            return (
              <div className="absolute inset-x-0 bottom-6 flex justify-center pointer-events-none px-8">
                <div
                  className="text-center max-w-[88%]"
                  style={{
                    fontFamily: spec.fontFamily,
                    fontWeight: spec.fontWeight,
                    fontSize: `${spec.fontSizePx}px`,
                    letterSpacing: spec.letterSpacing,
                    lineHeight: spec.lineHeight,
                    color: spec.color,
                    backgroundColor: spec.backgroundColor,
                    border: spec.border,
                    borderRadius: spec.borderRadius,
                    backdropFilter: spec.backdropFilter,
                    textShadow: spec.textShadow,
                    padding: spec.padding,
                  }}
                >
                  Your brand tokens update every caption and motion plate.
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};
