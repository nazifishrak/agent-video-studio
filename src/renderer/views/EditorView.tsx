import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Film,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { useStudioStore } from '../store/studioStore';
import { PreviewCanvas } from '../components/PreviewCanvas';
import { Timeline } from '../components/Timeline';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import {
  BrandTokens,
  BUILTIN_BRAND_PRESETS,
  CAPTION_STYLE_LABELS,
  CaptionStyleVariant,
  DEFAULT_BRAND_TOKENS,
  parseDesignMd,
} from '../../shared/designTokens';
import type { MotionSceneMeta } from '../../shared/schemas';

const DISPLAY_WEIGHT_OPTIONS = [
  { value: '400', label: 'Weight 400 (Regular)' },
  { value: '500', label: 'Weight 500 (Medium)' },
  { value: '600', label: 'Weight 600 (Semibold)' },
  { value: '700', label: 'Weight 700 (Bold)' },
  { value: '800', label: 'Weight 800 (Extra Bold)' },
];

export const EditorView: React.FC = () => {
  const {
    projectState,
    activeProjectSlug,
    editorLeftTab,
    setEditorLeftTab,
    selectedItem,
    setSelectedItem,
    currentTimeSec,
    setCurrentTimeSec,
    applyOps,
    undoProject,
    refreshVaultData,
    pinContextChip,
    setActiveTab,
    motionScenes,
    brandKits,
    assetServerUrl,
    assetServerToken,
    setPreviewTokensOverride,
    agentDrawerOpen,
    setAuditionMotionScene,
  } = useStudioStore();

  const [mediaDurationSec, setMediaDurationSec] = useState(0);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // Motion panel state
  const [motionQuery, setMotionQuery] = useState('');
  const [motionAlphaOnly, setMotionAlphaOnly] = useState(false);
  const [previewScene, setPreviewScene] = useState<MotionSceneMeta | null>(null);
  const [motionPropsDraft, setMotionPropsDraft] = useState<Record<string, unknown>>({});
  const motionIframeRef = useRef<HTMLIFrameElement>(null);

  // Brand panel state (dirty guard prevents chokidar reloads from wiping unsaved form edits)
  const [brandDraft, setBrandDraft] = useState<BrandTokens>(
    projectState?.brandTokens ?? DEFAULT_BRAND_TOKENS
  );
  const [brandDirty, setBrandDirty] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [brandSavedMsg, setBrandSavedMsg] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [showPasteDesign, setShowPasteDesign] = useState(false);
  const [pasteDesignText, setPasteDesignText] = useState('');
  const [showCustomizeTokens, setShowCustomizeTokens] = useState(false);

  useEffect(() => {
    setMediaDurationSec(0);
    setBrandDirty(false);
    setPreviewTokensOverride(null);
  }, [activeProjectSlug]);

  useEffect(() => {
    setMediaDurationSec(0);
  }, [projectState?.editPlan.sourceVideo]);

  useEffect(() => {
    if (projectState?.brandTokens && !brandDirty) {
      setBrandDraft(projectState.brandTokens);
    }
  }, [projectState?.manifest.slug, projectState?.brandTokens, brandDirty]);

  useEffect(() => {
    if (!previewScene && motionScenes.length > 0) {
      setPreviewScene(motionScenes[0]);
    }
  }, [motionScenes, previewScene]);

  useEffect(() => {
    if (previewScene) {
      setMotionPropsDraft(structuredClone(previewScene.default_props ?? {}));
    }
  }, [previewScene?.id]);

  // Auto-collapse right inspector on narrow viewports or when Terminal drawer opens
  useEffect(() => {
    const syncPanels = () => {
      if (window.innerWidth < 1180 || (agentDrawerOpen && window.innerWidth < 1440)) {
        setRightCollapsed(true);
      }
    };
    syncPanels();
    window.addEventListener('resize', syncPanels);
    return () => window.removeEventListener('resize', syncPanels);
  }, [agentDrawerOpen]);

  const totalDuration = useMemo(() => {
    if (!projectState) return 30;
    const plan = projectState.editPlan;
    const maxEnd = Math.max(
      20,
      mediaDurationSec,
      ...plan.shots.map((s) => s.end),
      ...plan.motionPlates.map((p) => p.end),
      ...plan.captions.map((c) => c.end),
      ...plan.broll.map((b) => b.end),
      ...plan.cameraMoves.map((m) => m.end),
      ...(projectState.transcript.words.length
        ? [projectState.transcript.words[projectState.transcript.words.length - 1].end]
        : [0])
    );
    return Math.ceil(maxEnd + 2);
  }, [projectState, mediaDurationSec]);

  const filteredScenes = useMemo(() => {
    const q = motionQuery.toLowerCase();
    return motionScenes.filter((s) => {
      if (motionAlphaOnly && !s.transparent_ready) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q)
      );
    });
  }, [motionScenes, motionQuery, motionAlphaOnly]);

  if (!projectState || !activeProjectSlug) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div
          className="rounded-3xl border p-8 max-w-md space-y-3"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="space-y-3">
            <Film size={28} className="mx-auto" />
            <div className="text-lg font-semibold">No Video Project Selected</div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Open the Planner tab and promote an idea or select a project to start editing.
            </p>
            <button onClick={() => setActiveTab('planner')} className="btn-primary px-5 py-2 text-xs">
              Go to Planner
            </button>
          </div>
        </div>
      </div>
    );
  }

  const latestTx = projectState.transactions[0] ?? null;
  const plan = projectState.editPlan;

  const selectedPlate =
    selectedItem?.kind === 'motionPlate'
      ? plan.motionPlates.find((p) => p.id === selectedItem.id) ?? null
      : null;
  const selectedCaption =
    selectedItem?.kind === 'caption'
      ? plan.captions.find((c) => c.id === selectedItem.id) ?? null
      : null;
  const selectedMove =
    selectedItem?.kind === 'cameraMove' ? plan.cameraMoves[selectedItem.index] ?? null : null;
  const selectedBroll =
    selectedItem?.kind === 'broll' ? plan.broll[selectedItem.index] ?? null : null;
  const selectedShot =
    selectedItem?.kind === 'shot' ? plan.shots.find((s) => s.id === selectedItem.id) ?? null : null;
  const selectedNote =
    selectedItem?.kind === 'reviewNote'
      ? plan.reviewNotes.find((n) => n.id === selectedItem.id) ?? null
      : null;

  const handleImportMedia = async () => {
    const res = await window.studio.importMediaDialog(activeProjectSlug);
    if (res) {
      await refreshVaultData();
    }
  };

  const handleInsertMotionPlate = async () => {
    if (!previewScene) return;
    const start = Number(currentTimeSec.toFixed(2));
    const end = Number((start + previewScene.duration).toFixed(2));
    const id = `plate_${Date.now()}`;
    await applyOps(
      [
        {
          op: 'add_motion_plate',
          plate: {
            id,
            sceneId: previewScene.id,
            label: previewScene.name,
            start,
            end,
            props: motionPropsDraft,
            transparent: previewScene.transparent_ready,
          },
        },
      ],
      `Inserted ${previewScene.name} at ${start}s`
    );
    setSelectedItem({ kind: 'motionPlate', id });
  };

  const updateBrandToken = <K extends keyof BrandTokens>(key: K, value: BrandTokens[K]) => {
    const next = { ...brandDraft, [key]: value };
    setBrandDraft(next);
    setBrandDirty(true);
    setPreviewTokensOverride(next);
  };

  const handleSaveBrandProject = async () => {
    await window.studio.saveProjectBrandKit(activeProjectSlug, brandDraft);
    setBrandDirty(false);
    setPreviewTokensOverride(null);
    await refreshVaultData();
    setBrandSavedMsg('Saved to brand/DESIGN.md');
    setTimeout(() => setBrandSavedMsg(null), 2000);
  };

  const handleSaveGlobalPreset = async () => {
    if (!presetName.trim()) return;
    await window.studio.saveGlobalBrandKit(presetName.trim(), brandDraft);
    setPresetName('');
    await refreshVaultData();
    setBrandSavedMsg('Saved preset');
    setTimeout(() => setBrandSavedMsg(null), 2000);
  };

  const motionPreviewUrl =
    previewScene && assetServerUrl
      ? `${assetServerUrl}/scenes/${previewScene.file}?${
          previewScene.transparent_ready ? 'transparent=1&' : ''
        }${assetServerToken ? `token=${assetServerToken}` : ''}`
      : '';

  const pushMotionIframe = () => {
    const win = motionIframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'SET_TOKENS', tokens: brandDraft }, '*');
    win.postMessage({ type: 'SET_PROPS', props: motionPropsDraft }, '*');
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Transaction Activity Strip */}
      {latestTx && (
        <div
          className="h-9 px-4 border-b flex items-center justify-between text-xs shrink-0"
          style={{
            backgroundColor: 'var(--bg-surface-alt)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex items-center gap-2.5 truncate">
            <span
              className="caption-label px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--accent-primary-ink)',
              }}
            >
              {latestTx.actor === 'agent' ? latestTx.agentName ?? 'AGENT' : 'EDIT'}
            </span>
            <span className="truncate" style={{ color: 'var(--text-primary)' }}>
              {latestTx.summary}
            </span>
          </div>
          <button
            onClick={() => void undoProject()}
            className="btn-secondary flex items-center gap-1 px-3 py-1 text-[11px] shrink-0"
          >
            <RotateCcw size={11} /> Undo Pass
          </button>
        </div>
      )}

      {/* Main Split Workspace */}
      <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
        {/* Left Pane (Collapsible) */}
        {leftCollapsed ? (
          <div
            className="w-10 shrink-0 border-r flex flex-col items-center py-3 gap-2"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            <button
              onClick={() => setLeftCollapsed(false)}
              className="btn-icon w-7 h-7"
              title="Expand Left Panel"
            >
              <PanelLeftOpen size={13} />
            </button>
          </div>
        ) : (
          <div
            className="w-64 lg:w-72 xl:w-80 shrink-0 border-r flex flex-col min-h-0"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            <div
              className="p-2.5 border-b space-y-2"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-0.5 overflow-x-auto min-w-0">
                  {(
                    [
                      ['transcript', 'Transcript'],
                      ['script', 'Script'],
                      ['media', `Media${projectState.mediaFiles.length ? ` (${projectState.mediaFiles.length})` : ''}`],
                      ['motion', 'Motion'],
                      ['brand', 'Brand'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      onClick={() => setEditorLeftTab(id)}
                      className={`px-2 py-1 text-[11px] whitespace-nowrap shrink-0 ${
                        editorLeftTab === id ? 'pill-tab-active' : 'pill-tab'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setLeftCollapsed(true)}
                  className="btn-icon w-6 h-6 shrink-0"
                  title="Collapse Left Panel"
                >
                  <PanelLeftClose size={12} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 text-xs leading-relaxed">
              {editorLeftTab === 'transcript' && (
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <button
                      onClick={handleImportMedia}
                      className="btn-secondary flex items-center gap-1 px-2.5 py-1 text-[11px]"
                    >
                      <Upload size={11} /> Import Footage
                    </button>
                  </div>
                  {projectState.transcript.words.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {projectState.transcript.words.map((w) => (
                        <button
                          key={w.id}
                          onClick={() => setCurrentTimeSec(w.start)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            void applyOps(
                              [{ op: 'toggle_word_deleted', wordId: w.id, deleted: !w.deleted }],
                              `${w.deleted ? 'Restored' : 'Cut'} word "${w.text}"`
                            );
                          }}
                          className={`px-1.5 py-0.5 rounded-md cursor-pointer transition ${
                            w.deleted ? 'line-through opacity-35' : 'hover:bg-[#2E6BFF] hover:text-white'
                          }`}
                          title={`${w.start.toFixed(2)}s (Right-click to cut/restore)`}
                        >
                          {w.text}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2" style={{ color: 'var(--text-secondary)' }}>
                      <p>No word-level transcript loaded yet (`transcript.json`).</p>
                      <p>
                        Ask the Terminal agent to populate `transcript.json` via `set_transcript`, or edit shots, captions, and motion plates directly on the timeline.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {editorLeftTab === 'script' && (
                projectState.linkedIdea ? (
                  <MarkdownRenderer content={projectState.linkedIdea.body} />
                ) : (
                  <div style={{ color: 'var(--text-secondary)' }}>
                    No linked idea markdown for this project.
                  </div>
                )
              )}

              {editorLeftTab === 'media' && (
                <div className="space-y-2.5">
                  <button
                    onClick={handleImportMedia}
                    className="btn-secondary w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs"
                  >
                    <Upload size={12} /> Import Video / Audio / Image
                  </button>
                  <div className="text-[11px] px-1" style={{ color: 'var(--text-secondary)' }}>
                    Drag files onto Timeline tracks or drop from Finder
                  </div>
                  {projectState.mediaFiles.length === 0 && plan.assets.length === 0 ? (
                    <div style={{ color: 'var(--text-secondary)' }}>
                      No video or audio files found in this project yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {projectState.mediaFiles.map((file) => {
                        const isActive = plan.sourceVideo === file;
                        const isAudio = /\.(mp3|wav|m4a|aac|flac|ogg)$/i.test(file);
                        const isImage = /\.(png|jpe?g|webp)$/i.test(file);
                        const mediaKind = isAudio ? 'audio' : isImage ? 'image' : 'video';
                        return (
                          <div
                            key={file}
                            draggable
                            onDragStart={(e) =>
                              e.dataTransfer.setData(
                                'application/x-studio-item',
                                JSON.stringify({
                                  kind: 'studio-media',
                                  source: file,
                                  label: file,
                                  mediaKind,
                                })
                              )
                            }
                            className="p-2.5 rounded-xl border space-y-2 cursor-grab active:cursor-grabbing"
                            style={{
                              backgroundColor: isActive ? 'var(--bg-surface-alt)' : 'var(--bg-canvas)',
                              borderColor: isActive ? 'var(--accent-primary)' : 'var(--border-subtle)',
                            }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate font-medium" title={file}>
                                {file}
                              </span>
                              <span className="caption-label uppercase shrink-0">{mediaKind}</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {isAudio ? (
                                <>
                                  <button
                                    onClick={() =>
                                      void applyOps(
                                        [
                                          {
                                            op: 'update_audio',
                                            audio: {
                                              ...(plan.audio ?? {}),
                                              musicTrack: file,
                                              musicDb: plan.audio?.musicDb ?? -18,
                                              sidechainDuck: plan.audio?.sidechainDuck ?? true,
                                            },
                                          },
                                        ],
                                        `Set ${file} as music bed`
                                      )
                                    }
                                    className="btn-secondary px-2 py-1 text-[10px]"
                                  >
                                    Music Bed
                                  </button>
                                  <button
                                    onClick={() =>
                                      void applyOps(
                                        [
                                          {
                                            op: 'update_audio',
                                            audio: {
                                              ...(plan.audio ?? {}),
                                              sfx: [
                                                ...(plan.audio?.sfx ?? []),
                                                {
                                                  id: `sfx_${Date.now()}`,
                                                  at: Number(currentTimeSec.toFixed(2)),
                                                  sound: file,
                                                },
                                              ],
                                            },
                                          },
                                        ],
                                        `Added SFX ${file} at ${currentTimeSec.toFixed(1)}s`
                                      )
                                    }
                                    className="btn-secondary px-2 py-1 text-[10px]"
                                  >
                                    + SFX @ {currentTimeSec.toFixed(1)}s
                                  </button>
                                </>
                              ) : (
                                <>
                                  {!isImage && (
                                    <button
                                      onClick={() =>
                                        void applyOps(
                                          [{ op: 'set_source_video', sourceVideo: file }],
                                          `Loaded ${file} on stage`
                                        )
                                      }
                                      className={
                                        isActive
                                          ? 'btn-primary px-2 py-1 text-[10px]'
                                          : 'btn-secondary px-2 py-1 text-[10px]'
                                      }
                                    >
                                      {isActive ? 'On A-Roll' : 'A-Roll'}
                                    </button>
                                  )}
                                  {!isImage && (
                                    <button
                                      onClick={() => {
                                        const start = Number(currentTimeSec.toFixed(2));
                                        void applyOps(
                                          [
                                            {
                                              op: 'add_shot',
                                              shot: {
                                                id: `shot_${Date.now()}`,
                                                source: file,
                                                label: file,
                                                start,
                                                end: Number((start + 5).toFixed(2)),
                                                srcIn: 0,
                                                speed: 1,
                                                volume: 1,
                                                transitionIn: 'cut',
                                                stabilize: false,
                                              },
                                            },
                                          ],
                                          `Added shot ${file} at ${start}s`
                                        );
                                      }}
                                      className="btn-secondary px-2 py-1 text-[10px]"
                                    >
                                      + Shot
                                    </button>
                                  )}
                                  <button
                                    onClick={() => {
                                      const start = Number(currentTimeSec.toFixed(2));
                                      void applyOps(
                                        [
                                          {
                                            op: 'add_broll',
                                            broll: {
                                              id: `br_${Date.now()}`,
                                              label: file,
                                              source: file,
                                              kind: isImage ? 'image' : 'video',
                                              start,
                                              end: Number((start + 4).toFixed(2)),
                                            },
                                          },
                                        ],
                                        `Added B-roll ${file} at ${start}s`
                                      );
                                    }}
                                    className="btn-secondary px-2 py-1 text-[10px]"
                                  >
                                    + B-Roll
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {plan.assets.map((asset) => {
                        const isActive = plan.sourceVideo === asset.id || plan.sourceVideo === asset.uri;
                        const label = asset.label || asset.id;
                        return (
                          <div
                            key={asset.id}
                            draggable
                            onDragStart={(e) =>
                              e.dataTransfer.setData(
                                'application/x-studio-item',
                                JSON.stringify({
                                  kind: 'studio-media',
                                  source: asset.id,
                                  label,
                                  mediaKind: asset.kind,
                                })
                              )
                            }
                            className="p-2.5 rounded-xl border space-y-2 cursor-grab active:cursor-grabbing"
                            style={{
                              backgroundColor: isActive ? 'var(--bg-surface-alt)' : 'var(--bg-canvas)',
                              borderColor: isActive ? 'var(--accent-primary)' : 'var(--border-subtle)',
                            }}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate font-medium">{label}</div>
                                <div className="caption-label truncate">{asset.kind}</div>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {asset.kind === 'audio' ? (
                                <>
                                  <button
                                    onClick={() =>
                                      void applyOps(
                                        [
                                          {
                                            op: 'update_audio',
                                            audio: {
                                              ...(plan.audio ?? {}),
                                              musicTrack: asset.id,
                                              musicDb: plan.audio?.musicDb ?? -18,
                                              sidechainDuck: plan.audio?.sidechainDuck ?? true,
                                            },
                                          },
                                        ],
                                        `Set ${label} as music bed`
                                      )
                                    }
                                    className="btn-secondary px-2 py-1 text-[10px]"
                                  >
                                    Music Bed
                                  </button>
                                  <button
                                    onClick={() =>
                                      void applyOps(
                                        [
                                          {
                                            op: 'update_audio',
                                            audio: {
                                              ...(plan.audio ?? {}),
                                              sfx: [
                                                ...(plan.audio?.sfx ?? []),
                                                {
                                                  id: `sfx_${Date.now()}`,
                                                  at: Number(currentTimeSec.toFixed(2)),
                                                  sound: asset.id,
                                                },
                                              ],
                                            },
                                          },
                                        ],
                                        `Added SFX ${label} at ${currentTimeSec.toFixed(1)}s`
                                      )
                                    }
                                    className="btn-secondary px-2 py-1 text-[10px]"
                                  >
                                    + SFX @ {currentTimeSec.toFixed(1)}s
                                  </button>
                                </>
                              ) : (
                                <>
                                  {asset.kind === 'video' && (
                                    <button
                                      onClick={() =>
                                        void applyOps(
                                          [{ op: 'set_source_video', sourceVideo: asset.id }],
                                          `Loaded ${label} on stage`
                                        )
                                      }
                                      className={
                                        isActive
                                          ? 'btn-primary px-2 py-1 text-[10px]'
                                          : 'btn-secondary px-2 py-1 text-[10px]'
                                      }
                                    >
                                      {isActive ? 'On A-Roll' : 'A-Roll'}
                                    </button>
                                  )}
                                  {asset.kind === 'video' && (
                                    <button
                                      onClick={() => {
                                        const start = Number(currentTimeSec.toFixed(2));
                                        const dur = asset.durationSec ? Math.min(5, asset.durationSec) : 5;
                                        void applyOps(
                                          [
                                            {
                                              op: 'add_shot',
                                              shot: {
                                                id: `shot_${Date.now()}`,
                                                assetId: asset.id,
                                                source: asset.uri,
                                                label,
                                                start,
                                                end: Number((start + dur).toFixed(2)),
                                                srcIn: 0,
                                                speed: 1,
                                                volume: 1,
                                                transitionIn: 'cut',
                                                stabilize: false,
                                              },
                                            },
                                          ],
                                          `Added shot ${label} at ${start}s`
                                        );
                                      }}
                                      className="btn-secondary px-2 py-1 text-[10px]"
                                    >
                                      + Shot
                                    </button>
                                  )}
                                  <button
                                    onClick={() => {
                                      const start = Number(currentTimeSec.toFixed(2));
                                      void applyOps(
                                        [
                                          {
                                            op: 'add_broll',
                                            broll: {
                                              id: `br_${Date.now()}`,
                                              label,
                                              source: asset.id,
                                              kind: asset.kind === 'image' ? 'image' : 'video',
                                              start,
                                              end: Number((start + 4).toFixed(2)),
                                            },
                                          },
                                        ],
                                        `Added B-roll ${label} at ${start}s`
                                      );
                                    }}
                                    className="btn-secondary px-2 py-1 text-[10px]"
                                  >
                                    + B-Roll
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {editorLeftTab === 'motion' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="flex-1 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border"
                      style={{ backgroundColor: 'var(--bg-surface-alt)', borderColor: 'var(--border-subtle)' }}
                    >
                      <Search size={12} style={{ color: 'var(--text-secondary)' }} />
                      <input
                        value={motionQuery}
                        onChange={(e) => setMotionQuery(e.target.value)}
                        placeholder={`Search ${motionScenes.length} scenes...`}
                        className="bg-transparent text-xs outline-none w-full"
                        style={{ color: 'var(--text-primary)' }}
                      />
                    </div>
                    <label className="flex items-center gap-1 caption-label cursor-pointer">
                      <input
                        type="checkbox"
                        checked={motionAlphaOnly}
                        onChange={(e) => setMotionAlphaOnly(e.target.checked)}
                      />
                      <span>ALPHA</span>
                    </label>
                  </div>

                  {previewScene && (
                    <div
                      className="rounded-2xl border p-2.5 space-y-2.5"
                      style={{ backgroundColor: 'var(--bg-surface-alt)', borderColor: 'var(--border-subtle)' }}
                    >
                      <div
                        className={`w-full aspect-video rounded-xl overflow-hidden border ${
                          previewScene.transparent_ready ? 'checkerboard' : ''
                        }`}
                        style={{ borderColor: 'var(--border-subtle)', backgroundColor: brandDraft.stage_bg }}
                      >
                        {motionPreviewUrl && (
                          <iframe
                            ref={motionIframeRef}
                            key={previewScene.id}
                            src={motionPreviewUrl}
                            onLoad={pushMotionIframe}
                            className="w-full h-full border-0 block pointer-events-none"
                            title={previewScene.name}
                          />
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{previewScene.name}</div>
                          <div className="caption-label">{previewScene.duration}s</div>
                        </div>
                        <button
                          onClick={() => void handleInsertMotionPlate()}
                          className="btn-primary flex items-center gap-1 px-3 py-1.5 text-[11px] shrink-0"
                        >
                          <Plus size={12} /> Insert @ {currentTimeSec.toFixed(1)}s
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    {filteredScenes.map((s) => {
                      const active = previewScene?.id === s.id;
                      return (
                        <button
                          key={s.id}
                          draggable
                          onDragStart={(e) =>
                            e.dataTransfer.setData(
                              'application/x-studio-item',
                              JSON.stringify({
                                kind: 'motion-scene',
                                sceneId: s.id,
                                name: s.name,
                                duration: s.duration,
                                transparent: s.transparent_ready,
                                defaultProps: s.default_props ?? {},
                              })
                            )
                          }
                          onClick={() => {
                            setPreviewScene(s);
                            setAuditionMotionScene({
                              scene: s,
                              props: structuredClone(s.default_props ?? {}),
                            });
                          }}
                          className="w-full text-left px-3 py-2 rounded-xl border cursor-pointer transition"
                          style={{
                            backgroundColor: active ? 'var(--bg-surface-alt)' : 'transparent',
                            borderColor: active ? 'var(--accent-primary)' : 'var(--border-subtle)',
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold truncate">
                              {s.number} / {s.name}
                            </span>
                            {s.transparent_ready && (
                              <span
                                className="caption-label px-1.5 py-0.5 rounded-full"
                                style={{
                                  backgroundColor: 'var(--accent-blue)',
                                  color: 'var(--accent-blue-ink)',
                                }}
                              >
                                ALPHA
                              </span>
                            )}
                          </div>
                          <div className="caption-label mt-1 truncate">{s.category}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {editorLeftTab === 'brand' && (
                <div className="space-y-4">
                  {/* Tier 1: Curated Presets & Approved Caption Look */}
                  <div className="space-y-2">
                    <div className="caption-label">BRAND PRESETS (LIVE STAGE PREVIEW)</div>
                    <div className="grid grid-cols-1 gap-1.5">
                      {(brandKits.length > 0 ? brandKits : BUILTIN_BRAND_PRESETS).map((preset) => {
                        const active = selectedPresetId === preset.id;
                        return (
                          <button
                            key={preset.id}
                            onClick={() => {
                              setSelectedPresetId(preset.id);
                              setBrandDraft(preset.tokens);
                              setBrandDirty(true);
                              setPreviewTokensOverride(preset.tokens);
                              setBrandSavedMsg(`Previewing "${preset.name}" — save below to apply`);
                            }}
                            className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl border text-left cursor-pointer transition"
                            style={{
                              backgroundColor: active ? 'var(--bg-surface-alt)' : 'transparent',
                              borderColor: active ? 'var(--accent-primary)' : 'var(--border-subtle)',
                            }}
                          >
                            <span className="text-xs font-medium truncate">{preset.name}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              {[preset.tokens.stage_bg, preset.tokens.surface_card, preset.tokens.accent_primary].map(
                                (col, i) => (
                                  <span
                                    key={i}
                                    className="w-3 h-3 rounded-full border"
                                    style={{
                                      backgroundColor: col,
                                      borderColor: 'rgba(255,255,255,0.2)',
                                    }}
                                  />
                                )
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Caption Look */}
                  <div className="space-y-2">
                    <div className="caption-label">CAPTION LOOK & POSITION</div>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={brandDraft.caption_style}
                        onChange={(e) =>
                          updateBrandToken('caption_style', e.target.value as BrandTokens['caption_style'])
                        }
                        className="px-2 py-1.5 rounded-lg border text-xs outline-none"
                        style={{
                          backgroundColor: 'var(--bg-surface-alt)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        {(Object.keys(CAPTION_STYLE_LABELS) as CaptionStyleVariant[]).map((styleKey) => (
                          <option key={styleKey} value={styleKey}>
                            {CAPTION_STYLE_LABELS[styleKey]}
                          </option>
                        ))}
                      </select>

                      <select
                        value={brandDraft.caption_position}
                        onChange={(e) =>
                          updateBrandToken('caption_position', e.target.value as BrandTokens['caption_position'])
                        }
                        className="px-2 py-1.5 rounded-lg border text-xs outline-none"
                        style={{
                          backgroundColor: 'var(--bg-surface-alt)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <option value="bottom">Bottom</option>
                        <option value="lower-third">Lower Third</option>
                        <option value="center">Center</option>
                      </select>
                    </div>
                  </div>

                  {/* Tier 2: Bring Your Own DESIGN.md */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'copy';
                    }}
                    onDrop={async (e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files?.[0];
                      if (!file) return;
                      const raw = await file.text();
                      const mode = /\bmode\s*[:=]\s*dark\b|\bdark\b/i.test(raw.slice(0, 400)) ? 'dark' : 'light';
                      const parsed = parseDesignMd(raw, mode);
                      const cleanName = file.name.replace(/\.(design\.md|md|markdown|txt)$/i, '');
                      setSelectedPresetId(null);
                      setBrandDraft(parsed);
                      setBrandDirty(true);
                      setPreviewTokensOverride(parsed);
                      setPresetName(cleanName);
                      setBrandSavedMsg(`Loaded "${file.name}" — save below to apply`);
                    }}
                    className="p-3 rounded-2xl border border-dashed space-y-2"
                    style={{
                      backgroundColor: 'var(--bg-surface-alt)',
                      borderColor: 'var(--border-subtle)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="caption-label flex items-center gap-1">
                        <FileText size={11} /> YOUR DESIGN.MD
                      </div>
                      <button
                        onClick={() => setShowPasteDesign(!showPasteDesign)}
                        className="text-[11px] underline cursor-pointer"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {showPasteDesign ? 'Hide paste' : 'Paste markdown'}
                      </button>
                    </div>
                    <button
                      onClick={async () => {
                        const res = await window.studio.importDesignMdDialog();
                        if (!res) return;
                        setSelectedPresetId(null);
                        setBrandDraft(res.tokens);
                        setBrandDirty(true);
                        setPreviewTokensOverride(res.tokens);
                        setPresetName(res.name);
                        setBrandSavedMsg(`Loaded "${res.fileName}" — save below to apply`);
                      }}
                      className="btn-secondary w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs"
                    >
                      <Upload size={12} /> Import DESIGN.md (or drop .md here)
                    </button>
                    {showPasteDesign && (
                      <div className="space-y-1.5 pt-1">
                        <textarea
                          rows={4}
                          value={pasteDesignText}
                          onChange={(e) => setPasteDesignText(e.target.value)}
                          placeholder="Paste DESIGN.md contents..."
                          className="w-full p-2 rounded-lg border text-[11px] outline-none"
                          style={{
                            backgroundColor: 'var(--bg-canvas)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-primary)',
                          }}
                        />
                        <button
                          onClick={() => {
                            if (!pasteDesignText.trim()) return;
                            const mode = /\bmode\s*[:=]\s*dark\b|\bdark\b/i.test(pasteDesignText.slice(0, 400))
                              ? 'dark'
                              : 'light';
                            const parsed = parseDesignMd(pasteDesignText, mode);
                            setSelectedPresetId(null);
                            setBrandDraft(parsed);
                            setBrandDirty(true);
                            setPreviewTokensOverride(parsed);
                            setShowPasteDesign(false);
                            setBrandSavedMsg('Parsed pasted DESIGN.md — save below to apply');
                          }}
                          className="btn-primary w-full py-1 text-[11px]"
                        >
                          Parse & Preview
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Tier 3: Collapsible Customize Tokens */}
                  <div className="space-y-2">
                    <button
                      onClick={() => setShowCustomizeTokens(!showCustomizeTokens)}
                      className="w-full flex items-center justify-between text-xs py-1 cursor-pointer"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <span className="caption-label">CUSTOMIZE TOKENS</span>
                      {showCustomizeTokens ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </button>
                    {showCustomizeTokens && (
                      <div className="space-y-2.5 pt-1">
                        <select
                          value={brandDraft.display_weight}
                          onChange={(e) => updateBrandToken('display_weight', e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none"
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
                          {(
                            [
                              ['stage_bg', 'Stage Bg'],
                              ['surface_card', 'Card'],
                              ['accent_primary', 'Accent'],
                              ['caption_color', 'Caption Text'],
                            ] as Array<[keyof BrandTokens, string]>
                          ).map(([k, label]) => (
                            <label
                              key={k}
                              className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg border"
                              style={{ backgroundColor: 'var(--bg-surface-alt)', borderColor: 'var(--border-subtle)' }}
                            >
                              <span className="truncate">{label}</span>
                              <input
                                type="color"
                                value={brandDraft[k].startsWith('#') ? brandDraft[k] : '#C4FF2E'}
                                onChange={(e) => updateBrandToken(k, e.target.value)}
                                className="w-5 h-4 rounded cursor-pointer bg-transparent border-0"
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                    <button
                      onClick={() => void handleSaveBrandProject()}
                      className="btn-primary w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs"
                    >
                      <Save size={13} /> Save Brand Kit to Project
                    </button>

                    <div className="flex gap-1.5">
                      <input
                        value={presetName}
                        onChange={(e) => setPresetName(e.target.value)}
                        placeholder="Save as vault preset..."
                        className="flex-1 px-2.5 py-1.5 rounded-lg border text-xs outline-none"
                        style={{
                          backgroundColor: 'var(--bg-surface-alt)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      />
                      <button
                        onClick={() => void handleSaveGlobalPreset()}
                        disabled={!presetName.trim()}
                        className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
                      >
                        Save
                      </button>
                    </div>

                    {brandSavedMsg && (
                      <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent-mint)' }}>
                        <Check size={13} /> {brandSavedMsg}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Center Preview Canvas */}
        <PreviewCanvas totalDuration={totalDuration} onMediaDuration={setMediaDurationSec} />

        {/* Right Clip & Scene Inspector (Collapsible) */}
        {rightCollapsed ? (
          <div
            className="w-10 shrink-0 border-l flex flex-col items-center py-3 gap-2"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            <button
              onClick={() => setRightCollapsed(false)}
              className="btn-icon w-7 h-7"
              title="Expand Inspector"
            >
              <PanelRightOpen size={13} />
            </button>
          </div>
        ) : (
          <div
            className="w-60 xl:w-72 shrink-0 border-l p-4 overflow-y-auto space-y-4"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="eyebrow-label">INSPECTOR</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() =>
                    pinContextChip({
                      kind: 'project',
                      label: `Project: ${activeProjectSlug}`,
                      payload: {
                        projectSlug: activeProjectSlug,
                        aspectRatio: projectState.manifest.aspectRatio,
                      },
                    })
                  }
                  className="btn-secondary flex items-center gap-1 px-2.5 py-1 text-[11px]"
                >
                  <Sparkles size={11} /> Pin
                </button>
                <button
                  onClick={() => setRightCollapsed(true)}
                  className="btn-icon w-6 h-6"
                  title="Collapse Inspector"
                >
                  <PanelRightClose size={12} />
                </button>
              </div>
            </div>

            {selectedPlate ? (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="font-semibold truncate">{selectedPlate.label || selectedPlate.sceneId}</div>
                  <button
                    onClick={() => {
                      void applyOps(
                        [{ op: 'remove_motion_plate', id: selectedPlate.id }],
                        `Removed motion plate ${selectedPlate.sceneId}`
                      );
                      setSelectedItem(null);
                    }}
                    className="btn-icon w-7 h-7"
                    title="Remove Motion Plate"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="caption-label block">START (S)</span>
                    <input
                      key={`mp-s-${selectedPlate.id}-${selectedPlate.start}`}
                      type="number"
                      step={0.1}
                      defaultValue={selectedPlate.start}
                      onBlur={(e) =>
                        void applyOps(
                          [{ op: 'update_motion_plate', id: selectedPlate.id, patch: { start: Number(e.target.value) } }],
                          'Adjusted motion plate start'
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border t-num"
                      style={{
                        backgroundColor: 'var(--bg-surface-alt)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="caption-label block">END (S)</span>
                    <input
                      key={`mp-e-${selectedPlate.id}-${selectedPlate.end}`}
                      type="number"
                      step={0.1}
                      defaultValue={selectedPlate.end}
                      onBlur={(e) =>
                        void applyOps(
                          [{ op: 'update_motion_plate', id: selectedPlate.id, patch: { end: Number(e.target.value) } }],
                          'Adjusted motion plate end'
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border t-num"
                      style={{
                        backgroundColor: 'var(--bg-surface-alt)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </label>
                </div>
                <div className="caption-label">EDITABLE PROPS</div>
                <div className="space-y-2">
                  {Object.entries(selectedPlate.props).map(([k, val]) =>
                    typeof val === 'string' || typeof val === 'number' ? (
                      <label key={`${selectedPlate.id}-${k}`} className="block space-y-1">
                        <span className="caption-label block">{k}</span>
                        <input
                          type={typeof val === 'number' ? 'number' : 'text'}
                          defaultValue={String(val)}
                          onBlur={(e) =>
                            void applyOps(
                              [
                                {
                                  op: 'update_motion_plate',
                                  id: selectedPlate.id,
                                  patch: {
                                    props: {
                                      ...selectedPlate.props,
                                      [k]: typeof val === 'number' ? Number(e.target.value) : e.target.value,
                                    },
                                  },
                                },
                              ],
                              `Updated ${k} on motion plate`
                            )
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg border text-xs outline-none"
                          style={{
                            backgroundColor: 'var(--bg-surface-alt)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-primary)',
                          }}
                        />
                      </label>
                    ) : null
                  )}
                </div>
              </div>
            ) : selectedCaption ? (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="caption-label">CAPTION SEGMENT</div>
                  <button
                    onClick={() => {
                      void applyOps([{ op: 'remove_caption', id: selectedCaption.id }], 'Removed caption');
                      setSelectedItem(null);
                    }}
                    className="btn-icon w-7 h-7"
                    title="Delete Caption"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <textarea
                  key={selectedCaption.id}
                  rows={3}
                  defaultValue={selectedCaption.text}
                  onBlur={(e) =>
                    void applyOps(
                      [{ op: 'update_caption', id: selectedCaption.id, patch: { text: e.target.value } }],
                      'Updated caption text'
                    )
                  }
                  className="w-full p-2.5 rounded-lg border outline-none"
                  style={{
                    backgroundColor: 'var(--bg-surface-alt)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="caption-label block">START (S)</span>
                    <input
                      key={`cap-s-${selectedCaption.id}-${selectedCaption.start}`}
                      type="number"
                      step={0.1}
                      defaultValue={selectedCaption.start}
                      onBlur={(e) =>
                        void applyOps(
                          [{ op: 'update_caption', id: selectedCaption.id, patch: { start: Number(e.target.value) } }],
                          'Adjusted caption start'
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border t-num"
                      style={{
                        backgroundColor: 'var(--bg-surface-alt)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="caption-label block">END (S)</span>
                    <input
                      key={`cap-e-${selectedCaption.id}-${selectedCaption.end}`}
                      type="number"
                      step={0.1}
                      defaultValue={selectedCaption.end}
                      onBlur={(e) =>
                        void applyOps(
                          [{ op: 'update_caption', id: selectedCaption.id, patch: { end: Number(e.target.value) } }],
                          'Adjusted caption end'
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border t-num"
                      style={{
                        backgroundColor: 'var(--bg-surface-alt)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
                  </label>
                </div>
                <label className="block space-y-1">
                  <span className="caption-label block">HIGHLIGHT WORD</span>
                  <input
                    key={`cap-hw-${selectedCaption.id}`}
                    type="text"
                    defaultValue={selectedCaption.highlightWord ?? ''}
                    placeholder="Optional keyword to accent..."
                    onBlur={(e) =>
                      void applyOps(
                        [{ op: 'update_caption', id: selectedCaption.id, patch: { highlightWord: e.target.value || undefined } }],
                        'Updated caption highlight word'
                      )
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border outline-none"
                    style={{
                      backgroundColor: 'var(--bg-surface-alt)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </label>
              </div>
            ) : selectedMove && selectedItem?.kind === 'cameraMove' ? (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="caption-label">CAMERA MOVE</div>
                  <button
                    onClick={() => {
                      void applyOps(
                        [{ op: 'remove_camera_move', index: selectedItem.index, id: selectedMove.id }],
                        'Removed camera move'
                      );
                      setSelectedItem(null);
                    }}
                    className="btn-icon w-7 h-7"
                    title="Delete Camera Move"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="caption-label block">START (S)</span>
                    <input
                      key={`cm-s-${selectedItem.index}-${selectedMove.start}`}
                      type="number"
                      step={0.1}
                      defaultValue={selectedMove.start}
                      onBlur={(e) =>
                        void applyOps(
                          [{ op: 'update_camera_move', index: selectedItem.index, patch: { start: Number(e.target.value) } }],
                          'Adjusted camera move start'
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border t-num"
                      style={{ backgroundColor: 'var(--bg-surface-alt)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="caption-label block">END (S)</span>
                    <input
                      key={`cm-e-${selectedItem.index}-${selectedMove.end}`}
                      type="number"
                      step={0.1}
                      defaultValue={selectedMove.end}
                      onBlur={(e) =>
                        void applyOps(
                          [{ op: 'update_camera_move', index: selectedItem.index, patch: { end: Number(e.target.value) } }],
                          'Adjusted camera move end'
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border t-num"
                      style={{ backgroundColor: 'var(--bg-surface-alt)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="caption-label block">TO SCALE</span>
                    <input
                      key={`cm-sc-${selectedItem.index}-${selectedMove.toScale}`}
                      type="number"
                      step={0.02}
                      defaultValue={selectedMove.toScale}
                      onBlur={(e) =>
                        void applyOps(
                          [{ op: 'update_camera_move', index: selectedItem.index, patch: { toScale: Number(e.target.value) } }],
                          'Updated zoom scale'
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border t-num"
                      style={{ backgroundColor: 'var(--bg-surface-alt)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="caption-label block">EASING</span>
                    <select
                      value={selectedMove.easing ?? 'easeInOutCubic'}
                      onChange={(e) =>
                        void applyOps(
                          [{ op: 'update_camera_move', index: selectedItem.index, patch: { easing: e.target.value as 'easeInOutCubic' | 'easeOutCubic' | 'linear' } }],
                          'Updated zoom easing'
                        )
                      }
                      className="w-full px-2 py-1.5 rounded-lg border outline-none"
                      style={{ backgroundColor: 'var(--bg-surface-alt)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                    >
                      <option value="easeInOutCubic">easeInOutCubic</option>
                      <option value="easeOutCubic">easeOutCubic</option>
                      <option value="linear">linear</option>
                    </select>
                  </label>
                </div>
              </div>
            ) : selectedBroll && selectedItem?.kind === 'broll' ? (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="caption-label">B-ROLL BEAT</div>
                  <button
                    onClick={() => {
                      void applyOps(
                        [{ op: 'remove_broll', index: selectedItem.index, id: selectedBroll.id }],
                        'Removed B-roll beat'
                      );
                      setSelectedItem(null);
                    }}
                    className="btn-icon w-7 h-7"
                    title="Delete B-Roll"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <label className="block space-y-1">
                  <span className="caption-label block">LABEL</span>
                  <input
                    key={`br-l-${selectedItem.index}`}
                    defaultValue={selectedBroll.label}
                    onBlur={(e) =>
                      void applyOps(
                        [{ op: 'update_broll', index: selectedItem.index, patch: { label: e.target.value } }],
                        'Updated B-roll label'
                      )
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border outline-none"
                    style={{ backgroundColor: 'var(--bg-surface-alt)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="caption-label block">START (S)</span>
                    <input
                      key={`br-s-${selectedItem.index}`}
                      type="number"
                      step={0.1}
                      defaultValue={selectedBroll.start}
                      onBlur={(e) =>
                        void applyOps(
                          [{ op: 'update_broll', index: selectedItem.index, patch: { start: Number(e.target.value) } }],
                          'Updated B-roll start'
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border t-num"
                      style={{ backgroundColor: 'var(--bg-surface-alt)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="caption-label block">END (S)</span>
                    <input
                      key={`br-e-${selectedItem.index}`}
                      type="number"
                      step={0.1}
                      defaultValue={selectedBroll.end}
                      onBlur={(e) =>
                        void applyOps(
                          [{ op: 'update_broll', index: selectedItem.index, patch: { end: Number(e.target.value) } }],
                          'Updated B-roll end'
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border t-num"
                      style={{ backgroundColor: 'var(--bg-surface-alt)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                    />
                  </label>
                </div>
              </div>
            ) : selectedShot ? (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="caption-label">SEQUENCE SHOT</div>
                  <button
                    onClick={() => {
                      void applyOps([{ op: 'remove_shot', id: selectedShot.id }], 'Removed shot');
                      setSelectedItem(null);
                    }}
                    className="btn-icon w-7 h-7"
                    title="Remove Shot"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="font-semibold">{selectedShot.label}</div>
                <div className="truncate" style={{ color: 'var(--text-secondary)' }} title={selectedShot.source}>
                  {selectedShot.source}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="caption-label block">START (S)</span>
                    <input
                      key={`sh-s-${selectedShot.id}`}
                      type="number"
                      step={0.1}
                      defaultValue={selectedShot.start}
                      onBlur={(e) =>
                        void applyOps(
                          [{ op: 'update_shot', id: selectedShot.id, patch: { start: Number(e.target.value) } }],
                          'Updated shot start'
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border t-num"
                      style={{ backgroundColor: 'var(--bg-surface-alt)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="caption-label block">END (S)</span>
                    <input
                      key={`sh-e-${selectedShot.id}`}
                      type="number"
                      step={0.1}
                      defaultValue={selectedShot.end}
                      onBlur={(e) =>
                        void applyOps(
                          [{ op: 'update_shot', id: selectedShot.id, patch: { end: Number(e.target.value) } }],
                          'Updated shot end'
                        )
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg border t-num"
                      style={{ backgroundColor: 'var(--bg-surface-alt)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                    />
                  </label>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedShot.stabilize}
                    onChange={(e) =>
                      void applyOps(
                        [{ op: 'update_shot', id: selectedShot.id, patch: { stabilize: e.target.checked } }],
                        'Toggled shot stabilization'
                      )
                    }
                  />
                  <span>Stabilize (deshake)</span>
                </label>
              </div>
            ) : selectedItem?.kind === 'audioTrack' && plan.audio?.musicTrack ? (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <div className="caption-label">AUDIO / MUSIC BED</div>
                  <button
                    onClick={() => {
                      void applyOps(
                        [
                          {
                            op: 'update_audio',
                            audio: {
                              ...(plan.audio ?? {}),
                              musicTrack: undefined,
                            },
                          },
                        ],
                        'Removed music bed'
                      );
                      setSelectedItem(null);
                    }}
                    className="btn-icon w-7 h-7"
                    title="Remove Music Bed"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <div
                  className="p-2.5 rounded-lg border truncate font-medium"
                  style={{
                    backgroundColor: 'var(--bg-surface-alt)',
                    borderColor: 'var(--border-subtle)',
                  }}
                  title={plan.audio.musicTrack}
                >
                  {plan.audio.musicTrack}
                </div>
                <label className="block space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="caption-label">VOLUME (DB)</span>
                    <span className="t-num font-semibold">{plan.audio.musicDb ?? -18} dB</span>
                  </div>
                  <input
                    type="range"
                    min={-30}
                    max={0}
                    step={1}
                    value={plan.audio.musicDb ?? -18}
                    onChange={(e) =>
                      void applyOps(
                        [
                          {
                            op: 'update_audio',
                            audio: {
                              ...(plan.audio ?? {}),
                              musicDb: Number(e.target.value),
                            },
                          },
                        ],
                        `Adjusted music volume to ${e.target.value} dB`
                      )
                    }
                    className="w-full accent-[#C4FF2E] cursor-pointer"
                  />
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(plan.audio.sidechainDuck)}
                    onChange={(e) =>
                      void applyOps(
                        [
                          {
                            op: 'update_audio',
                            audio: {
                              ...(plan.audio ?? {}),
                              sidechainDuck: e.target.checked,
                            },
                          },
                        ],
                        e.target.checked ? 'Enabled sidechain ducking' : 'Disabled sidechain ducking'
                      )
                    }
                  />
                  <span>Sidechain Ducking</span>
                </label>
              </div>
            ) : selectedNote ? (
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="caption-label">REVIEW NOTE @ {selectedNote.atSec.toFixed(1)}s</span>
                  <button
                    onClick={() => {
                      void applyOps([{ op: 'remove_review_note', id: selectedNote.id }], 'Removed review note');
                      setSelectedItem(null);
                    }}
                    className="btn-icon w-7 h-7"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <p>{selectedNote.text}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      void applyOps(
                        [{ op: 'resolve_review_note', id: selectedNote.id, resolved: !selectedNote.resolved }],
                        selectedNote.resolved ? 'Reopened note' : 'Resolved note'
                      )
                    }
                    className="btn-secondary px-3 py-1.5 text-[11px]"
                  >
                    {selectedNote.resolved ? 'Reopen' : 'Mark Resolved'}
                  </button>
                  <button
                    onClick={() =>
                      pinContextChip({
                        kind: 'review-note',
                        label: `Note @ ${selectedNote.atSec.toFixed(1)}s`,
                        payload: {
                          projectSlug: activeProjectSlug,
                          atSec: selectedNote.atSec,
                          text: selectedNote.text,
                        },
                      })
                    }
                    className="btn-primary px-3 py-1.5 text-[11px]"
                  >
                    Send to Terminal
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <p style={{ color: 'var(--text-secondary)' }}>
                  Select any shot, motion plate, caption, zoom, or review note on the timeline.
                </p>
                <div
                  className="p-3.5 rounded-2xl border space-y-1.5"
                  style={{ backgroundColor: 'var(--bg-surface-alt)', borderColor: 'var(--border-subtle)' }}
                >
                  <div className="caption-label mb-2">PROJECT SUMMARY</div>
                  <div className="t-num">Shots: {plan.shots.length}</div>
                  <div className="t-num">Motion Plates: {plan.motionPlates.length}</div>
                  <div className="t-num">Captions: {plan.captions.length}</div>
                  <div className="t-num">Camera Moves: {plan.cameraMoves.length}</div>
                  <div className="t-num">Media Files: {projectState.mediaFiles.length}</div>
                </div>
              </div>
            )}

            {/* Review Notes List */}
            {plan.reviewNotes.length > 0 && (
              <div className="pt-3 border-t space-y-2" style={{ borderColor: 'var(--border-subtle)' }}>
                <div className="flex items-center justify-between">
                  <span className="caption-label flex items-center gap-1">
                    <MessageSquare size={11} /> REVIEW NOTES ({plan.reviewNotes.length})
                  </span>
                </div>
                <div className="space-y-1.5">
                  {plan.reviewNotes.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => {
                        setCurrentTimeSec(n.atSec);
                        setSelectedItem({ kind: 'reviewNote', id: n.id });
                      }}
                      className="w-full text-left p-2 rounded-xl border text-xs cursor-pointer transition"
                      style={{
                        backgroundColor: 'var(--bg-surface-alt)',
                        borderColor:
                          selectedNote?.id === n.id ? 'var(--accent-primary)' : 'var(--border-subtle)',
                        opacity: n.resolved ? 0.55 : 1,
                      }}
                    >
                      <div className="caption-label t-num">@ {n.atSec.toFixed(1)}s</div>
                      <div className={`mt-0.5 line-clamp-2 ${n.resolved ? 'line-through' : ''}`}>
                        {n.text}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Timeline */}
      <Timeline totalDuration={totalDuration} />
    </div>
  );
};
