import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { IdeaMediaItem } from '../../shared/schemas';

export interface MarkdownDropTargetInfo {
  startLine: number;
  endLine: number;
  placement: 'before' | 'inline' | 'after';
  blockKind: string;
  dataTransfer: DataTransfer;
}

interface MarkdownRendererProps {
  content: string;
  onToggleChecklist?: (index: number) => void;
  mediaPool?: IdeaMediaItem[];
  onPreviewMedia?: (item: IdeaMediaItem) => void;
  onRemoveMediaTag?: (rawTag: string) => void;
  onDropMediaAtBlock?: (info: MarkdownDropTargetInfo) => void;
  className?: string;
}

export interface MarkdownBlock {
  id: string;
  startLine: number;
  endLine: number;
  text: string;
  kind: 'heading' | 'list-item' | 'code' | 'paragraph';
  checklistStartIndex: number;
}

export function splitMarkdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let i = 0;
  let checklistIdx = 0;

  const countCheckboxes = (txt: string) =>
    (txt.match(/^\s*[-*]\s+\[[ xX]\]\s+/gm) ?? []).length;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Fenced code block
    if (/^\s*```/.test(line)) {
      const start = i;
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        i++;
      }
      if (i < lines.length) i++;
      const text = lines.slice(start, i).join('\n');
      blocks.push({
        id: `blk_${start}`,
        startLine: start,
        endLine: i - 1,
        text,
        kind: 'code',
        checklistStartIndex: checklistIdx,
      });
      continue;
    }

    // Heading
    if (/^\s*#{1,6}\s+/.test(line)) {
      blocks.push({
        id: `blk_${i}`,
        startLine: i,
        endLine: i,
        text: line,
        kind: 'heading',
        checklistStartIndex: checklistIdx,
      });
      i++;
      continue;
    }

    // Single list item (keeps each bullet/checklist item as its own drop target)
    if (/^\s*(?:[-*+]|\d+\.)\s+/.test(line)) {
      const start = i;
      i++;
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !/^\s*(?:[-*+]|\d+\.)\s+/.test(lines[i]) &&
        !/^\s*#{1,6}\s+/.test(lines[i]) &&
        !/^\s*```/.test(lines[i])
      ) {
        i++;
      }
      const text = lines.slice(start, i).join('\n');
      blocks.push({
        id: `blk_${start}`,
        startLine: start,
        endLine: i - 1,
        text,
        kind: 'list-item',
        checklistStartIndex: checklistIdx,
      });
      checklistIdx += countCheckboxes(text);
      continue;
    }

    // Paragraph / blockquote
    const start = i;
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^\s*#{1,6}\s+/.test(lines[i]) &&
      !/^\s*(?:[-*+]|\d+\.)\s+/.test(lines[i]) &&
      !/^\s*```/.test(lines[i])
    ) {
      i++;
    }
    const text = lines.slice(start, i).join('\n');
    blocks.push({
      id: `blk_${start}`,
      startLine: start,
      endLine: i - 1,
      text,
      kind: 'paragraph',
      checklistStartIndex: checklistIdx,
    });
  }

  return blocks;
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
  onRemoveMediaTag,
}: {
  rawTag: string;
  mediaPool?: IdeaMediaItem[];
  onPreviewMedia?: (item: IdeaMediaItem) => void;
  onRemoveMediaTag?: (rawTag: string) => void;
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
    <span
      className="group/chip inline-flex items-center gap-1 px-2.5 py-0.5 mx-0.5 rounded-full text-[11px] font-medium border align-middle transition"
      style={{
        backgroundColor: colors.bg,
        color: 'var(--text-primary)',
        borderColor: colors.border,
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (matched && onPreviewMedia) {
            onPreviewMedia(matched);
          }
        }}
        className="inline-flex items-center gap-1.5 cursor-pointer hover:opacity-85"
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
      {onRemoveMediaTag && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemoveMediaTag(rawTag);
          }}
          className="opacity-0 group-hover/chip:opacity-80 hover:!opacity-100 ml-0.5 text-[11px] leading-none cursor-pointer"
          title="Remove tag from this beat"
        >
          ×
        </button>
      )}
    </span>
  );
}

function renderRichText(
  node: React.ReactNode,
  mediaPool?: IdeaMediaItem[],
  onPreviewMedia?: (item: IdeaMediaItem) => void,
  onRemoveMediaTag?: (rawTag: string) => void
): React.ReactNode {
  if (typeof node === 'string') {
    const tokens = node.split(MEDIA_SPLIT_REGEX);
    return tokens.map((tok, ti) => {
      if (MEDIA_TAG_PATTERN.test(tok)) {
        return (
          <MediaChip
            key={ti}
            rawTag={tok}
            mediaPool={mediaPool}
            onPreviewMedia={onPreviewMedia}
            onRemoveMediaTag={onRemoveMediaTag}
          />
        );
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
      <React.Fragment key={idx}>
        {renderRichText(child, mediaPool, onPreviewMedia, onRemoveMediaTag)}
      </React.Fragment>
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
  onRemoveMediaTag?: (rawTag: string) => void;
}> = ({ text, mediaPool, onPreviewMedia, onRemoveMediaTag }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <span>{renderRichText(children, mediaPool, onPreviewMedia, onRemoveMediaTag)}</span>
        ),
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        code: ({ children }) => {
          const raw = extractText(children).trim();
          if (CUE_PATTERN.test(raw)) {
            return <CuePill tag={raw} />;
          }
          if (MEDIA_TAG_PATTERN.test(raw)) {
            return (
              <MediaChip
                rawTag={raw}
                mediaPool={mediaPool}
                onPreviewMedia={onPreviewMedia}
                onRemoveMediaTag={onRemoveMediaTag}
              />
            );
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
  onRemoveMediaTag,
  onDropMediaAtBlock,
  className = '',
}) => {
  const [hoverBlock, setHoverBlock] = useState<{
    id: string;
    placement: 'before' | 'inline' | 'after';
  } | null>(null);

  const renderMarkdownSlice = (md: string, checklistOffset = 0) => {
    let checkboxCounter = checklistOffset;
    return (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p>{renderRichText(children, mediaPool, onPreviewMedia, onRemoveMediaTag)}</p>
          ),
          li: ({ children, className: liClass }) => (
            <li className={liClass}>
              {renderRichText(children, mediaPool, onPreviewMedia, onRemoveMediaTag)}
            </li>
          ),
          code: ({ children, className: codeClass }) => {
            const raw = extractText(children).trim();
            if (!codeClass && CUE_PATTERN.test(raw)) {
              return <CuePill tag={raw} />;
            }
            if (!codeClass && MEDIA_TAG_PATTERN.test(raw)) {
              return (
                <MediaChip
                  rawTag={raw}
                  mediaPool={mediaPool}
                  onPreviewMedia={onPreviewMedia}
                  onRemoveMediaTag={onRemoveMediaTag}
                />
              );
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
        {md}
      </ReactMarkdown>
    );
  };

  if (!onDropMediaAtBlock) {
    return <div className={`md-prose ${className}`}>{renderMarkdownSlice(content, 0)}</div>;
  }

  const blocks = splitMarkdownBlocks(content);

  const computePlacement = (
    e: React.DragEvent<HTMLDivElement>,
    kind: MarkdownBlock['kind']
  ): 'before' | 'inline' | 'after' => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relY = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0.5;
    if (relY < 0.28) return 'before';
    if (kind !== 'heading' && kind !== 'code' && relY <= 0.72) return 'inline';
    return 'after';
  };

  return (
    <div className={`md-prose ${className}`}>
      {blocks.length === 0 ? (
        <div className="text-xs py-6 text-center opacity-70">
          Drop footage or music anywhere here to start your plan.
        </div>
      ) : (
        blocks.map((blk) => {
          const isHovered = hoverBlock?.id === blk.id;
          const placement = isHovered ? hoverBlock.placement : null;
          return (
            <div
              key={blk.id}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'copy';
                const nextPlacement = computePlacement(e, blk.kind);
                if (!isHovered || hoverBlock?.placement !== nextPlacement) {
                  setHoverBlock({ id: blk.id, placement: nextPlacement });
                }
              }}
              onDragLeave={() => {
                if (isHovered) setHoverBlock(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const finalPlacement = computePlacement(e, blk.kind);
                setHoverBlock(null);
                onDropMediaAtBlock({
                  startLine: blk.startLine,
                  endLine: blk.endLine,
                  placement: finalPlacement,
                  blockKind: blk.kind,
                  dataTransfer: e.dataTransfer,
                });
              }}
              className={`relative rounded-lg transition-all ${
                placement === 'inline' ? 'ring-2 ring-[#C4FF2E] bg-[#C4FF2E]/10 px-2 -mx-2' : ''
              }`}
            >
              {placement === 'before' && (
                <div className="h-0.5 bg-[#C4FF2E] rounded-full mb-1 relative">
                  <span
                    className="absolute -top-2.5 right-0 px-1.5 py-0.2 rounded text-[9px] font-semibold"
                    style={{ backgroundColor: '#C4FF2E', color: '#090B0A' }}
                  >
                    Insert here
                  </span>
                </div>
              )}
              {placement === 'inline' && (
                <span
                  className="absolute -top-2.5 right-1 px-1.5 py-0.2 rounded text-[9px] font-semibold z-10"
                  style={{ backgroundColor: '#C4FF2E', color: '#090B0A' }}
                >
                  Attach to this beat
                </span>
              )}
              {renderMarkdownSlice(blk.text, blk.checklistStartIndex)}
              {placement === 'after' && (
                <div className="h-0.5 bg-[#C4FF2E] rounded-full mt-1 relative">
                  <span
                    className="absolute -top-2.5 right-0 px-1.5 py-0.2 rounded text-[9px] font-semibold"
                    style={{ backgroundColor: '#C4FF2E', color: '#090B0A' }}
                  >
                    Insert below
                  </span>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};
