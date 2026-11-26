#!/usr/bin/env bash
# Portable setup for nazif-motion-scene-library (60 decoupled HTML/CSS/JS motion scenes).
# Usage: bash skills/nazif-motion-scene-library/scripts/setup.sh

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Checking ffmpeg..."
if ! command -v ffmpeg >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    brew install ffmpeg
  elif command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg
  else
    echo "Please install ffmpeg manually."
    exit 1
  fi
fi

echo "==> Installing Playwright inside $SKILL_DIR..."
if command -v google-chrome >/dev/null 2>&1 || command -v chromium >/dev/null 2>&1 || [[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]]; then
  echo "    System Chrome detected — skipping 300MB bundled browser download."
  (cd "$SKILL_DIR" && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --no-audit --no-fund)
else
  (cd "$SKILL_DIR" && npm install --no-audit --no-fund && npx playwright install chromium)
fi

echo ""
echo "Setup complete! Example render:"
echo "  node \"$SKILL_DIR/scripts/render_scene.mjs\" --scene \"$SKILL_DIR/scenes/35-roi-savings-ticker.html\" --design \"$SKILL_DIR/themes/linear-dark.design.md\" --mode dark --out out/roi.mp4"
