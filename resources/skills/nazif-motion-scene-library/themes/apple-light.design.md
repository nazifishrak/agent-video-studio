# DESIGN.md — Motion Scene Aesthetic Contract

Drop any brand's `DESIGN.md` here and run:
`python3 scripts/parse_design_md.py DESIGN.md`
Every one of the 54 motion scenes in `scenes/` will immediately adopt the updated palette, typography, radii, and surface elevation.

## Typography
- display_font: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif
- body_font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif
- display_weight: 700
- display_tracking: -0.035em
- body_tracking: -0.012em

## Palette
- stage_bg: #FFFFFF
- surface_card: #FFFFFF
- surface_well: #F4F6F9
- border_subtle: #E2E8F0
- text_primary: #0F172A
- text_muted: #64748B
- accent_primary: #2563EB
- accent_soft: #DBEAFE
- accent_warm: #D97706
- accent_warm_soft: #FEF3C7
- status_positive: #16A34A
- status_positive_soft: #DCFCE7
- status_negative: #DC2626
- status_negative_soft: #FEE2E2
- skeleton_primary: #CBD5E1
- skeleton_secondary: #E2E8F0

## Geometry & Atmosphere
- radius_card: 28px
- radius_control: 14px
- shadow_card: 0 24px 60px -16px rgba(15, 23, 42, 0.08), 0 8px 24px -8px rgba(15, 23, 42, 0.04)
- aurora_opacity: 0.95
- aurora_gradient: linear-gradient(90deg, rgba(254, 215, 170, 0.50) 0%, rgba(233, 213, 255, 0.54) 50%, rgba(191, 219, 254, 0.52) 100%)

## Anti-Slop Guardrails (Mandatory)
- Zero monospace fonts on UI cards, titles, filenames, badges, or counters.
- Zero middot separators; use clean whitespace or hairline `/` dividers.
- Zero glowing neon status dots or emerald radio circles.
- Always apply `font-variant-numeric: tabular-nums` to animated counters and metrics.
