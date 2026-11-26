import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, MessageSquarePlus, Pause, Play, Shield, SkipBack, Sparkles } from 'lucide-react';
import { useStudioStore } from '../store/studioStore';

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
  } = useStudioStore();

  const [safeZones, setSafeZones] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const plateIframeRef = useRef<HTMLIFrameElement>(null);
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

  // Smooth playback loop without 60Hz React effect teardown
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const v = videoRef.current;
      const dur = totalDurationRef.current;
      if (activeSourceRef.current && v && Number.isFinite(v.duration) && v.duration > 0) {
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

  // Seek <video> only when paused or externally scrubbed
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !plan?.sourceVideo) return;
    if ((!isPlaying || Math.abs(v.currentTime - currentTimeSec) > 0.35) && Math.abs(v.currentTime - currentTimeSec) > 0.08) {
      v.currentTime = currentTimeSec;
    }
    if (isPlaying && v.paused) {
      void v.play().catch(() => undefined);
    } else if (!isPlaying && !v.paused) {
      v.pause();
    }
  }, [currentTimeSec, isPlaying, plan?.sourceVideo]);

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

  // Listen for SCENE_READY handshake from motion-engine.js
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'SCENE_READY') {
        pushTokensAndProps(true);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  });

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
    const asset = plan.assets.find((a) => a.id === source || a.uri === source);
    if (asset) {
      return `${assetServerUrl}/project-asset/${manifest.slug}/${asset.id}?${tokenParam}`;
    }
    return `${assetServerUrl}/project-media/${manifest.slug}/${source}?${tokenParam}`;
  };

  const videoUrl = buildMediaUrl(plan.sourceVideo);
  const brollUrl = activeBroll ? buildMediaUrl(activeBroll.source) : '';
  const plateSrc =
    activePlate && activePlateMeta && assetServerUrl
      ? `${assetServerUrl}/scenes/${activePlateMeta.file}?manual=1&w=${stageW}&h=${stageH}${
          activePlate.transparent ? '&transparent=1' : ''
        }${tokenParam ? `&${tokenParam}` : ''}`
      : '';

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
      className="flex-1 flex flex-col items-center justify-center p-4 min-h-0 gap-3"
      style={{ backgroundColor: 'var(--bg-canvas)' }}
    >
      {/* Video Stage */}
      <div
        className="relative rounded-2xl border overflow-hidden flex items-center justify-center"
        style={{
          aspectRatio: isVertical ? '9 / 16' : '16 / 9',
          height: isVertical ? '100%' : 'auto',
          width: isVertical ? 'auto' : '100%',
          maxHeight: '100%',
          maxWidth: '100%',
          borderColor: 'var(--border-subtle)',
          backgroundColor: tokens.stage_bg || '#090B0A',
        }}
      >
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              if (Number.isFinite(d) && d > 0) {
                onMediaDuration?.(d);
              }
            }}
            onEnded={() => setIsPlaying(false)}
            className="w-full h-full object-cover transition-transform duration-75"
            style={{ transform: cameraTransform, filter: colorGradeFilter }}
            playsInline
          />
        ) : (
          <div className="text-center px-6 space-y-2 text-[#F4F7F5]">
            <div className="caption-label" style={{ color: '#C4FF2E' }}>
              STAGE READY
            </div>
            <div className="text-sm font-semibold">No A-Roll Footage Imported Yet</div>
            <div className="text-xs" style={{ color: '#A9B8B0' }}>
              Import a video on the left, or preview Motion Plates & Captions directly on this stage.
            </div>
          </div>
        )}

        {/* Active B-Roll Cutaway Overlay */}
        {brollUrl && activeBroll && (
          <div className="absolute inset-0 pointer-events-none">
            {activeBroll.kind === 'image' ? (
              <img src={brollUrl} alt={activeBroll.label} className="w-full h-full object-cover" />
            ) : (
              <video src={brollUrl} className="w-full h-full object-cover" muted autoPlay loop playsInline />
            )}
          </div>
        )}

        {/* Active Motion Plate Overlay */}
        {plateSrc && (
          <iframe
            ref={plateIframeRef}
            key={activePlate?.id}
            src={plateSrc}
            onLoad={() => pushTokensAndProps(true)}
            className="absolute inset-0 w-full h-full border-0 pointer-events-none"
            title={activePlate?.sceneId}
          />
        )}

        {/* Active Caption Overlay */}
        {activeCaption && (
          <div
            className={`absolute inset-x-0 flex justify-center pointer-events-none px-6 ${
              tokens.caption_position === 'center'
                ? 'top-1/2 -translate-y-1/2'
                : tokens.caption_position === 'lower-third'
                  ? 'bottom-16'
                  : 'bottom-6'
            }`}
          >
            <div
              className="px-3.5 py-1.5 rounded-xl text-center max-w-[90%]"
              style={{
                fontFamily: tokens.caption_font || '"Google Sans Flex", sans-serif',
                fontWeight: Number(tokens.caption_weight) || 700,
                fontSize: isVertical ? '18px' : '22px',
                color: tokens.caption_color,
                backgroundColor:
                  tokens.caption_style === 'editorial' ? 'transparent' : tokens.caption_bg,
                borderRadius: tokens.caption_style === 'pill' ? '9999px' : '12px',
                textShadow:
                  tokens.caption_style === 'editorial' ? '0 2px 10px rgba(0,0,0,0.75)' : 'none',
              }}
            >
              {activeCaption.highlightWord
                ? activeCaption.text.split(new RegExp(`(${activeCaption.highlightWord})`, 'gi')).map((part, idx) =>
                    part.toLowerCase() === activeCaption.highlightWord?.toLowerCase() ? (
                      <span key={idx} style={{ color: tokens.caption_highlight_color }}>
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

      {/* Transport Bar */}
      <div
        className="w-full max-w-2xl px-3.5 py-2 rounded-full border flex flex-wrap items-center justify-between gap-2"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setIsPlaying(false);
              setCurrentTimeSec(0);
            }}
            className="btn-icon w-8 h-8"
            title="Jump to start"
          >
            <SkipBack size={13} />
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition hover:opacity-90"
            style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--accent-primary-ink)' }}
            title="Play / Pause (Space)"
          >
            {isPlaying ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <span className="text-xs font-semibold t-num ml-1">
            {currentTimeSec.toFixed(2)}s / {totalDuration.toFixed(1)}s
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setNoteOpen(!noteOpen)}
            className="btn-secondary flex items-center gap-1 px-2.5 py-1 text-xs"
            title="Add Timestamped Review Note"
          >
            <MessageSquarePlus size={12} /> Note
          </button>
          <button
            onClick={handlePinTimestamp}
            className="btn-secondary flex items-center gap-1 px-2.5 py-1 text-xs"
            title="Pin current timestamp to Terminal"
          >
            <Sparkles size={12} /> Pin {currentTimeSec.toFixed(1)}s
          </button>
          <button
            onClick={() => setSafeZones(!safeZones)}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs ${
              safeZones ? 'pill-tab-active' : 'btn-secondary'
            }`}
          >
            <Shield size={12} /> Safe
          </button>
          <button
            onClick={toggleAspect}
            className="btn-secondary flex items-center gap-1 px-2.5 py-1 text-xs"
          >
            <Maximize2 size={12} /> {manifest.aspectRatio}
          </button>
        </div>
      </div>
    </div>
  );
};
