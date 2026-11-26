---
name: ai-video-editor
description: Agentic, edit-as-code video editor powered by Remotion (React) + Python/FFmpeg/OpenCV. Automatically trims silence while preserving natural breaths, detects face/eye-line anchors, applies buttery sub-pixel soft pan & zoom with cubic-bezier easing, overlays full-bleed B-roll and clean React motion graphics, masters voice to -14 LUFS with dynamic music ducking and scripted silence drops, and visually self-verifies the render. Use when the user asks to edit raw footage, add soft pan/zoom, remove dead air, add callouts/lower-thirds, duck background music, or iterate on a video timeline.
---

# AI Video Editor (Edit-as-Code with Remotion + Python)

Replace traditional timeline editing with a declarative, 100% tweakable **`edit-plan.json`** workflow that renders cinema-smooth **sub-pixel pan/zoom**, clean React motion graphics, full-bleed B-roll, and broadcast-mastered audio.

> **Portable Setup (any repo):** Run `bash scripts/setup.sh` from this skill directory once (add `--with-whisper` for optional local word-level transcription).

---

## Core Editing Philosophy (Anti-Slop)

Load [`EDIT_STYLE.md`](EDIT_STYLE.md) before editing any footage.

1. **Plan First, Render Fast Draft, Then Master.** Always generate/update `edit-plan.json` and summarize the exact cuts, camera moves, callouts, and silence drops before running a full-res master render. Use `--preview` (50% scale) for rapid iteration.
2. **Never Use `ffmpeg zoompan`.** Integer pixel stepping stutters. All camera push-ins, soft pans, and pull-backs run through the Remotion React engine (`engine/render.mjs`) using GPU sub-pixel transforms clamped so black borders can never appear.
3. **Preserve Natural Breaths.** Silence cutting pads kept speech (`--pad 0.20`) and merges gaps `< 0.35s` so the speaker sounds human, not like a frantic jump-cut robot.
4. **Face-Centered Motion.** `analyze_footage.py` detects the speaker's eye-line `(faceAnchor.x, faceAnchor.y)` via OpenCV so every soft zoom pushes naturally toward the speaker's eyes.
5. **Visual Self-Verification Is Mandatory.** Run `verify_render.py` after every render and visually inspect the generated contact grid PNG before delivering the MP4.

---

## End-to-End Agent Workflow

### Step 1: Analyze Raw Footage -> Generate Starter `edit-plan.json`
```bash
# 16:9 YouTube Long-Form (auto silence cuts + face eye-line detection + starter soft zooms)
python3 scripts/analyze_footage.py raw_talking_head.mp4 -o edit-plan.json --aspect 16:9

# 9:16 Vertical Short / Reel + optional local word-level timestamps
python3 scripts/analyze_footage.py raw_talking_head.mp4 -o edit-plan.json --aspect 9:16 --transcribe
```

### Step 2: Refine `edit-plan.json` Surgically
Edit `edit-plan.json` directly to control every visual and audio beat:
- **`cuts`**: `{ "in": 2.4, "out": 14.8, "jCut": 0.45, "lCut": 0.35, "transition": "cut", "note": "Intro hook" }`
  - **`jCut`** leads the next segment's audio smoothly *before* the visual cut; **`lCut`** lets audio trail *after* the cut — keeping 100% locked lip-sync.
  - Passing `--transcribe` or `--words-json` to `analyze_footage.py` automatically detects stumbled/repeated takes and moves Take 1 into `droppedRetakes` (recoverable audit log) while keeping the clean Take 2.
- **`cameraMoves`**: Smooth sub-pixel pan & zoom on the *edited* timeline:
  ```json
  {
    "start": 6.0,
    "end": 11.0,
    "fromScale": 1.0,
    "toScale": 1.09,
    "fromPanX": 0.0,
    "toPanX": 0.8,
    "holdAfter": false,
    "returnDuration": 1.4,
    "easing": "easeInOutCubic",
    "reason": "Soft push-in on key insight"
  }
  ```
  - Supported easings: `easeInOutCubic` (default cinema push), `easeOutCubic`, `easeInOutSine`, `spring`, `linear`.
  - Set `"holdAfter": true` to hold the zoomed framing until the next cut/move; set `false` + `returnDuration` to glide gently back to `1.0x`.
- **`broll`**: Pair with the `b-roll-finder` skill to drop full-bleed cutaways (`{ "label": "b01", "start": 12.2, "end": 15.8, "source": "assets/cuts/b01.mp4", "ambientVolume": 0.18, "playbackRate": 1.0, "credit": "Wikimedia Commons" }`). Set `ambientVolume` (`0.12–0.22`) for Sarah Li / MKBHD natural café/street ambience L-cuts, or `0` for silent.
- **`callouts`**: Pro human-editor React motion graphics (for quick inline overlays):
  - `"type": "lower-third"` / `"stat-card"` / `"counter"` / `"spotlight"` / `"chapter-tracker"` / `"editorial-title"` / `"comparison"`.
  - **Strict Typography Rules (from `nazif-motion-scene-library`):** Zero monospace on UI labels/cards, zero `•` middot separators (use clean whitespace or hairline `/`), zero glowing pulsing status dots, always `tabular-nums` on animated counters.
- **60-Scene Motion Plate Arsenal (`nazif-motion-scene-library`):** Whenever a beat calls for rich motion graphics (kinetic hooks, problem/comparison wipes, product UI micro-demos, AI agent/workflow pipelines, 3D browser tilt, ROI tickers, bento grids, or transparent ProRes 4444 alpha overlays), **check `../nazif-motion-scene-library/catalog/scenes.json` FIRST** instead of hand-coding from scratch:
  ```bash
  node ../nazif-motion-scene-library/scripts/render_scene.mjs \
    --scene ../nazif-motion-scene-library/scenes/35-roi-savings-ticker.html \
    --design ../nazif-motion-scene-library/themes/linear-dark.design.md --mode dark \
    --props '{"title":"Rent-to-Points Net Return"}' \
    --fps 30 --out assets/plates/roi.mp4
  ```
  Then drop `assets/plates/roi.mp4` directly into `broll[]` inside `edit-plan.json`!
- **`colorGrade`**: Subtle filmic polish (`contrast`, `saturate`, `vignette`, `filmGrain: 0.04`), PLUS real **3D `.cube` Film LUTs** applied in mastering:
  - Built-in LUTs: `"lut": "sarah_warm_film"` (warm daylight matte) or `"lut": "mkbhd_matte_clean"` (crisp studio contrast), or any custom `.cube` path, blended cleanly via `"lutIntensity": 0.65`.
- **`audio`**:
  - `"sidechainDuck": true` + `"musicDb": -18` — real `ffmpeg sidechaincompress` so music **swells naturally** on B-roll/pauses and **ducks smoothly** (~10–12 dB) under your voice.
  - `"silenceDrops": [{ "start": 18.0, "end": 20.5, "fade": 0.35 }]` — smooth fade-out → 0% silence → gentle fade back up.
  - `"autoSfx": true` + optional custom `"sfx": [{ "at": 4.2, "sound": "riser_swell", "db": -18 }]` (or drop real `.wav`/`.mp3` foley into `assets/sfx/`).

### Optional: Pairing With HyperFrames
This skill uses **Remotion** + **`nazif-motion-scene-library`** (60 decoupled HTML/CSS/JS scenes) so you get both fast reusable talking-head timelines AND rich HTML/CSS motion plates offline. If you also want HyperFrames' `/reverse-any-video` workflow, install `npx skills add heygen-com/hyperframes` and drop rendered MP4s into `broll[]`.

### Step 3: Render Video (Preview or Master)
```bash
# Fast 50% preview for quick review
node engine/render.mjs edit-plan.json out/preview.mp4 --preview

# Full-resolution H.264 master
node engine/render.mjs edit-plan.json out/rendered.mp4
```
*(To inspect interactively frame-by-frame in a local browser: `cd engine && npm run studio`.)*

### Step 4: Master Audio, Tactile SFX, Music Ducking & Silence Drops
```bash
python3 scripts/master_audio.py out/rendered.mp4 edit-plan.json -o out/final_master.mp4 --music assets/music/lofi_bed.mp3
```

### Step 5: Visually Verify Before Delivering
```bash
python3 scripts/verify_render.py out/final_master.mp4 edit-plan.json -o out/verify_edit.png
```
Inspect `out/verify_edit.png` and verify:
- Speaker's eyes stay cleanly framed during zoom peaks (no clipped forehead/chin).
- Callouts & spotlight boxes don't cover the speaker's mouth/eyes.
- Zero black borders, letterboxing, or broken B-roll frames.

---

## Multi-Clip B-Roll Montage Workflow (Zero-Shake FFmpeg Standard)

When assembling a B-roll montage, day-in-the-life film, or multi-clip edit directly with FFmpeg (outside Remotion), follow these strict rules to prevent wobble, micro-stutter, and softness:

1. **Always Probe Clips & FFmpeg Capabilities First:**
   ```bash
   python3 scripts/probe_clips.py <footage_dir>
   ```
   Inspect `ffmpeg_capabilities` (`has_vidstab`, `has_deshake`, `has_videotoolbox`), `recommended_fps`, and each clip's `safe_in` / `safe_out` / `slowmo_hint`.
2. **Hard Ban on `ffmpeg zoompan` for Video Clips:**
   - `zoompan` steps in whole integer pixels, turning slow 4–8% zooms into visible 1px shake/wobble.
   - **Never add synthetic zoom/pan to moving, handheld, gimbal, or drone footage (DJI/Sony/iPhone).** Use clean single-pass Lanczos framing (`scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,setsar=1`) with zero double-scaling.
3. **Framerate Discipline:**
   - Match the timeline to `recommended_fps` from `probe_clips.py` (never blindly force `-r 30` onto 24fps or 25fps clips).
   - For `50/60fps` clips (`slowmo_hint: true`) on a `24/30fps` timeline, prefer smooth `setpts=2*PTS` (50% slow motion) or clean integer decimation rather than irregular frame dropping.
4. **Shake-Free Cuts & Conditional Stabilization:**
   - Start/end cuts inside `safe_in`..`safe_out` (trimming `>= 0.4s` off clip heads/tails to remove record-button tap and whip-end motion).
   - Only use `vidstabdetect` / `vidstabtransform` if `has_vidstab: true`; otherwise apply `deshake` selectively to genuinely shaky handheld shots (never globally).
5. **Mandatory Contact-Sheet Verification & Studio Registration:**
   - Render a 12–16 frame contact sheet spanning start, middle, and end of the rendered MP4 and visually inspect it before finishing.
   - Register `project.json` + `edit-plan.json` (with `sourceVideo` set to the final `.mp4` relative path) in `./vault/projects/<slug>/` so the Studio Editor opens it immediately.
