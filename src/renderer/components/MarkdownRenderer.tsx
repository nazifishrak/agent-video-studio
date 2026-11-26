import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
  onToggleChecklist?: (index: number) => void;
  className?: string;
}

const CUE_PATTERN = /^\[(?:VISUAL|SAY|B-ROLL CUE|DELIVERY CUE|SCREEN \/ ARTIFACT CUE|B-ROLL RESET)\]:?$/;
const CUE_SPLIT_REGEX = /(\[(?:VISUAL|SAY|B-ROLL CUE|DELIVERY CUE|SCREEN \/ ARTIFACT CUE|B-ROLL RESET)\]:?)/g;

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

function renderCueText(node: React.ReactNode): React.ReactNode {
  if (typeof node === 'string') {
    const parts = node.split(CUE_SPLIT_REGEX);
    if (parts.length === 1) return node;
    return parts.map((part, i) => {
      if (CUE_PATTERN.test(part)) {
        return <CuePill key={i} tag={part} />;
      }
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });
  }
  if (Array.isArray(node)) {
    return node.map((child, idx) => <React.Fragment key={idx}>{renderCueText(child)}</React.Fragment>);
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

export const InlineMarkdown: React.FC<{ text: string }> = ({ text }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <span>{renderCueText(children)}</span>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        code: ({ children }) => {
          const raw = extractText(children).trim();
          if (CUE_PATTERN.test(raw)) {
            return <CuePill tag={raw} />;
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
  className = '',
}) => {
  let checkboxCounter = 0;

  return (
    <div className={`md-prose ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p>{renderCueText(children)}</p>,
          li: ({ children, className: liClass }) => (
            <li className={liClass}>{renderCueText(children)}</li>
          ),
          code: ({ children, className: codeClass }) => {
            const raw = extractText(children).trim();
            if (!codeClass && CUE_PATTERN.test(raw)) {
              return <CuePill tag={raw} />;
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
