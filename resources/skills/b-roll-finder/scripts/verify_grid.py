#!/usr/bin/env python3
"""
verify_grid.py — Extract midpoint frames from every beat in a rendered cutaway video
and tile them into a verification grid PNG so you catch watermarks, burned-in captions,
letterboxing, or split-second slivers before publishing.

Usage:
  python3 verify_grid.py <manifest.json> -o verify_grid.png
"""

import argparse
import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path
from PIL import Image, ImageDraw


def main():
    p = argparse.ArgumentParser()
    p.add_argument("manifest", help="JSON manifest passed to broll_cli.py composite")
    p.add_argument("-o", "--output", default="verify_grid.png")
    p.add_argument("--cols", type=int, default=3)
    args = p.parse_args()

    manifest = json.loads(Path(args.manifest).read_text())
    video = manifest["output"]
    beats = sorted(manifest.get("beats", []), key=lambda b: float(b["start"]))
    if not beats:
        print("No beats in manifest.")
        sys.exit(0)

    tw, th = 480, 270
    cols = args.cols
    rows = math.ceil(len(beats) / cols)

    with tempfile.TemporaryDirectory() as tmpdir:
        tiles = []
        for idx, b in enumerate(beats):
            mid = round((float(b["start"]) + float(b["end"])) / 2.0, 2)
            fp = Path(tmpdir) / f"b_{idx:02d}.jpg"
            subprocess.run([
                "ffmpeg", "-y", "-v", "error",
                "-ss", str(mid), "-i", video,
                "-frames:v", "1",
                "-vf", f"scale={tw}:{th}:force_original_aspect_ratio=decrease,pad={tw}:{th}:(ow-iw)/2:(oh-ih)/2",
                str(fp),
            ], check=True)
            tiles.append((b["label"], mid, Image.open(fp).convert("RGB")))

        grid = Image.new("RGB", (cols * tw, rows * th), (15, 15, 18))
        draw = ImageDraw.Draw(grid)
        for idx, (label, mid, im) in enumerate(tiles):
            r, c = divmod(idx, cols)
            x, y = c * tw, r * th
            grid.paste(im, (x, y))
            draw.rectangle([x + 8, y + 8, x + 170, y + 32], fill=(0, 0, 0))
            draw.text((x + 14, y + 14), f"{label} @ {mid:.2f}s", fill=(255, 255, 255))

        out = Path(args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        grid.save(out)
        print(f"Verification grid ({len(tiles)} beats): {out}")


if __name__ == "__main__":
    main()
