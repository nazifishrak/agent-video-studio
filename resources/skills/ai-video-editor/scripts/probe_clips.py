#!/usr/bin/env python3
"""
Probe video clips and local FFmpeg capabilities for zero-shake montage assembly.

Usage:
  python3 probe_clips.py --check-env
  python3 probe_clips.py <file_or_dir> [<file_or_dir> ...]
"""

import argparse
import json
import os
import subprocess
import sys
from collections import Counter
from pathlib import Path

VIDEO_EXTS = {".mp4", ".mov", ".mkv", ".webm", ".m4v"}


def check_ffmpeg_capabilities() -> dict:
    filters_out = ""
    encoders_out = ""
    try:
        filters_out = subprocess.check_output(
            ["ffmpeg", "-hide_banner", "-filters"],
            stderr=subprocess.DEVNULL,
            text=True,
        )
    except Exception:
        pass
    try:
        encoders_out = subprocess.check_output(
            ["ffmpeg", "-hide_banner", "-encoders"],
            stderr=subprocess.DEVNULL,
            text=True,
        )
    except Exception:
        pass

    return {
        "has_vidstab": ("vidstabdetect" in filters_out and "vidstabtransform" in filters_out),
        "has_deshake": ("deshake" in filters_out),
        "has_videotoolbox": ("h264_videotoolbox" in encoders_out),
    }


def parse_fps(rate_str: str) -> float:
    if not rate_str or rate_str == "0/0":
        return 0.0
    if "/" in rate_str:
        num, den = rate_str.split("/", 1)
        try:
            d = float(den)
            return round(float(num) / d, 3) if d > 0 else 0.0
        except ValueError:
            return 0.0
    try:
        return round(float(rate_str), 3)
    except ValueError:
        return 0.0


def probe_video_file(file_path: Path) -> dict | None:
    try:
        raw = subprocess.check_output(
            [
                "ffprobe",
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_streams",
                "-show_format",
                str(file_path),
            ],
            stderr=subprocess.DEVNULL,
            text=True,
        )
        data = json.loads(raw)
    except Exception:
        return None

    video_stream = next(
        (s for s in data.get("streams", []) if s.get("codec_type") == "video"),
        None,
    )
    if not video_stream:
        return None

    width = int(video_stream.get("width") or 0)
    height = int(video_stream.get("height") or 0)
    if width <= 0 or height <= 0:
        return None

    # Account for rotation tags (90 / 270)
    rotation = 0
    for sd in video_stream.get("side_data_list", []):
        if "rotation" in sd:
            try:
                rotation = abs(int(sd["rotation"]))
            except (TypeError, ValueError):
                pass
    tags_rot = video_stream.get("tags", {}).get("rotate")
    if tags_rot:
        try:
            rotation = abs(int(tags_rot))
        except ValueError:
            pass
    if rotation in (90, 270):
        width, height = height, width

    fps = parse_fps(video_stream.get("r_frame_rate") or video_stream.get("avg_frame_rate") or "")
    duration_raw = video_stream.get("duration") or data.get("format", {}).get("duration") or 0
    try:
        duration = round(float(duration_raw), 3)
    except (TypeError, ValueError):
        duration = 0.0

    # Trim 0.4s head/tail camera record-button shake when clip is long enough
    if duration >= 1.5:
        safe_in = 0.4
        safe_out = round(duration - 0.4, 3)
    elif duration >= 0.6:
        safe_in = 0.15
        safe_out = round(duration - 0.15, 3)
    else:
        safe_in = 0.0
        safe_out = duration

    aspect = "16:9" if width >= height else "9:16"
    slowmo_hint = fps >= 48.0

    return {
        "path": str(file_path),
        "filename": file_path.name,
        "width": width,
        "height": height,
        "aspect": aspect,
        "fps": fps,
        "duration": duration,
        "safe_in": safe_in,
        "safe_out": safe_out,
        "slowmo_hint": slowmo_hint,
    }


def collect_videos(targets: list[str]) -> list[Path]:
    found: list[Path] = []
    seen: set[Path] = set()
    for target in targets:
        p = Path(target).expanduser().resolve()
        if p.is_file() and p.suffix.lower() in VIDEO_EXTS:
            if p not in seen:
                seen.add(p)
                found.append(p)
        elif p.is_dir():
            for root, dirs, files in os.walk(p):
                dirs[:] = sorted(d for d in dirs if not d.startswith("."))
                for name in sorted(files):
                    if name.startswith("."):
                        continue
                    fp = Path(root) / name
                    if fp.suffix.lower() in VIDEO_EXTS and fp not in seen:
                        seen.add(fp)
                        found.append(fp)
    return found


def choose_recommended_fps(clips: list[dict]) -> float:
    if not clips:
        return 30.0
    # Bucket near-standard rates cleanly (23.976/24, 25, 29.97/30, 50, 59.94/60)
    buckets: Counter[float] = Counter()
    for c in clips:
        fps = c["fps"]
        if fps <= 0:
            continue
        # Prefer base timeline rates (24/25/30) over 60fps slow-mo sources if mixed
        if 23.5 <= fps <= 24.5:
            buckets[24.0 if abs(fps - 24.0) < 0.05 else 23.976] += 2
        elif 24.5 < fps <= 25.5:
            buckets[25.0] += 2
        elif 29.5 <= fps <= 30.5:
            buckets[30.0 if abs(fps - 30.0) < 0.05 else 29.97] += 2
        elif 49.5 <= fps <= 50.5:
            buckets[25.0] += 1
        elif 59.0 <= fps <= 60.5:
            buckets[30.0] += 1
        else:
            buckets[round(fps, 2)] += 1
    if not buckets:
        return 30.0
    return buckets.most_common(1)[0][0]


def main() -> int:
    parser = argparse.ArgumentParser(description="Probe video clips and FFmpeg capabilities.")
    parser.add_argument("--check-env", action="store_true", help="Report local FFmpeg capabilities.")
    parser.add_argument("paths", nargs="*", help="Video files or directories to probe.")
    args = parser.parse_args()

    caps = check_ffmpeg_capabilities()
    if args.check_env and not args.paths:
        print(json.dumps({"ffmpeg_capabilities": caps}, indent=2))
        return 0

    if not args.paths:
        parser.print_help(sys.stderr)
        return 2

    files = collect_videos(args.paths)
    clips: list[dict] = []
    for f in files:
        info = probe_video_file(f)
        if info:
            clips.append(info)

    result = {
        "ffmpeg_capabilities": caps,
        "recommended_fps": choose_recommended_fps(clips),
        "count": len(clips),
        "clips": clips,
    }
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
