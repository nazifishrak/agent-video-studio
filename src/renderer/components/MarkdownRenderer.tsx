import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { IdeaMediaItem } from '../../shared/schemas';

interface MarkdownRendererProps {
  content: string;
  onToggleChecklist?: (index: number) => void;
  mediaPool?: IdeaMediaItem[];
  onPreviewMedia?: (item: IdeaMediaItem) => void;
  className?: string;
}

const CUE_PATTERN = /^\[(?:VISUAL|SAY|B-ROLL CUE|DELIVERY CUE|SCREEN \/ ARTIFACT CUE|B-ROLL RESET)\]:?$/;
const CUE_SPLIT_REGEX = /(\[(?:VISUAL|SAY|B-ROLL CUE|DELIVERY CUE|SCREEN \/ ARTIFACT CUE|B-ROLL RESET)\]:?)/g;
const MEDIA_TAG_PATTERN = /^\[MEDIA:([^|\]]+)\s*\|\s*([^|\]]+)\s*\|\s*([^\]]+)\]$/;
const MEDIA_SPLIT_REGEX = /(\[MEDIA:[^|\]]+\|[^|\]]+\|[^\]]+\])/g;

function getCueStyle(tag: string): React.CSSProperties {
  if (tag.includes('VISUAL') || tag.includes('SCREEN')) {
    return {
      backgroundColor: 'var(--accent-blue)',
      color: 'var(--accent-blue-ink)',
    };
  }
  if (tag.includes('B-ROLL')) {
    return {
      backgroundColor: 'var(--accent-mint)',
      color: 'var(--accent-mint-ink)',
    };
  }
  return {
    backgroundColor: 'var(--accent-primary)',
    color: 'var(--accent-primary-ink)',
    border: '1px solid rgba(9, 11, 10, 0.12)',
  };
}

function getMediaRoleColors(role: string): { bg: string; fg: string; border: string } {
  const r = role.trim().toLowerCase();
  if (r === 'a-roll') {
    return { bg: 'rgba(196, 255, 46, 0.16)', fg: '#C4FF2E', border: 'rgba(196, 255, 46, 0.45)' };
  }
  if (r === 'b-roll') {
    return { bg: 'rgba(20, 184, 166, 0.18)', fg: '#5EEAD4', border: 'rgba(20, 184, 166, 0.42)' };
  }
  if (r === 'music') {
    return { bg: 'rgba(0, 212, 170, 0.16)', fg: '#34D399', border: 'rgba(0, 212, 170, 0.42)' };
  }
  if (r === 'sfx') {
    return { bg: 'rgba(245, 158, 11, 0.16)', fg: '#FBBF24', border: 'rgba(245, 158, 11, 0.42)' };
  }
  return { bg: 'rgba(139, 92, 246, 0.18)', fg: '#DDD6FE', border: 'rgba(139, 92, 246, 0.42)' };
}

function CuePill({ tag }: { tag: string }) {
  return (
    <span
      className="inline-block px-2.5 py-0.5 mr-1.5 rounded-full text-[10px] font-semibold uppercase tracking-wider align-middle"
      style={getCueStyle(tag)}
    >
      {tag.replace(/[\[\]:]/g, '')}
    </span>
  );
}

function MediaChip({
  rawTag,
  mediaPool,
  onPreviewMedia,
}: {
  rawTag: string;
  mediaPool?: IdeaMediaItem[];
  onPreviewMedia?: (item: IdeaMediaItem) => void;
}) {
  const m = rawTag.match(MEDIA_TAG_PATTERN);
  if (!m) return <span>{rawTag}</span>;
  const id = m[1].trim();
  const role = m[2].trim();
  const label = m[3].trim();
  const matched =
    mediaPool?.find((x) => x.id === id) ??
    mediaPool?.find((x) => x.label.toLowerCase() === label.toLowerCase());
  const colors = getMediaRoleColors(matched?.role ?? role);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (matched && onPreviewMedia) {
          onPreviewMedia(matched);
        }
      }}
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 mx-0.5 rounded-full text-[11px] font-medium border align-middle cursor-pointer transition hover:opacity-85"
      style={{
        backgroundColor: colors.bg,
        color: 'var(--text-primary)',
        borderColor: colors.border,
      }}
      title={matched ? `${matched.path} — click to preview` : `${role}: ${label}`}
    >
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: colors.fg }}>
        {matched?.role ?? role}
      </span>
      <span className="truncate max-w-[200px]">{matched?.label ?? label}</span>
      {matched?.durationSec !== undefined && (
        <span className="text-[10px] opacity-75 t-num">{matched.durationSec.toFixed(1)}s</span>
      )}
    </button>
  );
}

function renderRichText(
  node: React.ReactNode,
  mediaPool?: IdeaMediaItem[],
  onPreviewMedia?: (item: IdeaMediaItem) => void
): React.ReactNode {
  if (typeof node === 'string') {
    const tokens = node.split(MEDIA_SPLIT_REGEX);
    return tokens.map((tok, ti) => {
      if (MEDIA_TAG_PATTERN.test(tok)) {
        return <MediaChip key={ti} rawTag={tok} mediaPool={mediaPool} onPreviewMedia={onPreviewMedia} />;
      }
      const parts = tok.split(CUE_SPLIT_REGEX);
      if (parts.length === 1) return <React.Fragment key={ti}>{tok}</React.Fragment>;
      return (
        <React.Fragment key={ti}>
          {parts.map((part, i) =>
            CUE_PATTERN.test(part) ? <CuePill key={i} tag={part} /> : <React.Fragment key={i}>{part}</React.Fragment>
          )}
        </React.Fragment>
      );
    });
  }
  if (Array.isArray(node)) {
    return node.map((child, idx) => (
      <React.Fragment key={idx}>{renderRichText(child, mediaPool, onPreviewMedia)}</React.Fragment>
    ));
  }
  return node;
}

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (React.isValidElement(node)) {
    return extractText((node.props as { children?: React.ReactNode }).children);
  }
  return '';
}

export const InlineMarkdown: React.FC<{
  text: string;
  mediaPool?: IdeaMediaItem[];
  onPreviewMedia?: (item: IdeaMediaItem) => void;
}> = ({ text, mediaPool, onPreviewMedia }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <span>{renderRichText(children, mediaPool, onPreviewMedia)}</span>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        code: ({ children }) => {
          const raw = extractText(children).trim();
          if (CUE_PATTERN.test(raw)) {
            return <CuePill tag={raw} />;
          }
          if (MEDIA_TAG_PATTERN.test(raw)) {
            return <MediaChip rawTag={raw} mediaPool={mediaPool} onPreviewMedia={onPreviewMedia} />;
          }
          return (
            <code
              className="px-1.5 py-0.5 rounded-md text-[11px] font-medium border"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--border-subtle)',
              }}
            >
              {children}
            </code>
          );
        },
      }}
    >
      {text}
    </ReactMarkdown>
  );
};

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  onToggleChecklist,
  mediaPool,
  onPreviewMedia,
  className = '',
}) => {
  let checkboxCounter = 0;

  return (
    <div className={`md-prose ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p>{renderRichText(children, mediaPool, onPreviewMedia)}</p>,
          li: ({ children, className: liClass }) => (
            <li className={liClass}>{renderRichText(children, mediaPool, onPreviewMedia)}</li>
          ),
          code: ({ children, className: codeClass }) => {
            const raw = extractText(children).trim();
            if (!codeClass && CUE_PATTERN.test(raw)) {
              return <CuePill tag={raw} />;
            }
            if (!codeClass && MEDIA_TAG_PATTERN.test(raw)) {
              return <MediaChip rawTag={raw} mediaPool={mediaPool} onPreviewMedia={onPreviewMedia} />;
            }
            return <code className={codeClass}>{children}</code>;
          },
          input: ({ type, checked }) => {
            if (type !== 'checkbox') return <input type={type} />;
            const currentIdx = checkboxCounter++;
            return (
              <input
                type="checkbox"
                checked={Boolean(checked)}
                onChange={() => onToggleChecklist?.(currentIdx)}
                disabled={!onToggleChecklist}
                className="mr-2 align-middle cursor-pointer accent-[#00A887]"
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
