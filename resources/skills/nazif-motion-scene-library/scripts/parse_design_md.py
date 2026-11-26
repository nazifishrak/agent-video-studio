#!/usr/bin/env python3
"""
Parse any DESIGN.md file (either simple `- key: value` format OR rich editorial/table DESIGN.md
like Apsis Space's Neural Palette) and compile it to engine/tokens.css and engine/tokens.json.

Usage:
  python3 scripts/parse_design_md.py themes/apsis-space.design.md --mode light
  python3 scripts/parse_design_md.py themes/apsis-space.design.md --mode dark
"""
import argparse
import json
import re
from pathlib import Path

KEY_TO_CSS = {
    "display_font": "--font-display",
    "body_font": "--font-body",
    "display_weight": "--display-weight",
    "display_tracking": "--display-tracking",
    "body_tracking": "--body-tracking",
    "stage_bg": "--stage-bg",
    "surface_card": "--surface-card",
    "surface_well": "--surface-well",
    "border_subtle": "--border-subtle",
    "text_primary": "--text-primary",
    "text_muted": "--text-muted",
    "accent_primary": "--accent-primary",
    "accent_soft": "--accent-soft",
    "accent_warm": "--accent-warm",
    "accent_warm_soft": "--accent-warm-soft",
    "status_positive": "--status-positive",
    "status_positive_soft": "--status-positive-soft",
    "status_negative": "--status-negative",
    "status_negative_soft": "--status-negative-soft",
    "skeleton_primary": "--skeleton-primary",
    "skeleton_secondary": "--skeleton-secondary",
    "radius_card": "--radius-card",
    "radius_control": "--radius-control",
    "shadow_card": "--shadow-card",
    "border_width": "--border-width",
    "aurora_opacity": "--aurora-opacity",
    "aurora_gradient": "--aurora-gradient",
}

def extract_raw_css_vars(md_text: str) -> dict:
    """Extract `--token-name` -> `#hex` pairs from markdown tables or prose."""
    found = {}
    for m in re.finditer(r"(--[a-zA-Z0-9_-]+)\s*\|?\s*(#[0-9a-fA-F]{3,8})", md_text):
        found[m.group(1).lower()] = m.group(2).lower()
    return found

def parse_design_md(md_text: str, mode: str = "light") -> dict:
    tokens = {}
    for line in md_text.splitlines():
        m = re.match(r"^\s*[-*]\s*([a-zA-Z0-9_]+)\s*:\s*(.+?)\s*$", line)
        if m:
            k, v = m.group(1).strip().lower(), m.group(2).strip()
            if k in KEY_TO_CSS:
                tokens[k] = v

    raw_vars = extract_raw_css_vars(md_text)

    # Smart mapping for rich palette DESIGN.md files (e.g. Apsis Space Neural Palette)
    if raw_vars:
        if mode == "dark":
            tokens.setdefault("stage_bg", raw_vars.get("--black", "#020202"))
            tokens.setdefault("surface_card", raw_vars.get("--neural-dark", "#111729"))
            tokens.setdefault("surface_well", raw_vars.get("--neural-dark-1", "#1e293c"))
            tokens.setdefault("border_subtle", raw_vars.get("--neural-dark-2", "#324155"))
            tokens.setdefault("text_primary", raw_vars.get("--canvas", "#ffffff"))
            tokens.setdefault("text_muted", raw_vars.get("--neural-gray", "#94a3b7"))
            tokens.setdefault("accent_primary", raw_vars.get("--neural-blue-2", raw_vars.get("--neural-blue", "#61a6fa")))
            tokens.setdefault("accent_soft", "rgba(38, 100, 236, 0.22)")
            tokens.setdefault("accent_warm", raw_vars.get("--neural-blue-3", "#92c4fc"))
            tokens.setdefault("accent_warm_soft", "rgba(146, 196, 252, 0.18)")
            tokens.setdefault("skeleton_primary", raw_vars.get("--neural-dark-2", "#324155"))
            tokens.setdefault("skeleton_secondary", raw_vars.get("--neural-dark-1", "#1e293c"))
        else:
            tokens.setdefault("stage_bg", raw_vars.get("--canvas", "#ffffff"))
            tokens.setdefault("surface_card", raw_vars.get("--canvas", "#ffffff"))
            tokens.setdefault("surface_well", raw_vars.get("--neural-gray-3", raw_vars.get("--neural-gray-2", "#f0f4f9")))
            tokens.setdefault("border_subtle", raw_vars.get("--neural-gray-1", "#ccd5e2"))
            tokens.setdefault("text_primary", raw_vars.get("--neural-dark", "#111729"))
            tokens.setdefault("text_muted", raw_vars.get("--neural-dark-3", "#465569"))
            tokens.setdefault("accent_primary", raw_vars.get("--neural-blue", "#2664ec"))
            tokens.setdefault("accent_soft", raw_vars.get("--neural-gray-3", "#f0f4f9"))
            tokens.setdefault("accent_warm", raw_vars.get("--neural-blue-1", "#3c82f5"))
            tokens.setdefault("accent_warm_soft", raw_vars.get("--neural-gray-2", "#e2e7ef"))
            tokens.setdefault("skeleton_primary", raw_vars.get("--neural-gray-1", "#ccd5e2"))
            tokens.setdefault("skeleton_secondary", raw_vars.get("--neural-gray-2", "#e2e7ef"))

    # Sensible defaults for any missing semantic tokens
    tokens.setdefault("display_font", '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif')
    tokens.setdefault("body_font", '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif')
    tokens.setdefault("display_weight", "700")
    tokens.setdefault("display_tracking", "-0.03em")
    tokens.setdefault("body_tracking", "-0.01em")
    tokens.setdefault("status_positive", "#16A34A")
    tokens.setdefault("status_positive_soft", "rgba(22, 163, 74, 0.14)" if mode == "dark" else "#DCFCE7")
    tokens.setdefault("status_negative", "#DC2626")
    tokens.setdefault("status_negative_soft", "rgba(220, 38, 38, 0.16)" if mode == "dark" else "#FEE2E2")
    tokens.setdefault("radius_card", "20px")
    tokens.setdefault("radius_control", "14px")
    tokens.setdefault("border_width", "1px" if "1px" in md_text else "2px")
    tokens.setdefault("shadow_card", "none" if "never heavy drop shadows" in md_text.lower() else "0 24px 60px -16px rgba(15, 23, 42, 0.08)")
    tokens.setdefault("aurora_opacity", "0" if "flat, architectural elevation" in md_text.lower() else "0.9")
    tokens.setdefault("aurora_gradient", "linear-gradient(90deg, rgba(254, 215, 170, 0.50) 0%, rgba(233, 213, 255, 0.54) 50%, rgba(191, 219, 254, 0.52) 100%)")

    return tokens, raw_vars

def compile_tokens(design_path: Path, out_dir: Path, mode: str = "light"):
    text = design_path.read_text(encoding="utf-8")
    tokens, raw_vars = parse_design_md(text, mode=mode)

    font_imports = []
    joined_fonts = (tokens.get("display_font", "") + " " + tokens.get("body_font", "")).lower()
    if "plus jakarta sans" in joined_fonts or "inter" in joined_fonts:
        font_imports.append("@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');")
    if "instrument serif" in joined_fonts:
        font_imports.append("@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap');")

    css_lines = [
        f"/* Auto-generated from {design_path.name} (mode={mode}) by scripts/parse_design_md.py */",
        *font_imports,
        ":root {",
    ]
    for k, css_var in KEY_TO_CSS.items():
        if k in tokens:
            css_lines.append(f"  {css_var}: {tokens[k]};")
    # Also preserve any custom brand tokens (e.g. --neural-dark, --neural-blue)
    for rk, rv in raw_vars.items():
        css_lines.append(f"  {rk}: {rv};")
    css_lines.append("}")
    css_lines.append("")
    css_lines.append("* { box-sizing: border-box; margin: 0; padding: 0; }")
    css_lines.append("html, body { width: 100%; height: 100%; overflow: hidden; background: var(--stage-bg); color: var(--text-primary); font-family: var(--font-body); letter-spacing: var(--body-tracking); -webkit-font-smoothing: antialiased; }")
    css_lines.append("body.transparent { background: transparent !important; }")
    css_lines.append("#stage { width: 1920px; height: 1080px; position: relative; overflow: hidden; transform-origin: top left; background: var(--stage-bg); }")
    css_lines.append("body.transparent #stage { background: transparent !important; }")
    css_lines.append(".stage-aurora { position: absolute; top: -90px; left: 0; right: 0; height: 240px; background: var(--aurora-gradient); filter: blur(65px); opacity: var(--aurora-opacity); pointer-events: none; z-index: 1; }")
    css_lines.append("body.transparent .stage-aurora { display: none; }")
    css_lines.append(".scene-root { position: absolute; inset: 0; z-index: 2; padding: 84px 112px; display: flex; flex-direction: column; justify-content: center; }")
    css_lines.append(".t-display { font-family: var(--font-display); font-weight: var(--display-weight); letter-spacing: var(--display-tracking); line-height: 1.06; color: var(--text-primary); }")
    css_lines.append(".t-num { font-variant-numeric: tabular-nums; }")
    css_lines.append(".card { background: var(--surface-card); border: var(--border-width, 1px) solid var(--border-subtle); border-radius: var(--radius-card); box-shadow: var(--shadow-card); }")
    css_lines.append(".well { background: var(--surface-well); border-radius: var(--radius-control); }")
    css_lines.append(".skel { height: 14px; border-radius: 999px; background: var(--skeleton-primary); }")
    css_lines.append(".skel.soft { background: var(--skeleton-secondary); }")

    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "tokens.css").write_text("\n".join(css_lines) + "\n", encoding="utf-8")
    (out_dir / "tokens.json").write_text(json.dumps({"mode": mode, "tokens": tokens, "raw_vars": raw_vars}, indent=2) + "\n", encoding="utf-8")
    print(f"Compiled {len(tokens)} semantic + {len(raw_vars)} brand tokens from {design_path.name} (mode={mode})")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("design", nargs="?", default="DESIGN.md")
    ap.add_argument("--mode", choices=["light", "dark"], default="light")
    args = ap.parse_args()
    root = Path(__file__).resolve().parent.parent
    compile_tokens(Path(args.design) if Path(args.design).is_absolute() else (Path.cwd() / args.design if Path(args.design).exists() else root / args.design), root / "engine", mode=args.mode)
