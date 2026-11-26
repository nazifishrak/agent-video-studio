export interface BrandTokens {
  display_font: string;
  body_font: string;
  display_weight: string;
  display_tracking: string;
  body_tracking: string;
  stage_bg: string;
  surface_card: string;
  surface_well: string;
  border_subtle: string;
  text_primary: string;
  text_muted: string;
  accent_primary: string;
  accent_soft: string;
  accent_warm: string;
  accent_warm_soft: string;
  status_positive: string;
  status_positive_soft: string;
  status_negative: string;
  status_negative_soft: string;
  skeleton_primary: string;
  skeleton_secondary: string;
  radius_card: string;
  radius_control: string;
  shadow_card: string;
  border_width: string;
  aurora_opacity: string;
  aurora_gradient: string;
  // First-class caption styling tokens
  caption_font: string;
  caption_weight: string;
  caption_size: string;
  caption_style: 'cinema-clean' | 'vlog-minimal' | 'editorial-glass' | 'editorial-serif';
  caption_color: string;
  caption_highlight_color: string;
  caption_bg: string;
  caption_position: 'bottom' | 'lower-third' | 'center';
}

export type CaptionStyleVariant = BrandTokens['caption_style'];

export interface CaptionVisualSpec {
  fontFamily: string;
  fontWeight: number;
  fontSizePx: number;
  letterSpacing: string;
  lineHeight: number;
  color: string;
  backgroundColor: string;
  border: string;
  borderRadius: string;
  backdropFilter: string;
  textShadow: string;
  padding: string;
  emphasizeColor: string;
}

export const CAPTION_STYLE_LABELS: Record<CaptionStyleVariant, string> = {
  'cinema-clean': 'Cinema Clean (SF Pro)',
  'vlog-minimal': 'Daily Vlog Minimal (SF Pro)',
  'editorial-glass': 'Editorial Glass (Figma)',
  'editorial-serif': 'Editorial Serif (Instrument)',
};

export function normalizeCaptionStyle(raw?: string): CaptionStyleVariant {
  const v = (raw || '').trim().toLowerCase();
  if (
    v === 'cinema-clean' ||
    v === 'vlog-minimal' ||
    v === 'editorial-glass' ||
    v === 'editorial-serif'
  ) {
    return v;
  }
  if (v === 'pill') return 'editorial-glass';
  return 'cinema-clean';
}

export function getCaptionVisualSpec(
  tokens: BrandTokens,
  opts: { isVertical?: boolean; renderHeight?: number } = {}
): CaptionVisualSpec {
  const style = normalizeCaptionStyle(tokens.caption_style);
  const baseFont =
    tokens.caption_font && !tokens.caption_font.includes('Google Sans Flex')
      ? tokens.caption_font
      : '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Inter", sans-serif';

  const renderHeight = opts.renderHeight;
  const isVertical = Boolean(opts.isVertical);
  const basePx = renderHeight
    ? Math.round(renderHeight * (isVertical ? 0.025 : 0.034))
    : isVertical
      ? 16
      : 19;

  // Avoid legacy AI-slop #60A5FA blue highlights; keep emphasis subtle and editorial.
  const safeAccent =
    tokens.caption_highlight_color &&
    tokens.caption_highlight_color.toUpperCase() !== '#60A5FA'
      ? tokens.caption_highlight_color
      : tokens.caption_color || '#FFFFFF';

  switch (style) {
    case 'vlog-minimal':
      return {
        fontFamily: baseFont,
        fontWeight: Number(tokens.caption_weight) || 600,
        fontSizePx: Math.round(basePx * 0.96),
        letterSpacing: '-0.015em',
        lineHeight: 1.32,
        color: tokens.caption_color || '#FFFFFF',
        backgroundColor: 'transparent',
        border: 'none',
        borderRadius: '0px',
        backdropFilter: 'none',
        textShadow: '0 2px 10px rgba(0, 0, 0, 0.78), 0 1px 2px rgba(0, 0, 0, 0.9)',
        padding: renderHeight ? '8px 18px' : '4px 10px',
        emphasizeColor: safeAccent,
      };
    case 'editorial-glass':
      return {
        fontFamily: baseFont,
        fontWeight: Number(tokens.caption_weight) || 500,
        fontSizePx: Math.round(basePx * 0.94),
        letterSpacing: '-0.01em',
        lineHeight: 1.35,
        color: tokens.caption_color || '#F8FAFC',
        backgroundColor:
          tokens.caption_bg &&
          tokens.caption_bg !== 'transparent' &&
          !tokens.caption_bg.includes('15, 23, 42')
            ? tokens.caption_bg
            : 'rgba(12, 14, 18, 0.56)',
        border: '1px solid rgba(255, 255, 255, 0.14)',
        borderRadius: '10px',
        backdropFilter: 'blur(14px)',
        textShadow: '0 1px 4px rgba(0, 0, 0, 0.45)',
        padding: renderHeight ? '10px 22px' : '6px 14px',
        emphasizeColor: safeAccent,
      };
    case 'editorial-serif':
      return {
        fontFamily: '"Instrument Serif", "New York", Georgia, serif',
        fontWeight: 400,
        fontSizePx: Math.round(basePx * 1.18),
        letterSpacing: '0em',
        lineHeight: 1.25,
        color: tokens.caption_color || '#FAF7F2',
        backgroundColor: 'transparent',
        border: 'none',
        borderRadius: '0px',
        backdropFilter: 'none',
        textShadow: '0 2px 14px rgba(0, 0, 0, 0.85), 0 1px 3px rgba(0, 0, 0, 0.92)',
        padding: renderHeight ? '8px 18px' : '4px 10px',
        emphasizeColor: safeAccent,
      };
    case 'cinema-clean':
    default:
      return {
        fontFamily: baseFont,
        fontWeight: Number(tokens.caption_weight) || 500,
        fontSizePx: basePx,
        letterSpacing: '-0.01em',
        lineHeight: 1.34,
        color: tokens.caption_color || '#FFFFFF',
        backgroundColor: 'transparent',
        border: 'none',
        borderRadius: '0px',
        backdropFilter: 'none',
        textShadow: '0 2px 12px rgba(0, 0, 0, 0.86), 0 1px 3px rgba(0, 0, 0, 0.95)',
        padding: renderHeight ? '8px 18px' : '4px 10px',
        emphasizeColor: safeAccent,
      };
  }
}

export const DEFAULT_BRAND_TOKENS: BrandTokens = {
  display_font: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
  body_font: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif',
  display_weight: '600',
  display_tracking: '-0.03em',
  body_tracking: '-0.01em',
  stage_bg: '#FFFFFF',
  surface_card: '#FFFFFF',
  surface_well: '#F4F6F9',
  border_subtle: '#E2E8F0',
  text_primary: '#0F172A',
  text_muted: '#64748B',
  accent_primary: '#2563EB',
  accent_soft: '#DBEAFE',
  accent_warm: '#D97706',
  accent_warm_soft: '#FEF3C7',
  status_positive: '#16A34A',
  status_positive_soft: '#DCFCE7',
  status_negative: '#DC2626',
  status_negative_soft: '#FEE2E2',
  skeleton_primary: '#CBD5E1',
  skeleton_secondary: '#E2E8F0',
  radius_card: '28px',
  radius_control: '14px',
  shadow_card: '0 24px 60px -16px rgba(15, 23, 42, 0.08), 0 8px 24px -8px rgba(15, 23, 42, 0.04)',
  border_width: '1px',
  aurora_opacity: '0.95',
  aurora_gradient:
    'linear-gradient(90deg, rgba(254, 215, 170, 0.50) 0%, rgba(233, 213, 255, 0.54) 50%, rgba(191, 219, 254, 0.52) 100%)',
  caption_font: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Inter", sans-serif',
  caption_weight: '500',
  caption_size: '28px',
  caption_style: 'cinema-clean',
  caption_color: '#FFFFFF',
  caption_highlight_color: '#FFFFFF',
  caption_bg: 'transparent',
  caption_position: 'bottom',
};

const KNOWN_KEYS = new Set<keyof BrandTokens>(Object.keys(DEFAULT_BRAND_TOKENS) as (keyof BrandTokens)[]);

export function parseDesignMd(mdText: string, mode: 'light' | 'dark' = 'light'): BrandTokens {
  const partial: Partial<Record<keyof BrandTokens, string>> = {};

  for (const line of mdText.split(/\r?\n/)) {
    const m = line.match(/^\s*[-*]\s*([a-zA-Z0-9_]+)\s*:\s*(.+?)\s*$/);
    if (m) {
      const k = m[1].trim().toLowerCase() as keyof BrandTokens;
      const v = m[2].trim();
      if (KNOWN_KEYS.has(k)) {
        partial[k] = v;
      }
    }
  }

  // Extract raw CSS vars from markdown tables (e.g. Apsis Space style DESIGN.md)
  const rawVars: Record<string, string> = {};
  const varRegex = /(--[a-zA-Z0-9_-]+)\s*\|?\s*(#[0-9a-fA-F]{3,8})/g;
  let match: RegExpExecArray | null;
  while ((match = varRegex.exec(mdText)) !== null) {
    rawVars[match[1].toLowerCase()] = match[2].toLowerCase();
  }

  if (Object.keys(rawVars).length > 0) {
    if (mode === 'dark') {
      partial.stage_bg ??= rawVars['--black'] ?? '#020202';
      partial.surface_card ??= rawVars['--neural-dark'] ?? '#111729';
      partial.surface_well ??= rawVars['--neural-dark-1'] ?? '#1e293c';
      partial.border_subtle ??= rawVars['--neural-dark-2'] ?? '#324155';
      partial.text_primary ??= rawVars['--canvas'] ?? '#ffffff';
      partial.text_muted ??= rawVars['--neural-gray'] ?? '#94a3b7';
      partial.accent_primary ??= rawVars['--neural-blue-2'] ?? rawVars['--neural-blue'] ?? '#61a6fa';
      partial.accent_soft ??= 'rgba(38, 100, 236, 0.22)';
      partial.accent_warm ??= rawVars['--neural-blue-3'] ?? '#92c4fc';
      partial.accent_warm_soft ??= 'rgba(146, 196, 252, 0.18)';
      partial.skeleton_primary ??= rawVars['--neural-dark-2'] ?? '#324155';
      partial.skeleton_secondary ??= rawVars['--neural-dark-1'] ?? '#1e293c';
    } else {
      partial.stage_bg ??= rawVars['--canvas'] ?? '#ffffff';
      partial.surface_card ??= rawVars['--canvas'] ?? '#ffffff';
      partial.surface_well ??= rawVars['--neural-gray-3'] ?? rawVars['--neural-gray-2'] ?? '#f0f4f9';
      partial.border_subtle ??= rawVars['--neural-gray-1'] ?? '#ccd5e2';
      partial.text_primary ??= rawVars['--neural-dark'] ?? '#111729';
      partial.text_muted ??= rawVars['--neural-dark-3'] ?? '#465569';
      partial.accent_primary ??= rawVars['--neural-blue'] ?? '#2664ec';
      partial.accent_soft ??= rawVars['--neural-gray-3'] ?? '#f0f4f9';
      partial.accent_warm ??= rawVars['--neural-blue-1'] ?? '#3c82f5';
      partial.accent_warm_soft ??= rawVars['--neural-gray-2'] ?? '#e2e7ef';
      partial.skeleton_primary ??= rawVars['--neural-gray-1'] ?? '#ccd5e2';
      partial.skeleton_secondary ??= rawVars['--neural-gray-2'] ?? '#e2e7ef';
    }
  }

  const darkFallbacks: Partial<BrandTokens> =
    mode === 'dark'
      ? {
          stage_bg: '#111318',
          surface_card: '#1A1D24',
          surface_well: '#232732',
          border_subtle: '#2E3340',
          text_primary: '#F8FAFC',
          text_muted: '#94A3B8',
          accent_primary: '#3B82F6',
          accent_soft: 'rgba(59, 130, 246, 0.22)',
          status_positive_soft: 'rgba(22, 163, 74, 0.14)',
          status_negative_soft: 'rgba(220, 38, 38, 0.14)',
          aurora_opacity: '0.22',
        }
      : {};

  const merged = {
    ...DEFAULT_BRAND_TOKENS,
    ...darkFallbacks,
    ...(partial as Partial<BrandTokens>),
  };
  merged.caption_style = normalizeCaptionStyle(merged.caption_style);
  return merged;
}

export function serializeDesignMd(name: string, tokens: BrandTokens): string {
  return `# ${name} — Brand Kit & Motion Token Contract

## Typography
- display_font: ${tokens.display_font}
- body_font: ${tokens.body_font}
- display_weight: ${tokens.display_weight}
- display_tracking: ${tokens.display_tracking}
- body_tracking: ${tokens.body_tracking}

## Palette
- stage_bg: ${tokens.stage_bg}
- surface_card: ${tokens.surface_card}
- surface_well: ${tokens.surface_well}
- border_subtle: ${tokens.border_subtle}
- text_primary: ${tokens.text_primary}
- text_muted: ${tokens.text_muted}
- accent_primary: ${tokens.accent_primary}
- accent_soft: ${tokens.accent_soft}
- accent_warm: ${tokens.accent_warm}
- accent_warm_soft: ${tokens.accent_warm_soft}
- status_positive: ${tokens.status_positive}
- status_positive_soft: ${tokens.status_positive_soft}
- status_negative: ${tokens.status_negative}
- status_negative_soft: ${tokens.status_negative_soft}
- skeleton_primary: ${tokens.skeleton_primary}
- skeleton_secondary: ${tokens.skeleton_secondary}

## Geometry & Atmosphere
- radius_card: ${tokens.radius_card}
- radius_control: ${tokens.radius_control}
- shadow_card: ${tokens.shadow_card}
- border_width: ${tokens.border_width}
- aurora_opacity: ${tokens.aurora_opacity}
- aurora_gradient: ${tokens.aurora_gradient}

## Captions & Subtitles
- caption_font: ${tokens.caption_font}
- caption_weight: ${tokens.caption_weight}
- caption_size: ${tokens.caption_size}
- caption_style: ${tokens.caption_style}
- caption_color: ${tokens.caption_color}
- caption_highlight_color: ${tokens.caption_highlight_color}
- caption_bg: ${tokens.caption_bg}
- caption_position: ${tokens.caption_position}
`;
}

export interface BrandPreset {
  id: string;
  name: string;
  mode: 'light' | 'dark';
  tokens: BrandTokens;
}

export const BUILTIN_BRAND_PRESETS: BrandPreset[] = [
  {
    id: 'cinema-daily-vlog',
    name: 'Cinema & Daily Vlog',
    mode: 'dark',
    tokens: {
      ...DEFAULT_BRAND_TOKENS,
      display_font: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
      body_font: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif',
      display_weight: '600',
      stage_bg: '#090B0A',
      surface_card: '#141816',
      surface_well: '#1E2421',
      border_subtle: '#28302C',
      text_primary: '#F8FAFC',
      text_muted: '#A1A1AA',
      accent_primary: '#F8FAFC',
      accent_soft: 'rgba(255, 255, 255, 0.12)',
      shadow_card: 'none',
      aurora_opacity: '0',
      caption_font: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Inter", sans-serif',
      caption_weight: '500',
      caption_style: 'cinema-clean',
      caption_color: '#FFFFFF',
      caption_highlight_color: '#FFFFFF',
      caption_bg: 'transparent',
    },
  },
  {
    id: 'apple-keynote-clean',
    name: 'Apple Keynote Clean',
    mode: 'light',
    tokens: {
      ...DEFAULT_BRAND_TOKENS,
      display_font: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
      body_font: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif',
      display_weight: '600',
      stage_bg: '#FFFFFF',
      surface_card: '#F5F5F7',
      surface_well: '#E8E8ED',
      border_subtle: '#D2D2D7',
      text_primary: '#1D1D1F',
      text_muted: '#6E6E73',
      accent_primary: '#1D1D1F',
      accent_soft: 'rgba(29, 29, 31, 0.08)',
      shadow_card: '0 20px 48px rgba(0, 0, 0, 0.08)',
      aurora_opacity: '0',
      caption_font: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif',
      caption_weight: '500',
      caption_style: 'vlog-minimal',
      caption_color: '#FFFFFF',
      caption_highlight_color: '#FFFFFF',
      caption_bg: 'transparent',
    },
  },
  {
    id: 'electric-lime-dark',
    name: 'Electric Lime Dark',
    mode: 'dark',
    tokens: {
      ...DEFAULT_BRAND_TOKENS,
      display_font: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
      body_font: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif',
      display_weight: '600',
      stage_bg: '#090B0A',
      surface_card: '#141816',
      surface_well: '#1E2421',
      border_subtle: '#28302C',
      text_primary: '#F4F7F5',
      text_muted: '#A9B8B0',
      accent_primary: '#C4FF2E',
      accent_soft: 'rgba(196, 255, 46, 0.16)',
      accent_warm: '#00D4AA',
      accent_warm_soft: 'rgba(0, 212, 170, 0.16)',
      status_positive: '#00D4AA',
      status_positive_soft: 'rgba(0, 212, 170, 0.16)',
      shadow_card: 'none',
      aurora_opacity: '0.26',
      aurora_gradient: 'linear-gradient(125deg, #C4FF2E 0%, #00D4AA 52%, #2E6BFF 100%)',
      caption_font: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif',
      caption_style: 'editorial-glass',
      caption_color: '#F4F7F5',
      caption_highlight_color: '#C4FF2E',
      caption_bg: 'rgba(12, 15, 14, 0.58)',
    },
  },
  {
    id: 'electric-lime-light',
    name: 'Electric Lime Light',
    mode: 'light',
    tokens: {
      ...DEFAULT_BRAND_TOKENS,
      display_font: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
      body_font: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif',
      display_weight: '600',
      stage_bg: '#F6F9F4',
      surface_card: '#FFFFFF',
      surface_well: '#EBF1E7',
      border_subtle: '#DCE5D8',
      text_primary: '#0F1410',
      text_muted: '#4F5D52',
      accent_primary: '#141A13',
      accent_soft: 'rgba(196, 255, 46, 0.34)',
      accent_warm: '#00A887',
      accent_warm_soft: 'rgba(0, 168, 135, 0.14)',
      shadow_card: 'none',
      aurora_opacity: '0.85',
      aurora_gradient:
        'linear-gradient(125deg, rgba(196, 255, 46, 0.34) 0%, rgba(0, 212, 170, 0.22) 52%, rgba(46, 107, 255, 0.16) 100%)',
      caption_font: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif',
      caption_style: 'cinema-clean',
      caption_color: '#FFFFFF',
      caption_highlight_color: '#FFFFFF',
      caption_bg: 'transparent',
    },
  },
  {
    id: 'apple-light',
    name: 'Apple Light',
    mode: 'light',
    tokens: { ...DEFAULT_BRAND_TOKENS },
  },
  {
    id: 'linear-dark',
    name: 'Linear Dark',
    mode: 'dark',
    tokens: {
      ...DEFAULT_BRAND_TOKENS,
      display_weight: '600',
      stage_bg: '#111318',
      surface_card: '#1A1D24',
      surface_well: '#232732',
      border_subtle: '#2E3340',
      text_primary: '#F8FAFC',
      text_muted: '#94A3B8',
      accent_primary: '#3B82F6',
      accent_soft: 'rgba(59, 130, 246, 0.22)',
      accent_warm: '#F59E0B',
      accent_warm_soft: 'rgba(245, 158, 11, 0.20)',
      status_positive: '#22C55E',
      status_positive_soft: 'rgba(34, 197, 94, 0.18)',
      status_negative: '#EF4444',
      status_negative_soft: 'rgba(239, 68, 68, 0.18)',
      skeleton_primary: '#475569',
      skeleton_secondary: '#334155',
      radius_card: '24px',
      radius_control: '12px',
      shadow_card: '0 28px 70px -18px rgba(0, 0, 0, 0.55)',
      aurora_opacity: '0.22',
      caption_style: 'editorial-glass',
      caption_color: '#F8FAFC',
      caption_highlight_color: '#F8FAFC',
      caption_bg: 'rgba(17, 19, 24, 0.56)',
    },
  },
  {
    id: 'editorial-warm',
    name: 'Editorial Warm',
    mode: 'light',
    tokens: {
      ...DEFAULT_BRAND_TOKENS,
      display_font: '"Instrument Serif", "New York", Georgia, serif',
      body_font: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif',
      display_weight: '400',
      stage_bg: '#FAF7F2',
      surface_card: '#FFFFFF',
      surface_well: '#F3EFE8',
      border_subtle: '#E7E0D5',
      text_primary: '#1C1917',
      text_muted: '#78716C',
      accent_primary: '#C2410C',
      accent_soft: '#FFEDD5',
      aurora_opacity: '0.65',
      caption_font: '"Instrument Serif", "New York", Georgia, serif',
      caption_weight: '400',
      caption_style: 'editorial-serif',
      caption_color: '#FAF7F2',
      caption_highlight_color: '#FAF7F2',
      caption_bg: 'transparent',
    },
  },
  {
    id: 'apsis-dark',
    name: 'Apsis Space Dark',
    mode: 'dark',
    tokens: {
      ...DEFAULT_BRAND_TOKENS,
      display_font: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
      body_font: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif',
      display_weight: '500',
      stage_bg: '#020202',
      surface_card: '#111729',
      surface_well: '#1E293C',
      border_subtle: '#324155',
      text_primary: '#FFFFFF',
      text_muted: '#94A3B7',
      accent_primary: '#61A6FA',
      accent_soft: 'rgba(38, 100, 236, 0.22)',
      shadow_card: 'none',
      aurora_opacity: '0',
      caption_style: 'cinema-clean',
      caption_color: '#FFFFFF',
      caption_highlight_color: '#FFFFFF',
      caption_bg: 'transparent',
    },
  },
  {
    id: 'figma-lime',
    name: 'Figma Editorial Lime',
    mode: 'light',
    tokens: {
      ...DEFAULT_BRAND_TOKENS,
      display_font: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif',
      body_font: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif',
      display_weight: '400',
      stage_bg: '#FFFFFF',
      surface_card: '#C4FA6F',
      surface_well: '#F5F5F5',
      border_subtle: '#E5E5E5',
      text_primary: '#000000',
      text_muted: '#1A1A1A',
      accent_primary: '#000000',
      accent_soft: '#D8C7FF',
      shadow_card: 'none',
      aurora_opacity: '0',
      caption_style: 'editorial-glass',
      caption_color: '#FFFFFF',
      caption_highlight_color: '#C4FA6F',
      caption_bg: 'rgba(12, 14, 18, 0.62)',
    },
  },
];
