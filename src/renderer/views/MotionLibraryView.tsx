import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Pause, Play, Plus, Search, Sparkles } from 'lucide-react';
import { useStudioStore } from '../store/studioStore';
import type { MotionSceneMeta } from '../../shared/schemas';

export const MotionLibraryView: React.FC = () => {
  const {
    motionScenes,
    assetServerUrl,
    getActiveBrandTokens,
    brandKits,
    activeProjectSlug,
    currentTimeSec,
    applyOps,
    setActiveTab,
    pinContextChip,
  } = useStudioStore();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [transparentOnly, setTransparentOnly] = useState(false);
  const [selectedScene, setSelectedScene] = useState<MotionSceneMeta | null>(null);
  const [propsDraft, setPropsDraft] = useState<Record<string, unknown>>({});
  const [previewBrandId, setPreviewBrandId] = useState<string>('active');
  const [checkerboard, setCheckerboard] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [scrubT, setScrubT] = useState(0);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!selectedScene && motionScenes.length > 0) {
      setSelectedScene(motionScenes[0]);
    }
  }, [motionScenes, selectedScene]);

  useEffect(() => {
    if (selectedScene) {
      setPropsDraft(structuredClone(selectedScene.default_props ?? {}));
      setCheckerboard(Boolean(selectedScene.transparent_ready));
      setScrubT(0);
      setPlaying(true);
    }
  }, [selectedScene?.id]);

  const categories = useMemo(
    () => [...new Set(motionScenes.map((s) => s.category))],
    [motionScenes]
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return motionScenes.filter((s) => {
      if (transparentOnly && !s.transparent_ready) return false;
      if (category && s.category !== category) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
      );
    });
  }, [motionScenes, query, category, transparentOnly]);

  const activeTokens = useMemo(() => {
    if (previewBrandId === 'active') return getActiveBrandTokens();
    return brandKits.find((k) => k.id === previewBrandId)?.tokens ?? getActiveBrandTokens();
  }, [previewBrandId, brandKits, getActiveBrandTokens]);

  const pushIframeState = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'SET_TOKENS', tokens: activeTokens }, '*');
    win.postMessage({ type: 'SET_PROPS', props: propsDraft }, '*');
    if (!playing) {
      win.postMessage({ type: 'SEEK', t: scrubT }, '*');
    }
  };

  useEffect(() => {
    pushIframeState();
  }, [activeTokens, propsDraft, playing, scrubT]);

  const handleInsertAtPlayhead = async () => {
    if (!selectedScene || !activeProjectSlug) return;
    const start = Number(currentTimeSec.toFixed(2));
    const end = Number((start + selectedScene.duration).toFixed(2));
    await applyOps(
      [
        {
          op: 'add_motion_plate',
          plate: {
            id: `plate_${Date.now()}`,
            sceneId: selectedScene.id,
            label: selectedScene.name,
            start,
            end,
            props: propsDraft,
            transparent: selectedScene.transparent_ready,
          },
        },
      ],
      `Inserted ${selectedScene.name} at ${start}s`
    );
    setActiveTab('editor');
  };

  const handleCopyPrompt = () => {
    if (!selectedScene) return;
    const text = `Use motion scene "${selectedScene.id}" (${selectedScene.name}) at ${currentTimeSec.toFixed(
      1
    )}s with props:\n${JSON.stringify(propsDraft, null, 2)}`;
    void navigator.clipboard.writeText(text);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 1600);
  };

  const iframeSrc =
    selectedScene && assetServerUrl
      ? `${assetServerUrl}/scenes/${selectedScene.file}?${playing ? '' : 'manual=1&'}${
          checkerboard && selectedScene.transparent_ready ? 'transparent=1' : ''
        }`
      : '';

  return (
    <div className="flex-1 flex min-h-0">
      {/* Left Scene Catalog */}
      <div
        className="w-80 shrink-0 border-r flex flex-col min-h-0"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="p-3 border-b space-y-2.5" style={{ borderColor: 'var(--border-subtle)' }}>
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border"
            style={{ backgroundColor: 'var(--bg-surface-alt)', borderColor: 'var(--border-subtle)' }}
          >
            <Search size={13} style={{ color: 'var(--text-secondary)' }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${motionScenes.length} motion scenes...`}
              className="bg-transparent text-xs outline-none w-full"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="flex-1 px-2.5 py-1.5 rounded-lg border text-xs outline-none"
              style={{
                backgroundColor: 'var(--bg-surface-alt)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <label className="flex items-center gap-1.5 caption-label cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={transparentOnly}
                onChange={(e) => setTransparentOnly(e.target.checked)}
              />
              <span>ALPHA</span>
            </label>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
          {filtered.map((s) => {
            const active = selectedScene?.id === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setSelectedScene(s)}
                className="w-full text-left px-3.5 py-2.5 rounded-2xl border cursor-pointer transition"
                style={{
                  backgroundColor: active ? 'var(--bg-surface-alt)' : 'transparent',
                  borderColor: active ? 'var(--accent-primary)' : 'var(--border-subtle)',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold truncate">
                    {s.number} / {s.name}
                  </span>
                  {s.transparent_ready && (
                    <span
                      className="caption-label px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: 'var(--accent-blue)',
                        color: 'var(--accent-blue-ink)',
                      }}
                    >
                      ALPHA
                    </span>
                  )}
                </div>
                <div className="caption-label mt-1.5 truncate">
                  {s.category} · {s.duration}S
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Center Live Preview Stage */}
      {selectedScene ? (
        <div className="flex-1 flex flex-col min-w-0 p-5 gap-4 overflow-y-auto">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="caption-label">{selectedScene.category}</div>
              <h2 className="display-editorial text-2xl">
                {selectedScene.number} / {selectedScene.name}
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {selectedScene.description} — Inspired by {selectedScene.inspiration}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={previewBrandId}
                onChange={(e) => setPreviewBrandId(e.target.value)}
                className="btn-secondary px-3.5 py-1.5 text-xs outline-none"
              >
                <option value="active">Active Project Brand Kit</option>
                {brandKits.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>

              {selectedScene.transparent_ready && (
                <button
                  onClick={() => setCheckerboard(!checkerboard)}
                  className={`px-3.5 py-1.5 text-xs ${
                    checkerboard ? 'pill-tab-active' : 'btn-secondary'
                  }`}
                >
                  Transparent Grid
                </button>
              )}

              <button
                onClick={() =>
                  pinContextChip({
                    kind: 'motion-scene',
                    label: `Scene: ${selectedScene.id}`,
                    payload: {
                      sceneId: selectedScene.id,
                      name: selectedScene.name,
                      props: propsDraft,
                      duration: selectedScene.duration,
                    },
                  })
                }
                className="btn-secondary flex items-center gap-1.5 px-3.5 py-1.5 text-xs"
              >
                <Sparkles size={13} /> Pin to Terminal
              </button>

              <button
                onClick={handleCopyPrompt}
                className="btn-secondary flex items-center gap-1.5 px-3.5 py-1.5 text-xs"
              >
                {copiedPrompt ? <Check size={13} /> : <Copy size={13} />}
                <span>{copiedPrompt ? 'Copied' : 'Copy Prompt'}</span>
              </button>

              {activeProjectSlug && (
                <button
                  onClick={handleInsertAtPlayhead}
                  className="btn-primary flex items-center gap-1.5 px-4 py-1.5 text-xs"
                >
                  <Plus size={13} /> Insert at {currentTimeSec.toFixed(1)}s
                </button>
              )}
            </div>
          </div>

          <div
            className={`w-full aspect-video rounded-3xl border overflow-hidden ${
              checkerboard && selectedScene.transparent_ready ? 'checkerboard' : ''
            }`}
            style={{ borderColor: 'var(--border-subtle)', backgroundColor: activeTokens.stage_bg }}
          >
            {iframeSrc && (
              <iframe
                ref={iframeRef}
                key={`${selectedScene.id}-${playing ? 'play' : 'manual'}-${checkerboard}`}
                src={iframeSrc}
                onLoad={pushIframeState}
                className="w-full h-full border-0 block"
                title={selectedScene.name}
              />
            )}
          </div>

          {/* Scrub Controls */}
          <div
            className="px-4 py-2.5 rounded-full border flex items-center gap-3"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            <button onClick={() => setPlaying(!playing)} className="btn-icon w-9 h-9">
              {playing ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <input
              type="range"
              min={0}
              max={selectedScene.duration}
              step={0.05}
              value={scrubT}
              onChange={(e) => {
                setPlaying(false);
                setScrubT(parseFloat(e.target.value));
              }}
              className="flex-1 cursor-pointer accent-[#C4FF2E]"
            />
            <span className="caption-label t-num">
              {playing ? 'LOOPING' : `${scrubT.toFixed(2)}S`} / {selectedScene.duration.toFixed(1)}S
            </span>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm" style={{ color: 'var(--text-secondary)' }}>
          No motion scenes loaded.
        </div>
      )}

      {/* Right Live Props Editor */}
      {selectedScene && (
        <div
          className="w-80 shrink-0 border-l p-4 overflow-y-auto space-y-4"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
        >
          <div>
            <div className="eyebrow-label">LIVE SCENE PROPS</div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              Edit copy or metrics and preview instantaneously.
            </div>
          </div>

          <div className="space-y-3">
            {Object.entries(propsDraft).map(([key, val]) => {
              if (typeof val === 'string' || typeof val === 'number') {
                return (
                  <div key={key} className="space-y-1">
                    <label className="caption-label block">{key}</label>
                    <input
                      type={typeof val === 'number' ? 'number' : 'text'}
                      value={String(val)}
                      onChange={(e) =>
                        setPropsDraft((prev) => ({
                          ...prev,
                          [key]: typeof val === 'number' ? Number(e.target.value) : e.target.value,
                        }))
                      }
                      className="w-full px-3 py-1.5 rounded-lg border text-xs outline-none"
                      style={{
                        backgroundColor: 'var(--bg-surface-alt)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </div>
                );
              }

              return (
                <div key={key} className="space-y-1">
                  <label className="caption-label block">{key} (JSON)</label>
                  <textarea
                    rows={3}
                    defaultValue={JSON.stringify(val, null, 2)}
                    onBlur={(e) => {
                      try {
                        const parsed = JSON.parse(e.target.value);
                        setPropsDraft((prev) => ({ ...prev, [key]: parsed }));
                      } catch {
                        // Ignore invalid JSON while typing
                      }
                    }}
                    className="w-full p-2.5 rounded-lg border text-xs outline-none"
                    style={{
                      backgroundColor: 'var(--bg-surface-alt)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
