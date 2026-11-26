import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { BrollBeat, CalloutOverlay, CameraMove, EasingName, EditPlan } from './types';

function applyEasing(t: number, name: EasingName = 'easeInOutCubic', frame = 0, fps = 30): number {
  const clamped = Math.max(0, Math.min(1, t));
  switch (name) {
    case 'linear':
      return clamped;
    case 'easeOutCubic':
      return Easing.bezier(0.33, 1, 0.68, 1)(clamped);
    case 'easeInOutSine':
      return Easing.inOut(Easing.sin)(clamped);
    case 'spring':
      return spring({ frame, fps, config: { damping: 24, stiffness: 90, mass: 1.1 } });
    case 'easeInOutCubic':
    default:
      return Easing.bezier(0.65, 0, 0.35, 1)(clamped);
  }
}

function computeCameraState(
  timeSec: number,
  fps: number,
  moves: CameraMove[],
  defaultFocus: { x: number; y: number }
) {
  let scale = 1.0;
  let panX = 0;
  let panY = 0;
  let focusX = defaultFocus.x;
  let focusY = defaultFocus.y;

  const sorted = [...moves].sort((a, b) => a.start - b.start);

  for (const m of sorted) {
    if (timeSec < m.start) break;

    const fx = m.focusX ?? defaultFocus.x;
    const fy = m.focusY ?? defaultFocus.y;
    const dur = Math.max(0.05, m.end - m.start);
    const fromPanX = m.fromPanX ?? 0;
    const toPanX = m.toPanX ?? 0;
    const fromPanY = m.fromPanY ?? 0;
    const toPanY = m.toPanY ?? 0;

    if (timeSec <= m.end) {
      const rawP = (timeSec - m.start) / dur;
      const e = applyEasing(rawP, m.easing ?? 'easeInOutCubic', Math.round((timeSec - m.start) * fps), fps);
      scale = m.fromScale + (m.toScale - m.fromScale) * e;
      panX = fromPanX + (toPanX - fromPanX) * e;
      panY = fromPanY + (toPanY - fromPanY) * e;
      focusX = fx;
      focusY = fy;
    } else if (m.holdAfter) {
      scale = m.toScale;
      panX = toPanX;
      panY = toPanY;
      focusX = fx;
      focusY = fy;
    } else {
      const retDur = m.returnDuration ?? 1.2;
      if (timeSec <= m.end + retDur) {
        const rawR = (timeSec - m.end) / Math.max(0.05, retDur);
        const e = applyEasing(rawR, 'easeInOutSine');
        scale = m.toScale + (1.0 - m.toScale) * e;
        panX = toPanX * (1 - e);
        panY = toPanY * (1 - e);
        focusX = fx;
        focusY = fy;
      } else {
        scale = 1.0;
        panX = 0;
        panY = 0;
      }
    }
  }

  // Clamp pan so zoomed frame NEVER exposes black borders
  const maxShiftLeft = Math.max(0, (scale - 1) * focusX * 100);
  const maxShiftRight = Math.max(0, (scale - 1) * (1 - focusX) * 100);
  const maxShiftUp = Math.max(0, (scale - 1) * focusY * 100);
  const maxShiftDown = Math.max(0, (scale - 1) * (1 - focusY) * 100);

  panX = Math.max(-maxShiftRight, Math.min(maxShiftLeft, panX));
  panY = Math.max(-maxShiftDown, Math.min(maxShiftUp, panY));

  return { scale, panX, panY, focusX, focusY };
}

const CutVideo: React.FC<{
  src: string;
  cutIn: number;
  cutOut: number;
  fps: number;
  transition?: 'cut' | 'dip-to-black';
}> = ({ src, cutIn, cutOut, fps, transition }) => {
  const frame = useCurrentFrame();
  const dipOpacity =
    transition === 'dip-to-black'
      ? interpolate(frame, [0, Math.round(0.22 * fps)], [0, 1], { extrapolateRight: 'clamp' })
      : 1;

  return (
    <AbsoluteFill style={{ opacity: dipOpacity }}>
      <OffthreadVideo
        src={src}
        muted
        startFrom={Math.round(cutIn * fps)}
        endAt={Math.round(cutOut * fps)}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </AbsoluteFill>
  );
};

const CutAudio: React.FC<{
  src: string;
  srcStartFrame: number;
  srcEndFrame: number;
  totalFrames: number;
  jFrames: number;
  lFrames: number;
}> = ({ src, srcStartFrame, srcEndFrame, totalFrames, jFrames, lFrames }) => {
  const frame = useCurrentFrame();
  const fadeIn = Math.max(3, jFrames);
  const fadeOut = Math.max(3, lFrames);
  const vol = interpolate(
    frame,
    [0, fadeIn, Math.max(fadeIn + 1, totalFrames - fadeOut), totalFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <Audio
      src={src}
      startFrom={Math.max(0, srcStartFrame)}
      endAt={Math.max(srcStartFrame + 1, srcEndFrame)}
      volume={vol}
    />
  );
};

const BrollLayer: React.FC<{ beat: BrollBeat; fps: number }> = ({ beat, fps }) => {
  const frame = useCurrentFrame();
  const durFrames = Math.max(1, Math.round((beat.end - beat.start) * fps));
  const fadeFrames = Math.max(1, Math.round((beat.fade ?? 0.12) * fps));

  const opacity = interpolate(
    frame,
    [0, fadeFrames, Math.max(fadeFrames + 1, durFrames - fadeFrames), durFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const imgScale = 1.0 + 0.015 * (frame / fps);
  const ambVol = beat.ambientVolume ?? 0;

  return (
    <AbsoluteFill style={{ opacity, backgroundColor: '#000' }}>
      {beat.kind === 'image' ? (
        <Img
          src={beat.source}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${imgScale})`,
          }}
        />
      ) : (
        <OffthreadVideo
          src={beat.source}
          muted={ambVol <= 0}
          volume={ambVol * opacity}
          playbackRate={beat.playbackRate ?? 1}
          startFrom={Math.round((beat.srcIn ?? 0) * fps)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
      {beat.credit ? (
        <div
          style={{
            position: 'absolute',
            right: 28,
            bottom: 22,
            fontSize: 16,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            color: 'rgba(255,255,255,0.72)',
            backgroundColor: 'rgba(0,0,0,0.45)',
            padding: '4px 10px',
            borderRadius: 6,
          }}
        >
          {beat.credit}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

const CalloutLayer: React.FC<{ overlay: CalloutOverlay; fps: number }> = ({ overlay, fps }) => {
  const frame = useCurrentFrame();
  const durFrames = Math.max(1, Math.round((overlay.end - overlay.start) * fps));
  const accent = overlay.accent || '#38bdf8';

  const enter = spring({ frame, fps, config: { damping: 22, stiffness: 135, mass: 0.9 } });
  const exit = interpolate(
    frame,
    [Math.max(0, durFrames - Math.round(0.28 * fps)), durFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const alpha = Math.min(enter, exit);
  const slideY = interpolate(enter, [0, 1], [16, 0]);

  // 1. SPOTLIGHT (MKBHD / Tutorial screen-dim + glowing focus box)
  if (overlay.type === 'spotlight' && overlay.box) {
    const { x, y, w, h } = overlay.box;
    return (
      <AbsoluteFill style={{ opacity: alpha, pointerEvents: 'none' }}>
        <div
          style={{
            position: 'absolute',
            left: `${x * 100}%`,
            top: `${y * 100}%`,
            width: `${w * 100}%`,
            height: `${h * 100}%`,
            borderRadius: 14,
            border: `3px solid ${accent}`,
            boxShadow: `0 0 0 9999px rgba(5, 8, 15, 0.62), 0 0 28px ${accent}55`,
          }}
        />
        {overlay.title ? (
          <div
            style={{
              position: 'absolute',
              left: `${x * 100}%`,
              top: `calc(${(y + h) * 100}% + 14px)`,
              fontFamily: 'system-ui, -apple-system, sans-serif',
              backgroundColor: 'rgba(11, 15, 25, 0.9)',
              color: '#f8fafc',
              border: `1px solid ${accent}66`,
              padding: '8px 16px',
              borderRadius: 10,
              fontSize: 20,
              fontWeight: 600,
              transform: `translateY(${slideY}px)`,
            }}
          >
            {overlay.title}
          </div>
        ) : null}
      </AbsoluteFill>
    );
  }

  // 2. EDITORIAL TITLE CARD (Sarah Li / Matt D'Avella calm full-frame breather)
  if (overlay.type === 'editorial-title') {
    return (
      <AbsoluteFill
        style={{
          opacity: alpha,
          backgroundColor: 'rgba(9, 12, 18, 0.78)',
          backdropFilter: 'blur(18px)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 80,
          textAlign: 'center',
        }}
      >
        <div style={{ transform: `translateY(${slideY}px)`, maxWidth: 960 }}>
          {overlay.subtitle ? (
            <div
              style={{
                fontFamily: 'system-ui, -apple-system, sans-serif',
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: accent,
                marginBottom: 18,
              }}
            >
              {overlay.subtitle}
            </div>
          ) : null}
          <div
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: 64,
              fontWeight: 400,
              color: '#f8fafc',
              letterSpacing: '-0.02em',
              lineHeight: 1.12,
            }}
          >
            {overlay.title}
          </div>
        </div>
      </AbsoluteFill>
    );
  }

  // 3. CHAPTER TRACKER (Mrwhosetheboss-style persistent step progress bar)
  if (overlay.type === 'chapter-tracker' && overlay.steps?.length) {
    const active = overlay.activeStep ?? 0;
    return (
      <div
        style={{
          position: 'absolute',
          top: 34,
          left: '50%',
          transform: `translate(-50%, ${slideY * 0.5}px)`,
          opacity: alpha,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          borderRadius: 999,
          backgroundColor: 'rgba(11, 15, 25, 0.82)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.14)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {overlay.steps.map((st, idx) => {
          const isCurrent = idx === active;
          const isDone = idx < active;
          return (
            <div
              key={idx}
              style={{
                padding: '5px 14px',
                borderRadius: 999,
                fontSize: 15,
                fontWeight: isCurrent ? 700 : 500,
                color: isCurrent ? '#07090e' : isDone ? '#94a3b8' : '#cbd5e1',
                backgroundColor: isCurrent ? accent : 'transparent',
              }}
            >
              {idx + 1}. {st}
            </div>
          );
        })}
      </div>
    );
  }

  const posStyle: React.CSSProperties =
    overlay.position === 'top-left'
      ? { top: 44, left: 48 }
      : overlay.position === 'center-right'
      ? { top: '50%', right: 56, transform: `translateY(calc(-50% + ${slideY}px))` }
      : overlay.position === 'center'
      ? { top: '50%', left: '50%', transform: `translate(-50%, calc(-50% + ${slideY}px))` }
      : { bottom: 56, left: 52, transform: `translateY(${slideY}px)` };

  const baseCard: React.CSSProperties = {
    position: 'absolute',
    ...posStyle,
    opacity: alpha,
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: '#f8fafc',
    backgroundColor: 'rgba(11, 15, 25, 0.86)',
    backdropFilter: 'blur(14px)',
    border: '1px solid rgba(255,255,255,0.14)',
    boxShadow: '0 18px 48px rgba(0,0,0,0.45)',
    borderRadius: 14,
  };

  // 4. ANIMATED COUNTER (Mrwhosetheboss / Finance math reveal)
  if (overlay.type === 'counter') {
    const countP = applyEasing(frame / Math.max(1, Math.min(durFrames * 0.55, fps * 1.4)), 'easeOutCubic');
    const fromV = overlay.fromValue ?? 0;
    const toV = overlay.toValue ?? 100;
    const currentVal = Math.round(fromV + (toV - fromV) * countP);
    return (
      <div style={{ ...baseCard, padding: '20px 28px', borderLeft: `5px solid ${accent}`, minWidth: 320 }}>
        <div style={{ fontSize: 15, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: accent }}>
          {overlay.title}
        </div>
        <div style={{ fontSize: 48, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em', marginTop: 4 }}>
          {overlay.prefix || ''}
          {currentVal.toLocaleString()}
          {overlay.suffix || ''}
        </div>
        {overlay.subtitle ? (
          <div style={{ fontSize: 17, color: '#cbd5e1', marginTop: 4 }}>{overlay.subtitle}</div>
        ) : null}
      </div>
    );
  }

  if (overlay.type === 'chapter-pill') {
    return (
      <div
        style={{
          ...baseCard,
          padding: '9px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderRadius: 999,
        }}
      >
        <span style={{ width: 9, height: 9, borderRadius: 99, backgroundColor: accent }} />
        <span style={{ fontSize: 19, fontWeight: 600, letterSpacing: '-0.01em' }}>{overlay.title}</span>
      </div>
    );
  }

  if (overlay.type === 'comparison') {
    return (
      <div style={{ ...baseCard, padding: '20px 24px', maxWidth: 640 }}>
        <div style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: accent, marginBottom: 10 }}>
          {overlay.title}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ padding: '9px 13px', borderRadius: 9, backgroundColor: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.35)', fontSize: 19, color: '#fecaca' }}>
            <strong style={{ marginRight: 8 }}>Avoid:</strong> {overlay.beforeText}
          </div>
          <div style={{ padding: '9px 13px', borderRadius: 9, backgroundColor: 'rgba(34,197,94,0.14)', border: '1px solid rgba(34,197,94,0.38)', fontSize: 19, color: '#dcfce7' }}>
            <strong style={{ marginRight: 8 }}>Instead:</strong> {overlay.afterText}
          </div>
        </div>
      </div>
    );
  }

  if (overlay.type === 'stat-card') {
    return (
      <div style={{ ...baseCard, padding: '20px 26px', borderLeft: `5px solid ${accent}`, maxWidth: 600 }}>
        <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.15 }}>{overlay.title}</div>
        {overlay.subtitle ? (
          <div style={{ fontSize: 18, color: '#cbd5e1', marginTop: 7, lineHeight: 1.38 }}>{overlay.subtitle}</div>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ ...baseCard, padding: '15px 22px', borderLeft: `4px solid ${accent}` }}>
      <div style={{ fontSize: 25, fontWeight: 700, letterSpacing: '-0.02em' }}>{overlay.title}</div>
      {overlay.subtitle ? <div style={{ fontSize: 17, color: '#94a3b8', marginTop: 4 }}>{overlay.subtitle}</div> : null}
    </div>
  );
};

export const VideoEditor: React.FC<{ plan: EditPlan }> = ({ plan }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeSec = frame / fps;

  const focus = plan.faceAnchor ?? { x: 0.5, y: 0.38 };
  const cam = computeCameraState(timeSec, fps, plan.cameraMoves ?? [], focus);

  const cg = plan.colorGrade ?? {};
  const cssFilter = `contrast(${cg.contrast ?? 1.03}) saturate(${cg.saturate ?? 1.05}) brightness(${cg.brightness ?? 1.0})`;
  const vignette = cg.vignette ?? 0.12;
  const filmGrain = cg.filmGrain ?? 0;

  let cursorFrame = 0;
  const segments = (plan.cuts || []).map((cut, idx) => {
    const startFrame = cursorFrame;
    const durFrames = Math.max(1, Math.round((cut.out - cut.in) * fps));
    cursorFrame += durFrames;
    return { cut, idx, startFrame, durFrames };
  });

  // Subtle shifting grain seed per frame (zero external asset needed)
  const grainOffsetX = (frame * 37) % 120;
  const grainOffsetY = (frame * 53) % 120;

  return (
    <AbsoluteFill style={{ backgroundColor: '#07090e', overflow: 'hidden' }}>
      {/* Track 1: Talking-Head A-Roll with Smooth Sub-Pixel Soft Pan & Zoom */}
      <AbsoluteFill
        style={{
          transformOrigin: `${(cam.focusX * 100).toFixed(2)}% ${(cam.focusY * 100).toFixed(2)}%`,
          transform: `translate3d(${cam.panX.toFixed(3)}%, ${cam.panY.toFixed(3)}%, 0) scale(${cam.scale.toFixed(5)})`,
          filter: cssFilter,
        }}
      >
        {segments.map(({ cut, idx, startFrame, durFrames }) => (
          <Sequence key={`cut-${idx}`} from={startFrame} durationInFrames={durFrames}>
            {plan.sourceVideo ? (
              <CutVideo
                src={plan.sourceVideo}
                cutIn={cut.in}
                cutOut={cut.out}
                fps={fps}
                transition={cut.transition}
              />
            ) : (
              <AbsoluteFill
                style={{
                  background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#e2e8f0',
                  fontSize: 34,
                  fontFamily: 'system-ui, sans-serif',
                }}
              >
                No sourceVideo set in edit-plan.json
              </AbsoluteFill>
            )}
          </Sequence>
        ))}
      </AbsoluteFill>

      {/* Parallel Audio Track: True J-Cut (audio leads visual) & L-Cut (audio trails visual) */}
      {plan.sourceVideo
        ? segments.map(({ cut, idx, startFrame, durFrames }) => {
            const rawInFrame = Math.round(cut.in * fps);
            const rawOutFrame = Math.round(cut.out * fps);
            const jFrames = Math.min(startFrame, rawInFrame, Math.round((cut.jCut ?? 0) * fps));
            const lFrames = Math.round((cut.lCut ?? 0) * fps);
            const audioFrom = startFrame - jFrames;
            const totalAudioFrames = Math.max(1, durFrames + jFrames + lFrames);
            return (
              <Sequence key={`aud-${idx}`} from={audioFrom} durationInFrames={totalAudioFrames}>
                <CutAudio
                  src={plan.sourceVideo}
                  srcStartFrame={rawInFrame - jFrames}
                  srcEndFrame={rawOutFrame + lFrames}
                  totalFrames={totalAudioFrames}
                  jFrames={jFrames}
                  lFrames={lFrames}
                />
              </Sequence>
            );
          })
        : null}

      {/* Subtle Filmic Vignette */}
      {vignette > 0 ? (
        <AbsoluteFill
          style={{
            pointerEvents: 'none',
            background: `radial-gradient(circle at 50% 45%, rgba(0,0,0,0) 58%, rgba(0,0,0,${vignette}) 100%)`,
          }}
        />
      ) : null}

      {/* Track 2: Full-Bleed B-Roll Cutaways (Silent or Subtle Ambience L-Cut) */}
      {(plan.broll || []).map((beat, idx) => {
        const from = Math.max(0, Math.round(beat.start * fps));
        const dur = Math.max(1, Math.round((beat.end - beat.start) * fps));
        return (
          <Sequence key={`broll-${idx}`} from={from} durationInFrames={dur}>
            <BrollLayer beat={beat} fps={fps} />
          </Sequence>
        );
      })}

      {/* Track 3: Pro Motion Graphics (Spotlight, Counter, Editorial Title, Chapter Tracker, Cards) */}
      {(plan.callouts || []).map((overlay, idx) => {
        const from = Math.max(0, Math.round(overlay.start * fps));
        const dur = Math.max(1, Math.round((overlay.end - overlay.start) * fps));
        return (
          <Sequence key={`callout-${idx}`} from={from} durationInFrames={dur}>
            <CalloutLayer overlay={overlay} fps={fps} />
          </Sequence>
        );
      })}

      {/* Optional Subtle Organic Film Grain Overlay */}
      {filmGrain > 0 ? (
        <AbsoluteFill
          style={{
            pointerEvents: 'none',
            opacity: filmGrain,
            mixBlendMode: 'overlay',
            backgroundImage:
              'radial-gradient(rgba(255,255,255,0.45) 0.5px, transparent 0.5px), radial-gradient(rgba(0,0,0,0.45) 0.5px, transparent 0.5px)',
            backgroundSize: '6px 6px',
            backgroundPosition: `${grainOffsetX}px ${grainOffsetY}px, ${grainOffsetX + 3}px ${grainOffsetY + 3}px`,
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};
