#!/usr/bin/env python3
"""
generate_sfx_pack.py — Synthesize a clean, subtle, tactile micro-SFX library (pure Python, zero dependencies)
inspired by MKBHD & Mrwhosetheboss sound design ("things that move should make subtle sound").

Generates inside ../assets/sfx/:
  - soft_pop.wav      : Crisp muted bubble/UI pop for callout cards & counters
  - subtle_whoosh.wav : Soft filtered air sweep for transitions & chapter pills
  - riser_swell.wav   : Gentle 1.2s low-mid swell before major reveals
  - ui_tick.wav       : Ultra-clean mechanical tick for spotlight/step-tracker advances
  - bass_hit.wav      : Warm subtle sub-bass thump for big thesis/stat drops
"""

import math
import random
import struct
import wave
from pathlib import Path

SR = 48000


def write_wav(path: Path, samples):
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        raw = bytearray()
        for s in samples:
            clamped = max(-1.0, min(1.0, s))
            raw.extend(struct.pack("<h", int(clamped * 32767)))
        wf.writeframes(bytes(raw))


def make_soft_pop():
    n = int(SR * 0.14)
    out = []
    phase = 0.0
    for i in range(n):
        t = i / SR
        freq = 320.0 + 380.0 * math.exp(-t * 28.0)
        phase += 2 * math.pi * freq / SR
        env = math.sin(min(1.0, t / 0.008) * math.pi * 0.5) * math.exp(-t * 32.0)
        out.append(0.65 * env * math.sin(phase))
    return out


def make_subtle_whoosh():
    random.seed(42)
    n = int(SR * 0.42)
    out = []
    lp = 0.0
    for i in range(n):
        t = i / SR
        p = t / 0.42
        env = math.sin(p * math.pi) ** 1.6
        # Low-pass filtered breathy noise sweeping cutoff gently
        alpha = 0.02 + 0.14 * math.sin(p * math.pi)
        noise = random.uniform(-1.0, 1.0)
        lp = lp + alpha * (noise - lp)
        out.append(0.75 * env * lp)
    return out


def make_riser_swell():
    random.seed(7)
    n = int(SR * 1.1)
    out = []
    lp = 0.0
    phase = 0.0
    for i in range(n):
        t = i / SR
        p = t / 1.1
        env = (p ** 2.2) * (1.0 - max(0.0, (p - 0.92) / 0.08))
        freq = 90.0 + 180.0 * (p ** 1.8)
        phase += 2 * math.pi * freq / SR
        noise = random.uniform(-1.0, 1.0)
        lp = lp + (0.015 + 0.08 * p) * (noise - lp)
        out.append(0.45 * env * (0.5 * math.sin(phase) + 0.9 * lp))
    return out


def make_ui_tick():
    n = int(SR * 0.06)
    out = []
    for i in range(n):
        t = i / SR
        env = math.exp(-t * 95.0)
        out.append(0.6 * env * (0.6 * math.sin(2 * math.pi * 1400 * t) + 0.4 * math.sin(2 * math.pi * 2600 * t)))
    return out


def make_bass_hit():
    n = int(SR * 0.55)
    out = []
    phase = 0.0
    for i in range(n):
        t = i / SR
        freq = 115.0 * math.exp(-t * 6.0) + 46.0
        phase += 2 * math.pi * freq / SR
        env = math.sin(min(1.0, t / 0.012) * math.pi * 0.5) * math.exp(-t * 7.5)
        out.append(0.8 * env * math.sin(phase))
    return out


def main():
    sfx_dir = Path(__file__).resolve().parent.parent / "assets" / "sfx"
    pack = {
        "soft_pop.wav": make_soft_pop(),
        "subtle_whoosh.wav": make_subtle_whoosh(),
        "riser_swell.wav": make_riser_swell(),
        "ui_tick.wav": make_ui_tick(),
        "bass_hit.wav": make_bass_hit(),
    }
    for name, samples in pack.items():
        write_wav(sfx_dir / name, samples)
    print(f"Generated {len(pack)} tactile micro-SFX files in {sfx_dir}")


if __name__ == "__main__":
    main()
