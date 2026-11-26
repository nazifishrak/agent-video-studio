#!/usr/bin/env python3
"""
analyze_footage.py — Analyze raw talking-head footage and generate a declarative edit-plan.json.

What it does:
  1. Probes video resolution, fps, and duration via ffprobe.
  2. Runs ffmpeg silencedetect to find dead air and build clean speech-kept `cuts`
     while preserving natural breaths (default 0.20s padding).
  3. Samples frames with OpenCV Haar cascade to detect the speaker's eye/face center
     so soft pan/zoom moves push naturally toward the speaker's eyes.
  4. Proposes subtle, anti-slop soft push-in camera moves on longer talking segments.
  5. Optional (--transcribe): runs local faster-whisper for word-level timestamps JSON.

Usage:
  python3 scripts/analyze_footage.py raw.mp4 -o edit-plan.json [--aspect 16:9|9:16] [--silence-db -32] [--min-silence 0.7] [--transcribe]
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


def probe_video(video_path: str):
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate:format=duration",
        "-of", "json", video_path,
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    data = json.loads(res.stdout)
    stream = (data.get("streams") or [{}])[0]
    w = int(stream.get("width") or 1920)
    h = int(stream.get("height") or 1080)
    fps_str = str(stream.get("r_frame_rate") or "30/1")
    if "/" in fps_str:
        num, den = fps_str.split("/")
        fps = round(float(num) / max(1.0, float(den)))
    else:
        fps = round(float(fps_str))
    dur = float((data.get("format") or {}).get("duration") or 0.0)
    return w, h, max(24, min(60, fps)), dur


def detect_speech_cuts(video_path: str, duration: float, noise_db: float = -32.0, min_silence: float = 0.75, pad: float = 0.20):
    """Return list of {in, out, note} segments removing long dead air while keeping natural breaths."""
    cmd = [
        "ffmpeg", "-i", video_path,
        "-af", f"silencedetect=noise={noise_db}dB:d={min_silence}",
        "-f", "null", "-",
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    silences = []
    cur_start = None
    for line in res.stderr.splitlines():
        m_s = re.search(r"silence_start:\s*([0-9.]+)", line)
        m_e = re.search(r"silence_end:\s*([0-9.]+)", line)
        if m_s:
            cur_start = float(m_s.group(1))
        elif m_e and cur_start is not None:
            silences.append((cur_start, float(m_e.group(1))))
            cur_start = None
    if cur_start is not None:
        silences.append((cur_start, duration))

    if not silences:
        return [{"in": 0.0, "out": round(duration, 2), "note": "Continuous speech (no long silences detected)"}]

    kept = []
    cursor = 0.0
    for s_start, s_end in silences:
        seg_in = max(0.0, cursor - (pad if cursor > 0 else 0.0))
        seg_out = min(duration, s_start + pad)
        if seg_out - seg_in >= 0.35:
            kept.append((seg_in, seg_out))
        cursor = s_end

    if duration - cursor >= 0.35:
        kept.append((max(0.0, cursor - pad), duration))

    # Merge overlapping or tiny-gap (<0.35s) segments so pauses stay natural
    merged = []
    for seg_in, seg_out in kept:
        if merged and seg_in - merged[-1][1] < 0.35:
            merged[-1] = (merged[-1][0], max(merged[-1][1], seg_out))
        else:
            merged.append((seg_in, seg_out))

    if not merged:
        return [{"in": 0.0, "out": round(duration, 2), "note": "Full clip kept"}]

    return [
        {"in": round(a, 2), "out": round(b, 2), "note": f"Speech segment #{i+1}"}
        for i, (a, b) in enumerate(merged)
    ]


def detect_face_anchor(video_path: str, samples: int = 8):
    """Detect median normalized (x, y) eye-line center using OpenCV if available."""
    try:
        import cv2
    except ImportError:
        return {"x": 0.5, "y": 0.38}

    cascade_cls = getattr(cv2, "CascadeClassifier", None) or getattr(getattr(cv2, "objdetect", None), "CascadeClassifier", None)
    data_mod = getattr(cv2, "data", None)
    if cascade_cls is None or data_mod is None or not hasattr(data_mod, "haarcascades"):
        return {"x": 0.5, "y": 0.38}

    cap = cv2.VideoCapture(video_path)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    if total_frames <= 0:
        cap.release()
        return {"x": 0.5, "y": 0.38}

    cascade_path = data_mod.haarcascades + "haarcascade_frontalface_default.xml"
    detector = cascade_cls(cascade_path)
    if detector.empty():
        cap.release()
        return {"x": 0.5, "y": 0.38}

    xs, ys = [], []
    for i in range(samples):
        idx = int(((i + 1) / (samples + 1)) * total_frames)
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ok, frame = cap.read()
        if not ok or frame is None:
            continue
        h, w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = detector.detectMultiScale(gray, scaleFactor=1.15, minNeighbors=5, minSize=(60, 60))
        if len(faces) > 0:
            fx, fy, fw, fh = max(faces, key=lambda f: f[2] * f[3])
            xs.append((fx + fw * 0.5) / w)
            ys.append((fy + fh * 0.38) / h)

    cap.release()
    if not xs:
        return {"x": 0.5, "y": 0.38}

    xs.sort()
    ys.sort()
    mid = len(xs) // 2
    return {"x": round(xs[mid], 3), "y": round(ys[mid], 3)}


def propose_soft_camera_moves(cuts, face_anchor):
    """Propose tasteful, slow push-ins spaced naturally every ~12-18 seconds (never jarring)."""
    edited_dur = sum(max(0.0, c["out"] - c["in"]) for c in cuts)
    moves = []
    if edited_dur < 5.0:
        return moves

    # For short clips (5-14s), add one gentle cinema push-in around the middle
    if edited_dur < 15.0:
        start = round(edited_dur * 0.2, 2)
        end = round(min(edited_dur - 0.8, start + 4.5), 2)
        if end - start >= 2.0:
            moves.append({
                "start": start,
                "end": end,
                "fromScale": 1.0,
                "toScale": 1.09,
                "fromPanX": 0.0,
                "toPanX": 0.6,
                "holdAfter": False,
                "returnDuration": 1.4,
                "easing": "easeInOutCubic",
                "focusX": face_anchor["x"],
                "focusY": face_anchor["y"],
                "reason": "Soft push-in emphasizing key beat",
            })
        return moves

    # For longer videos, place gentle alternating subtle push-ins every ~18s
    t = 6.0
    idx = 0
    while t + 5.5 < edited_dur:
        pan_dir = 0.8 if idx % 2 == 0 else -0.8
        moves.append({
            "start": round(t, 2),
            "end": round(t + 5.0, 2),
            "fromScale": 1.0,
            "toScale": 1.09,
            "fromPanX": 0.0,
            "toPanX": pan_dir,
            "holdAfter": False,
            "returnDuration": 1.5,
            "easing": "easeInOutCubic",
            "focusX": face_anchor["x"],
            "focusY": face_anchor["y"],
            "reason": f"Auto soft push-in #{idx + 1} (adjust timing to key insight)",
        })
        t += 18.0
        idx += 1
    return moves


FILLER_WORDS = {"um", "uh", "uhh", "umm", "so", "like", "okay", "alright", "actually", "basically"}


def _clean_tokens(text_words):
    cleaned = []
    for w in text_words:
        tok = re.sub(r"[^a-z0-9]", "", str(w).lower())
        if tok and tok not in FILLER_WORDS:
            cleaned.append(tok)
    return cleaned


def detect_retakes(cuts, words):
    """
    Detect consecutive restarted takes (flubs): when segment N starts with the same
    opening phrase as segment N+1 (prefix overlap >= 60% on first 3-5 meaningful words),
    drop segment N into `dropped_retakes` and keep the cleaner final take N+1.
    """
    if not words or len(cuts) < 2:
        return cuts, []

    seg_tokens = []
    for c in cuts:
        a, b = float(c["in"]), float(c["out"])
        w_in = [w["word"] for w in words if a - 0.15 <= float(w["start"]) <= b + 0.15]
        seg_tokens.append(_clean_tokens(w_in))

    kept = []
    dropped = []
    for i, c in enumerate(cuts):
        is_retake = False
        if i + 1 < len(cuts):
            toks_a = seg_tokens[i]
            toks_b = seg_tokens[i + 1]
            k = min(4, len(toks_a), len(toks_b))
            if k >= 2:
                head_a = toks_a[:k]
                head_b = toks_b[: min(k + 1, len(toks_b))]
                matches = sum(1 for t in head_a if t in head_b)
                overlap = matches / k
                dur_a = float(c["out"]) - float(c["in"])
                # Short/aborted take OR high opening-phrase duplication -> drop earlier take
                if overlap >= 0.65 and (len(toks_a) <= len(toks_b) + 2 or dur_a < 7.0):
                    is_retake = True
        if is_retake:
            d = dict(c)
            d["note"] = f"Auto-dropped retake (repeated opening: '{' '.join(seg_tokens[i][:4])}')"
            dropped.append(d)
        else:
            c2 = dict(c)
            if seg_tokens[i]:
                c2["note"] = f"Speech #{len(kept)+1}: {' '.join(seg_tokens[i][:6])}..."
            kept.append(c2)

    return kept, dropped


def run_whisper(video_path: str, out_json: Path):
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        sys.stderr.write("[WARN] faster-whisper not installed. Run setup.sh --with-whisper to enable transcription.\n")
        return None

    model = WhisperModel("base", device="cpu", compute_type="int8")
    segments, _ = model.transcribe(video_path, word_timestamps=True)
    words = []
    for seg in segments:
        for w in seg.words or []:
            words.append({"word": w.word.strip(), "start": round(w.start, 2), "end": round(w.end, 2)})
    out_json.write_text(json.dumps({"words": words}, indent=2))
    print(f"Word-level transcript saved ({len(words)} words): {out_json}")
    return words


def main():
    p = argparse.ArgumentParser(description="Analyze raw talking-head footage into an EditPlan JSON")
    p.add_argument("input", help="Path to raw talking-head video")
    p.add_argument("-o", "--output", required=True, help="Output edit-plan.json path")
    p.add_argument("--aspect", choices=["16:9", "9:16", "source"], default="16:9")
    p.add_argument("--silence-db", type=float, default=-32.0, help="Silence threshold in dB")
    p.add_argument("--min-silence", type=float, default=0.75, help="Minimum silence duration to cut (s)")
    p.add_argument("--pad", type=float, default=0.20, help="Breath padding around speech cuts (s)")
    p.add_argument("--no-cuts", action="store_true", help="Keep full clip uncut (still detect face & propose zooms)")
    p.add_argument("--transcribe", action="store_true", help="Run optional local faster-whisper word timestamps + retake detection")
    p.add_argument("--words-json", help="Optional existing word-level transcript JSON for retake/flub detection")
    p.add_argument("--lut", default="", help="Optional built-in LUT (sarah_warm_film | mkbhd_matte_clean) or .cube path")
    args = p.parse_args()

    src = str(Path(args.input).resolve())
    sw, sh, fps, dur = probe_video(src)
    if args.aspect == "16:9":
        w, h = 1920, 1080
    elif args.aspect == "9:16":
        w, h = 1080, 1920
    else:
        w, h = sw, sh

    cuts = (
        [{"in": 0.0, "out": round(dur, 2), "note": "Uncut source"}]
        if args.no_cuts
        else detect_speech_cuts(src, dur, args.silence_db, args.min_silence, args.pad)
    )

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    words = None
    if args.words_json and Path(args.words_json).exists():
        words = json.loads(Path(args.words_json).read_text()).get("words")
    elif args.transcribe:
        words = run_whisper(src, out_path.with_suffix(".words.json"))

    dropped_retakes = []
    if words and not args.no_cuts:
        cuts, dropped_retakes = detect_retakes(cuts, words)

    face_anchor = detect_face_anchor(src)
    camera_moves = propose_soft_camera_moves(cuts, face_anchor)

    edited_dur = round(sum(c["out"] - c["in"] for c in cuts), 2)
    plan = {
        "project": Path(src).stem,
        "sourceVideo": src,
        "width": w,
        "height": h,
        "fps": fps,
        "faceAnchor": face_anchor,
        "cuts": cuts,
        "droppedRetakes": dropped_retakes,
        "cameraMoves": camera_moves,
        "broll": [],
        "callouts": [],
        "colorGrade": {
            "contrast": 1.03,
            "saturate": 1.05,
            "brightness": 1.0,
            "vignette": 0.12,
            "filmGrain": 0.0,
            "lut": args.lut,
            "lutIntensity": 0.65,
        },
        "audio": {
            "musicTrack": "",
            "musicDb": -18,
            "sidechainDuck": True,
            "targetLufs": -14,
            "autoSfx": True,
            "sfx": [],
            "silenceDrops": [],
        },
    }

    out_path.write_text(json.dumps(plan, indent=2))

    print(
        f"Analyzed {Path(src).name}: {dur:.1f}s raw -> {edited_dur:.1f}s edited "
        f"({len(cuts)} cuts, {len(dropped_retakes)} retakes dropped, {len(camera_moves)} soft moves, faceAnchor={face_anchor})"
    )
    print(f"Edit plan written: {out_path}")


if __name__ == "__main__":
    main()
