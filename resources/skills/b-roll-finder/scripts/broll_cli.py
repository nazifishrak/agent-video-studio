#!/usr/bin/env python3
"""
broll_cli.py — Free, portable, zero-API-key B-roll sourcing & cutting CLI.

Supported sources:
  - wikimedia : Wikimedia Commons videos (CC / Public Domain, zero API key, monetization-safe*)
  - archive   : Internet Archive movies/Prelinger/open-source (Public Domain / CC, zero API key)
  - nasa      : NASA Image & Video Library (Public Domain, zero API key)
  - youtube   : YouTube via yt-dlp (channel-scoped or open search; uncleared / commentary-only)
  - pexels    : Pexels 4K stock video (free API key via PEXELS_API_KEY env var, commercial-safe)
  - pixabay   : Pixabay 4K stock video (free API key via PIXABAY_API_KEY env var, commercial-safe)

Subcommands:
  search         Search one or multiple free B-roll sources
  download       Download a clip by URL (auto-detects YouTube vs direct HTTP)
  cut            Trim & format a clip to silent full-bleed 16:9 or 9:16 H.264 MP4
  contact-sheet  Create a timestamped thumbnail grid PNG from a video for quick picking
  zoom-still     Convert a still image (tweet/screenshot/photo) to smooth sub-pixel Ken Burns MP4
  composite      Splice B-roll cutaways over a talking-head video using a JSON manifest (audio untouched)
"""

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

USER_AGENT = "b-roll-finder-skill/1.0 (https://github.com/antigravity-skills)"


def run_cmd(cmd, check=True):
    res = subprocess.run(cmd, capture_output=True, text=True)
    if check and res.returncode != 0:
        sys.stderr.write(f"[ERROR] Command failed: {' '.join(cmd)}\n{res.stderr[-1200:]}\n")
        sys.exit(res.returncode)
    return res


def http_json(url, headers=None, timeout=20):
    hdrs = {"User-Agent": USER_AGENT}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url, headers=hdrs)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8", errors="replace"))


def ytdlp_base_cmd():
    cmd = ["yt-dlp"]
    if shutil.which("node"):
        cmd += ["--js-runtimes", "node", "--remote-components", "ejs:github"]
    elif shutil.which("deno"):
        cmd += ["--js-runtimes", "deno", "--remote-components", "ejs:github"]
    return cmd


# -------------------- SEARCH PROVIDERS --------------------

def search_wikimedia(query, limit=5):
    params = urllib.parse.urlencode({
        "action": "query",
        "generator": "search",
        "gsrsearch": f"filetype:video {query}",
        "gsrnamespace": 6,
        "gsrlimit": limit * 2,
        "prop": "videoinfo",
        "viprop": "url|size|mime|extmetadata",
        "format": "json",
    })
    data = http_json(f"https://commons.wikimedia.org/w/api.php?{params}")
    pages = data.get("query", {}).get("pages", {})
    results = []
    for p in pages.values():
        vi_list = p.get("videoinfo") or []
        if not vi_list:
            continue
        vi = vi_list[0]
        url = vi.get("url")
        if not url:
            continue
        meta = vi.get("extmetadata") or {}
        lic = (meta.get("LicenseShortName") or {}).get("value", "Check Wikimedia license")
        artist = (meta.get("Artist") or {}).get("value", "Wikimedia Commons")
        # Strip minimal HTML tags from artist
        import re
        artist_clean = re.sub(r"<[^>]+>", "", artist).strip()[:60]
        results.append({
            "source": "wikimedia",
            "title": p.get("title", "").replace("File:", ""),
            "url": url,
            "page_url": vi.get("descriptionurl", ""),
            "duration": round(float(vi.get("duration", 0) or 0), 1),
            "resolution": f"{vi.get('width', '?')}x{vi.get('height', '?')}",
            "_height": int(vi.get("height") or 0),
            "rights": f"CLEARED ({lic}) — credit: {artist_clean}",
        })
    results.sort(key=lambda r: r.get("_height", 0), reverse=True)
    for r in results:
        r.pop("_height", None)
    return results[:limit]


def search_archive(query, limit=5, public_domain_only=True):
    scope = 'collection:(prelinger OR opensource_movies) AND -title:(meeting OR board OR council OR sermon) AND ' if public_domain_only else ''
    q = f'mediatype:(movies) AND {scope}({query}) AND format:(MPEG4)'
    url = (
        "https://archive.org/advancedsearch.php?"
        + urllib.parse.urlencode({
            "q": q,
            "rows": limit,
            "output": "json",
        })
        + "&fl[]=identifier&fl[]=title&fl[]=licenseurl&fl[]=runtime"
    )
    data = http_json(url)
    docs = data.get("response", {}).get("docs", [])
    results = []
    for d in docs:
        ident = d.get("identifier")
        if not ident:
            continue
        # Resolve direct MP4 download URL from metadata
        mp4_url = ""
        try:
            meta = http_json(f"https://archive.org/metadata/{ident}", timeout=12)
            files = meta.get("files") or []
            mp4s = [f for f in files if str(f.get("name", "")).lower().endswith(".mp4")]
            # Prefer reasonably sized H.264 / MPEG4
            mp4s.sort(key=lambda f: int(f.get("size") or 0))
            if mp4s:
                chosen = mp4s[len(mp4s) // 2]
                mp4_url = f"https://archive.org/download/{ident}/{urllib.parse.quote(chosen['name'])}"
        except Exception:
            pass
        lic = d.get("licenseurl") or "Public Domain / Open Archive (verify on page)"
        results.append({
            "source": "archive",
            "title": str(d.get("title", ident))[:90],
            "url": mp4_url or f"https://archive.org/details/{ident}",
            "page_url": f"https://archive.org/details/{ident}",
            "duration": str(d.get("runtime", "?")),
            "resolution": "Archival MP4",
            "rights": f"ARCHIVAL ({lic})",
        })
    return results


def search_nasa(query, limit=5):
    url = "https://images-api.nasa.gov/search?" + urllib.parse.urlencode({
        "q": query,
        "media_type": "video",
        "page_size": limit,
    })
    data = http_json(url)
    items = data.get("collection", {}).get("items", [])[:limit]
    results = []
    for it in items:
        d0 = (it.get("data") or [{}])[0]
        href = it.get("href", "")
        mp4_url = ""
        if href:
            try:
                assets = http_json(href, timeout=12)
                mp4s = [a for a in assets if isinstance(a, str) and a.lower().endswith(".mp4")]
                # Prefer ~medium or ~orig
                for pref in ("~medium.mp4", "~orig.mp4", "~mobile.mp4"):
                    matches = [a for a in mp4s if pref in a]
                    if matches:
                        mp4_url = matches[0]
                        break
                if not mp4_url and mp4s:
                    mp4_url = mp4s[0]
            except Exception:
                pass
        results.append({
            "source": "nasa",
            "title": str(d0.get("title", d0.get("nasa_id", "")))[:90],
            "url": mp4_url or f"https://images.nasa.gov/details/{d0.get('nasa_id', '')}",
            "page_url": f"https://images.nasa.gov/details/{d0.get('nasa_id', '')}",
            "duration": "?",
            "resolution": "HD/4K MP4",
            "rights": "PUBLIC DOMAIN (NASA — credit: NASA)",
        })
    return results


def search_youtube(query, limit=5, channel=None):
    if channel:
        handle = channel if channel.startswith("@") else f"@{channel}"
        target = f"https://www.youtube.com/{handle}/search?query={urllib.parse.quote(query)}"
        scope_note = f"Channel-scoped ({handle})"
    else:
        target = f"ytsearch{limit}:{query}"
        scope_note = "Open search"

    cmd = ytdlp_base_cmd() + [
        target,
        "--flat-playlist",
        "--playlist-end", str(limit * 3 if channel else limit),
        "--print", "%(title)s ||| %(duration_string)s ||| %(id)s ||| %(uploader)s",
    ]
    res = run_cmd(cmd, check=False)
    results = []
    for line in res.stdout.splitlines():
        parts = [p.strip() for p in line.split("|||")]
        if len(parts) >= 3 and parts[2] and len(parts[2]) == 11:
            vid_id = parts[2]
            uploader = parts[3] if len(parts) >= 4 else (channel or "YouTube")
            results.append({
                "source": "youtube",
                "title": parts[0][:90],
                "url": f"https://www.youtube.com/watch?v={vid_id}",
                "page_url": f"https://www.youtube.com/watch?v={vid_id}",
                "duration": parts[1],
                "resolution": "Up to 1080p/4K",
                "rights": f"UNCLEARED ({scope_note}; uploader: {uploader}) — keep 2-5s silent/transformative or verify CC",
            })
            if len(results) >= limit:
                break
    return results


def search_pexels(query, limit=5, orientation=None):
    api_key = os.environ.get("PEXELS_API_KEY", "").strip()
    if not api_key:
        return [{
            "source": "pexels",
            "title": "PEXELS_API_KEY not set (free key at https://www.pexels.com/api/)",
            "url": "",
            "duration": 0,
            "resolution": "-",
            "rights": "SETUP REQUIRED (free key)",
        }]
    params = {"query": query, "per_page": limit}
    if orientation in ("landscape", "portrait", "square"):
        params["orientation"] = orientation
    data = http_json(
        "https://api.pexels.com/videos/search?" + urllib.parse.urlencode(params),
        headers={"Authorization": api_key},
    )
    results = []
    for v in data.get("videos", []):
        files = sorted(
            [f for f in v.get("video_files", []) if f.get("file_type") == "video/mp4"],
            key=lambda f: abs((f.get("height") or 0) - 1080),
        )
        best = files[0] if files else {}
        user = (v.get("user") or {}).get("name", "Pexels")
        results.append({
            "source": "pexels",
            "title": f"Pexels #{v.get('id')} by {user}",
            "url": best.get("link", ""),
            "page_url": v.get("url", ""),
            "duration": v.get("duration", 0),
            "resolution": f"{best.get('width', '?')}x{best.get('height', '?')}",
            "rights": f"CLEARED COMMERCIAL (Pexels License — credit: {user})",
        })
    return results


def search_pixabay(query, limit=5):
    api_key = os.environ.get("PIXABAY_API_KEY", "").strip()
    if not api_key:
        return [{
            "source": "pixabay",
            "title": "PIXABAY_API_KEY not set (free key at https://pixabay.com/api/docs/)",
            "url": "",
            "duration": 0,
            "resolution": "-",
            "rights": "SETUP REQUIRED (free key)",
        }]
    params = urllib.parse.urlencode({"key": api_key, "q": query, "per_page": max(3, limit)})
    data = http_json(f"https://pixabay.com/api/videos/?{params}")
    results = []
    for hit in data.get("hits", [])[:limit]:
        vids = hit.get("videos") or {}
        best = vids.get("large") or vids.get("medium") or {}
        results.append({
            "source": "pixabay",
            "title": f"Pixabay #{hit.get('id')}: {hit.get('tags', '')[:60]}",
            "url": best.get("url", ""),
            "page_url": hit.get("pageURL", ""),
            "duration": hit.get("duration", 0),
            "resolution": f"{best.get('width', '?')}x{best.get('height', '?')}",
            "rights": "CLEARED COMMERCIAL (Pixabay Content License)",
        })
    return results


# -------------------- SUBCOMMANDS --------------------

def cmd_search(args):
    sources = [s.strip().lower() for s in args.source.split(",")]
    if "all-free" in sources:
        sources = ["wikimedia", "archive", "nasa", "youtube"]
    elif "cleared" in sources:
        sources = ["wikimedia", "archive", "nasa"]
        if os.environ.get("PEXELS_API_KEY"):
            sources.insert(0, "pexels")
        if os.environ.get("PIXABAY_API_KEY"):
            sources.insert(0, "pixabay")

    all_results = []
    for src in sources:
        try:
            if src == "wikimedia":
                all_results.extend(search_wikimedia(args.query, args.limit))
            elif src == "archive":
                all_results.extend(search_archive(args.query, args.limit, not args.all_archive))
            elif src == "nasa":
                all_results.extend(search_nasa(args.query, args.limit))
            elif src == "youtube":
                all_results.extend(search_youtube(args.query, args.limit, args.channel))
            elif src == "pexels":
                all_results.extend(search_pexels(args.query, args.limit, args.orientation))
            elif src == "pixabay":
                all_results.extend(search_pixabay(args.query, args.limit))
            else:
                sys.stderr.write(f"[WARN] Unknown source: {src}\n")
        except Exception as e:
            sys.stderr.write(f"[WARN] Search failed for {src}: {e}\n")

    if args.json:
        print(json.dumps(all_results, indent=2))
        return

    if not all_results:
        print("No results found.")
        return

    for idx, r in enumerate(all_results, 1):
        print(f"[{idx}] ({r['source'].upper()}) {r['title']}")
        print(f"    Duration: {r['duration']} | Res: {r['resolution']}")
        print(f"    Rights  : {r['rights']}")
        print(f"    URL     : {r['url']}")


def cmd_download(args):
    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    url = args.url

    if "youtube.com" in url or "youtu.be" in url:
        stem = str(out_path.with_suffix(""))
        cmd = ytdlp_base_cmd() + [
            "-f", "bv*[protocol=https][height<=1080][ext=mp4]/bv*[height<=1080]/b",
            "--no-playlist",
            "--merge-output-format", "mp4",
            "-o", f"{stem}.%(ext)s",
            url,
        ]
        if args.cookies_from_browser:
            cmd += ["--cookies-from-browser", args.cookies_from_browser]
        res = run_cmd(cmd, check=False)
        if res.returncode != 0:
            sys.stderr.write(res.stderr[-1200:] + "\n")
            if "403" in res.stderr:
                sys.stderr.write(
                    "[TIP] YouTube returned HTTP 403 (common on cloud/datacenter IPs without cookies).\n"
                    "      Run on your local machine or pass --cookies-from-browser chrome (or use --source cleared).\n"
                )
            sys.exit(res.returncode)
        candidates = sorted(out_path.parent.glob(f"{out_path.stem}.*"))
        final = candidates[0] if candidates else out_path
        print(f"Downloaded: {final}")
    else:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=60) as resp, open(out_path, "wb") as f:
            shutil.copyfileobj(resp, f)
        print(f"Downloaded: {out_path} ({out_path.stat().st_size // 1024} KB)")


def cmd_cut(args):
    w, h = (1080, 1920) if args.aspect == "9:16" else (1920, 1080)
    if args.size:
        w, h = map(int, args.size.lower().split("x"))

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    vf = f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1,fps={args.fps},format=yuv420p"
    cmd = [
        "ffmpeg", "-y", "-v", "error",
        "-ss", str(args.start),
        "-t", str(args.duration),
        "-i", args.input,
        "-vf", vf,
        "-c:v", "libx264", "-crf", str(args.crf), "-preset", "fast",
        "-movflags", "+faststart",
    ]
    if not args.keep_audio:
        cmd.append("-an")
    else:
        cmd += ["-c:a", "aac", "-b:a", "192k"]
    cmd.append(str(out_path))
    run_cmd(cmd)
    print(f"Cut ready ({w}x{h}, {args.duration}s, {'audio kept' if args.keep_audio else 'silent'}): {out_path}")


def cmd_contact_sheet(args):
    from PIL import Image, ImageDraw

    probe = run_cmd([
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "csv=p=0", args.input,
    ])
    duration = float(probe.stdout.strip() or 0)
    if duration <= 0:
        sys.stderr.write("[ERROR] Could not read video duration.\n")
        sys.exit(1)

    n = args.frames
    cols = args.cols
    rows = math.ceil(n / cols)
    tw, th = 420, 236

    with tempfile.TemporaryDirectory() as tmpdir:
        thumbs = []
        for i in range(n):
            ts = round((duration / (n + 1)) * (i + 1), 2)
            frame_path = Path(tmpdir) / f"f_{i:02d}.jpg"
            run_cmd([
                "ffmpeg", "-y", "-v", "error",
                "-ss", str(ts), "-i", args.input,
                "-frames:v", "1",
                "-vf", f"scale={tw}:{th}:force_original_aspect_ratio=increase,crop={tw}:{th}",
                str(frame_path),
            ])
            if frame_path.exists():
                thumbs.append((ts, Image.open(frame_path).convert("RGB")))

        sheet = Image.new("RGB", (cols * tw, rows * th), (18, 18, 22))
        draw = ImageDraw.Draw(sheet)
        for idx, (ts, im) in enumerate(thumbs):
            r, c = divmod(idx, cols)
            x, y = c * tw, r * th
            sheet.paste(im, (x, y))
            label = f"#{idx+1}  {ts:.1f}s"
            draw.rectangle([x + 8, y + 8, x + 115, y + 30], fill=(0, 0, 0))
            draw.text((x + 14, y + 13), label, fill=(255, 255, 255))

        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(out_path)
        print(f"Contact sheet ({len(thumbs)} frames, video={duration:.1f}s): {out_path}")


def cmd_zoom_still(args):
    from PIL import Image, ImageFilter

    w, h = (1080, 1920) if args.aspect == "9:16" else (1920, 1080)
    if args.size:
        w, h = map(int, args.size.lower().split("x"))

    def cover(im):
        sw, sh = im.size
        sc = max(w / sw, h / sh)
        im2 = im.resize((round(sw * sc), round(sh * sc)), Image.LANCZOS)
        x0, y0 = (im2.width - w) // 2, (im2.height - h) // 2
        return im2.crop((x0, y0, x0 + w, y0 + h))

    src = Image.open(args.input).convert("RGB")
    if args.blurfill:
        bg = cover(src).filter(ImageFilter.GaussianBlur(45))
        sc = min((w * 0.88) / src.width, (h * 0.88) / src.height)
        fg = src.resize((round(src.width * sc), round(src.height * sc)), Image.LANCZOS)
        bg.paste(fg, ((w - fg.width) // 2, (h - fg.height) // 2))
        base = bg
    else:
        base = cover(src)

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    n_frames = round(args.duration * args.fps)

    ff = subprocess.Popen([
        "ffmpeg", "-y", "-v", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24",
        "-s", f"{w}x{h}", "-r", str(args.fps), "-i", "-",
        "-an", "-c:v", "libx264", "-crf", "18", "-preset", "fast",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out_path),
    ], stdin=subprocess.PIPE)

    for f in range(n_frames):
        s = 1.0 + args.rate * (f / args.fps)
        bw, bh = w / s, h / s
        x0, y0 = (w - bw) / 2, (h - bh) / 2
        ff.stdin.write(base.resize((w, h), Image.LANCZOS, box=(x0, y0, x0 + bw, y0 + bh)).tobytes())
    ff.stdin.close()
    rc = ff.wait()
    if rc != 0:
        sys.exit(rc)
    print(f"Sub-pixel zoom still ready ({w}x{h}, {args.duration}s): {out_path}")


def cmd_composite(args):
    """
    Manifest JSON schema:
    {
      "base": "talking_head.mp4",
      "output": "final_with_broll.mp4",
      "width": 1920,
      "height": 1080,
      "fps": 30,
      "beats": [
        {"label": "b01", "start": 2.2, "end": 5.4, "source": "clips/b01.mp4", "kind": "video", "src_in": 0.0}
      ]
    }
    """
    manifest = json.loads(Path(args.manifest).read_text())
    base = manifest["base"]
    out = manifest["output"]
    w = int(manifest.get("width", 1920))
    h = int(manifest.get("height", 1080))
    fps = int(manifest.get("fps", 30))
    beats = sorted(manifest.get("beats", []), key=lambda b: float(b["start"]))

    probe = run_cmd([
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "csv=p=0", base,
    ])
    end_t = float(manifest.get("end") or probe.stdout.strip())
    vf = f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1,fps={fps},format=yuv420p"

    fmt_dir = Path(out).parent / "_fmt_beats"
    fmt_dir.mkdir(parents=True, exist_ok=True)

    prepared = []
    for b in beats:
        s, e = float(b["start"]), float(b["end"])
        dur = round(e - s, 3)
        clip_out = fmt_dir / f"{b['label']}.mp4"
        if b.get("kind", "video") == "still":
            run_cmd([
                "ffmpeg", "-y", "-v", "error", "-loop", "1", "-t", str(dur),
                "-i", b["source"], "-vf", vf, "-an",
                "-c:v", "libx264", "-crf", "18", "-preset", "fast", str(clip_out),
            ])
        else:
            run_cmd([
                "ffmpeg", "-y", "-v", "error", "-ss", str(b.get("src_in", 0.0)), "-t", str(dur),
                "-i", b["source"], "-vf", vf, "-an",
                "-c:v", "libx264", "-crf", "18", "-preset", "fast", str(clip_out),
            ])
        prepared.append((b["label"], s, e, str(clip_out)))

    inputs = ["-i", base]
    for _, _, _, cp in prepared:
        inputs += ["-i", cp]

    parts, fg, last, seg = [], [], 0.0, 0
    for i, (_, s, e, _) in enumerate(prepared):
        if s > last:
            fg.append(f"[0:v]trim=start={last}:end={s},setpts=PTS-STARTPTS,{vf}[g{seg}]")
            parts.append(f"[g{seg}]")
            seg += 1
        fg.append(f"[{i+1}:v]setpts=PTS-STARTPTS[c{i}]")
        parts.append(f"[c{i}]")
        last = e
    if last < end_t:
        fg.append(f"[0:v]trim=start={last}:end={end_t},setpts=PTS-STARTPTS,{vf}[g{seg}]")
        parts.append(f"[g{seg}]")

    fg.append("".join(parts) + f"concat=n={len(parts)}:v=1:a=0[v]")
    fg.append(f"[0:a]atrim=start=0:end={end_t},asetpts=PTS-STARTPTS[a]")

    Path(out).parent.mkdir(parents=True, exist_ok=True)
    run_cmd([
        "ffmpeg", "-y", "-v", "error", *inputs,
        "-filter_complex", ";".join(fg),
        "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-crf", "18", "-preset", "fast",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out,
    ])
    print(f"Composited {len(prepared)} B-roll beats -> {out}")


def main():
    p = argparse.ArgumentParser(description="Free B-Roll Finder & Cutter CLI")
    sub = p.add_subparsers(dest="cmd", required=True)

    ps = sub.add_parser("search", help="Search free B-roll sources")
    ps.add_argument("query", help="Visual search query")
    ps.add_argument("-s", "--source", default="all-free",
                    help="Comma-separated: all-free, cleared, wikimedia, archive, nasa, youtube, pexels, pixabay")
    ps.add_argument("-l", "--limit", type=int, default=4, help="Results per source")
    ps.add_argument("--channel", help="Scope YouTube search to a specific @handle")
    ps.add_argument("--orientation", choices=["landscape", "portrait", "square"], help="Orientation filter (Pexels)")
    ps.add_argument("--all-archive", action="store_true", help="Search all Internet Archive movies (not just Prelinger/open-source)")
    ps.add_argument("--json", action="store_true", help="Output raw JSON")
    ps.set_defaults(func=cmd_search)

    pd = sub.add_parser("download", help="Download a candidate clip")
    pd.add_argument("url", help="Video URL (YouTube or direct MP4/WebM)")
    pd.add_argument("-o", "--output", required=True, help="Output file path")
    pd.add_argument("--cookies-from-browser", help="Optional browser name for yt-dlp (chrome/firefox/safari)")
    pd.set_defaults(func=cmd_download)

    pc = sub.add_parser("cut", help="Cut full-bleed silent clip for editing")
    pc.add_argument("input", help="Input video file")
    pc.add_argument("-o", "--output", required=True, help="Output MP4 path")
    pc.add_argument("--start", type=float, default=0.0, help="Start time in seconds")
    pc.add_argument("--duration", type=float, default=4.0, help="Clip duration in seconds")
    pc.add_argument("--aspect", choices=["16:9", "9:16"], default="16:9", help="Output aspect ratio")
    pc.add_argument("--size", help="Optional explicit WxH override")
    pc.add_argument("--fps", type=int, default=30)
    pc.add_argument("--crf", type=int, default=18)
    pc.add_argument("--keep-audio", action="store_true", help="Keep clip audio (default strips audio)")
    pc.set_defaults(func=cmd_cut)

    pcs = sub.add_parser("contact-sheet", help="Generate labeled timestamp contact sheet PNG")
    pcs.add_argument("input", help="Input video file")
    pcs.add_argument("-o", "--output", required=True, help="Output PNG path")
    pcs.add_argument("--frames", type=int, default=9, help="Number of frames to sample")
    pcs.add_argument("--cols", type=int, default=3, help="Grid columns")
    pcs.set_defaults(func=cmd_contact_sheet)

    pz = sub.add_parser("zoom-still", help="Sub-pixel subtle Ken Burns zoom (no shaky ffmpeg zoompan)")
    pz.add_argument("input", help="Input image (PNG/JPG)")
    pz.add_argument("-o", "--output", required=True, help="Output MP4 path")
    pz.add_argument("--duration", type=float, default=3.5, help="Duration in seconds")
    pz.add_argument("--rate", type=float, default=0.015, help="Zoom rate per second (default 1.5%/s)")
    pz.add_argument("--fps", type=int, default=30)
    pz.add_argument("--aspect", choices=["16:9", "9:16"], default="16:9")
    pz.add_argument("--size", help="Optional explicit WxH")
    pz.add_argument("--blurfill", action="store_true", help="Blurred background fill for vertical/screenshot stills")
    pz.set_defaults(func=cmd_zoom_still)

    pcomp = sub.add_parser("composite", help="Splice B-roll cutaways over talking-head via JSON manifest")
    pcomp.add_argument("manifest", help="Path to JSON manifest")
    pcomp.set_defaults(func=cmd_composite)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
