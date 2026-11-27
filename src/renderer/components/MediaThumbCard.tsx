import React, { useRef, useState } from 'react';
import { Film, Image as ImageIcon, Music, Pause, Play, Volume2 } from 'lucide-react';

interface MediaThumbCardProps {
  label: string;
  kind: 'video' | 'audio' | 'image';
  mediaUrl: string;
  durationSec?: number;
  badge?: string;
  active?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onPreview?: () => void;
  titlePath?: string;
  headerActions?: React.ReactNode;
  children?: React.ReactNode;
}

function formatDuration(sec?: number): string | null {
  if (sec === undefined || !Number.isFinite(sec) || sec <= 0) return null;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const mins = Math.floor(sec / 60);
  const rem = Math.floor(sec % 60);
  return `${mins}:${String(rem).padStart(2, '0')}`;
}

export const MediaThumbCard: React.FC<MediaThumbCardProps> = ({
  label,
  kind,
  mediaUrl,
  durationSec,
  badge,
  active = false,
  draggable = false,
  onDragStart,
  onPreview,
  titlePath,
  headerActions,
  children,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [hovering, setHovering] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);

  const durationText = formatDuration(durationSec);

  const handleVideoMouseEnter = () => {
    setHovering(true);
    const v = videoRef.current;
    if (v) {
      v.play().catch(() => {});
    }
  };

  const handleVideoMouseLeave = () => {
    setHovering(false);
    const v = videoRef.current;
    if (v) {
      try {
        v.pause();
        const target = Math.min(0.5, (v.duration || 1) * 0.25);
        if (Number.isFinite(target)) {
          v.currentTime = target;
        }
      } catch {
        // Ignore seek errors before metadata loads
      }
    }
  };

  const toggleAudioPlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const a = audioRef.current;
    if (!a) return;
    if (audioPlaying) {
      a.pause();
      setAudioPlaying(false);
    } else {
      a.play()
        .then(() => setAudioPlaying(true))
        .catch(() => setAudioPlaying(false));
    }
  };

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      className={`p-2 rounded-xl border space-y-2 transition ${
        draggable ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
      style={{
        backgroundColor: active ? 'var(--bg-surface-alt)' : 'var(--bg-canvas)',
        borderColor: active ? 'var(--accent-primary)' : 'var(--border-subtle)',
      }}
    >
      {/* Visual Preview Surface */}
      {kind === 'audio' ? (
        <div
          onClick={onPreview}
          className="h-11 rounded-lg px-2.5 flex items-center justify-between gap-2 border cursor-pointer"
          style={{
            backgroundColor: 'var(--bg-surface-alt)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <audio
            ref={audioRef}
            src={mediaUrl}
            preload="metadata"
            onEnded={() => setAudioPlaying(false)}
          />
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={toggleAudioPlay}
              className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 cursor-pointer"
              style={{
                backgroundColor: audioPlaying ? 'var(--accent-mint)' : 'var(--bg-canvas)',
                color: audioPlaying ? '#090B0A' : 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
              }}
              title={audioPlaying ? 'Pause audio' : 'Play audio'}
            >
              {audioPlaying ? <Pause size={12} /> : <Play size={12} />}
            </button>
            <div className="flex items-center gap-0.5 h-5" aria-hidden="true">
              {[0.4, 0.85, 0.55, 1, 0.7, 0.45, 0.9, 0.6, 0.35].map((h, i) => (
                <span
                  key={i}
                  className="w-0.5 rounded-full transition-all"
                  style={{
                    height: `${Math.round(h * 16)}px`,
                    backgroundColor: audioPlaying ? 'var(--accent-mint)' : 'var(--text-secondary)',
                    opacity: audioPlaying ? 0.95 : 0.45,
                  }}
                />
              ))}
            </div>
            <Volume2 size={12} className="shrink-0 opacity-60" />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {badge && (
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide"
                style={{
                  backgroundColor: 'var(--bg-canvas)',
                  color: 'var(--text-secondary)',
                }}
              >
                {badge}
              </span>
            )}
            {durationText && (
              <span className="text-[10px] t-num" style={{ color: 'var(--text-secondary)' }}>
                {durationText}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div
          onClick={onPreview}
          onMouseEnter={kind === 'video' ? handleVideoMouseEnter : undefined}
          onMouseLeave={kind === 'video' ? handleVideoMouseLeave : undefined}
          className="relative aspect-video w-full rounded-lg bg-black overflow-hidden cursor-pointer group"
        >
          {mediaError || !mediaUrl ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-white/40">
              {kind === 'image' ? <ImageIcon size={20} /> : <Film size={20} />}
            </div>
          ) : kind === 'image' ? (
            <img
              src={mediaUrl}
              alt={label}
              loading="lazy"
              onError={() => setMediaError(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <video
              ref={videoRef}
              src={`${mediaUrl}#t=0.5`}
              muted
              playsInline
              loop
              preload="metadata"
              onError={() => setMediaError(true)}
              className="w-full h-full object-cover"
            />
          )}

          {/* Top-left silent hover preview indicator */}
          {kind === 'video' && hovering && !mediaError && (
            <div className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/75 backdrop-blur-sm text-[9px] font-semibold tracking-wide text-white pointer-events-none">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C4FF2E]" />
              PREVIEW
            </div>
          )}

          {/* Subtle center play button on hover */}
          {onPreview && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <div className="w-8 h-8 rounded-full bg-black/65 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white">
                <Play size={13} fill="currentColor" />
              </div>
            </div>
          )}

          {/* Bottom-left badge */}
          {badge && (
            <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-sm text-[9px] font-semibold uppercase tracking-wide text-white/95 pointer-events-none">
              {badge}
            </span>
          )}

          {/* Bottom-right duration pill */}
          {durationText && (
            <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-sm text-[10px] t-num text-white/95 pointer-events-none">
              {durationText}
            </span>
          )}
        </div>
      )}

      {/* Compact Title Row + Header Actions */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {kind === 'audio' ? (
            <Music size={12} className="shrink-0" style={{ color: 'var(--accent-mint)' }} />
          ) : kind === 'image' ? (
            <ImageIcon size={12} className="shrink-0" style={{ color: '#DDD6FE' }} />
          ) : (
            <Film size={12} className="shrink-0" style={{ color: 'var(--accent-primary)' }} />
          )}
          <span className="text-xs font-medium truncate" title={titlePath || label}>
            {label}
          </span>
        </div>
        {headerActions && <div className="flex items-center gap-0.5 shrink-0">{headerActions}</div>}
      </div>

      {children}
    </div>
  );
};
