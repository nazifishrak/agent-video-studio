# NazifAnimationArtifacts

A decoupled **54-scene motion plate library** built for AI video agents (Claude Code, Hyperframes, Remotion, or headless Chromium + FFmpeg).

## Quick Start on Your Laptop

1. Unzip `NazifAnimationArtifacts.zip` into your video-agent workspace.
2. Open `preview-gallery.html` directly in Chrome/Safari to browse, filter, scrub, and live-theme all 54 scenes.
3. Point your video agent to `SKILL.md` and `catalog/scenes.json`.
4. To swap aesthetics for any brand, edit `DESIGN.md` (or pass any custom `DESIGN.md`) and run:
   ```bash
   python3 scripts/parse_design_md.py DESIGN.md
   ```
5. To render MP4 or transparent ProRes 4444 motion plates locally:
   ```bash
   npm install && npx playwright install chromium
   node scripts/render_scene.mjs --scene scenes/01-kinetic-hook-mask.html --out out/01-hook.mp4
   ```
