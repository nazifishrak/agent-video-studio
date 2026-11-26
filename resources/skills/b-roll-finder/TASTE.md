# TASTE.md — Creator B-Roll Taste Profile

> Loaded automatically by `SKILL.md` before sourcing B-roll. Customize this file for any repo or channel you copy this skill into.

## Channel Fingerprint
- **Style:** Grounded talking-head + authentic lifestyle/outdoor B-roll + zoomed-in real artifacts (zero hustle-bro hype, zero cheesy corporate stock).
- **Core Pillars:**
  1. `career` — Software engineering leverage, ownership, Slack/1:1 receipts, workplace reality.
  2. `ai` — Antigravity builds, UI demos, spec-first workflows, real before/after comparisons.
  3. `finance` — Rent-to-points math (Chexy/Bilt), credit card strategy, investing systems, real city/travel visuals.
- **Pacing:**
  - **Long-Form (8–15 min):** Deliberate, calm visual shifts every ~15–25s. Beats run **2.5–4.5s**. Avoid frantic sub-second MrBeast cuts.
  - **Short-Form (45–60s):** Tighter shifts every ~4–6s, clean contrast overlays.

## Guardrails (Law)
- **Audio:** ALWAYS SILENT (`-an`). Talking head carries the audio track.
- **Stills Motion:** Subtle sub-pixel zoom-in (`--rate 0.015`) via `broll_cli.py zoom-still` (`--blurfill` for vertical screenshots/tweets). `ffmpeg zoompan` is banned.
- **No Cheesy Stock / AI Video Slop:** Reject glowing blue AI brains, fake handshakes in glass boardrooms, watermarked previews, and stock people pointing at blank whiteboards.
- **Rights First:** Prefer `cleared` sources (Wikimedia Commons, Internet Archive, NASA, Pexels/Pixabay) or creator's own shots for monetized videos. Flag every YouTube/film clip as `UNCLEARED` and cap at **2–5s** silent transformative commentary.
- **No Auto-Picked Memes:** Never silently insert random memes. Propose a beat + tone only if requested.

## Trusted YouTube Channels (Scoped Entity Search)
Use `--channel @handle` when searching YouTube for Entity beats:

### AI & Tech (`ai`)
- `@anthropic-ai` — Official AI research & product demos
- `@OpenAI` — Official product launches & demos
- `@GoogleDeepMind` — Official AI research & visuals
- `@3blue1brown` — Authoritative conceptual math/AI visual references
- `@Fireship` — Crisp developer culture & tooling context
- `@WIRED` — High-craft tech explainers

### Career & Engineering (`career`)
- `@ycombinator` — Founder & engineering career authority
- `@PragmaticEngineer` — Real-world software engineering industry context
- `@LennyPodcast` — Product & tech career discussions

### Finance & Urban Lifestyle (`finance`)
- `@BenFelixCSI` — Evidence-based Canadian/North American investing credibility
- `@ThePlainBagel` — Grounded, anti-hype Canadian finance breakdowns
- `@Vox` — High-craft visual explainer references

## Output Defaults
- **Long-Form:** `1920x1080`, `30fps`, H.264 (`crf 18`), silent (`-an`)
- **Short-Form:** `1080x1920`, `30fps`, H.264 (`crf 18`), silent (`-an`)
- **Source Credit Etiquette:** Note canonical source + platform (e.g., `NASA`, `Wikimedia Commons`, `WIRED / YouTube`) in `BROLL-MANIFEST.md` for attribution.
