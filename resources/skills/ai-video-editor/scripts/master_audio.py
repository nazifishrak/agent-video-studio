#!/usr/bin/env python3
"""
master_audio.py — Final Pro Mastering Pass (Audio + Optional 3D .cube Film LUT):
  1. Voice broadcast mastering (-14 LUFS loudnorm, 75Hz highpass, subtle 3.2kHz clarity, gentle compression)
  2. Smooth sidechain music ducking (`ffmpeg sidechaincompress` — music swells naturally during pauses/B-roll
     and smoothly ducks ~10-12 dB under speech!) + smooth fade-ramped 0% silence drops
  3. Tactile micro-SFX layering (`sfx[]` + `autoSfx` auto-synced to callouts & transitions)
  4. Optional 3D `.cube` Film LUT color grading (`sarah_warm_film` | `mkbhd_matte_clean` | custom `.cube`)
     with adjustable `lutIntensity` blending (zero video re-encode when no LUT is configured!)

Usage:
  python3 scripts/master_audio.py <rendered.mp4> <edit-plan.json> -o <final_master.mp4> [--music bg.mp3] [--lut sarah_warm_film]
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
SFX_DIR = SKILL_DIR / "assets" / "sfx"
LUT_DIR = SKILL_DIR / "assets" / "luts"


def run(cmd):
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        sys.stderr.write(res.stderr[-1600:] + "\n")
        sys.exit(res.returncode)
    return res


def ensure_builtin_assets():
    if not (SFX_DIR / "soft_pop.wav").exists():
        gen = SKILL_DIR / "scripts" / "generate_sfx_pack.py"
        if gen.exists():
            run([sys.executable, str(gen)])
    if not (LUT_DIR / "sarah_warm_film.cube").exists():
        gen = SKILL_DIR / "scripts" / "generate_luts.py"
        if gen.exists():
            run([sys.executable, str(gen)])


def resolve_asset(name: str, plan_dir: Path, builtin_dir: Path, ext: str):
    if not name:
        return None
    p = Path(name)
    if p.exists():
        return p.resolve()
    if (plan_dir / name).exists():
        return (plan_dir / name).resolve()
    b = builtin_dir / (name if name.endswith(ext) else f"{name}{ext}")
    if b.exists():
        return b.resolve()
    return None


def collect_sfx_cues(plan: dict, plan_dir: Path):
    audio_cfg = plan.get("audio") or {}
    cues = list(audio_cfg.get("sfx") or [])

    if audio_cfg.get("autoSfx", True):
        for c in plan.get("callouts") or []:
            ctype = c.get("type", "lower-third")
            t = float(c.get("start", 0))
            if ctype == "editorial-title":
                cues.append({"at": max(0.0, t - 0.12), "sound": "subtle_whoosh", "db": -18})
            elif ctype in ("stat-card", "counter"):
                cues.append({"at": t, "sound": "soft_pop", "db": -16})
            elif ctype in ("spotlight", "chapter-tracker"):
                cues.append({"at": t, "sound": "ui_tick", "db": -18})
            else:
                cues.append({"at": t, "sound": "soft_pop", "db": -20})

    resolved = []
    for cue in cues:
        fp = resolve_asset(str(cue.get("sound", "")), plan_dir, SFX_DIR, ".wav")
        if fp:
            resolved.append({
                "path": str(fp),
                "ms": max(0, int(round(float(cue.get("at", 0)) * 1000))),
                "gain": round(10 ** (float(cue.get("db", -18)) / 20.0), 5),
            })
    return resolved


def build_silence_drop_expr(base_gain: float, silence_drops: list) -> str:
    """Build smooth linear fade-out -> 0% silence -> fade-in volume expression for ffmpeg."""
    expr = str(base_gain)
    for drop in silence_drops:
        ds = float(drop["start"])
        de = float(drop["end"])
        fade = max(0.08, float(drop.get("fade", 0.35)))
        f_start = max(0.0, ds - fade)
        f_end = de + fade
        # Smooth ramp down over [f_start, ds], silent on [ds, de], smooth ramp up over [de, f_end]
        ramp_down = f"{base_gain}*(({ds}-t)/{fade})"
        ramp_up = f"{base_gain}*((t-{de})/{fade})"
        expr = (
            f"if(between(t,{ds},{de}),0,"
            f"if(between(t,{f_start},{ds}),{ramp_down},"
            f"if(between(t,{de},{f_end}),{ramp_up},{expr})))"
        )
    return expr


def main():
    p = argparse.ArgumentParser(description="Final pro mastering: voice, sidechain music ducking, SFX, and .cube LUT")
    p.add_argument("video", help="Rendered MP4 from Remotion")
    p.add_argument("plan", help="Path to edit-plan.json")
    p.add_argument("-o", "--output", required=True, help="Final mastered MP4 output")
    p.add_argument("--music", help="Optional override path to background music MP3/WAV")
    p.add_argument("--lut", help="Optional override LUT name (sarah_warm_film | mkbhd_matte_clean) or .cube path")
    p.add_argument("--lut-intensity", type=float, help="Override LUT intensity 0.0..1.0")
    args = p.parse_args()

    plan_path = Path(args.plan).resolve()
    plan = json.loads(plan_path.read_text())
    audio_cfg = plan.get("audio") or {}
    cg_cfg = plan.get("colorGrade") or {}

    music = args.music or audio_cfg.get("musicTrack") or ""
    sidechain = bool(audio_cfg.get("sidechainDuck", True))
    default_music_db = -18.0 if sidechain else -28.0
    music_db = float(audio_cfg.get("musicDb", default_music_db))
    target_lufs = float(audio_cfg.get("targetLufs", -14))
    silence_drops = audio_cfg.get("silenceDrops") or []

    ensure_builtin_assets()
    sfx_cues = collect_sfx_cues(plan, plan_path.parent)

    lut_name = args.lut if args.lut is not None else str(cg_cfg.get("lut") or "")
    lut_path = resolve_asset(lut_name, plan_path.parent, LUT_DIR, ".cube")
    lut_intensity = float(args.lut_intensity if args.lut_intensity is not None else cg_cfg.get("lutIntensity", 0.65))
    lut_intensity = max(0.0, min(1.0, lut_intensity))

    voice_chain = (
        f"highpass=f=75,equalizer=f=3200:t=q:w=1.2:g=2,"
        f"acompressor=threshold=-20dB:ratio=2.5:attack=12:release=140,"
        f"loudnorm=I={target_lufs}:TP=-1.5:LRA=11"
    )

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    inputs = ["-i", args.video]
    filters = []
    video_map = "0:v"
    video_codec_args = ["-c:v", "copy"]

    # Optional 3D .cube Film LUT with intensity blending
    if lut_path and lut_intensity > 0.01:
        escaped_lut = str(lut_path).replace("\\", "/").replace(":", "\\:")
        if lut_intensity >= 0.99:
            filters.append(f"[0:v]lut3d=file='{escaped_lut}':interp=tetrahedral,format=yuv420p[v_out]")
        else:
            orig_w = round(1.0 - lut_intensity, 3)
            lut_w = round(lut_intensity, 3)
            filters.append(
                f"[0:v]split=2[v_orig][v_tolut];"
                f"[v_tolut]lut3d=file='{escaped_lut}':interp=tetrahedral[v_graded];"
                f"[v_orig][v_graded]mix=inputs=2:weights='{orig_w} {lut_w}',format=yuv420p[v_out]"
            )
        video_map = "[v_out]"
        video_codec_args = ["-c:v", "libx264", "-crf", "18", "-preset", "fast"]

    # Audio graph: mastered voice (split for sidechain trigger if music enabled)
    has_music = bool(music and Path(music).exists())
    mix_labels = []
    next_idx = 1

    if has_music and sidechain:
        filters.append(f"[0:a]{voice_chain},asplit=2[v_mix][v_sc]")
        mix_labels.append("[v_mix]")
    else:
        filters.append(f"[0:a]{voice_chain}[v_mix]")
        mix_labels.append("[v_mix]")

    if has_music:
        inputs += ["-i", music]
        base_gain = round(10 ** (music_db / 20.0), 5)
        vol_expr = build_silence_drop_expr(base_gain, silence_drops)
        if sidechain:
            # Music swells at base_gain on pauses, smoothly ducks ~10-12dB whenever voice is active!
            filters.append(f"[{next_idx}:a]aloop=loop=-1:size=2e+09,aresample=48000,volume='{vol_expr}':eval=frame[m_bed]")
            filters.append(
                "[m_bed][v_sc]sidechaincompress=threshold=0.025:ratio=6:attack=60:release=450:makeup=1[m_duck]"
            )
        else:
            filters.append(f"[{next_idx}:a]aloop=loop=-1:size=2e+09,aresample=48000,volume='{vol_expr}':eval=frame[m_duck]")
        mix_labels.append("[m_duck]")
        next_idx += 1

    # Tactile SFX cues at exact ms offsets
    for s_i, cue in enumerate(sfx_cues):
        inputs += ["-i", cue["path"]]
        filters.append(f"[{next_idx}:a]aresample=48000,adelay={cue['ms']}|{cue['ms']},volume={cue['gain']}[sfx{s_i}]")
        mix_labels.append(f"[sfx{s_i}]")
        next_idx += 1

    if len(mix_labels) == 1:
        audio_map = "[v_mix]"
    else:
        filters.append(
            "".join(mix_labels)
            + f"amix=inputs={len(mix_labels)}:duration=first:dropout_transition=2:normalize=0[a_out]"
        )
        audio_map = "[a_out]"

    run([
        "ffmpeg", "-y", "-v", "error", *inputs,
        "-filter_complex", ";".join(filters),
        "-map", video_map, "-map", audio_map,
        *video_codec_args,
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", str(out_path),
    ])

    lut_note = f"{lut_path.name} ({int(lut_intensity*100)}%)" if lut_path else "OFF"
    duck_note = "sidechain" if (has_music and sidechain) else ("static" if has_music else "OFF")
    print(
        f"Mastered ({target_lufs} LUFS | music={duck_note} | {len(silence_drops)} smooth silence drops | "
        f"{len(sfx_cues)} SFX | LUT={lut_note}) -> {out_path}"
    )


if __name__ == "__main__":
    main()
