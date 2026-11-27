# Motion Language Reference — Nazif Motion Scene Library

> Concrete timing, easing, stagger, and staging grammar extracted from `engine/motion-engine.js` and the 60 bundled scenes.

---

## 1. Look vs. Moves Contract

- **User's `brand/DESIGN.md` owns the LOOK:** colors, background (`--stage-bg`), card surfaces (`--surface-card`), borders, radii, shadows, typography (`--font-display`, `--font-body`), and caption variant.
  - If the project has no `brand/DESIGN.md`, fall back to an approved Brand Kit preset (`cinema-daily-vlog`, `apple-keynote-clean`, `figma-lime`, `editorial-warm`, `linear-dark`) or ask the user.
- **This library owns the MOVES:** easing curves, durations, staggers, entrance/exit geometry, and layout patterns. Always adapt moves to the user's `DESIGN.md` CSS variables — **never** overwrite the user's brand with a scene's sample theme colors.

---

## 2. Approved Easing Curves & Durations

| Element Role | Curve | Duration | Motion Pattern |
| --- | --- | --- | --- |
| **Hero Masks & Containers** | `expo.out` | `0.65–0.75s` | Masked `translateY(115% -> 0%)` or container `scale(0.95 -> 1.0)` + opacity |
| **Body Copy, Labels & Cards** | `power3.out` | `0.45–0.65s` | `translateY(24px -> 0px)` + opacity `0 -> 1` |
| **Highlight Wipes & Bars** | `power2.out` | `0.42–0.50s` | `scaleX(0 -> 1)` from `transform-origin: left center` |
| **Tactile Badges & CTAs** | `back.out(1.3)` | `0.50–0.60s` | `translateY(20px -> 0)` or `scale(0.92 -> 1.0)` with gentle overshoot (`1.3`, never cartoon-bouncy) |
| **Ambient Hold Drift** | `sine.inOut` | `1.5–4.8s` | Subtle `scale(1.0 -> 1.03)` or micro-parallax drift during holds so no frame looks frozen |

---

## 3. Stagger & Pacing Rules

- **Line-to-Line Stagger:** `0.15–0.18s` between consecutive headline lines (e.g., `line1` at `0.25s`, `line2` at `0.42s`).
- **Section-to-Section Stagger:** `0.25–0.35s` between kicker (`0.12s`) → hero (`0.25s`) → highlight wipe (`0.98s`) → supporting body (`1.28s`).
- **Continuous Motion:** Never leave `> 1.5s` with zero visual change. Pair every reading hold with subtle `sine.inOut` drift (`scale(1.0 -> 1.03)`), progress bar sweep, or sequential card/bullet reveal.

---

## 4. Frame-0 Non-Blank Rule

- Frame `0.0s` (`t = 0`) must **never** render as an empty solid-color screen.
- The backdrop/aurora, primary card frame, or initial anchor element must already be visible (or visibly entering by `0.10s`) so thumbnails and HyperFrames `snapshot` checks at `t = 0` immediately read with intent.

---

## 5. Anti-Patterns (Never Do)

- **NO cartoon bounce:** Keep `back.out` overshoot ≤ `1.4` (never `back.out(3)`).
- **NO frozen holds:** Never animate in over `0.8s` and then freeze dead for `3+` seconds.
- **NO `ffmpeg zoompan`:** Use CSS transforms / GSAP / single-pass Lanczos `scale+crop`.
- **NO monospace UI text:** Use `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", sans-serif` (or `DESIGN.md` font tokens) and `.t-num` (`tabular-nums`) for numbers.
