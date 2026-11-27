import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, MessageSquarePlus, Pause, Play, Shield, SkipBack, Sparkles } from 'lucide-react';
import { useStudioStore } from '../store/studioStore';
import { getCaptionVisualSpec } from '../../shared/designTokens';

export const PreviewCanvas: React.FC<{
  totalDuration: number;
  onMediaDuration?: (durationSec: number) => void;
}> = ({ totalDuration, onMediaDuration }) => {
  const {
    projectState,
    assetServerUrl,
    assetServerToken,
    motionScenes,
    currentTimeSec,
    setCurrentTimeSec,
    isPlaying,
    setIsPlaying,
    refreshVaultData,
    applyOps,
    pinContextChip,
    getActiveBrandTokens,
    trackVisibility,
    mediaRevision,
    auditionMotionScene,
    setAuditionMotionScene,
    setSelectedItem,
  } = useStudioStore();

  const [safeZones, setSafeZones] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [stageBounds, setStageBounds] = useState({ width: 640, height: 360 });
  const stageBoundsRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = stageBoundsRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setStageBounds({ width, height });
        }
      }
    });
    ro.observe(el);
    if (el.clientWidth > 0 && el.clientHeight > 0) {
      setStageBounds({ width: el.clientWidth, height: el.clientHeight });
    }
    return () => ro.disconnect();
  }, []);
  const brollVideoRef = useRef<HTMLVideoElement>(null);
  const musicAudioRef = useRef<HTMLAudioElement>(null);
  const plateIframeRef = useRef<HTMLIFrameElement>(null);
  const auditionIframeRef = useRef<HTMLIFrameElement>(null);
  const lastPropsKeyRef = useRef<string>('');
  const lastTokensKeyRef = useRef<string>('');

  const currentTimeRef = useRef(currentTimeSec);
  currentTimeRef.current = currentTimeSec;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const totalDurationRef = useRef(totalDuration);
  totalDurationRef.current = totalDuration;

  const manifest = projectState?.manifest;
  const plan = projectState?.editPlan;
  const tokens = getActiveBrandTokens();

  const activeSourceRef = useRef(plan?.sourceVideo ?? '');
  activeSourceRef.current = plan?.sourceVideo ?? '';
  const cutsRef = useRef(plan?.cuts ?? []);
  cutsRef.current = plan?.cuts ?? [];

  const activeShot = useMemo(
    () =>
      plan?.shots.find((s) => currentTimeSec >= s.start && currentTimeSec < s.end) ??
      (plan?.shots.length ? plan.shots[plan.shots.length - 1] : null),
    [plan?.shots, currentTimeSec]
  );

  const hasTimelineVideo = Boolean(plan?.sourceVideo || (plan?.shots.length ?? 0) > 0);
  const activeTimelineVideoRef = useRef(hasTimelineVideo);
  activeTimelineVideoRef.current = hasTimelineVideo;
  const activeShotRef = useRef(activeShot);
  activeShotRef.current = activeShot;
  const shotsCountRef = useRef(plan?.shots.length ?? 0);
  shotsCountRef.current = plan?.shots.length ?? 0;

  // Smooth playback loop without 60Hz React effect teardown
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const v = videoRef.current;
      const dur = totalDurationRef.current;
      if (
        shotsCountRef.current === 0 &&
        activeSourceRef.current &&
        v &&
        Number.isFinite(v.duration) &&
        v.duration > 0
      ) {
        if (v.ended) {
          setCurrentTimeSec(0);
          setIsPlaying(false);
          return;
        }
        // Skip outside active cuts[] when cuts are defined
        const cuts = cutsRef.current;
        let t = v.currentTime;
        if (cuts.length > 0) {
          const inCut = cuts.some((c) => t >= c.in - 0.04 && t <= c.out + 0.04);
          if (!inCut) {
            const nextCut = cuts.find((c) => c.in > t);
            if (nextCut) {
              v.currentTime = nextCut.in;
              t = nextCut.in;
            } else {
              v.pause();
              setCurrentTimeSec(0);
              setIsPlaying(false);
              return;
            }
          }
        }
        setCurrentTimeSec(t);
        raf = requestAnimationFrame(tick);
        return;
      }

      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const next = currentTimeRef.current + dt;
      if (next >= dur) {
        setCurrentTimeSec(0);
        setIsPlaying(false);
      } else {
        setCurrentTimeSec(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, setCurrentTimeSec, setIsPlaying]);

  // Seek <video> for either single sourceVideo or multi-shot montage
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !hasTimelineVideo) return;

    if (activeShot) {
      const targetSrcTime = Math.max(
        0,
        activeShot.srcIn + (currentTimeSec - activeShot.start) * (activeShot.speed || 1)
      );
      if (Math.abs(v.currentTime - targetSrcTime) > 0.25) {
        v.currentTime = targetSrcTime;
      }
      v.playbackRate = activeShot.speed || 1;
      if (isPlaying && v.paused) {
        void v.play().catch(() => undefined);
      } else if (!isPlaying && !v.paused) {
        v.pause();
      }
      return;
    }

    if (!plan?.sourceVideo) return;
    if ((!isPlaying || Math.abs(v.currentTime - currentTimeSec) > 0.35) && Math.abs(v.currentTime - currentTimeSec) > 0.08) {
      v.currentTime = currentTimeSec;
    }
    if (isPlaying && v.paused) {
      void v.play().catch(() => undefined);
    } else if (!isPlaying && !v.paused) {
      v.pause();
    }
  }, [currentTimeSec, isPlaying, plan?.sourceVideo, activeShot?.id, activeShot?.srcIn, hasTimelineVideo]);

  // Global transport hotkeys (registered once, guarding against inputs & xterm)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.closest('.xterm')) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(!isPlayingRef.current);
      } else if (e.key === 'j' || e.key === 'J') {
        setCurrentTimeSec(Math.max(0, currentTimeRef.current - 2));
      } else if (e.key === 'l' || e.key === 'L') {
        setCurrentTimeSec(Math.min(totalDurationRef.current, currentTimeRef.current + 2));
      } else if (e.key === 'k' || e.key === 'K') {
        setIsPlaying(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setIsPlaying, setCurrentTimeSec]);

  const activePlate = useMemo(
    () =>
      plan?.motionPlates.find((p) => currentTimeSec >= p.start && currentTimeSec <= p.end) ?? null,
    [plan?.motionPlates, currentTimeSec]
  );

  const activePlateMeta = useMemo(
    () => (activePlate ? motionScenes.find((s) => s.id === activePlate.sceneId) ?? null : null),
    [activePlate, motionScenes]
  );

  const activeBroll = useMemo(
    () => plan?.broll.find((b) => currentTimeSec >= b.start && currentTimeSec <= b.end) ?? null,
    [plan?.broll, currentTimeSec]
  );

  const activeCaption = useMemo(
    () => plan?.captions.find((c) => currentTimeSec >= c.start && currentTimeSec <= c.end) ?? null,
    [plan?.captions, currentTimeSec]
  );

  const activeCallout = useMemo(
    () => plan?.callouts.find((c) => currentTimeSec >= c.start && currentTimeSec <= c.end) ?? null,
    [plan?.callouts, currentTimeSec]
  );

  // Sync B-roll <video> playback with timeline playhead
  useEffect(() => {
    const bv = brollVideoRef.current;
    if (!bv || !activeBroll || activeBroll.kind === 'image') return;
    const targetBrollTime = Math.max(0, (activeBroll.srcIn ?? 0) + (currentTimeSec - activeBroll.start));
    if (Math.abs(bv.currentTime - targetBrollTime) > 0.28) {
      bv.currentTime = targetBrollTime;
    }
    if (isPlaying && bv.paused) {
      void bv.play().catch(() => undefined);
    } else if (!isPlaying && !bv.paused) {
      bv.pause();
    }
  }, [activeBroll?.id, activeBroll?.start, activeBroll?.srcIn, activeBroll?.kind, currentTimeSec, isPlaying]);

  const cameraTransform = useMemo(() => {
    const moves = plan?.cameraMoves ?? [];
    for (const m of moves) {
      if (currentTimeSec >= m.start && currentTimeSec <= m.end) {
        const p = Math.max(0, Math.min(1, (currentTimeSec - m.start) / Math.max(0.05, m.end - m.start)));
        const eased =
          m.easing === 'linear'
            ? p
            : m.easing === 'easeOutCubic'
              ? 1 - Math.pow(1 - p, 3)
              : p < 0.5
                ? 4 * p * p * p
                : 1 - Math.pow(-2 * p + 2, 3) / 2;
        const s = m.fromScale + (m.toScale - m.fromScale) * eased;
        const px = (m.fromPanX ?? 0) + ((m.toPanX ?? 0) - (m.fromPanX ?? 0)) * eased;
        const py = (m.fromPanY ?? 0) + ((m.toPanY ?? 0) - (m.fromPanY ?? 0)) * eased;
        return `scale(${s.toFixed(4)}) translate(${px.toFixed(2)}%, ${py.toFixed(2)}%)`;
      }
    }
    return 'scale(1)';
  }, [plan?.cameraMoves, currentTimeSec]);

  const colorGradeFilter = useMemo(() => {
    const g = plan?.colorGrade;
    if (!g) return undefined;
    const parts: string[] = [];
    if (g.contrast && g.contrast !== 1) parts.push(`contrast(${g.contrast})`);
    if (g.saturate && g.saturate !== 1) parts.push(`saturate(${g.saturate})`);
    if (g.brightness && g.brightness !== 1) parts.push(`brightness(${g.brightness})`);
    return parts.length > 0 ? parts.join(' ') : undefined;
  }, [plan?.colorGrade]);

  const pushTokensAndProps = (force = false) => {
    const win = plateIframeRef.current?.contentWindow;
    if (!win || !activePlate) return;
    const tokKey = JSON.stringify(tokens);
    if (force || tokKey !== lastTokensKeyRef.current) {
      lastTokensKeyRef.current = tokKey;
      win.postMessage({ type: 'SET_TOKENS', tokens }, '*');
    }
    const propKey = `${activePlate.id}:${JSON.stringify(activePlate.props ?? {})}`;
    if (force || propKey !== lastPropsKeyRef.current) {
      lastPropsKeyRef.current = propKey;
      win.postMessage({ type: 'SET_PROPS', props: activePlate.props ?? {} }, '*');
    }
    win.postMessage({ type: 'SEEK', t: Math.max(0, currentTimeSec - activePlate.start) }, '*');
  };

  const pushAuditionTokensAndProps = () => {
    const win = auditionIframeRef.current?.contentWindow;
    if (!win || !auditionMotionScene) return;
    win.postMessage({ type: 'SET_TOKENS', tokens }, '*');
    win.postMessage({ type: 'SET_PROPS', props: auditionMotionScene.props ?? {} }, '*');
  };

  // Listen for SCENE_READY handshake from motion-engine.js
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'SCENE_READY') {
        pushTokensAndProps(true);
        pushAuditionTokensAndProps();
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  });

  useEffect(() => {
    pushAuditionTokensAndProps();
  }, [auditionMotionScene?.scene.id, auditionMotionScene?.props, tokens]);

  // Update tokens/props only when they change; seek on time ticks without remounting DOM
  useEffect(() => {
    pushTokensAndProps(false);
  }, [activePlate?.id, activePlate?.props, tokens]);

  useEffect(() => {
    const win = plateIframeRef.current?.contentWindow;
    if (!win || !activePlate) return;
    win.postMessage({ type: 'SEEK', t: Math.max(0, currentTimeSec - activePlate.start) }, '*');
  }, [currentTimeSec, activePlate?.id, activePlate?.start]);

  if (!manifest || !plan) return null;

  const isVertical = manifest.aspectRatio === '9:16';
  const stageW = isVertical ? 1080 : 1920;
  const stageH = isVertical ? 1920 : 1080;
  const tokenParam = assetServerToken ? `token=${assetServerToken}` : '';

  const buildMediaUrl = (source: string) => {
    if (!source || !assetServerUrl) return '';
    const revParam = `v=${mediaRevision}`;
    const authPart = tokenParam ? `${tokenParam}&${revParam}` : revParam;
    const asset = plan.assets.find((a) => a.id === source || a.uri === source);
    if (asset) {
      return `${assetServerUrl}/project-asset/${manifest.slug}/${asset.id}?${authPart}`;
    }
    return `${assetServerUrl}/project-media/${manifest.slug}/${source}?${authPart}`;
  };

  const primarySource = activeShot ? activeShot.assetId || activeShot.source : plan.sourceVideo;
  const videoUrl = buildMediaUrl(primarySource);
  const brollUrl = activeBroll ? buildMediaUrl(activeBroll.source) : '';
  const musicUrl = plan.audio?.musicTrack ? buildMediaUrl(plan.audio.musicTrack) : '';

  // Sync music bed <audio> playback with timeline playhead & volume
  useEffect(() => {
    const audio = musicAudioRef.current;
    if (!audio || !musicUrl) return;
    const db = plan.audio?.musicDb ?? -18;
    const gain = Math.min(1, Math.max(0, Math.pow(10, db / 20)));
    audio.volume = trackVisibility.audio ? gain : 0;
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      const target = currentTimeSec % audio.duration;
      if (Math.abs(audio.currentTime - target) > 0.35) {
        audio.currentTime = target;
      }
    }
    if (isPlaying && trackVisibility.audio && !auditionMotionScene) {
      if (audio.paused) void audio.play().catch(() => undefined);
    } else if (!audio.paused) {
      audio.pause();
    }
  }, [
    musicUrl,
    plan.audio?.musicDb,
    trackVisibility.audio,
    currentTimeSec,
    isPlaying,
    auditionMotionScene,
  ]);

  const auditionSrc =
    auditionMotionScene && assetServerUrl
      ? `${assetServerUrl}/scenes/${auditionMotionScene.scene.file}?w=${stageW}&h=${stageH}${
          auditionMotionScene.scene.transparent_ready ? '&transparent=1' : ''
        }${tokenParam ? `&${tokenParam}` : ''}`
      : '';

  const handleInsertAuditionedMotion = async () => {
    if (!auditionMotionScene) return;
    const s = auditionMotionScene.scene;
    const id = `mp_${Date.now()}`;
    const start = Number(currentTimeSec.toFixed(2));
    const end = Number((start + (s.duration || 5)).toFixed(2));
    await applyOps(
      [
        {
          op: 'add_motion_plate',
          plate: {
            id,
            sceneId: s.id,
            label: s.name,
            start,
            end,
            transparent: s.transparent_ready,
            props: structuredClone(auditionMotionScene.props ?? s.default_props ?? {}),
          },
        },
      ],
      `Inserted ${s.name} at ${start}s`
    );
    setSelectedItem({ kind: 'motionPlate', id });
    setAuditionMotionScene(null);
  };
  const plateSrc =
    activePlate && activePlateMeta && assetServerUrl
      ? `${assetServerUrl}/scenes/${activePlateMeta.file}?manual=1&w=${stageW}&h=${stageH}${
          activePlate.transparent ? '&transparent=1' : ''
        }${tokenParam ? `&${tokenParam}` : ''}&v=${mediaRevision}`
      : '';
  const targetRatio = isVertical ? 9 / 16 : 16 / 9;
  const fitW = Math.max(160, Math.floor(Math.min(stageBounds.width, stageBounds.height * targetRatio)));
  const fitH = Math.max(90, Math.floor(fitW / targetRatio));
  const captionSpec = getCaptionVisualSpec(tokens, {
    isVertical,
    renderHeight: Math.max(140, fitH),
  });
  const activeLayerLabels = [
    trackVisibility.video && (activeShot?.label || (plan.sourceVideo ? 'A-Roll' : null)),
    trackVisibility.broll && activeBroll ? `B-Roll: ${activeBroll.label}` : null,
    trackVisibility.motion && activePlate ? `Motion: ${activePlate.label || activePlate.sceneId}` : null,
    trackVisibility.captions && activeCaption ? 'Caption' : null,
  ].filter(Boolean) as string[];

  const toggleAspect = async () => {
    const nextAspect = isVertical ? '16:9' : '9:16';
    const nextW = nextAspect === '9:16' ? 1080 : 1920;
    const nextH = nextAspect === '9:16' ? 1920 : 1080;
    await window.studio.updateProjectManifest(manifest.slug, { aspectRatio: nextAspect });
    await applyOps(
      [{ op: 'set_canvas', width: nextW, height: nextH }],
      `Switched canvas to ${nextAspect}`
    );
    await refreshVaultData();
  };

  const handlePinTimestamp = () => {
    pinContextChip({
      kind: 'time-range',
      label: `${manifest.slug} @ ${currentTimeSec.toFixed(1)}s`,
      payload: {
        projectSlug: manifest.slug,
        atSec: Number(currentTimeSec.toFixed(2)),
        aspectRatio: manifest.aspectRatio,
        sourceVideo: plan.sourceVideo,
      },
    });
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    await applyOps(
      [
        {
          op: 'add_review_note',
          note: {
            id: `note_${Date.now().toString(36)}`,
            atSec: Number(currentTimeSec.toFixed(2)),
            text: noteText.trim(),
            author: 'human',
            resolved: false,
            createdAt: new Date().toISOString(),
          },
        },
      ],
      `Added review note at ${currentTimeSec.toFixed(1)}s`
    );
    setNoteText('');
    setNoteOpen(false);
  };

  return (
    <div
      className="flex-1 flex flex-col items-center justify-center p-3 sm:p-4 min-h-0 min-w-0 gap-2.5 overflow-hidden"
      style={{ backgroundColor: 'var(--bg-canvas)' }}
    >
      {/* Video Stage Bounds */}
      <div
        ref={stageBoundsRef}
        className="flex-1 min-h-0 min-w-0 w-full flex items-center justify-center overflow-hidden"
      >
        <div
          ref={stageRef}
          className="group relative rounded-2xl border overflow-hidden flex items-center justify-center shrink-0"
          style={{
            width: `${fitW}px`,
            height: `${fitH}px`,
            borderColor: 'var(--border-subtle)',
            backgroundColor: tokens.stage_bg || '#090B0A',
          }}
        >
        {auditionMotionScene && auditionSrc ? (
          <>
            <iframe
              ref={auditionIframeRef}
              key={auditionMotionScene.scene.id}
              src={auditionSrc}
              onLoad={pushAuditionTokensAndProps}
              className="w-full h-full border-0"
              title={`Audition ${auditionMotionScene.scene.name}`}
            />
            <div
              className="absolute top-3 inset-x-3 flex items-center justify-between gap-2 px-3 py-1.5 rounded-full border backdrop-blur-md z-30"
              style={{
                backgroundColor: 'rgba(9, 11, 10, 0.72)',
                borderColor: 'rgba(255, 255, 255, 0.16)',
                color: '#F8FAFC',
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: '#C4FF2E' }}>
                  AUDITIONING
                </span>
                <span className="text-xs font-semibold truncate">{auditionMotionScene.scene.name}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => void handleInsertAuditionedMotion()}
                  className="btn-primary px-2.5 py-1 text-[11px]"
                >
                  + Insert @ {currentTimeSec.toFixed(1)}s
                </button>
                <button
                  onClick={() => setAuditionMotionScene(null)}
                  className="btn-secondary px-2.5 py-1 text-[11px]"
                >
                  Back to Timeline
                </button>
              </div>
            </div>
          </>
        ) : trackVisibility.video && videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              if (Number.isFinite(d) && d > 0 && plan.shots.length === 0) {
                onMediaDuration?.(d);
              }
            }}
            onEnded={() => {
              if (plan.shots.length === 0) setIsPlaying(false);
            }}
            className="w-full h-full object-contain transition-transform duration-75"
            style={{
              transform: trackVisibility.camera ? cameraTransform : 'scale(1)',
              filter: colorGradeFilter,
            }}
            playsInline
          />
        ) : !brollUrl && !plateSrc && !activeCaption ? (
          <div className="text-center px-6 space-y-2 text-[#F4F7F5]">
            <div className="caption-label" style={{ color: '#C4FF2E' }}>
              STAGE READY
            </div>
            <div className="text-sm font-semibold">No A-Roll Footage Imported Yet</div>
            <div className="text-xs" style={{ color: '#A9B8B0' }}>
              Import a video on the left, or preview Motion Plates & Captions directly on this stage.
            </div>
          </div>
        ) : null}

        {/* Active B-Roll Cutaway Overlay */}
        {trackVisibility.broll && brollUrl && activeBroll && (
          <div className="absolute inset-0 pointer-events-none">
            {activeBroll.kind === 'image' ? (
              <img src={brollUrl} alt={activeBroll.label} className="w-full h-full object-cover" />
            ) : (
              <video ref={brollVideoRef} src={brollUrl} className="w-full h-full object-cover" muted playsInline />
            )}
          </div>
        )}

        {/* Active Motion Plate Overlay */}
        {trackVisibility.motion && plateSrc && (
          <iframe
            ref={plateIframeRef}
            key={`${activePlate?.id}-${mediaRevision}`}
            src={plateSrc}
            onLoad={() => pushTokensAndProps(true)}
            className="absolute inset-0 w-full h-full border-0 pointer-events-none"
            title={activePlate?.sceneId}
          />
        )}

        {/* Active Callout Overlay */}
        {activeCallout && (
          <div className="absolute top-4 right-4 max-w-[42%] px-3.5 py-2 rounded-xl border pointer-events-none backdrop-blur-md"
            style={{
              backgroundColor: 'rgba(12, 14, 18, 0.62)',
              borderColor: 'rgba(255, 255, 255, 0.14)',
              color: '#F8FAFC',
              fontFamily: captionSpec.fontFamily,
            }}
          >
            <div className="text-xs font-semibold">{activeCallout.title}</div>
            {activeCallout.subtitle && (
              <div className="text-[11px] opacity-80">{activeCallout.subtitle}</div>
            )}
          </div>
        )}

        {/* Active Layer HUD Pill (visible on stage hover) */}
        {activeLayerLabels.length > 0 && (
          <div
            className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-medium pointer-events-none backdrop-blur-md border"
            style={{
              backgroundColor: 'rgba(9, 11, 10, 0.56)',
              borderColor: 'rgba(255, 255, 255, 0.12)',
              color: '#E4E4E7',
            }}
          >
            {activeLayerLabels.join(' · ')}
          </div>
        )}

        {/* Active Caption Overlay */}
        {trackVisibility.captions && activeCaption && (
          <div
            className={`absolute inset-x-0 flex justify-center pointer-events-none px-[5%] ${
              tokens.caption_position === 'center'
                ? 'top-1/2 -translate-y-1/2'
                : tokens.caption_position === 'lower-third'
                  ? 'bottom-[11%]'
                  : 'bottom-[5%]'
            }`}
          >
            <div
              className="text-center max-w-[90%]"
              style={{
                fontFamily: captionSpec.fontFamily,
                fontWeight: captionSpec.fontWeight,
                fontSize: `${Math.max(11, captionSpec.fontSizePx)}px`,
                letterSpacing: captionSpec.letterSpacing,
                lineHeight: captionSpec.lineHeight,
                color: captionSpec.color,
                backgroundColor: captionSpec.backgroundColor,
                border: captionSpec.border,
                borderRadius: captionSpec.borderRadius,
                backdropFilter: captionSpec.backdropFilter,
                textShadow: captionSpec.textShadow,
                padding: captionSpec.backgroundColor === 'transparent' ? '2px 8px' : '4px 10px',
              }}
            >
              {activeCaption.highlightWord
                ? activeCaption.text.split(new RegExp(`(${activeCaption.highlightWord})`, 'gi')).map((part, idx) =>
                    part.toLowerCase() === activeCaption.highlightWord?.toLowerCase() ? (
                      <span
                        key={idx}
                        style={{
                          fontWeight: Math.min(700, captionSpec.fontWeight + 150),
                          color: captionSpec.emphasizeColor,
                        }}
                      >
                        {part}
                      </span>
                    ) : (
                      <React.Fragment key={idx}>{part}</React.Fragment>
                    )
                  )
                : activeCaption.text}
            </div>
          </div>
        )}

        {/* Safe Zone Guides */}
        {safeZones && (
          <div className="absolute inset-0 pointer-events-none border-[18px] border-[#C4FF2E]/15">
            <div className="w-full h-full border border-dashed border-[#C4FF2E]/60" />
          </div>
        )}
        </div>
      </div>

      {/* Inline Review Note Popover */}
      {noteOpen && (
        <form
          onSubmit={handleAddNote}
          className="w-full max-w-2xl px-3 py-2 rounded-2xl border flex items-center gap-2"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--accent-primary)' }}
        >
          <span className="caption-label t-num shrink-0">@ {currentTimeSec.toFixed(1)}s</span>
          <input
            autoFocus
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Describe what to change at this timestamp..."
            className="flex-1 bg-transparent text-xs outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
          <button type="submit" className="btn-primary px-3 py-1 text-[11px]">
            Save Note
          </button>
          <button
            type="button"
            onClick={() => setNoteOpen(false)}
            className="btn-secondary px-2.5 py-1 text-[11px]"
          >
            Cancel
          </button>
        </form>
      )}

      {/* Live Music Bed Audio */}
      {musicUrl && <audio ref={musicAudioRef} src={musicUrl} loop preload="auto" />}

      {/* Transport Bar */}
      <div
        className="w-full max-w-2xl px-3 py-1.5 rounded-2xl border flex flex-wrap items-center justify-between gap-2 shrink-0"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              setIsPlaying(false);
              setCurrentTimeSec(0);
            }}
            className="btn-icon w-7 h-7 shrink-0"
            title="Jump to start"
          >
            <SkipBack size={13} />
          </button>
          <button
            onClick={() => {
              setAuditionMotionScene(null);
              setIsPlaying(!isPlaying);
            }}
            className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition hover:opacity-90 shrink-0"
            style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--accent-primary-ink)' }}
            title="Play / Pause (Space)"
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <span className="text-xs font-semibold t-num ml-1 whitespace-nowrap">
            {currentTimeSec.toFixed(2)}s / {totalDuration.toFixed(1)}s
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setNoteOpen(!noteOpen)}
            className="btn-secondary flex items-center gap-1 px-2.5 py-1 text-xs whitespace-nowrap shrink-0"
            title="Add Timestamped Review Note"
          >
            <MessageSquarePlus size={12} /> Note
          </button>
          <button
            onClick={handlePinTimestamp}
            className="btn-secondary flex items-center gap-1 px-2.5 py-1 text-xs whitespace-nowrap shrink-0"
            title="Pin current timestamp to Terminal"
          >
            <Sparkles size={12} /> Pin {currentTimeSec.toFixed(1)}s
          </button>
          <button
            onClick={() => setSafeZones(!safeZones)}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs whitespace-nowrap shrink-0 ${
              safeZones ? 'pill-tab-active' : 'btn-secondary'
            }`}
          >
            <Shield size={12} /> Safe
          </button>
          <button
            onClick={toggleAspect}
            className="btn-secondary flex items-center gap-1 px-2.5 py-1 text-xs whitespace-nowrap shrink-0"
          >
            <Maximize2 size={12} /> {manifest.aspectRatio}
          </button>
        </div>
      </div>
    </div>
  );
};
