---
name: nazif-motion-scene-library
description: Decoupled 60-scene HTML/CSS/JS motion plate library driven by any DESIGN.md file. Use when building promotional videos, SaaS launch films, YouTube explainers, or B-roll motion plates with deterministic 30/60fps rendering and zero AI-slop typography.
---

# Nazif Motion Scene Library (60 Decoupled Scenes)

A modular motion-graphics system for AI video agents (Claude Code, Hyperframes, Remotion, or headless Playwright + FFmpeg). Every scene is decoupled from brand styling via `DESIGN.md` and accepts dynamic JSON prop overrides at render time.

## Strict Aesthetic Rules (Never Violate)

1. **Follow `../ai-video-editor/references/APPROVED_LOOKS.md`**: Only pick approved motion scenes and caption variants (`cinema-clean`, `vlog-minimal`, `editorial-glass`, `editorial-serif`) that match the active Brand Kit. Never use `#60A5FA` blue caption highlights or heavy AI-slop boxes.
2. **Zero Monospace on UI**: Never use monospace fonts (`JetBrains Mono`, `Fira Code`, `Space Grotesk`, `Courier`) on headlines, cards, labels, filenames, or badges. Default to `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", sans-serif` (or the fonts specified in the active `DESIGN.md`).
3. **Zero Middot Separators**: Never use `•` separators. Use clean whitespace or hairline `/` dividers.
4. **Zero Glowing Status Dots**: Never add emerald/neon pulsing status circles or glowing pill chips.
5. **Tabular Numbers**: Always use `font-variant-numeric: tabular-nums` (`.t-num`) on animated counters and metrics.

## Workflow for Video Agents

> **Look vs. Moves Contract:** The user's `brand/DESIGN.md` owns the **Look** (colors, fonts, radii, shadows). This library owns the **Moves** (easing, timing, staggers, staging). Before authoring or adapting any motion graphic, read **[`references/MOTION_LANGUAGE.md`](./references/MOTION_LANGUAGE.md)** for exact durations, easing curves, stagger spacing, and the Frame-0 non-blank rule.

### Step 1 — Apply Any Brand `DESIGN.md`
When the user provides a `DESIGN.md` (or pick a preset in `themes/`):
```bash
python3 scripts/parse_design_md.py path/to/DESIGN.md --mode light   # or --mode dark (supports rich Neural/table DESIGN.md like themes/apsis-space.design.md)
```
This compiles all brand colors, font stacks, radii, shadows, and aurora settings into `engine/tokens.css`, instantly reskinning all 60 scenes.

### Step 2 — Select Scenes from `catalog/scenes.json`
Read `catalog/scenes.json` to browse all 60 scenes across 9 categories:
- **01–06**: Kinetic Typography & Hooks (Apple Keynote, Linear, Broadcast Lower Thirds)
- **07–12**: Problem, Comparison & Objection Killers (Ali Abdaal, Ramp, Stripe)
- **13–18**: Product UI & Interactive Micro-Demos (Linear, Raycast, Notion)
- **19–24**: Workflows, Agents & Architecture Pipelines (Jeff Su, n8n, AI Dev)
- **25–30**: Screen Callouts, Zooms & PiP Overlays (Loom, Screen Studio)
- **31–36**: Data Viz, Metrics & ROI Proof (Stripe, Ramp, ChartMogul)
- **37–42**: Social Proof, Logos & Trust (Vercel, YC Launch Videos)
- **43–48**: Chapter Cards, Pacing & Transitions (Jeff Su, Apple)
- **49–54**: Feature Grids, Pricing & End-Card CTAs (Apple, Framer, Stripe)
- **55–58**: Apsis Space Signature (Streaming Telemetry Console, Notched Testimonial Card, Sticky Stacking Cards, Sliding Segmented Filter Pill)
- **59–60**: Figma Editorial Signature (Oversized Pastel Lime Color-Block Poster, Multi-Block Lilac/Navy/Coral Story Sequence)

### Step 3 — Customize Dynamically via `--props` (or Clone & Extend)
Every scene reads `defaultProps` and accepts runtime JSON overrides via `window.setProps(overrides)` or `--props` in the CLI:
```bash
node scripts/render_scene.mjs \
  --scene scenes/01-kinetic-hook-mask.html \
  --design themes/linear-dark.design.md \
  --props '{"kicker":"Launch","line1":"Ship faster","line2":"without the chaos"}' \
  --fps 30 \
  --out out/01-hook.mp4
```
For transparent overlays (e.g. `06-lower-third-clean.html`, `28-triple-chevron-pointer.html`), pass `--transparent --out out/overlay.mov` to render ProRes 4444 with alpha channel.

### Step 4 — Composite Plates onto A-Cut Footage
Create a `manifest.json` mapping rendered plates to A-cut timestamps and run:
```bash
python3 scripts/compose_sequence.py manifest.json
```

### Step 5 — Extending the Library
To create a custom 55th+ scene dynamically, copy any scene in `scenes/`, keep `<link rel="stylesheet" href="../engine/tokens.css">` and `<script src="../engine/motion-engine.js"></script>`, and implement `mount(props)` + deterministic `render(t, props)`.
