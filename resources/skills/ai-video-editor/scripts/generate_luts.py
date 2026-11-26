#!/usr/bin/env python3
"""
generate_luts.py — Generate two clean, tasteful 17x17x17 3D .cube LUTs inside ../assets/luts/
using pure Python math (zero external dependencies):
  - sarah_warm_film.cube   : Warm daylight highlights, gently lifted matte shadows, organic film feel
  - mkbhd_matte_clean.cube : Crisp neutral studio contrast, rich shadows, subtle cool-shadow separation
"""

import math
from pathlib import Path


def clamp(v, lo=0.0, hi=1.0):
    return max(lo, min(hi, v))


def s_curve(x, strength=0.14):
    # Smooth gentle contrast S-curve
    return clamp(x + strength * math.sin(2.0 * math.pi * (x - 0.5)) * (-0.5))


def sarah_warm_film(r, g, b):
    # Subtle S-curve + gently lifted matte blacks + warm sunlit highlights
    r = s_curve(r, 0.08)
    g = s_curve(g, 0.08)
    b = s_curve(b, 0.08)

    # Lift blacks gently (filmic matte floor ~0.03)
    r = 0.028 + r * 0.965
    g = 0.025 + g * 0.965
    b = 0.022 + b * 0.955

    # Warm midtones/highlights slightly, gently soften harsh blues
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    warm = 0.032 * (0.3 + 0.7 * luma)
    r = clamp(r + warm)
    g = clamp(g + warm * 0.42)
    b = clamp(b - warm * 0.55)

    # Slight gentle desaturation in very high luminance (filmic highlight rolloff)
    sat = 1.04 - 0.08 * (luma ** 2)
    l2 = 0.2126 * r + 0.7152 * g + 0.0722 * b
    r = clamp(l2 + (r - l2) * sat)
    g = clamp(l2 + (g - l2) * sat)
    b = clamp(l2 + (b - l2) * sat)
    return r, g, b


def mkbhd_matte_clean(r, g, b):
    # Crisp contrast curve + clean deep blacks + subtle cool shadows / clean neutral highs
    r = s_curve(r, 0.16)
    g = s_curve(g, 0.16)
    b = s_curve(b, 0.16)

    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    # Subtle cool tint in deep shadows, neutral crisp highlights
    shadow_weight = (1.0 - luma) ** 2
    r = clamp(r - 0.015 * shadow_weight + 0.008 * luma)
    g = clamp(g + 0.002 * shadow_weight)
    b = clamp(b + 0.022 * shadow_weight)

    # Clean punchy saturation (+7%)
    l2 = 0.2126 * r + 0.7152 * g + 0.0722 * b
    sat = 1.07
    r = clamp(l2 + (r - l2) * sat)
    g = clamp(l2 + (g - l2) * sat)
    b = clamp(l2 + (b - l2) * sat)
    return r, g, b


def write_cube(path: Path, title: str, fn, size: int = 17):
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        f'TITLE "{title}"',
        f"LUT_3D_SIZE {size}",
        "DOMAIN_MIN 0.0 0.0 0.0",
        "DOMAIN_MAX 1.0 1.0 1.0",
    ]
    # Standard .cube order: R fastest, then G, then B
    for bi in range(size):
        b = bi / (size - 1)
        for gi in range(size):
            g = gi / (size - 1)
            for ri in range(size):
                r = ri / (size - 1)
                ro, go, bo = fn(r, g, b)
                lines.append(f"{ro:.6f} {go:.6f} {bo:.6f}")
    path.write_text("\n".join(lines) + "\n")


def main():
    lut_dir = Path(__file__).resolve().parent.parent / "assets" / "luts"
    write_cube(lut_dir / "sarah_warm_film.cube", "Sarah Warm Film", sarah_warm_film)
    write_cube(lut_dir / "mkbhd_matte_clean.cube", "MKBHD Matte Clean", mkbhd_matte_clean)
    print(f"Generated 2 built-in 3D .cube LUTs in {lut_dir}")


if __name__ == "__main__":
    main()
