---
name: b-roll-finder
description: Source, inspect, cut, and composite accurate, anti-slop B-roll for talking-head YouTube videos and Shorts using 100% free tools (Wikimedia Commons, Internet Archive, NASA, yt-dlp, optional free Pexels/Pixabay, and ffmpeg). Use when the user asks to find B-roll, source clips for a script/transcript, generate B-roll contact sheets, cut silent full-bleed clips, or splice cutaways over talking-head footage.
---

# B-Roll Finder (Free, Portable, Anti-Slop)

Source accurate, on-brand B-roll for talking-head video (16:9 YouTube & 9:16 Shorts) using **100% free, zero-API-key tooling** — with built-in rights awareness, visual contact sheets, silent full-bleed cutting, sub-pixel Ken Burns stills, and post-render frame verification.

> **Portable Setup (any repo):** Run `bash scripts/setup.sh` (from this skill directory) once to install `ffmpeg`, `yt-dlp`, and `Pillow` (add `--with-whisper` for optional local word-level transcription).

---

## Core Rules (Non-Negotiable)

1. **The user picks final taste-call clips.** Your job is to interpret the script, narrow to accurate candidates, generate a labeled contact sheet PNG, and let the user pick (unless the user explicitly says "auto-pick and cut").
2. **Illustrate the POINT, not the nearest keyword.** Read the full script/transcript first. State the thesis, then write a 1-sentence interpretation per beat (*"what is this line actually about?"*). No B-roll beats wrong B-roll.
3. **Always tag Rights / Monetization Posture.** Every candidate MUST clearly show whether it is:
   - `CLEARED` (Wikimedia CC/PD, Internet Archive PD, NASA PD, Pexels/Pixabay) — safe for monetized YouTube.
   - `UNCLEARED / REFERENCE` (YouTube entity clips, movie scenes) — keep **2–5s**, **strip audio (`-an`)**, transformative commentary only, or swap to a cleared source.
4. **Full-bleed & silent by default.** Every cutaway fills the frame edge-to-edge (`1920x1080` or `1080x1920`, never letterboxed) and strips source audio (`-an`) so the speaker talks cleanly over it.
5. **Never use `ffmpeg zoompan` on stills.** Integer pixel steps stutter. Always use `broll_cli.py zoom-still` (sub-pixel PIL float-box Lanczos).
6. **Land ON or +0.2–0.5s AFTER the spoken keyword — never before.** B-roll appearing before the word reads as an edit mistake.

---

## Step 1: Load Taste Profile & Classify Every Beat

Before running any searches, read [`TASTE.md`](TASTE.md) in this skill directory to load the creator's pacing, guardrails, and trusted channels.

Route every script beat to the right lane:

| Beat Type | Trigger in Script | Best Free Source |
| :--- | :--- | :--- |
| **Own Lifestyle / Screen** | Personal story, code demo, Antigravity UI, spreadsheet math | Creator's own screen recording or Sunday Outdoor B-Roll Bank (flag as `SHOOT / LOCAL` — never replace with cheesy stock) |
| **Receipts** | Specific claim, headline, tweet, pricing page, Slack template | Clean screenshot + `broll_cli.py zoom-still --blurfill` |
| **Entity / Product / Person** | Named company, tool, keynote, public figure | Channel-scoped `youtube` search (`--channel @handle`) or official demo |
| **Evocative / Archival / City** | City street, retro computing, office, space, abstract mood | `cleared` (`wikimedia`, `archive`, `nasa`, plus `pexels`/`pixabay` if free env keys are set) |
| **Film / Movie Reference** | Specific cinematic scene by visual mood | Recommend [Flim.ai](https://flim.ai/) or [Frame Set](https://frameset.app/search) to identify the exact scene -> pull & cut 2–4s silent clip via `youtube` (`UNCLEARED`) |

---

## Step 2: Run the Free B-Roll CLI (`scripts/broll_cli.py`)

All commands live in `scripts/broll_cli.py` relative to this skill folder.

### 1. Search Free Sources (Metadata First, Zero Download Cost)
```bash
# Monetization-safe cleared sources (Wikimedia + Internet Archive + NASA + Pexels/Pixabay if keys set)
python3 scripts/broll_cli.py search "city street sunset" --source cleared --limit 4

# Search all free sources including YouTube
python3 scripts/broll_cli.py search "software developer typing" --source all-free --limit 3

# Channel-scoped YouTube search (preferred over open YouTube search for Entity beats)
python3 scripts/broll_cli.py search "AI agents" --source youtube --channel @anthropic-ai --limit 4

# Specific archive or Wikimedia search
python3 scripts/broll_cli.py search "vintage computer office" --source archive --limit 5
python3 scripts/broll_cli.py search "quebec street" --source wikimedia --limit 5
```

### 2. Download Chosen Candidate
```bash
python3 scripts/broll_cli.py download "<URL>" -o assets/raw/clip01.mp4
```

### 3. Generate a Timestamped Contact Sheet (Inspect Before Cutting)
```bash
python3 scripts/broll_cli.py contact-sheet assets/raw/clip01.mp4 -o assets/sheets/clip01_sheet.png --frames 9 --cols 3
```
Inspect the generated PNG (or show it to the user) to pick the cleanest start timestamp — reject frames with watermarks, burned-in captions, or lower-thirds.

### 4. Cut Full-Bleed Silent Clip (16:9 YouTube or 9:16 Short)
```bash
# 16:9 YouTube Long-Form (1920x1080, 30fps, silent)
python3 scripts/broll_cli.py cut assets/raw/clip01.mp4 -o assets/cuts/b01.mp4 --start 12.5 --duration 3.5 --aspect 16:9

# 9:16 YouTube Short / Reel (1080x1920, 30fps, silent)
python3 scripts/broll_cli.py cut assets/raw/clip01.mp4 -o assets/cuts/b01_short.mp4 --start 12.5 --duration 3.0 --aspect 9:16
```

### 5. Animate Receipts / Screenshots Smoothly (Sub-Pixel Ken Burns)
```bash
python3 scripts/broll_cli.py zoom-still assets/receipts/slack_msg.png -o assets/cuts/b02_receipt.mp4 --duration 3.5 --blurfill --aspect 16:9
```

### 6. Composite Cutaways Over Talking-Head Video (Optional)
Create a JSON manifest (`broll_manifest.json`) mapping each beat window (`start`, `end`, `source`, `kind`, `src_in`) — preserving original talking-head audio untouched:
```bash
python3 scripts/broll_cli.py composite broll_manifest.json
python3 scripts/verify_grid.py broll_manifest.json -o assets/verify_grid.png
```

---

## Step 3: Mandatory Self-Verification (Before Delivering)

Before handing clips or a composited edit to the user, inspect the contact sheet / `verify_grid.png` and **AUTO-REJECT** any beat containing:
1. Burned-in subtitles or captions from the source video
2. Watermarks or stock preview logos
3. Lower-third name tags identifying unrelated strangers
4. Letterboxing (black bars) or blurry upscaled low-res footage (<720p)
5. Split-second face slivers (<1s) between adjacent cutaways (extend the first cutaway to meet the second instead)

Keep a `BROLL-MANIFEST.md` alongside the project listing each beat's timestamp, chosen source URL, and rights/attribution note so nothing is lost across revisions.

For detailed source comparisons, free API key upgrades (Pexels/Pixabay), and film-reference workflows, see [`references/free-sources-guide.md`](references/free-sources-guide.md).
