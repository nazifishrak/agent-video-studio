# Agent Video Studio — Product & Architecture Specification

**Status:** Phase 1 Foundation  
**License:** MIT  
**Runtime:** Electron (Chromium + Node.js) + React + TypeScript + Vite + Tailwind CSS v4  

---

## 1. Product Vision & Competitive Positioning

**Agent Video Studio** is a local-first, open-source desktop video editor and content planner engineered so **humans and AI coding agents** (Claude Code, Antigravity, Codex, Cursor) collaborate on the exact same live video project without vendor lock-in.

It combines four proven ideas into one unified desktop studio:
1. **Borumi's Agent-First Transactional MCP Bridge:** An embedded local stdio MCP server (`dist/mcp/server.js`) exposes structured timeline, transcript, scene-library, and brand-token tools wrapped in explicit transactions (`begin_project_edit` → `apply_timeline_ops` → `commit_project_edit` / `abort_project_edit`) with atomic `.history/` snapshots and 1-click Undo.
2. **Descript's Transcript-First Editing (with Word-ID Anchoring):** A word-level interactive transcript (`transcript.json`) sits beside the video preview. Every word has a stable `wordId`. Overlays, motion plates, B-roll cutaways, and camera moves can anchor to a `wordId + offsetSec`, so cutting or deleting sentences in the transcript never causes downstream overlays to drift out of sync.
3. **CapCut's Visual Preview Ergonomics:** Instant live previews of all 60+ HTML/CSS motion scenes, captions, and brand tokens in the active project's fonts and colors, with auto-generated live props editors—never guessing what a template looks like from raw JSON.
4. **Obsidian's Local-First Vault Architecture:** Plain Markdown ideas, isolated per-project folders, and shared reusable libraries live on disk in a user-chosen folder, 100% readable by Git, Obsidian, and any external AI agent.

---

## 2. Vault Directory Layout

The app supports both **new Starter Vaults** and **existing creator vaults** (such as `video-knowledge-base/`) automatically:

```text
<vault-root>/
├── ideas/  (or 03-video-ideas/)        # Lightweight Markdown + YAML frontmatter (NO heavy video)
│   └── 01-swe-career-visibility.md
├── projects/ (or 04-projects/)         # Created when an Idea is promoted to a Video Project
│   └── 2026-11-swe-career-visibility/
│       ├── project.json                # Links back to ideaId, aspectRatio, fps, brandKitId, status
│       ├── edit-plan.json              # Single source of truth for timeline (EditPlanV2)
│       ├── transcript.json             # Word-level timestamps + stable wordIds + retake flags
│       ├── brand/
│       │   └── DESIGN.md               # Project-specific Brand Kit override
│       ├── media/                      # Raw A-roll, 720p proxies, B-roll cuts, SFX, music
│       ├── exports/                    # Preview & master MP4s + verification contact sheets
│       └── .history/                   # Transactional active drafts & atomic commit snapshots
│           ├── active-tx/
│           └── commits/
├── library/ (or skills/)               # Shared across ALL projects in the vault
│   ├── motion-scenes/                  # 60+ decoupled HTML/CSS/JS scenes + catalog/scenes.json
│   ├── brand-kits/                     # Preset DESIGN.md themes (apple-light, linear-dark, etc.)
│   ├── luts/                           # .cube film LUTs
│   └── sfx/                            # Micro-SFX pack
├── templates/ (or 02-templates/)       # Long-form & short-form Markdown blueprints
└── strategy/ (or 00-strategy/)         # Channel positioning & roadmap docs
```

---

## 3. Core Data Schemas (Zod-Validated)

All shared schemas live in `src/shared/schemas.ts`:

- **`IdeaRecord` (`ideas/*.md`):** YAML frontmatter (`title`, `pillar`, `format`, `status`, `target_length`, `intro_formula`, `repurpose_short`, `tags`) + Markdown script body. Parses `- [ ]` / `- [x]` B-roll checklists and `[VISUAL]`, `[B-ROLL CUE]`, `[DELIVERY CUE]` tags.
- **`ProjectManifest` (`project.json`):** `id`, `slug`, `title`, `ideaId?`, `aspectRatio` (`16:9` | `9:16`), `fps`, `brandKitId`, `status`, `createdAt`, `updatedAt`.
- **`EditPlanV2` (`edit-plan.json`):** Extends the `EditPlan` contract (`cuts`, `droppedRetakes`, `cameraMoves`, `broll`, `callouts`, `colorGrade`, `audio`) with:
  - `motionPlates[]`: references `sceneId`, `start`, `end`, optional `wordAnchor: { wordId, offsetSec }`, `props`, `transparent`, `themeOverride?`.
  - `captions[]`: first-class subtitle segments (`text`, `start`, `end`, optional `wordAnchor`, `words[]`).
  - `brandKit`: active `BrandTokens` snapshot or preset ID.
- **`TranscriptDoc` (`transcript.json`):** Array of `WordToken` (`id`, `text`, `start`, `end`, `confidence?`, `isFiller?`, `deleted?`).
- **`BrandTokens` (`DESIGN.md`):** All 27 CSS variables consumed by `motion-engine.js` (`display_font`, `body_font`, `stage_bg`, `accent_primary`, `radius_card`, `aurora_opacity`, etc.) plus **Caption Tokens** (`caption_font`, `caption_weight`, `caption_size`, `caption_style`, `caption_color`, `caption_highlight_color`, `caption_bg`, `caption_position`).

---

## 4. Dual-Mode Agent Bridge

1. **External Agents via Local Stdio MCP (`dist/mcp/server.js`):**
   - Shares the exact same `vault.ts` core as Electron Main.
   - Tools: `get_vault_overview`, `list_ideas`, `read_idea`, `create_idea`, `update_idea`, `list_projects`, `create_project_from_idea`, `get_project_state`, `list_motion_scenes`, `search_motion_scenes`, `create_custom_motion_scene`, `get_brand_tokens`, `update_brand_tokens`, `begin_project_edit`, `apply_timeline_ops`, `commit_project_edit`, `abort_project_edit`, `undo_last_project_edit`.
   - File watcher (`chokidar`) in Electron Main detects commits or direct file edits and hot-reloads the UI within ~150ms.
2. **Embedded Agent Drawer:**
   - Users can pin **Context Chips** (e.g., active project, selected playhead range, customized motion scene + props, active Brand Kit) from anywhere in the UI.
   - Runs locally installed CLIs (`claude`, `codex`, `gemini`, or `zsh`) via `child_process.spawn` inside the vault directory, or copies a structured prompt for any external chat.

---

## 5. UI Design System (Electric Lime Brand Palette + Google Sans Flex)

The desktop studio UI implements the **Electric Lime Brand Palette** with **Google Sans Flex** as the sole font family across every view:
- **Studio Dark (Default) & Editorial Light:** Obsidian `#090B0A` / `#141816` / `#1E2421` in dark mode and Chalk `#F6F9F4` / `#FFFFFF` / `#EBF1E7` in light mode, with flat, zero-glow Volt Lime `#C4FF2E` primary CTAs (`#141A13` with `#C4FF2E` ink on light) and a diagonal `.hero-mesh-ribbon` gradient (`#C4FF2E` → `#00D4AA` → `#2E6BFF`).
- **Timeline Track Mapping:** Volt Lime (`#C4FF2E`) for the playhead needle & A-Roll track, Electric Blue (`#2E6BFF` / `#2458E6`) for B-Roll / Motion Plates / Captions, and Mint Wave (`#00D4AA` / `#00A887`) for Audio & SFX.
- **Typography:** Strictly `Google Sans Flex` (`opsz,wght@6..144,1..1000`) across all UI labels, eyebrows, headings, rendered Markdown, and `tabular-nums` timecodes.

---

## 6. Live Chromium Preview & Zero-Python Media Engine

- **Local HTTP Range & Scene Server (`src/main/server.ts`):** Binds to `127.0.0.1` on an ephemeral port. Serves `/scenes/*` (preventing `file://` iframe origin blocks) and streams `/project-media/:slug/*` with HTTP `206 Partial Content` range support for instant `<video>` scrubbing.
- **Motion Engine Sync:** Each active motion plate renders in a Chromium `<iframe>` with `?manual=1` and receives `{ type: 'SET_TOKENS', tokens }`, `{ type: 'SET_PROPS', props }`, and `{ type: 'SEEK', t }` via `postMessage`.
- **MIT/Apache-Clean Licensing:** Zero Remotion commercial license dependency; zero Python runtime required for core app.

---

## 6. Phased Roadmap

- **Phase 1 (Implemented Now):** Electron + React + Vite + Tailwind v4 shell; Onboarding & Starter Vault generator; Ideas Planner (Kanban + Script/Checklist editor + Promote to Project); 60-Scene Live Motion Library with auto-generated Props form; Visual Brand Kit (`DESIGN.md`) editor controlling both Motion Scenes and Captions; Editor Preview Canvas + Multi-Track Timeline + Interactive Transcript foundation; Local HTTP server; File watcher; Transactional `.history/` Undo; Standalone stdio MCP Server; Embedded Agent Drawer + MCP Connect modal.
- **Phase 2 (Media & Export):** Bundled FFmpeg binary for automatic 720p proxy generation, audio waveform extraction, `-14 LUFS` sidechain-ducked mastering, and 4K export; local `whisper.cpp` auto-transcription (with optional Groq/OpenAI Whisper API toggle); integrated free B-roll search & contact-sheet viewer.
- **Phase 3 (Visual Agent Inspection & Advanced NLE):** `inspect_timeline` MCP tool returning rendered frame PNGs/contact sheets to agents for visual self-verification; drag-to-trim/split/ripple-delete timeline interactions; custom scene visual code editor.
- **Phase 4 (Distribution & V2 Capture):** Signed macOS `.dmg` / Windows / Linux installers via `electron-builder`; optional Screen + Camera Recorder + Teleprompter fed directly from Idea scripts.
