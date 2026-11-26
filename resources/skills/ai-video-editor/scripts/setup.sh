#!/usr/bin/env bash
# Portable setup script for the ai-video-editor skill (Remotion + Python).
# Works on macOS (Homebrew) and Ubuntu/Debian Linux (apt).
# Usage: bash skills/ai-video-editor/scripts/setup.sh [--with-whisper]

set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WITH_WHISPER=false
for arg in "$@"; do
  if [[ "$arg" == "--with-whisper" ]]; then
    WITH_WHISPER=true
  fi
done

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

echo "==> Installing Python packages (opencv-python-headless, pillow)..."
python3 -m pip install -q --upgrade opencv-python-headless pillow

if [[ "$WITH_WHISPER" == "true" ]]; then
  echo "==> Installing faster-whisper..."
  python3 -m pip install -q --upgrade faster-whisper
fi

echo "==> Installing Remotion rendering engine (Node.js)..."
(cd "$SKILL_DIR/engine" && npm install --no-audit --no-fund)

echo ""
echo "Setup complete! Workflow:"
echo "  1. python3 \"$SKILL_DIR/scripts/analyze_footage.py\" raw.mp4 -o edit-plan.json"
echo "  2. Edit edit-plan.json (or ask your AI agent to tweak zooms/callouts/cuts)"
echo "  3. node \"$SKILL_DIR/engine/render.mjs\" edit-plan.json output.mp4"
echo "  4. python3 \"$SKILL_DIR/scripts/master_audio.py\" output.mp4 edit-plan.json -o final_master.mp4"
