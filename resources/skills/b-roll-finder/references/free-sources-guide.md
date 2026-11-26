# Free B-Roll Sources & Monetization Rights Guide

Every automated source integrated into `scripts/broll_cli.py` was tested live. Here is how they compare, what works out of the box with zero API keys, and how to stay safe from YouTube Content ID claims.

---

## 1. Tested Automated Sources (Built Into `broll_cli.py`)

| Source | CLI Flag | API Key? | Best For | Monetization / Rights |
| :--- | :--- | :--- | :--- | :--- |
| **Wikimedia Commons** | `--source wikimedia` | **None ($0)** | Real cities, streets, transit, architecture, world locations (up to 1440p/4K WebM/MP4) | **CLEARED** (Public Domain / CC-BY / CC0 — check printed license & add credit in description) |
| **Internet Archive** | `--source archive` | **None ($0)** | Vintage computing, retro offices, mid-century Americana, documentary & archival film (Prelinger / Open Source Movies) | **CLEARED / ARCHIVAL** (Mostly Public Domain / CC — verify `licenseurl` printed by CLI) |
| **NASA Video Library** | `--source nasa` | **None ($0)** | Crisp HD/4K Earth views, space, rockets, high-scale visual metaphors | **CLEARED** (US Gov Public Domain — credit `NASA`) |
| **YouTube (`yt-dlp`)** | `--source youtube` | **None ($0)** | Official product demos, keynotes, named tech leaders, specific film clips (use `--channel @handle`) | **UNCLEARED** (Keep 2–5s, silent `-an`, transformative commentary only — or verify CC license) |
| **Pexels Video API** | `--source pexels` | Free key (`PEXELS_API_KEY`) | Clean modern 4K lifestyle, cafés, coding, finance, city b-roll | **CLEARED COMMERCIAL** (Pexels License — zero Content ID risk) |
| **Pixabay Video API** | `--source pixabay` | Free key (`PIXABAY_API_KEY`) | Clean modern 4K stock & abstract backgrounds | **CLEARED COMMERCIAL** (Pixabay Content License — zero Content ID risk) |

---

## 2. Optional 2-Minute Upgrade for Modern 4K Lifestyle B-Roll (100% Free)

Wikimedia, Internet Archive, and NASA require **zero setup**, but for crisp modern 4K shots of *coffee shops, laptops, city walks, credit cards, and apartments* with zero copyright risk, grab a free API key from Pexels:

1. Create a free account at `https://www.pexels.com/api/` (instant approval, 200 requests/hour free).
2. Export it in your shell (or repo `.env`):
   ```bash
   export PEXELS_API_KEY="your_free_key_here"
   ```
3. Now `--source cleared` automatically includes Pexels 4K results first!

---

## 3. Finding Specific Movie Scenes by Visual Concept (Free Hybrid Workflow)

Most movie quote sites (`Clip.Cafe`, `Yarn`, `PlayPhrase.me`) search **spoken dialogue**, not visuals. To find a specific *visual* movie shot (e.g., *"university lecture hall"* or *"programmer coding in dark room"*):

1. Search the visual concept on **[Flim.ai](https://flim.ai/)** or **[Frame Set](https://frameset.app/search)** (free tiers let you browse and identify the film + scene).
2. Note the film title + scene name, then pull the clip cleanly via `broll_cli.py`:
   ```bash
   python3 scripts/broll_cli.py search "<Film Title> <scene description> scene HD" --source youtube --limit 3
   python3 scripts/broll_cli.py download "<URL>" -o assets/raw/scene.mp4
   python3 scripts/broll_cli.py contact-sheet assets/raw/scene.mp4 -o assets/sheets/scene.png
   python3 scripts/broll_cli.py cut assets/raw/scene.mp4 -o assets/cuts/scene_3s.mp4 --start 14.0 --duration 3.0
   ```
3. **Monetization safety:** Hollywood clips are **not cleared** — keep them **2–4 seconds**, always **silent (`-an`)**, and directly tied to your commentary. When in doubt for a sponsored/monetized video, swap to `cleared` (`pexels` / `wikimedia` / `archive`) or your own Sunday Outdoor B-Roll Bank.

---

## 4. Copying This Skill Into Another Repo

Simply copy the entire `skills/b-roll-finder/` directory into any other project (e.g., `.agent/skills/b-roll-finder/` or `skills/b-roll-finder/`) and run:

```bash
bash skills/b-roll-finder/scripts/setup.sh
```

Then edit `TASTE.md` if that project uses a different channel voice or set of trusted YouTube channels.
