# EDIT_STYLE.md — Default Editorial Taste Profile

> Loaded by `SKILL.md` so every automated edit feels calm, cinematic, and human — never like noisy template slop.

## Camera Motion Defaults
- **Soft Push-In (Standard):** `1.00 -> 1.09` over `4.5–5.5s` with `easeInOutCubic`, centered on `faceAnchor`, returning gently over `1.4s` (`holdAfter: false`).
- **Subtle Punch-In (Pattern Reset):** `1.08` immediate hold (`start` to `start + 0.08s`, `holdAfter: true`) only at clean sentence boundaries.
- **Pan Restraint:** Keep `toPanX` within `-1.2` to `+1.2%` so motion feels like a real motorized slider, never dizzying.
- **Cadence:** Max 1 soft camera move every ~15–20s in Long-Form; max 1 every ~6–8s in Shorts.

## B-Roll & Montage Camera Discipline
- **No Fake Zoom on Moving Footage:** Never apply synthetic zoom/pan (and never use `ffmpeg zoompan`) on moving handheld, gimbal, or drone clips — let the real camera motion breathe.
- **Single-Pass Lanczos Framing:** Scale once (`force_original_aspect_ratio=increase:flags=lanczos,crop=W:H,setsar=1`) with zero upscaling-then-downscaling passes.
- **Native Timeline FPS & Safe Trims:** Match timeline FPS to `probe_clips.py` `recommended_fps` and trim `>= 0.4s` off clip heads/tails (`safe_in`/`safe_out`) to avoid record-button shake.

## Pacing, Cuts & J/L-Cuts
- **Silence Removal:** Cut dead air `>= 0.75s` below `-32 dB`, always keeping `0.20s` breath padding around speech.
- **Auto Retake Cleanup:** Run `analyze_footage.py --transcribe` (or `--words-json`) to automatically detect restarted sentences and move Take 1 to `droppedRetakes` while keeping the clean Take 2.
- **J-Cuts & L-Cuts:** Use `"jCut": 0.35–0.55` on scene shifts so the next thought's voice/ambience leads slightly before the video cut, and `"lCut": 0.35` so audio trails naturally across cutaways.
- **Keep Intentional Beats:** Never shave pauses `< 0.45s` right before a key reveal or laugh.

## Color & Film Texture
- **Built-in `.cube` LUTs:** `"lut": "sarah_warm_film"` (warm daylight matte for outdoor/lifestyle vlogs) or `"lut": "mkbhd_matte_clean"` (crisp studio contrast for tech/AI desk builds) blended at `"lutIntensity": 0.60–0.70` so skin tones stay natural.
- **Subtle Film Grain:** Optional `"filmGrain": 0.03–0.05` for organic vlog warmth.

## Motion Graphics & Callouts
- **Aesthetic:** Minimal dark frosted glass (`rgba(11, 15, 25, 0.84)`), clean `system-ui` typography, subtle accent stripe (`#38bdf8` cyan or `#22c55e` green).
- **Zero Spam Captions:** Do NOT plaster flashing rainbow word-by-word captions on Long-Form YouTube. Use crisp `stat-card`, `counter`, `spotlight`, `chapter-tracker`, `editorial-title`, and `comparison` overlays only where they clarify math, code, or exact phrasing.

## Audio Mastering & Sound Design
- **Voice Loudness:** `-14 LUFS` (YouTube standard) with gentle 75Hz highpass + subtle 3.2kHz presence clarity.
- **Sidechain Music Bed:** `"sidechainDuck": true` with `"musicDb": -18` — swells gently during B-roll/breathers and ducks ~10–12 dB smoothly whenever you speak.
- **Smooth Silence Drops:** Schedule 1–2 deliberate `2.0–3.0s` total music silence drops (`"fade": 0.35`) on the video's biggest truth or warning.
- **Tactile Micro-SFX:** `"autoSfx": true` automatically layers subtle `-16 to -20 dB` `soft_pop`, `ui_tick`, and `subtle_whoosh` on callouts & transitions (drop custom real foley `.wav`s into `assets/sfx/` anytime).
