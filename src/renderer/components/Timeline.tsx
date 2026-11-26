import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Eye,
  EyeOff,
  Magnet,
  Maximize2,
  Plus,
  Scissors,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { TrackKey, useStudioStore } from '../store/studioStore';
import type { TimelineOp } from '../../shared/schemas';

type DragItemKind = 'shot' | 'cameraMove' | 'broll' | 'motionPlate' | 'caption';
type DragMode = 'move' | 'trim-start' | 'trim-end';
type DropTrackKind = 'video' | 'broll' | 'motion' | 'audio';

interface DragState {
  kind: DragItemKind;
  id?: string;
  index?: number;
  mode: DragMode;
  startClientX: number;
  origStart: number;
  origEnd: number;
  origSrcIn?: number;
  moved: boolean;
}

function formatTimecode(sec: number): string {
  const s = Math.max(0, sec);
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(mins).padStart(2, '0')}:${rem.toFixed(2).padStart(5, '0')}`;
}

function formatRulerTick(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export const Timeline: React.FC<{ totalDuration: number }> = ({ totalDuration }) => {
  const {
    projectState,
    currentTimeSec,
    setCurrentTimeSec,
    isPlaying,
    selectedItem,
    setSelectedItem,
    applyOps,
    setEditorLeftTab,
    trackVisibility,
    toggleTrackVisibility,
    setAuditionMotionScene,
    activeProjectSlug,
    refreshVaultData,
  } = useStudioStore();

  const scrollRef = useRef<HTMLDivElement>(null);
  const draggingPlayheadRef = useRef(false);
  const [viewportWidth, setViewportWidth] = useState(800);
  const [zoomPxPerSec, setZoomPxPerSec] = useState(48);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragPreview, setDragPreview] = useState<{ start: number; end: number } | null>(null);
  const [dropHover, setDropHover] = useState<{ track: DropTrackKind; timeSec: number } | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setViewportWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    setViewportWidth(el.clientWidth || 800);
    return () => ro.disconnect();
  }, []);

  const dur = Math.max(15, totalDuration);
  const labelColWidth = 152;
  const availableTrackWidth = Math.max(360, viewportWidth - labelColWidth);
  const contentWidth = Math.max(availableTrackWidth, Math.ceil(dur * zoomPxPerSec) + 96);
  const pxPerSec = contentWidth / dur;

  // Auto-fit zoom gently when project changes
  const projectSlug = projectState?.manifest.slug ?? '';
  useEffect(() => {
    if (!projectSlug) return;
    const fitPx = Math.max(18, Math.min(90, Math.floor((availableTrackWidth - 40) / dur)));
    setZoomPxPerSec(fitPx);
  }, [projectSlug]);

  // Auto-scroll playhead into view during playback
  useEffect(() => {
    if (!isPlaying || !scrollRef.current) return;
    const el = scrollRef.current;
    const playheadPx = currentTimeSec * pxPerSec;
    const visibleStart = el.scrollLeft;
    const visibleEnd = visibleStart + availableTrackWidth;
    if (playheadPx < visibleStart + 24 || playheadPx > visibleEnd - 48) {
      el.scrollLeft = Math.max(0, playheadPx - availableTrackWidth * 0.25);
    }
  }, [currentTimeSec, isPlaying, pxPerSec, availableTrackWidth]);

  // Delete selected item via Backspace/Delete
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.closest('.xterm')) {
        return;
      }
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedItem) {
        e.preventDefault();
        void handleDeleteSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedItem, projectState?.editPlan]);

  // Global pointer listeners for clip drag/trim
  useEffect(() => {
    if (!dragState) return;

    const snapTime = (t: number): number => {
      if (!snapEnabled) return Math.max(0, Number(t.toFixed(2)));
      if (Math.abs(t - currentTimeSec) * pxPerSec < 8) {
        return Number(currentTimeSec.toFixed(2));
      }
      return Math.max(0, Number((Math.round(t * 10) / 10).toFixed(2)));
    };

    const computeRange = (clientX: number) => {
      const dx = clientX - dragState.startClientX;
      const dt = dx / pxPerSec;
      const durSpan = Math.max(0.2, dragState.origEnd - dragState.origStart);
      if (dragState.mode === 'move') {
        const nextStart = snapTime(Math.max(0, dragState.origStart + dt));
        return {
          start: nextStart,
          end: Number((nextStart + durSpan).toFixed(2)),
          moved: Math.abs(dx) > 3,
        };
      }
      if (dragState.mode === 'trim-start') {
        const nextStart = snapTime(Math.min(dragState.origEnd - 0.2, Math.max(0, dragState.origStart + dt)));
        return {
          start: nextStart,
          end: dragState.origEnd,
          moved: Math.abs(dx) > 3,
        };
      }
      const nextEnd = snapTime(Math.max(dragState.origStart + 0.2, dragState.origEnd + dt));
      return {
        start: dragState.origStart,
        end: nextEnd,
        moved: Math.abs(dx) > 3,
      };
    };

    const onMove = (e: PointerEvent) => {
      const next = computeRange(e.clientX);
      setDragPreview({ start: next.start, end: next.end });
      if (next.moved && !dragState.moved) {
        setDragState((prev) => (prev ? { ...prev, moved: true } : null));
      }
    };

    const onUp = (e: PointerEvent) => {
      const next = computeRange(e.clientX);
      const wasMoved = next.moved;
      const current = dragState;
      setDragState(null);
      setDragPreview(null);
      if (!wasMoved) return;

      const ops: TimelineOp[] = [];
      if (current.kind === 'shot' && current.id) {
        const deltaStart = next.start - current.origStart;
        const patch: Record<string, number> = { start: next.start, end: next.end };
        if (current.mode === 'trim-start' && typeof current.origSrcIn === 'number') {
          patch.srcIn = Math.max(0, Number((current.origSrcIn + deltaStart).toFixed(2)));
        }
        ops.push({ op: 'update_shot', id: current.id, patch });
      } else if (current.kind === 'cameraMove') {
        ops.push({
          op: 'update_camera_move',
          index: current.index,
          id: current.id,
          patch: { start: next.start, end: next.end },
        });
      } else if (current.kind === 'broll') {
        ops.push({
          op: 'update_broll',
          index: current.index,
          id: current.id,
          patch: { start: next.start, end: next.end },
        });
      } else if (current.kind === 'motionPlate' && current.id) {
        ops.push({
          op: 'update_motion_plate',
          id: current.id,
          patch: { start: next.start, end: next.end },
        });
      } else if (current.kind === 'caption' && current.id) {
        ops.push({
          op: 'update_caption',
          id: current.id,
          patch: { start: next.start, end: next.end },
        });
      }
      if (ops.length > 0) {
        void applyOps(ops, `Adjusted ${current.kind} timing (${next.start.toFixed(1)}s–${next.end.toFixed(1)}s)`);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragState, pxPerSec, snapEnabled, currentTimeSec, applyOps]);

  const rulerTicks = useMemo(() => {
    const step =
      pxPerSec >= 80 ? 1 : pxPerSec >= 40 ? 2 : pxPerSec >= 18 ? 5 : pxPerSec >= 9 ? 10 : 30;
    const major: number[] = [];
    for (let t = 0; t <= dur; t += step) {
      major.push(t);
    }
    return { step, major };
  }, [dur, pxPerSec]);

  if (!projectState) return null;
  const plan = projectState.editPlan;

  const toPx = (t: number) => Math.max(0, t * pxPerSec);
  const spanPx = (start: number, end: number) => Math.max(18, (end - start) * pxPerSec);

  const seekFromClientX = (el: HTMLDivElement, clientX: number) => {
    setAuditionMotionScene(null);
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, clientX - rect.left);
    setCurrentTimeSec(Number(Math.min(dur, x / pxPerSec).toFixed(2)));
  };

  const getDropTime = (el: HTMLDivElement, clientX: number) => {
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, clientX - rect.left);
    const raw = Math.min(dur, x / pxPerSec);
    return Number((snapEnabled ? Math.round(raw * 10) / 10 : raw).toFixed(2));
  };

  const handleTrackDragOver = (e: React.DragEvent<HTMLDivElement>, track: DropTrackKind) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropHover({ track, timeSec: getDropTime(e.currentTarget, e.clientX) });
  };

  const handleTrackDrop = async (e: React.DragEvent<HTMLDivElement>, track: DropTrackKind) => {
    e.preventDefault();
    const dropTimeSec = getDropTime(e.currentTarget, e.clientX);
    setDropHover(null);
    setAuditionMotionScene(null);

    const rawInternal = e.dataTransfer.getData('application/x-studio-item');
    if (rawInternal) {
      try {
        const item = JSON.parse(rawInternal) as {
          kind: string;
          sceneId?: string;
          name?: string;
          duration?: number;
          transparent?: boolean;
          defaultProps?: Record<string, unknown>;
          source?: string;
          label?: string;
          mediaKind?: string;
        };
        if (item.kind === 'motion-scene' && item.sceneId) {
          const id = `mp_${Date.now()}`;
          const end = Number((dropTimeSec + (item.duration || 5)).toFixed(2));
          await applyOps(
            [
              {
                op: 'add_motion_plate',
                plate: {
                  id,
                  sceneId: item.sceneId,
                  label: item.name || item.sceneId,
                  start: dropTimeSec,
                  end,
                  transparent: Boolean(item.transparent),
                  props: item.defaultProps ?? {},
                },
              },
            ],
            `Dropped ${item.name || item.sceneId} at ${dropTimeSec}s`
          );
          setSelectedItem({ kind: 'motionPlate', id });
          setCurrentTimeSec(dropTimeSec);
          return;
        }
        if (item.kind === 'studio-media' && item.source) {
          const label = item.label || item.source;
          if (track === 'audio' || item.mediaKind === 'audio') {
            await applyOps(
              [
                {
                  op: 'update_audio',
                  audio: {
                    ...(plan.audio ?? {}),
                    musicTrack: item.source,
                    musicDb: plan.audio?.musicDb ?? -18,
                    sidechainDuck: plan.audio?.sidechainDuck ?? true,
                  },
                },
              ],
              `Set ${label} as music bed`
            );
            setSelectedItem({ kind: 'audioTrack' });
          } else if (track === 'broll' || item.mediaKind === 'image') {
            const id = `br_${Date.now()}`;
            await applyOps(
              [
                {
                  op: 'add_broll',
                  broll: {
                    id,
                    label,
                    source: item.source,
                    kind: item.mediaKind === 'image' ? 'image' : 'video',
                    start: dropTimeSec,
                    end: Number((dropTimeSec + 4).toFixed(2)),
                  },
                },
              ],
              `Dropped B-roll ${label} at ${dropTimeSec}s`
            );
            setCurrentTimeSec(dropTimeSec);
          } else {
            const id = `shot_${Date.now()}`;
            await applyOps(
              [
                {
                  op: 'add_shot',
                  shot: {
                    id,
                    source: item.source,
                    label,
                    start: dropTimeSec,
                    end: Number((dropTimeSec + 5).toFixed(2)),
                    srcIn: 0,
                    speed: 1,
                    volume: 1,
                    transitionIn: 'cut',
                    stabilize: false,
                  },
                },
              ],
              `Dropped shot ${label} at ${dropTimeSec}s`
            );
            setSelectedItem({ kind: 'shot', id });
            setCurrentTimeSec(dropTimeSec);
          }
          return;
        }
      } catch {
        // Ignore malformed drag payload
      }
    }

    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length > 0 && activeProjectSlug) {
      const paths = files.map((f) => window.studio.getPathForFile(f)).filter(Boolean);
      if (paths.length === 0) return;
      const res = (await window.studio.registerMedia(activeProjectSlug, paths, 'link')) as {
        registered?: Array<{ id: string; kind: string; uri: string; label?: string; durationSec?: number }>;
      };
      await refreshVaultData();
      const ops: TimelineOp[] = [];
      let cursor = dropTimeSec;
      for (const asset of res?.registered ?? []) {
        const label = asset.label || asset.id;
        if (track === 'audio' || asset.kind === 'audio') {
          ops.push({
            op: 'update_audio',
            audio: {
              ...(plan.audio ?? {}),
              musicTrack: asset.id,
              musicDb: plan.audio?.musicDb ?? -18,
              sidechainDuck: plan.audio?.sidechainDuck ?? true,
            },
          });
        } else if (track === 'broll' || asset.kind === 'image') {
          const durSec = asset.durationSec ? Math.min(5, asset.durationSec) : 4;
          ops.push({
            op: 'add_broll',
            broll: {
              id: `br_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
              label,
              source: asset.id,
              kind: asset.kind === 'image' ? 'image' : 'video',
              start: Number(cursor.toFixed(2)),
              end: Number((cursor + durSec).toFixed(2)),
            },
          });
          cursor += durSec;
        } else {
          const durSec = asset.durationSec ? Math.min(6, asset.durationSec) : 5;
          ops.push({
            op: 'add_shot',
            shot: {
              id: `shot_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
              assetId: asset.id,
              source: asset.uri,
              label,
              start: Number(cursor.toFixed(2)),
              end: Number((cursor + durSec).toFixed(2)),
              srcIn: 0,
              speed: 1,
              volume: 1,
              transitionIn: 'cut',
              stabilize: false,
            },
          });
          cursor += durSec;
        }
      }
      if (ops.length > 0) {
        await applyOps(ops, `Dropped ${ops.length} media file(s) onto ${track} track`);
        setCurrentTimeSec(dropTimeSec);
      }
    }
  };

  const renderDropIndicator = (track: DropTrackKind) => {
    if (!dropHover || dropHover.track !== track) return null;
    return (
      <div
        className="absolute top-0 bottom-0 w-0.5 z-30 pointer-events-none"
        style={{ left: toPx(dropHover.timeSec), backgroundColor: '#C4FF2E' }}
      >
        <span
          className="absolute top-0.5 left-1 px-1 py-0.2 rounded text-[9px] font-semibold t-num whitespace-nowrap"
          style={{ backgroundColor: '#C4FF2E', color: '#090B0A' }}
        >
          Drop @ {formatRulerTick(dropHover.timeSec)}
        </span>
      </div>
    );
  };

  const handleFitZoom = () => {
    const fitPx = Math.max(14, Math.min(180, Math.floor((availableTrackWidth - 40) / dur)));
    setZoomPxPerSec(fitPx);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.88 : 1.14;
      setZoomPxPerSec((z) => Math.max(12, Math.min(180, Math.round(z * factor))));
      return;
    }
    if (e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX) && scrollRef.current) {
      e.preventDefault();
      scrollRef.current.scrollLeft += e.deltaY;
    }
  };

  const handleAddCaption = async () => {
    const start = Number(currentTimeSec.toFixed(2));
    await applyOps(
      [
        {
          op: 'add_caption',
          caption: {
            id: `cap_${Date.now()}`,
            text: 'New caption beat',
            start,
            end: Number((start + 3.0).toFixed(2)),
          },
        },
      ],
      `Added caption at ${start}s`
    );
  };

  const handleAddZoom = async () => {
    const start = Number(currentTimeSec.toFixed(2));
    await applyOps(
      [
        {
          op: 'add_camera_move',
          move: {
            id: `cam_${Date.now()}`,
            start,
            end: Number((start + 2.5).toFixed(2)),
            fromScale: 1.0,
            toScale: 1.08,
            easing: 'easeInOutCubic',
            reason: 'Manual push-in',
          },
        },
      ],
      `Added zoom push-in at ${start}s`
    );
  };

  const handleDeleteSelected = async () => {
    if (!selectedItem) return;
    const ops: TimelineOp[] = [];
    if (selectedItem.kind === 'shot') ops.push({ op: 'remove_shot', id: selectedItem.id });
    else if (selectedItem.kind === 'cameraMove') ops.push({ op: 'remove_camera_move', index: selectedItem.index });
    else if (selectedItem.kind === 'broll') ops.push({ op: 'remove_broll', index: selectedItem.index });
    else if (selectedItem.kind === 'motionPlate') ops.push({ op: 'remove_motion_plate', id: selectedItem.id });
    else if (selectedItem.kind === 'caption') ops.push({ op: 'remove_caption', id: selectedItem.id });
    else if (selectedItem.kind === 'reviewNote') ops.push({ op: 'remove_review_note', id: selectedItem.id });
    if (ops.length > 0) {
      await applyOps(ops, `Removed ${selectedItem.kind}`);
      setSelectedItem(null);
    }
  };

  const canSplit =
    (selectedItem?.kind === 'caption' || selectedItem?.kind === 'shot') &&
    (() => {
      const t = currentTimeSec;
      if (selectedItem.kind === 'caption') {
        const cap = plan.captions.find((c) => c.id === selectedItem.id);
        return Boolean(cap && t > cap.start + 0.25 && t < cap.end - 0.25);
      }
      const shot = plan.shots.find((s) => s.id === selectedItem.id);
      return Boolean(shot && t > shot.start + 0.25 && t < shot.end - 0.25);
    })();

  const handleSplitSelected = async () => {
    if (!selectedItem) return;
    const t = Number(currentTimeSec.toFixed(2));
    if (selectedItem.kind === 'caption') {
      const cap = plan.captions.find((c) => c.id === selectedItem.id);
      if (!cap || t <= cap.start + 0.25 || t >= cap.end - 0.25) return;
      const words = cap.text.split(/\s+/);
      const mid = Math.max(1, Math.round((words.length * (t - cap.start)) / (cap.end - cap.start)));
      const firstText = words.slice(0, mid).join(' ') || cap.text;
      const secondText = words.slice(mid).join(' ') || cap.text;
      await applyOps(
        [
          { op: 'update_caption', id: cap.id, patch: { end: t, text: firstText } },
          {
            op: 'add_caption',
            caption: { id: `cap_${Date.now()}`, text: secondText, start: t, end: cap.end },
          },
        ],
        `Split caption at ${t}s`
      );
    } else if (selectedItem.kind === 'shot') {
      const shot = plan.shots.find((s) => s.id === selectedItem.id);
      if (!shot || t <= shot.start + 0.25 || t >= shot.end - 0.25) return;
      const elapsedSrc = (t - shot.start) * (shot.speed || 1);
      await applyOps(
        [
          { op: 'update_shot', id: shot.id, patch: { end: t } },
          {
            op: 'add_shot',
            shot: {
              ...shot,
              id: `shot_${Date.now()}`,
              label: `${shot.label} (2)`,
              start: t,
              srcIn: Number((shot.srcIn + elapsedSrc).toFixed(2)),
            },
          },
        ],
        `Split shot at ${t}s`
      );
    }
  };

  const getEffectiveRange = (
    kind: DragItemKind,
    item: { id?: string; index?: number; start: number; end: number }
  ) => {
    if (
      dragState &&
      dragPreview &&
      dragState.kind === kind &&
      ((item.id && dragState.id === item.id) || (item.index !== undefined && dragState.index === item.index))
    ) {
      return dragPreview;
    }
    return { start: item.start, end: item.end };
  };

  const renderTrackLabel = (key: TrackKey, label: string, count: number, borderBottom = true) => {
    const visible = trackVisibility[key];
    return (
      <div
        className={`sticky left-0 z-30 shrink-0 px-3 flex items-center justify-between gap-1.5 border-r ${
          borderBottom ? 'border-b' : ''
        }`}
        style={{
          width: labelColWidth,
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          opacity: visible ? 1 : 0.48,
        }}
      >
        <div className="min-w-0 flex items-center gap-1.5">
          <span className="caption-label truncate">{label}</span>
          {count > 0 && (
            <span
              className="text-[10px] t-num px-1.5 py-0.2 rounded-full"
              style={{ backgroundColor: 'var(--bg-surface-alt)', color: 'var(--text-secondary)' }}
            >
              {count}
            </span>
          )}
        </div>
        <button
          onClick={() => toggleTrackVisibility(key)}
          className="btn-icon w-5 h-5 shrink-0"
          title={visible ? `Hide ${label}` : `Show ${label}`}
        >
          {visible ? <Eye size={11} /> : <EyeOff size={11} />}
        </button>
      </div>
    );
  };

  const sfxList = plan.audio?.sfx ?? [];
  const summaryParts = [
    plan.shots.length ? `${plan.shots.length} shots` : plan.sourceVideo ? '1 source' : null,
    plan.broll.length ? `${plan.broll.length} b-roll` : null,
    plan.motionPlates.length ? `${plan.motionPlates.length} motion` : null,
    plan.captions.length ? `${plan.captions.length} captions` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className="h-72 shrink-0 border-t flex flex-col select-none"
      style={{ backgroundColor: 'var(--bg-canvas)', borderColor: 'var(--border-subtle)' }}
    >
      {/* Timeline Header Controls */}
      <div
        className="px-4 py-1.5 border-b flex items-center justify-between gap-2 text-xs overflow-x-auto"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center gap-3 shrink-0">
          <span className="eyebrow-label">TIMELINE</span>
          <span
            className="text-xs font-semibold t-num px-2 py-0.5 rounded-md border"
            style={{
              backgroundColor: 'var(--bg-surface-alt)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            {formatTimecode(currentTimeSec)} / {formatTimecode(dur)}
          </span>
          {summaryParts && (
            <span className="text-[11px] hidden lg:inline" style={{ color: 'var(--text-secondary)' }}>
              {summaryParts}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setEditorLeftTab('motion')}
            className="btn-secondary flex items-center gap-1 px-2.5 py-1 text-[11px]"
          >
            <Plus size={11} /> Motion
          </button>
          <button
            onClick={handleAddCaption}
            className="btn-secondary flex items-center gap-1 px-2.5 py-1 text-[11px]"
          >
            <Plus size={11} /> Caption
          </button>
          <button
            onClick={handleAddZoom}
            className="btn-secondary flex items-center gap-1 px-2.5 py-1 text-[11px]"
          >
            <ZoomIn size={11} /> Zoom
          </button>

          <div className="w-px h-4 mx-0.5" style={{ backgroundColor: 'var(--border-subtle)' }} />

          <button
            onClick={() => void handleSplitSelected()}
            disabled={!canSplit}
            className="btn-secondary flex items-center gap-1 px-2 py-1 text-[11px] disabled:opacity-35"
            title="Split selected shot or caption at playhead"
          >
            <Scissors size={11} /> Split
          </button>
          <button
            onClick={() => void handleDeleteSelected()}
            disabled={!selectedItem}
            className="btn-secondary flex items-center gap-1 px-2 py-1 text-[11px] disabled:opacity-35"
            title="Delete selected item (Backspace)"
          >
            <Trash2 size={11} />
          </button>
          <button
            onClick={() => setSnapEnabled(!snapEnabled)}
            className={`flex items-center gap-1 px-2 py-1 text-[11px] ${
              snapEnabled ? 'pill-tab-active' : 'btn-secondary'
            }`}
            title="Toggle 0.1s & Playhead Magnetic Snap"
          >
            <Magnet size={11} />
          </button>

          <div className="w-px h-4 mx-0.5" style={{ backgroundColor: 'var(--border-subtle)' }} />

          <button
            onClick={() => setZoomPxPerSec((z) => Math.max(12, Math.round(z * 0.8)))}
            className="btn-icon w-6 h-6"
            title="Zoom Out Timeline"
          >
            <ZoomOut size={12} />
          </button>
          <input
            type="range"
            min={12}
            max={180}
            value={zoomPxPerSec}
            onChange={(e) => setZoomPxPerSec(Number(e.target.value))}
            className="w-16 accent-[#C4FF2E] cursor-pointer"
            title={`Zoom: ${zoomPxPerSec}px/s`}
          />
          <button
            onClick={() => setZoomPxPerSec((z) => Math.min(180, Math.round(z * 1.25)))}
            className="btn-icon w-6 h-6"
            title="Zoom In Timeline"
          >
            <ZoomIn size={12} />
          </button>
          <button
            onClick={handleFitZoom}
            className="btn-secondary flex items-center gap-1 px-2 py-1 text-[11px]"
            title="Fit entire timeline"
          >
            <Maximize2 size={10} /> Fit
          </button>
        </div>
      </div>

      {/* Horizontally Scrollable Multi-Track Grid */}
      <div
        ref={scrollRef}
        onWheel={handleWheel}
        className="flex-1 overflow-x-auto overflow-y-hidden relative min-h-0"
      >
        <div
          className="h-full flex flex-col relative"
          style={{ width: labelColWidth + contentWidth }}
        >
          {/* Full-Height Playhead Needle */}
          <div
            className="absolute top-0 bottom-0 w-0.5 z-20 pointer-events-none"
            style={{
              left: labelColWidth + toPx(currentTimeSec),
              backgroundColor: 'var(--playhead-color)',
            }}
          >
            <div
              className="w-2.5 h-2.5 -translate-x-[4px] rotate-45"
              style={{ backgroundColor: 'var(--playhead-color)' }}
            />
          </div>

          {/* Row 0: Timecode Ruler */}
          <div className="h-7 shrink-0 flex">
            <div
              className="sticky left-0 z-30 shrink-0 border-r border-b px-3 flex items-center caption-label"
              style={{
                width: labelColWidth,
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              TIMECODE
            </div>
            <div
              onPointerDown={(e) => {
                draggingPlayheadRef.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                seekFromClientX(e.currentTarget, e.clientX);
              }}
              onPointerMove={(e) => {
                if (draggingPlayheadRef.current) seekFromClientX(e.currentTarget, e.clientX);
              }}
              onPointerUp={() => {
                draggingPlayheadRef.current = false;
              }}
              className="relative border-b cursor-ew-resize"
              style={{
                width: contentWidth,
                backgroundColor: 'var(--bg-surface-alt)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              {rulerTicks.major.map((t) => (
                <div
                  key={t}
                  className="absolute top-0 bottom-0 border-l pointer-events-none"
                  style={{ left: toPx(t), borderColor: 'var(--border-subtle)' }}
                >
                  <span className="absolute top-1 left-1 text-[10px] t-num" style={{ color: 'var(--text-secondary)' }}>
                    {formatRulerTick(t)}
                  </span>
                </div>
              ))}
              {plan.reviewNotes.map((n) => (
                <button
                  key={n.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentTimeSec(n.atSec);
                    setSelectedItem({ kind: 'reviewNote', id: n.id });
                  }}
                  className="absolute bottom-0.5 w-2.5 h-2.5 -translate-x-1/2 rounded-full cursor-pointer z-30"
                  style={{
                    left: toPx(n.atSec),
                    backgroundColor: n.resolved ? 'var(--accent-mint)' : '#FF4D6A',
                  }}
                  title={`Note @ ${n.atSec.toFixed(1)}s: ${n.text}`}
                />
              ))}
            </div>
          </div>

          {/* Row 1: VIDEO / SHOTS */}
          <div className="flex-1 min-h-[34px] flex">
            {renderTrackLabel('video', 'VIDEO / SHOTS', plan.shots.length || (plan.sourceVideo ? 1 : 0))}
            <div
              onClick={(e) => seekFromClientX(e.currentTarget, e.clientX)}
              onDragOver={(e) => handleTrackDragOver(e, 'video')}
              onDragLeave={() => setDropHover(null)}
              onDrop={(e) => void handleTrackDrop(e, 'video')}
              className="relative border-b cursor-pointer"
              style={{
                width: contentWidth,
                borderColor: dropHover?.track === 'video' ? '#C4FF2E' : 'var(--border-subtle)',
                backgroundColor: dropHover?.track === 'video' ? 'rgba(196, 255, 46, 0.06)' : undefined,
                opacity: trackVisibility.video ? 1 : 0.35,
              }}
            >
              {renderDropIndicator('video')}
              {plan.shots.length > 0 ? (
                plan.shots.map((shot) => {
                  const range = getEffectiveRange('shot', shot);
                  const selected = selectedItem?.kind === 'shot' && selectedItem.id === shot.id;
                  return (
                    <div
                      key={shot.id}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setAuditionMotionScene(null);
                        setSelectedItem({ kind: 'shot', id: shot.id });
                        setCurrentTimeSec(shot.start);
                        setDragState({
                          kind: 'shot',
                          id: shot.id,
                          mode: 'move',
                          startClientX: e.clientX,
                          origStart: shot.start,
                          origEnd: shot.end,
                          origSrcIn: shot.srcIn,
                          moved: false,
                        });
                      }}
                      className="absolute inset-y-1 rounded-md px-2 flex items-center justify-between text-[11px] font-semibold cursor-grab active:cursor-grabbing border overflow-hidden group"
                      style={{
                        left: toPx(range.start),
                        width: spanPx(range.start, range.end),
                        backgroundColor: '#C4FF2E',
                        color: '#090B0A',
                        borderColor: selected ? '#FFFFFF' : 'rgba(9,11,10,0.28)',
                        boxShadow: selected ? '0 0 0 1.5px #090B0A' : 'none',
                      }}
                      title={`${shot.label} (${range.start.toFixed(1)}s–${range.end.toFixed(1)}s)`}
                    >
                      <div
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setSelectedItem({ kind: 'shot', id: shot.id });
                          setDragState({
                            kind: 'shot',
                            id: shot.id,
                            mode: 'trim-start',
                            startClientX: e.clientX,
                            origStart: shot.start,
                            origEnd: shot.end,
                            origSrcIn: shot.srcIn,
                            moved: false,
                          });
                        }}
                        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-black/20 opacity-0 group-hover:opacity-100"
                      />
                      <span className="truncate">{shot.label}</span>
                      <span className="text-[10px] opacity-65 t-num ml-1 shrink-0">
                        {(range.end - range.start).toFixed(1)}s
                      </span>
                      <div
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setSelectedItem({ kind: 'shot', id: shot.id });
                          setDragState({
                            kind: 'shot',
                            id: shot.id,
                            mode: 'trim-end',
                            startClientX: e.clientX,
                            origStart: shot.start,
                            origEnd: shot.end,
                            origSrcIn: shot.srcIn,
                            moved: false,
                          });
                        }}
                        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-black/20 opacity-0 group-hover:opacity-100"
                      />
                    </div>
                  );
                })
              ) : (
                plan.sourceVideo && (
                  <div
                    className="absolute inset-y-1 left-0 rounded-md px-2.5 flex items-center text-[11px] font-semibold"
                    style={{
                      width: toPx(dur),
                      backgroundColor: '#C4FF2E',
                      color: '#090B0A',
                    }}
                  >
                    {plan.sourceVideo}
                  </div>
                )
              )}
            </div>
          </div>

          {/* Row 2: CAMERA / ZOOM */}
          <div className="flex-1 min-h-[30px] flex">
            {renderTrackLabel('camera', 'CAMERA / ZOOM', plan.cameraMoves.length)}
            <div
              onClick={(e) => seekFromClientX(e.currentTarget, e.clientX)}
              className="relative border-b cursor-pointer"
              style={{
                width: contentWidth,
                borderColor: 'var(--border-subtle)',
                opacity: trackVisibility.camera ? 1 : 0.35,
              }}
            >
              {plan.cameraMoves.map((m, idx) => {
                const range = getEffectiveRange('cameraMove', { id: m.id, index: idx, start: m.start, end: m.end });
                const selected = selectedItem?.kind === 'cameraMove' && selectedItem.index === idx;
                return (
                  <div
                    key={m.id ?? idx}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelectedItem({ kind: 'cameraMove', index: idx });
                      setCurrentTimeSec(m.start);
                      setDragState({
                        kind: 'cameraMove',
                        id: m.id,
                        index: idx,
                        mode: 'move',
                        startClientX: e.clientX,
                        origStart: m.start,
                        origEnd: m.end,
                        moved: false,
                      });
                    }}
                    className="absolute inset-y-1 rounded-md px-2 flex items-center text-[11px] font-medium cursor-grab active:cursor-grabbing border overflow-hidden group"
                    style={{
                      left: toPx(range.start),
                      width: spanPx(range.start, range.end),
                      backgroundColor: 'rgba(245, 158, 11, 0.16)',
                      color: '#FBBF24',
                      borderColor: selected ? '#FBBF24' : 'rgba(245, 158, 11, 0.38)',
                    }}
                  >
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setDragState({
                          kind: 'cameraMove',
                          id: m.id,
                          index: idx,
                          mode: 'trim-start',
                          startClientX: e.clientX,
                          origStart: m.start,
                          origEnd: m.end,
                          moved: false,
                        });
                      }}
                      className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-amber-400/35 opacity-0 group-hover:opacity-100"
                    />
                    <span className="truncate">Zoom {m.fromScale}→{m.toScale}x</span>
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setDragState({
                          kind: 'cameraMove',
                          id: m.id,
                          index: idx,
                          mode: 'trim-end',
                          startClientX: e.clientX,
                          origStart: m.start,
                          origEnd: m.end,
                          moved: false,
                        });
                      }}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-amber-400/35 opacity-0 group-hover:opacity-100"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Row 3: B-ROLL */}
          <div className="flex-1 min-h-[32px] flex">
            {renderTrackLabel('broll', 'B-ROLL', plan.broll.length)}
            <div
              onClick={(e) => seekFromClientX(e.currentTarget, e.clientX)}
              onDragOver={(e) => handleTrackDragOver(e, 'broll')}
              onDragLeave={() => setDropHover(null)}
              onDrop={(e) => void handleTrackDrop(e, 'broll')}
              className="relative border-b cursor-pointer"
              style={{
                width: contentWidth,
                borderColor: dropHover?.track === 'broll' ? '#5EEAD4' : 'var(--border-subtle)',
                backgroundColor: dropHover?.track === 'broll' ? 'rgba(20, 184, 166, 0.08)' : undefined,
                opacity: trackVisibility.broll ? 1 : 0.35,
              }}
            >
              {renderDropIndicator('broll')}
              {plan.broll.map((b, idx) => {
                const range = getEffectiveRange('broll', { id: b.id, index: idx, start: b.start, end: b.end });
                const selected = selectedItem?.kind === 'broll' && selectedItem.index === idx;
                return (
                  <div
                    key={b.id ?? idx}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setAuditionMotionScene(null);
                      setSelectedItem({ kind: 'broll', index: idx });
                      setCurrentTimeSec(b.start);
                      setDragState({
                        kind: 'broll',
                        id: b.id,
                        index: idx,
                        mode: 'move',
                        startClientX: e.clientX,
                        origStart: b.start,
                        origEnd: b.end,
                        moved: false,
                      });
                    }}
                    className="absolute inset-y-1 rounded-md px-2 flex items-center justify-between text-[11px] font-medium cursor-grab active:cursor-grabbing border overflow-hidden group"
                    style={{
                      left: toPx(range.start),
                      width: spanPx(range.start, range.end),
                      backgroundColor: 'rgba(20, 184, 166, 0.20)',
                      color: '#5EEAD4',
                      borderColor: selected ? '#5EEAD4' : 'rgba(20, 184, 166, 0.42)',
                    }}
                    title={`${b.label} (${b.kind || 'video'})`}
                  >
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setDragState({
                          kind: 'broll',
                          id: b.id,
                          index: idx,
                          mode: 'trim-start',
                          startClientX: e.clientX,
                          origStart: b.start,
                          origEnd: b.end,
                          moved: false,
                        });
                      }}
                      className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-teal-300/35 opacity-0 group-hover:opacity-100"
                    />
                    <span className="truncate">{b.label}</span>
                    <span className="text-[10px] opacity-70 t-num ml-1 shrink-0">
                      {(range.end - range.start).toFixed(1)}s
                    </span>
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setDragState({
                          kind: 'broll',
                          id: b.id,
                          index: idx,
                          mode: 'trim-end',
                          startClientX: e.clientX,
                          origStart: b.start,
                          origEnd: b.end,
                          moved: false,
                        });
                      }}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-teal-300/35 opacity-0 group-hover:opacity-100"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Row 4: MOTION PLATES */}
          <div className="flex-1 min-h-[32px] flex">
            {renderTrackLabel('motion', 'MOTION PLATES', plan.motionPlates.length)}
            <div
              onClick={(e) => seekFromClientX(e.currentTarget, e.clientX)}
              onDragOver={(e) => handleTrackDragOver(e, 'motion')}
              onDragLeave={() => setDropHover(null)}
              onDrop={(e) => void handleTrackDrop(e, 'motion')}
              className="relative border-b cursor-pointer"
              style={{
                width: contentWidth,
                borderColor: dropHover?.track === 'motion' ? '#C4B5FD' : 'var(--border-subtle)',
                backgroundColor: dropHover?.track === 'motion' ? 'rgba(139, 92, 246, 0.08)' : undefined,
                opacity: trackVisibility.motion ? 1 : 0.35,
              }}
            >
              {renderDropIndicator('motion')}
              {plan.motionPlates.map((p) => {
                const range = getEffectiveRange('motionPlate', p);
                const selected = selectedItem?.kind === 'motionPlate' && selectedItem.id === p.id;
                return (
                  <div
                    key={p.id}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setAuditionMotionScene(null);
                      setSelectedItem({ kind: 'motionPlate', id: p.id });
                      setCurrentTimeSec(p.start);
                      setDragState({
                        kind: 'motionPlate',
                        id: p.id,
                        mode: 'move',
                        startClientX: e.clientX,
                        origStart: p.start,
                        origEnd: p.end,
                        moved: false,
                      });
                    }}
                    className="absolute inset-y-1 rounded-md px-2 flex items-center justify-between gap-1 text-[11px] font-semibold cursor-grab active:cursor-grabbing border overflow-hidden group"
                    style={{
                      left: toPx(range.start),
                      width: spanPx(range.start, range.end),
                      backgroundColor: 'rgba(139, 92, 246, 0.24)',
                      color: '#DDD6FE',
                      borderColor: selected ? '#C4B5FD' : 'rgba(139, 92, 246, 0.45)',
                    }}
                    title={p.label || p.sceneId}
                  >
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setDragState({
                          kind: 'motionPlate',
                          id: p.id,
                          mode: 'trim-start',
                          startClientX: e.clientX,
                          origStart: p.start,
                          origEnd: p.end,
                          moved: false,
                        });
                      }}
                      className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-violet-300/35 opacity-0 group-hover:opacity-100"
                    />
                    <span className="truncate">{p.label || p.sceneId}</span>
                    {p.transparent && (
                      <span className="text-[9px] px-1 rounded bg-white/15 shrink-0">ALPHA</span>
                    )}
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setDragState({
                          kind: 'motionPlate',
                          id: p.id,
                          mode: 'trim-end',
                          startClientX: e.clientX,
                          origStart: p.start,
                          origEnd: p.end,
                          moved: false,
                        });
                      }}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-violet-300/35 opacity-0 group-hover:opacity-100"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Row 5: CAPTIONS */}
          <div className="flex-1 min-h-[32px] flex">
            {renderTrackLabel('captions', 'CAPTIONS', plan.captions.length)}
            <div
              onClick={(e) => seekFromClientX(e.currentTarget, e.clientX)}
              className="relative border-b cursor-pointer"
              style={{
                width: contentWidth,
                borderColor: 'var(--border-subtle)',
                opacity: trackVisibility.captions ? 1 : 0.35,
              }}
            >
              {plan.captions.map((c) => {
                const range = getEffectiveRange('caption', c);
                const selected = selectedItem?.kind === 'caption' && selectedItem.id === c.id;
                return (
                  <div
                    key={c.id}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelectedItem({ kind: 'caption', id: c.id });
                      setCurrentTimeSec(c.start);
                      setDragState({
                        kind: 'caption',
                        id: c.id,
                        mode: 'move',
                        startClientX: e.clientX,
                        origStart: c.start,
                        origEnd: c.end,
                        moved: false,
                      });
                    }}
                    className="absolute inset-y-1 rounded-md px-2 flex items-center text-[11px] font-medium cursor-grab active:cursor-grabbing border overflow-hidden group"
                    style={{
                      left: toPx(range.start),
                      width: spanPx(range.start, range.end),
                      backgroundColor: 'var(--bg-surface-alt)',
                      color: 'var(--text-primary)',
                      borderColor: selected ? 'var(--text-primary)' : 'var(--border-subtle)',
                    }}
                    title={c.text}
                  >
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setDragState({
                          kind: 'caption',
                          id: c.id,
                          mode: 'trim-start',
                          startClientX: e.clientX,
                          origStart: c.start,
                          origEnd: c.end,
                          moved: false,
                        });
                      }}
                      className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/25 opacity-0 group-hover:opacity-100"
                    />
                    <span className="truncate">{c.text}</span>
                    <div
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setDragState({
                          kind: 'caption',
                          id: c.id,
                          mode: 'trim-end',
                          startClientX: e.clientX,
                          origStart: c.start,
                          origEnd: c.end,
                          moved: false,
                        });
                      }}
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-white/25 opacity-0 group-hover:opacity-100"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Row 6: AUDIO & SFX */}
          <div className="flex-1 min-h-[30px] flex">
            {renderTrackLabel('audio', 'AUDIO & SFX', (plan.audio?.musicTrack ? 1 : 0) + sfxList.length, false)}
            <div
              onClick={(e) => seekFromClientX(e.currentTarget, e.clientX)}
              onDragOver={(e) => handleTrackDragOver(e, 'audio')}
              onDragLeave={() => setDropHover(null)}
              onDrop={(e) => void handleTrackDrop(e, 'audio')}
              className="relative cursor-pointer"
              style={{
                width: contentWidth,
                backgroundColor: dropHover?.track === 'audio' ? 'rgba(0, 212, 170, 0.08)' : undefined,
                opacity: trackVisibility.audio ? 1 : 0.35,
              }}
            >
              {renderDropIndicator('audio')}
              {plan.audio?.musicTrack && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setAuditionMotionScene(null);
                    setSelectedItem({ kind: 'audioTrack' });
                  }}
                  className="absolute inset-y-1.5 left-0 rounded-md px-2.5 flex items-center text-[11px] font-semibold cursor-pointer border"
                  style={{
                    width: toPx(dur),
                    backgroundColor: 'var(--accent-mint)',
                    color: 'var(--accent-mint-ink)',
                    borderColor: selectedItem?.kind === 'audioTrack' ? '#FFFFFF' : 'transparent',
                  }}
                  title="Click to adjust music bed volume & ducking"
                >
                  Music Bed: {plan.audio.musicTrack} ({plan.audio.musicDb ?? -18} dB ·{' '}
                  {plan.audio.sidechainDuck ? 'Ducking On' : 'Flat'})
                </button>
              )}
              {sfxList.map((s, idx) => (
                <div
                  key={s.id ?? idx}
                  className="absolute top-1 bottom-1 px-1.5 rounded text-[10px] font-semibold flex items-center border z-10"
                  style={{
                    left: toPx(s.at),
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    borderColor: 'var(--border-subtle)',
                  }}
                  title={`SFX: ${s.sound} @ ${s.at.toFixed(1)}s`}
                >
                  {s.sound}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
