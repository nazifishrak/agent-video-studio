# Design Guidelines for Artifacts

Adopted 2026-11-04 at Nazif's request. Follow this system for artifact design (web pages and documents built for him), unless he asks otherwise. This file is the standing design MD.

## Overview

Figma's marketing canvas is, at the system level, an editor-clean black-and-white frame. The chrome — top nav, body type, footer, primary CTA — is monochrome. Headlines are oversized `{typography.display-xl}` set in `figmaSans` with aggressive negative tracking, body copy hovers around weight 320–340 of the same variable family, and small mono `{typography.eyebrow}` and `{typography.caption}` labels (figmaMono, all-caps, positive tracking) act as section markers. Every CTA is a pill — `{rounded.pill}` — and the primary action across the entire site is the same black `{components.button-primary}` paired with the same white `{components.button-secondary}`.

What makes the design unique is what happens **between** those monochrome bookends: the page repeatedly drops into oversized pastel **color-block sections** — lime, lavender, cream, mint, pink, coral, and a deep navy — that span the full content width with `{rounded.lg}` corners and `{spacing.xxl}` interior padding. These blocks are where the storytelling lives. They aren't accents tucked into a card; they take over a whole viewport's worth of vertical space, like a designer arranging giant sticky notes on a clean wall. FigJam is the most pastel-saturated, the home page rotates through the full set, and the pricing page ends with a lime FAQ panel — same vocabulary, different rhythm per route.

This is a system built on contrast: the monochrome chrome makes the color blocks feel intentional rather than decorative, and the color blocks make the monochrome chrome feel like editorial paper rather than enterprise SaaS. Density is generous, line-heights are tight on display sizes, and the interface never reaches for shadows or gradients to do the work that color blocks and confident typography already do.

**Key Characteristics:**
- Monochrome system core: `{colors.primary}` (black) and `{colors.canvas}` (white) carry every CTA, every body line, every footer link.
- Oversized pastel **color-block sections** (`{colors.block-lime}`, `{colors.block-lilac}`, `{colors.block-cream}`, `{colors.block-mint}`, `{colors.block-pink}`, `{colors.block-coral}`, `{colors.block-navy}`) define the narrative rhythm of every long-form page.
- Pill is the only button shape — `{rounded.pill}` for text CTAs, `{rounded.full}` for icon buttons. No square buttons anywhere.
- `figmaSans` variable typeface used at unusually fine weight increments (320, 330, 340, 450, 480, 540) — the type system reads as a single voice that flexes rather than a multi-weight family.
- Tight negative letter-spacing on display sizes (-1.72px at 86px, -0.96px at 64px) creates a confident editorial cadence.
- `figmaMono` reserved for category labels, eyebrows, and captions — always uppercase, positive tracking — to flag taxonomy without competing with display type.
- Color-block page rhythm (home): white hero → marquee strip → white feature → lime systems block → navy ship-products block → coral developer block → white template grid → white footer.

## Colors

### Brand & Accent
- **Black** ({colors.primary}): The system primary. Every primary CTA, every headline, every body line, the marquee strip, the inverse canvas of dark sections.
- **White** ({colors.on-primary}): Inverse text on black surfaces; also the canvas color used as the foreground of secondary pill buttons (`{components.button-secondary}`).
- **Magenta Promo** ({colors.accent-magenta}): A single saturated CTA pink reserved for promotional inline buttons. Use scarcely; it is not a section color.

### Surface
- **Canvas** ({colors.canvas}): Default page background and the body of every white card.
- **Inverse Canvas** ({colors.inverse-canvas}): Footer, marquee strip, and a subset of "ship products"-style story sections.
- **Surface Soft** ({colors.surface-soft}): Off-white tile background used for icon buttons, template cards, and feature illustration tiles when they sit on the white canvas.
- **Hairline** ({colors.hairline}): 1px borders on form inputs, pricing cards, and table dividers.
- **Hairline Soft** ({colors.hairline-soft}): Even subtler dividers — comparison-table row separators and footer column rules.
- **Block Lime** ({colors.block-lime}): The signature **systems / FAQ / contact-form** color block. Recurs across home, pricing, contact.
- **Block Lilac** ({colors.block-lilac}): Hero block on `/design/`; also the inline Release Notes promo banner.
- **Block Cream** ({colors.block-cream}): Soft warm background — FigJam hero strip, template-grid section.
- **Block Mint** ({colors.block-mint}): FigJam pastel section.
- **Block Pink** ({colors.block-pink}): FigJam pastel section.
- **Block Coral** ({colors.block-coral}): "Ship products" coral story block on home.
- **Block Navy** ({colors.block-navy}): Deep indigo story block — only place dark surfaces appear above the footer.

### Text
- **Ink** ({colors.ink}): All headline, body, and caption type on light surfaces. There is no softer mid-gray text role on marketing — body copy is always black at weight 320–340, and weight (not opacity) carries the hierarchy.
- **Inverse Ink** ({colors.inverse-ink}): Type on inverse-canvas surfaces (footer, marquee strip, navy color block).
- **On-Inverse Soft** ({colors.on-inverse-soft}): White used at ~16% opacity for circular icon-button surfaces against dark sections.

### Semantic
- **Success Green** ({colors.semantic-success}): Comparison-table checkmarks on pricing. Used as a glyph fill, not a surface.
- **Overlay Scrim** ({colors.overlay-scrim}): Black used at ~60% opacity behind modal / video-overlay surfaces.

## Typography

### Font Family

- **figmaSans** — Figma's proprietary variable typeface; fallback stack `figmaSans Fallback, SF Pro Display, system-ui, helvetica`. Variable weight axis is exercised at unusually fine increments (320, 330, 340, 450, 480, 540, 700).
- **figmaMono** — Proprietary monospace; fallback `figmaMono Fallback, SF Mono, menlo`. Used exclusively for eyebrow labels and captions, always uppercase with positive letter-spacing.

OpenType `kern` is enabled across every role.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-xl}` | 86px | 340 | 1.00 | -1.72px | Hero headlines |
| `{typography.display-lg}` | 64px | 340 | 1.10 | -0.96px | Section opener headlines |
| `{typography.headline}` | 26px | 540 | 1.35 | -0.26px | Story-block titles inside color blocks |
| `{typography.subhead}` | 26px | 340 | 1.35 | -0.26px | Long-form intro paragraphs at near-headline scale |
| `{typography.card-title}` | 24px | 700 | 1.45 | 0 | Pricing-tier titles, feature card titles |
| `{typography.body-lg}` | 20px | 330 | 1.40 | -0.14px | Lead body copy, form labels |
| `{typography.body}` | 18px | 320 | 1.45 | -0.26px | Default body |
| `{typography.body-sm}` | 16px | 330 | 1.45 | -0.14px | Card body, footer link list |
| `{typography.link}` | 20px | 480 | 1.40 | -0.10px | Inline link emphasis |
| `{typography.button}` | 20px | 480 | 1.40 | -0.10px | All pill buttons, primary and secondary |
| `{typography.eyebrow}` | 18px | 400 | 1.30 | 0.54px | figmaMono uppercase section eyebrows |
| `{typography.caption}` | 12px | 400 | 1.00 | 0.60px | figmaMono uppercase captions, footer column heads |

### Principles

- **Weight, not size, carries hierarchy on body copy.**
- **Negative letter-spacing scales with size.**
- **Mono is taxonomy, not body.** Never used to set a paragraph.
- **Tight line-heights on display, generous on body.**

### Note on Font Substitutes

If implementing without access to figmaSans / figmaMono, suitable open-source substitutes are **Inter** (or **Geist**) for the sans, and **JetBrains Mono** (or **Geist Mono**) for the mono. Inter at variable weights closely matches the fine-grained weight axis figmaSans uses; manually adjust line-heights down by ~0.02 to compensate for Inter's slightly taller x-height.

## Layout

### Spacing System

- **Base unit**: 8px.
- **Tokens**: `{spacing.hair}` 1px · `{spacing.xxs}` 4px · `{spacing.xs}` 8px · `{spacing.sm}` 12px · `{spacing.md}` 16px · `{spacing.lg}` 24px · `{spacing.xl}` 32px · `{spacing.xxl}` 48px · `{spacing.section}` 96px.
- Section interior padding: `{spacing.xxl}` (48px) on color-block sections.
- Card interior padding: `{spacing.lg}` (24px) on pricing cards and template tiles.
- Form input padding: `{spacing.sm}` 12px vertical · 14px horizontal.
- Button padding: `{spacing.xs}` 8px vertical · `{spacing.lg}` 24px horizontal for pill buttons.
- Universal rhythm constant: `{spacing.section}` (96px) — the vertical gap between major content sections.

### Grid & Container

- Max content width around 1280px, with side gutters scaling from `{spacing.xxl}` on desktop down to `{spacing.lg}` on mobile.
- Color-block sections break the column grid — they span content width with full bleed inside the rounded `{rounded.lg}` corners, then place a single editorial column of headline + body inside.

### Whitespace Philosophy

White space is used to make the color blocks feel deliberate. Between every colored panel and the next, the page returns to white canvas with `{spacing.section}` of breathing room. Inside a color block, the type itself is given generous side margins so the panel reads as a poster, not a wall of copy.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| 0 (flat) | No shadow, no border | Default for color-block sections, inverse-canvas footer, hero |
| 1 (hairline) | 1px `{colors.hairline}` border on `{colors.canvas}` | Pricing cards, form inputs, comparison table cells |
| 2 (soft elevation) | Subtle drop shadow approx 0 4px 16px rgba(0,0,0,0.06) | Floating template tiles, dropdown menus |
| 3 (modal) | Stronger shadow + `{colors.overlay-scrim}` behind | Video / image lightbox overlays |

The system is shadow-light by design — the color blocks substitute for traditional elevation.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.xs}` | 2px | Anchor / link decoration corners |
| `{rounded.sm}` | 6px | Small chips, sub-nav tabs |
| `{rounded.md}` | 8px | Form inputs, list items, image frames |
| `{rounded.lg}` | 24px | Pricing cards, color-block sections, large image containers |
| `{rounded.xl}` | 32px | Hero feature panels, oversized callouts |
| `{rounded.pill}` | 50px | All text CTAs (primary, secondary, tab toggles) |
| `{rounded.full}` | 9999px | Circular icon buttons, comparison-table checkmark glyphs |

## Components

### Buttons

**`button-primary`** — Black pill. Background `{colors.primary}`, text `{colors.on-primary}`, type `{typography.button}`, padding 10px 20px, rounded `{rounded.pill}`.

**`button-secondary`** — White pill with black text. Background `{colors.canvas}`, text `{colors.ink}`, type `{typography.button}`, padding 8px 18px 10px, rounded `{rounded.pill}`. No border.

**`button-tertiary-text`** — Plain text link styled as a button hit target. Background `{colors.canvas}`, text `{colors.ink}`, type `{typography.link}`, rounded `{rounded.full}` (hit target only), padding `{spacing.xs}` `{spacing.sm}`.

**`button-icon-circular`** — 40px circular icon button. Background `{colors.surface-soft}`, text `{colors.ink}`, rounded `{rounded.full}`, size 40px.

**`button-icon-circular-inverse`** — Same shape, on inverse-canvas / dark color blocks. Background `{colors.on-inverse-soft}` (translucent white), text `{colors.inverse-ink}`, rounded `{rounded.full}`, size 40px.

**`button-magenta-promo`** — Saturated pink pill used only inside promotional surfaces. Background `{colors.accent-magenta}`, text `{colors.on-primary}`, type `{typography.button}`, rounded `{rounded.pill}`, padding 10px 18px.

### Color-Block Sections (signature)

Each is a full-content-width panel with `{rounded.lg}` corners and `{spacing.xxl}` interior padding. Variants: lime (systems stories, FAQ, contact form), lilac (hero, highlights), navy (deep indigo story block, inverse text), plus cream, mint, pink, coral following the same shape.

### Promo Banner

**`promo-banner-lilac`** — Background `{colors.block-lilac}`, text `{colors.ink}`, type `{typography.body-sm}`, rounded `{rounded.md}`, padding `{spacing.md}` `{spacing.lg}`. Carries a `button-magenta-promo` on the right edge.

### Navigation

**`top-nav`** — Sticky white bar, background `{colors.canvas}`, text `{colors.ink}`, type `{typography.body-sm}`, height 56px.

**`marquee-strip`** — Thin black ribbon. Background `{colors.inverse-canvas}`, text `{colors.inverse-ink}`, type `{typography.body-sm}`, height 36px.

### Footer

**`footer`** — Dense link grid on white canvas, type `{typography.caption}` for column headings and small links, padding `{spacing.section}` top/bottom · `{spacing.xl}` sides.

## Do's and Don'ts

### Do

- Reserve `{colors.primary}` for genuine primary CTAs and selected states.
- When introducing a story section, choose **one** color block from the `{colors.block-*}` family and let it span full content width with `{rounded.lg}` corners and `{spacing.xxl}` interior padding.
- Keep type in `figmaSans` at variable weights (320, 330, 340, 480, 540, 700).
- Use `figmaMono` only for eyebrows and captions, always uppercase, with positive letter-spacing.
- Compose every CTA as a pill (`{rounded.pill}`) and every icon button as a circle (`{rounded.full}`).
- Allow the page to **return to white canvas** between every two color blocks.
- Pair `button-primary` and `button-secondary` whenever a section needs both a primary and a secondary action.

### Don't

- Don't introduce mid-gray text. Body hierarchy comes from weight, not opacity.
- Don't add drop shadows to color-block sections.
- Don't introduce new accent colors outside the documented `{colors.block-*}` palette and `{colors.accent-magenta}`.
- Don't combine more than one color block visible inside a single viewport.
- Don't square off CTAs.
- Don't put `figmaMono` in body copy.
- Don't replace the `pricing-tab-selected` black fill with a colored tab.

## Responsive Behavior

| Name | Width | Key Changes |
|---|---|---|
| 4k | 1920px | Max content width holds at 1280px; gutters expand |
| Desktop-XL | 1440px | Default desktop layout |
| Desktop | 1400px | Comparison table column widths normalize |
| Desktop-S | 1280px | Pricing 4-up tier grid maintained |
| Tablet | 960px | Pricing collapses 4-up → 2-up; nav becomes hamburger |
| Mobile-L | 768px | Color-block sections become full-bleed (no rounded corners on edges) |
| Mobile | 560px | Display-xl reduces from 86px to ~48px; pill CTAs go full-width |
| Mobile-XS | 559px | Two-column footer collapses to single column |

### Touch Targets

- Pill buttons maintain a minimum 44px tap height across all viewports.
- Circular icon buttons are 40px on desktop and grow to 44px on touch viewports.
- Form input minimum tap target is 48px high.

## Iteration Guide

1. Focus on ONE component at a time and reference it by its `components:` token name.
2. When introducing a new section, decide **first** which `{colors.block-*}` token it sits on.
3. Default body type to `{typography.body}`; reach for `{typography.subhead}` or `{typography.headline}` only inside a color block.
4. Add new variants as separate component entries — do not bury them in prose.
5. Keep `{colors.primary}` scarce. If two `button-primary` instances appear in the same viewport, neutralize one to `button-secondary`.
6. Treat `{colors.accent-magenta}` as a single-shot color: one promo CTA per page, never two.

## Known Gaps

- The exact pastel hex values of `{colors.block-*}` are derived from screenshot pixels; treat documented hex values as faithful approximations rather than exact brand specs.
- Dark mode is not documented because the marketing site does not ship a dark theme — the closest analog is the navy color-block and the inverse-canvas footer.
- Form-field error and validation styling is not visible on `/contact/`; inputs have hairline borders and rounded `{rounded.md}` corners.
- The animated marquee-strip and color-block reveal animations are not documented.

## Compiled Motion Tokens (for scripts/parse_design_md.py)
- display_font: "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif
- body_font: "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif
- display_weight: 400
- display_tracking: -0.025em
- body_tracking: -0.01em
- stage_bg: #FFFFFF
- surface_card: #C4FA6F
- surface_well: #F5F5F5
- border_subtle: #E5E5E5
- text_primary: #000000
- text_muted: #1A1A1A
- accent_primary: #000000
- accent_soft: #D8C7FF
- accent_warm: #FF3B9A
- accent_warm_soft: #FFF6E5
- skeleton_primary: #1A1A1A
- skeleton_secondary: #D4D4D8
- radius_card: 24px
- radius_control: 50px
- border_width: 1px
- shadow_card: none
- aurora_opacity: 0
