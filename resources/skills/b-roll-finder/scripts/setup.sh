#!/usr/bin/env bash
# Portable setup script for the b-roll-finder skill.
# Works on macOS (Homebrew) and Ubuntu/Debian Linux (apt).
# Usage: bash skills/b-roll-finder/scripts/setup.sh [--with-whisper]

set -euo pipefail

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
    echo "Please install ffmpeg manually: https://ffmpeg.org/download.html"
    exit 1
  fi
else
  echo "    ffmpeg found: $(ffmpeg -version | head -n 1)"
fi

echo "==> Installing Python dependencies (yt-dlp, Pillow)..."
python3 -m pip install -q --upgrade yt-dlp pillow

if [[ "$WITH_WHISPER" == "true" ]]; then
  echo "==> Installing faster-whisper (optional word-level transcript timing)..."
  python3 -m pip install -q --upgrade faster-whisper
fi

echo "==> Verifying toolchain..."
ffmpeg -version | head -n 1
yt-dlp --version
python3 -c "import PIL; print('Pillow', PIL.__version__)"

echo ""
echo "Setup complete! Quick test:"
echo "  python3 \"$(dirname "$0")/broll_cli.py\" search \"city street\" --source cleared --limit 2"
