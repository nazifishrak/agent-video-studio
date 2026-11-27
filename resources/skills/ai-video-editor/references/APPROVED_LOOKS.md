# Approved Looks, Caption Variants & Motion Scene Whitelist

> Mandatory visual quality contract for every edit, caption pass, and motion plate. Never fall back to generic AI-slop styling.

---

## 1. Approved Caption Variants (4 Real-World Looks)

All video captions MUST use one of these 4 approved `caption_style` tokens in `DESIGN.md`:

| Variant (`caption_style`) | Typography & Weight | Background & Shadow | Best Genre |
| --- | --- | --- | --- |
| **`cinema-clean`** *(Default)* | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Inter", sans-serif` · Weight `500` · `#FFFFFF` | Transparent background, crisp cinema drop shadow (`0 2px 12px rgba(0,0,0,0.86)`), `-0.01em` tracking | Cinematography, montages, documentaries, narrative reels |
| **`vlog-minimal`** | `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif` · Weight `600` · `#FFFFFF` | Transparent background, tight `-0.015em` tracking, clean subtle shadow (`0 2px 10px rgba(0,0,0,0.78)`) | Daily vlogs, talking-head commentary, lifestyle Shorts |
| **`editorial-glass`** | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif` · Weight `500` · `#F8FAFC` | Smoked translucent glass (`rgba(12, 14, 18, 0.56)` + `blur(14px)` + `1px solid rgba(255,255,255,0.14)`), `10px` radius | SaaS demos, product launches, technical explainers |
| **`editorial-serif`** | `"Instrument Serif", "New York", Georgia, serif` · Weight `400` · `#FAF7F2` | Transparent background, slightly larger `1.18x` editorial scale, soft shadow (`0 2px 14px rgba(0,0,0,0.85)`) | Essays, travel films, reflective voiceovers |

### Safe-Zone Placement
- `bottom` (default): `6%` from bottom edge (clean cinema framing).
- `lower-third`: `12%` from bottom edge (clears TikTok/Reels/Shorts UI chrome in `9:16`).
- `center`: Only for short 1–3 word punch hooks when no subject face is centered.

---

## 2. Banned AI-Slop List (Never Use)

1. **NO `#60A5FA` blue highlight words** or loud neon karaoke word-by-word color flashing.
2. **NO heavy dark-navy opaque caption boxes** (`rgba(15, 23, 42, 0.78)` or `BorderStyle=3` thick boxes on cinema/vlog footage).
3. **NO `Google Sans Flex` or monospace fonts** (`JetBrains Mono`, `Space Grotesk`, `Courier`) on captions or editorial titles — use Apple SF Pro / Inter / Instrument Serif.
4. **NO unapproved template spam** (bouncing emoji subtitles, glowing status dots, middot `•` separators, or rainbow gradients).

---

## 3. Approved Motion Scene Whitelist by Genre

Pair scenes with matching Brand Kits (`cinema-daily-vlog`, `apple-keynote-clean`, `figma-lime`, `editorial-warm`, `electric-lime-dark`).

### Cinematography & Daily Vlogs (`cinema-daily-vlog` / `editorial-warm`)
- `03-editorial-pullquote` — Calm typographic pull-quote for narrative transitions.
- `28-triple-chevron-pointer` *(transparent alpha)* — Minimal directional pointer when highlighting a detail.
- `46-optical-blur-unveil` — Subtle chapter/title unveil.
- `52-founder-signoff-card` — Clean end-card signoff.

### Apple Keynote & SaaS Product Launches (`apple-keynote-clean` / `linear-dark`)
- `01-kinetic-hook-mask` — Crisp kinetic opening title.
- `05-type-scale-zoom` — Clean Apple-style scale typography beat.
- `13-cursor-approval-cards`, `14-command-palette-search`, `15-sidebar-view-switch` — Product UI micro-demos.
- `25-loom-pip-dashboard-zoom`, `29-browser-window-tilt-3d`, `30-mobile-frame-showcase` — Screen & device framing.
- `31-organic-spline-chart`, `32-kpi-bento-trio` — Restraint-first metric cards.
- `49-bento-feature-mosaic`, `53-product-launch-outro`, `54-cta-url-endcard` — Feature summary & launch CTA.

### Figma Editorial & Bold Design Stories (`figma-lime` / `electric-lime-dark`)
- `59-figma-color-block-poster` — Signature Figma Editorial oversized poster card.
- `60-figma-pastel-story-sequence` — Multi-block editorial story sequence.
- `55-apsis-streaming-console`, `56-apsis-notched-testimonial`, `57-apsis-stacking-cards` — High-craft dark editorial UI cards.
- `19-six-stage-laser-pipeline`, `20-hub-and-spoke-sync`, `24-multi-agent-parallel` — Technical agent/system architecture diagrams.

---

## 4. Pre-Delivery Visual Review Checklist (Pass vs. Fail)

Run this check on every rendered contact sheet (`inspect_timeline`) or HyperFrames `snapshot` before delivering:

### Pass Criteria
- **Non-Blank Frame `0`:** Background/container or opening anchor element is visible (or visibly entering by `0.10s`) — never a blank solid screen at `t = 0`.
- **Continuous Subtle Motion:** Held reading beats include gentle `sine.inOut` drift (`scale(1 -> 1.03)`) or staggered reveals so nothing stays frozen `> 1.5s`.
- **Legible Typography:** Minimum `24px` body / `56px+` display at 1080p, high contrast against card/stage, and tabular numbers (`.t-num`) on counters.
- **Token Fidelity:** Colors, radii, shadows, and caption variant match the project's `brand/DESIGN.md` (or approved Brand Kit preset).

### Fail Criteria (Must Fix Before Returning)
- Blank first frame (`t = 0`), frozen static holds, or clipped/overlapping text.
- `#60A5FA` blue caption highlights, heavy dark-navy caption boxes, or `Google Sans Flex` / monospace on UI copy.
- Unapproved neon/rainbow gradients or cartoon bounce (`back.out` overshoot `> 1.4`).
