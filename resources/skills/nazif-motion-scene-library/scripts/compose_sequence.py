#!/usr/bin/env python3
"""
Composite rendered motion plates over an A-cut talking-head video (or concatenate standalone plates).
Example manifest.json:
{
  "acut": "footage/acut.mp4",
  "output": "out/final_video.mp4",
  "plates": [
    {"file": "out/01-hook.mp4", "start": 0.0, "end": 4.5, "pip": false},
    {"file": "out/25-loom-pip.mp4", "start": 6.0, "end": 11.5, "pip": true, "pip_size": 260}
  ]
}
"""
import json
import subprocess
import sys
from pathlib import Path

def compose(manifest_path: Path):
    cfg = json.loads(manifest_path.read_text(encoding="utf-8"))
    acut = cfg.get("acut")
    plates = cfg.get("plates", [])
    out = cfg["output"]
    Path(out).parent.mkdir(parents=True, exist_ok=True)

    if not acut:
        # Pure faceless concatenation of rendered plates
        list_file = Path(out).with_suffix(".concat.txt")
        list_file.write_text("\n".join(f"file '{Path(p['file']).resolve()}'" for p in plates) + "\n", encoding="utf-8")
        subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(list_file), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", out], check=True)
        print(f"Concatenated {len(plates)} plates -> {out}")
        return

    cmd = ["ffmpeg", "-y", "-i", acut]
    for p in plates:
        cmd += ["-i", p["file"]]

    filters = []
    prev = "[0:v]"
    for idx, p in enumerate(plates, start=1):
        start, end = p["start"], p["end"]
        lbl = f"[v{idx}]"
        filters.append(f"[{idx}:v]setpts=PTS-STARTPTS+{start}/TB[p{idx}]")
        filters.append(f"{prev}[p{idx}]overlay=0:0:enable='between(t,{start},{end})'{lbl}")
        prev = lbl

    cmd += ["-filter_complex", ";".join(filters), "-map", prev, "-map", "0:a?", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", "-c:a", "aac", out]
    subprocess.run(cmd, check=True)
    print(f"Composited A-cut + {len(plates)} motion plates -> {out}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("Usage: python3 scripts/compose_sequence.py manifest.json")
    compose(Path(sys.argv[1]))
