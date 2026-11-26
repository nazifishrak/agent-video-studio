# DESIGN.md — Apsis Space Design System & Motion Specification

## 1. Aesthetic Philosophy
The interface pairs austere black, white, and cool steel-gray surfaces with controlled bursts of cobalt blue and tactile aerospace photography. Hierarchy comes from type scale, negative tracking, surface alternation, and 1px hairline borders—never heavy drop shadows, neon glows, or decorative chrome.
- Flat, architectural elevation: Depth is created by alternating full-width surface bands (#FFFFFF, #E2E7EF, #111729, #020202, #2664EC) and 1px borders rather than blur shadows.
- Per-pillar page theming: Each primary navigation section owns a distinct hero palette while sharing identical button geometry, spacing cadence, and footer structure.
- Restrained metadata: No pulsing/green status dots, no glowing neon chips on dark surfaces, no middot separators, and no monospace/typewriter UI labels.

## 2. Color Tokens (Neural Palette)
| Token | Hex | Role |
| --- | --- | --- |
| --black | #020202 | Announcement bar, pure dark hero bands (Meridian, Systems), global footer |
| --neural-dark | #111729 | Primary text on light, primary dark pill CTAs, dark console/feature cards, Security hero |
| --neural-dark-1 | #1e293c | Elevated dark card surfaces, dark hairline borders, Orbital Vault stacking card |
| --neural-dark-2 | #324155 | Dark-mode subtle dividers and secondary dark borders |
| --neural-dark-3 | #465569 | Secondary body copy and muted labels on light backgrounds |
| --neural-gray | #94a3b7 | Muted metadata, inactive dark segmented buttons, footer column headers |
| --neural-gray-1 | #ccd5e2 | Standard 1px hairlines, form input borders, accordion rules, research table dividers |
| --neural-gray-2 | #e2e7ef | Neutral section bands (Purpose-built systems, Meridian capabilities, About hero, Contact canvas) |
| --neural-gray-3 | #f0f4f9 | Soft surface tint for notched testimonial cards, mega-menu hover states, inactive blog chips |
| --neural-blue | #2664ec | Primary brand accent, dark CTA hover state, active links, Research hero top, form focus border |
| --neural-blue-1 | #3c82f5 | Secondary interactive blue accent |
| --neural-blue-2 | #61a6fa | Dark-surface technical callouts, footer newsletter eyebrow, Voronoi line art, streaming caret |
| --neural-blue-3 | #92c4fc | Dark-mode NEW badge fill (paired with #111729 text), gradient end-stop |
| --canvas | #ffffff | Default editorial canvas (Home, Blog, Research table, form cards, light-mode CTAs on dark) |

## 3. Typography System
- display_font: "Plus Jakarta Sans", "Inter", -apple-system, BlinkMacSystemFont, sans-serif
- body_font: "Inter", -apple-system, BlinkMacSystemFont, sans-serif
- display_weight: 500
- display_tracking: -0.03em
- body_tracking: 0em
- eyebrow_spec: Plus Jakarta Sans / 11px / 600 / 0.06em uppercase

## 4. Motion & Architectural Ease
- primary_ease: cubic-bezier(0.22, 1, 0.36, 1)
- radius_card: 20px
- radius_control: 14px
- shadow_card: none
- border_width: 1px
- aurora_opacity: 0
