import React, { useRef } from 'react';
import { Plus, ZoomIn } from 'lucide-react';
import { useStudioStore } from '../store/studioStore';

export const Timeline: React.FC<{ totalDuration: number }> = ({ totalDuration }) => {
  const {
    projectState,
    currentTimeSec,
    setCurrentTimeSec,
    selectedItem,
    setSelectedItem,
    applyOps,
    setEditorLeftTab,
  } = useStudioStore();

  const draggingRef = useRef(false);

  if (!projectState) return null;
  const plan = projectState.editPlan;
  const dur = Math.max(15, totalDuration);

  const pct = (t: number) => `${Math.max(0, Math.min(100, (t / dur) * 100))}%`;
  const widthPct = (start: number, end: number) =>
    `${Math.max(1.5, Math.min(100, ((end - start) / dur) * 100))}%`;

  const seekFromClientX = (el: HTMLDivElement, clientX: number) => {
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setCurrentTimeSec(Number((ratio * dur).toFixed(2)));
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
            toScale: 1.1,
            easing: 'easeInOutCubic',
            reason: 'Manual push-in',
          },
        },
      ],
      `Added zoom push-in at ${start}s`
    );
  };

  return (
    <div
      className="h-56 shrink-0 border-t flex flex-col select-none"
      style={{ backgroundColor: 'var(--bg-canvas)', borderColor: 'var(--border-subtle)' }}
    >
      {/* Timeline Header Controls */}
      <div
        className="px-4 py-2 border-b flex items-center justify-between text-xs"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <span className="eyebrow-label">MULTI-TRACK TIMELINE</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditorLeftTab('motion')}
            className="btn-secondary flex items-center gap-1 px-3 py-1 text-xs"
          >
            <Plus size={12} /> Motion Plate
          </button>
          <button
            onClick={handleAddCaption}
            className="btn-secondary flex items-center gap-1 px-3 py-1 text-xs"
          >
            <Plus size={12} /> Caption
          </button>
          <button
            onClick={handleAddZoom}
            className="btn-secondary flex items-center gap-1 px-3 py-1 text-xs"
          >
            <ZoomIn size={12} /> Soft Zoom
          </button>
        </div>
      </div>

      {/* Tracks Grid */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Track Labels */}
        <div
          className="w-36 shrink-0 border-r flex flex-col caption-label"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="h-6 border-b px-3 flex items-center" style={{ borderColor: 'var(--border-subtle)' }}>
            TIMECODE
          </div>
          <div className="flex-1 px-3 flex items-center border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            VIDEO / SHOTS
          </div>
          <div className="flex-1 px-3 flex items-center border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            B-ROLL / MOTION
          </div>
          <div className="flex-1 px-3 flex items-center border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            CAPTIONS
          </div>
          <div className="flex-1 px-3 flex items-center">
            AUDIO & SFX
          </div>
        </div>

        {/* Scrubbable Tracks Canvas */}
        <div className="flex-1 relative flex flex-col min-w-0">
          {/* Playhead Needle */}
          <div
            className="absolute top-0 bottom-0 w-0.5 z-20 pointer-events-none"
            style={{ left: pct(currentTimeSec), backgroundColor: 'var(--playhead-color)' }}
          />

          {/* Time Ruler (Click & Drag Scrubbing + Review Note Pins) */}
          <div
            onPointerDown={(e) => {
              draggingRef.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              seekFromClientX(e.currentTarget, e.clientX);
            }}
            onPointerMove={(e) => {
              if (draggingRef.current) seekFromClientX(e.currentTarget, e.clientX);
            }}
            onPointerUp={() => {
              draggingRef.current = false;
            }}
            className="h-6 border-b relative cursor-ew-resize"
            style={{ backgroundColor: 'var(--bg-surface-alt)', borderColor: 'var(--border-subtle)' }}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
              <span
                key={frac}
                className="absolute top-1.5 caption-label t-num -translate-x-1/2 pointer-events-none"
                style={{ left: `${frac * 100}%` }}
              >
                {(frac * dur).toFixed(0)}S
              </span>
            ))}
            {plan.reviewNotes.map((n) => (
              <button
                key={n.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentTimeSec(n.atSec);
                  setSelectedItem({ kind: 'reviewNote', id: n.id });
                }}
                className="absolute top-0.5 w-2.5 h-2.5 -translate-x-1/2 rounded-full cursor-pointer z-30"
                style={{
                  left: pct(n.atSec),
                  backgroundColor: n.resolved ? 'var(--accent-mint)' : '#FF4D6A',
                }}
                title={`Note @ ${n.atSec.toFixed(1)}s: ${n.text}`}
              />
            ))}
          </div>

          {/* Track 1: Shots or SourceVideo + Camera Moves */}
          <div
            onClick={(e) => seekFromClientX(e.currentTarget, e.clientX)}
            className="flex-1 relative border-b cursor-pointer"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            {plan.shots.length > 0 ? (
              plan.shots.map((shot) => {
                const selected = selectedItem?.kind === 'shot' && selectedItem.id === shot.id;
                return (
                  <button
                    key={shot.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedItem({ kind: 'shot', id: shot.id });
                      setCurrentTimeSec(shot.start);
                    }}
                    className="absolute inset-y-1.5 rounded-lg px-2 text-[11px] font-semibold truncate cursor-pointer border"
                    style={{
                      left: pct(shot.start),
                      width: widthPct(shot.start, shot.end),
                      backgroundColor: '#C4FF2E',
                      color: '#090B0A',
                      borderColor: selected ? '#090B0A' : 'rgba(9,11,10,0.2)',
                    }}
                  >
                    {shot.label}
                  </button>
                );
              })
            ) : (
              plan.sourceVideo && (
                <div
                  className="absolute inset-y-1.5 left-0 right-0 rounded-lg px-2.5 flex items-center text-[11px] font-semibold"
                  style={{
                    backgroundColor: '#C4FF2E',
                    color: '#090B0A',
                  }}
                >
                  {plan.sourceVideo}
                </div>
              )
            )}
            {plan.cameraMoves.map((m, idx) => (
              <button
                key={m.id ?? idx}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedItem({ kind: 'cameraMove', index: idx });
                  setCurrentTimeSec(m.start);
                }}
                className="absolute top-2 bottom-2 rounded-lg px-2 text-[11px] font-semibold truncate cursor-pointer border z-10"
                style={{
                  left: pct(m.start),
                  width: widthPct(m.start, m.end),
                  backgroundColor: 'var(--bg-surface-alt)',
                  color: 'var(--text-primary)',
                  borderColor:
                    selectedItem?.kind === 'cameraMove' && selectedItem.index === idx
                      ? 'var(--accent-primary)'
                      : 'var(--border-subtle)',
                }}
              >
                Zoom {m.toScale}x
              </button>
            ))}
          </div>

          {/* Track 2: B-Roll & Motion Plates */}
          <div
            onClick={(e) => seekFromClientX(e.currentTarget, e.clientX)}
            className="flex-1 relative border-b cursor-pointer"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            {plan.broll.map((b, idx) => (
              <button
                key={b.id ?? idx}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedItem({ kind: 'broll', index: idx });
                  setCurrentTimeSec(b.start);
                }}
                className="absolute top-1.5 bottom-1.5 rounded-lg px-2.5 text-[11px] font-medium truncate cursor-pointer border"
                style={{
                  left: pct(b.start),
                  width: widthPct(b.start, b.end),
                  backgroundColor: 'var(--accent-blue)',
                  color: 'var(--accent-blue-ink)',
                  borderColor:
                    selectedItem?.kind === 'broll' && selectedItem.index === idx
                      ? 'var(--accent-primary)'
                      : 'transparent',
                }}
              >
                {b.label}
              </button>
            ))}
            {plan.motionPlates.map((p) => {
              const selected = selectedItem?.kind === 'motionPlate' && selectedItem.id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedItem({ kind: 'motionPlate', id: p.id });
                    setCurrentTimeSec(p.start);
                  }}
                  className="absolute top-1.5 bottom-1.5 rounded-lg px-2.5 text-[11px] font-semibold truncate cursor-pointer border"
                  style={{
                    left: pct(p.start),
                    width: widthPct(p.start, p.end),
                    backgroundColor: 'var(--accent-blue)',
                    color: 'var(--accent-blue-ink)',
                    borderColor: selected ? 'var(--accent-primary)' : 'transparent',
                  }}
                >
                  {p.label || p.sceneId}
                </button>
              );
            })}
          </div>

          {/* Track 3: Captions */}
          <div
            onClick={(e) => seekFromClientX(e.currentTarget, e.clientX)}
            className="flex-1 relative border-b cursor-pointer"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            {plan.captions.map((c) => {
              const selected = selectedItem?.kind === 'caption' && selectedItem.id === c.id;
              return (
                <button
                  key={c.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedItem({ kind: 'caption', id: c.id });
                    setCurrentTimeSec(c.start);
                  }}
                  className="absolute top-1.5 bottom-1.5 rounded-lg px-2.5 text-[11px] font-medium truncate cursor-pointer border"
                  style={{
                    left: pct(c.start),
                    width: widthPct(c.start, c.end),
                    backgroundColor: 'var(--accent-blue)',
                    color: 'var(--accent-blue-ink)',
                    borderColor: selected ? 'var(--accent-primary)' : 'transparent',
                  }}
                >
                  {c.text}
                </button>
              );
            })}
          </div>

          {/* Track 4: Audio & SFX */}
          <div
            onClick={(e) => seekFromClientX(e.currentTarget, e.clientX)}
            className="flex-1 relative cursor-pointer"
          >
            {plan.audio?.musicTrack && (
              <div
                className="absolute inset-y-2 left-0 right-0 rounded-lg px-2.5 flex items-center text-[11px] font-semibold"
                style={{
                  backgroundColor: 'var(--accent-mint)',
                  color: 'var(--accent-mint-ink)',
                }}
              >
                Music Bed ({plan.audio.sidechainDuck ? 'Sidechain Ducking On' : 'Flat'})
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
