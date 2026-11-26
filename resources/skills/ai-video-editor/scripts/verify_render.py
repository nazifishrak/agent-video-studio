#!/usr/bin/env python3
"""
verify_render.py — Extract key inspection frames (camera move starts/peaks, callouts, B-roll midpoints)
into a labeled contact sheet PNG so the agent can visually review its own edit before delivery.

Usage:
  python3 scripts/verify_render.py <rendered.mp4> <edit-plan.json> -o verify_edit.png
"""

import argparse
import json
import math
import subprocess
import tempfile
from pathlib import Path
from PIL import Image, ImageDraw


def main():
    p = argparse.ArgumentParser()
    p.add_argument("video", help="Rendered MP4 file")
    p.add_argument("plan", help="edit-plan.json")
    p.add_argument("-o", "--output", default="verify_edit.png")
    p.add_argument("--cols", type=int, default=3)
    args = p.parse_args()

    plan = json.loads(Path(args.plan).read_text())
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", args.video],
        capture_output=True, text=True, check=True,
    )
    dur = float(probe.stdout.strip() or 1.0)

    # Collect smart inspection timestamps: start + zoom start/peak + callout midpoints + broll midpoints
    points = [("Start", min(0.3, dur * 0.1))]
    for idx, m in enumerate(plan.get("cameraMoves") or [], 1):
        points.append((f"Zoom{idx} Start", float(m["start"])))
        points.append((f"Zoom{idx} Peak", float(m["end"])))
    for idx, c in enumerate(plan.get("callouts") or [], 1):
        mid = (float(c["start"]) + float(c["end"])) / 2.0
        points.append((f"Callout{idx}", mid))
    for idx, b in enumerate(plan.get("broll") or [], 1):
        mid = (float(b["start"]) + float(b["end"])) / 2.0
        points.append((f"BRoll{idx}", mid))
    points.append(("End", max(0.0, dur - 0.3)))

    # Clamp & cap at 12 clean inspection frames
    clean = []
    for label, t in points:
        t_c = round(max(0.0, min(dur - 0.05, t)), 2)
        clean.append((label, t_c))
    clean = clean[:12]

    tw, th = 480, 270
    cols = args.cols
    rows = math.ceil(len(clean) / cols)

    with tempfile.TemporaryDirectory() as tmpdir:
        tiles = []
        for idx, (label, ts) in enumerate(clean):
            fp = Path(tmpdir) / f"f_{idx:02d}.jpg"
            subprocess.run([
                "ffmpeg", "-y", "-v", "error",
                "-ss", str(ts), "-i", args.video,
                "-frames:v", "1",
                "-vf", f"scale={tw}:{th}:force_original_aspect_ratio=decrease,pad={tw}:{th}:(ow-iw)/2:(oh-ih)/2",
                str(fp),
            ], check=True)
            tiles.append((label, ts, Image.open(fp).convert("RGB")))

        grid = Image.new("RGB", (cols * tw, rows * th), (12, 14, 18))
        draw = ImageDraw.Draw(grid)
        for idx, (label, ts, im) in enumerate(tiles):
            r, c = divmod(idx, cols)
            x, y = c * tw, r * th
            grid.paste(im, (x, y))
            draw.rectangle([x + 8, y + 8, x + 225, y + 32], fill=(0, 0, 0))
            draw.text((x + 14, y + 14), f"{label} @ {ts:.2f}s", fill=(255, 255, 255))

        out = Path(args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        grid.save(out)
        print(f"Edit verification grid ({len(tiles)} frames): {out}")


if __name__ == "__main__":
    main()
