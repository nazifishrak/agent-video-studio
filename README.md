# Agent Video Studio

An open-source, MIT-licensed, local-first desktop **Video Editor & Content Planner** built for human + AI coding agent collaboration (`Claude Code`, `Antigravity`, `Codex`, `Cursor`) via plain Markdown/JSON files, a local stdio **MCP server**, and an integrated GPU-accelerated **Terminal**.

## Key Features
- **2-Workspace Studio UI (`Planner` + `Editor`):**
  - **Planner:** Markdown scripts, frontmatter status pipeline, interactive shot lists, production cues, and linked project launch.
  - **Editor:** Multi-track timeline (`Shots`, `B-Roll`, `Motion Plates`, `Captions`, `Audio`), live `PreviewCanvas`, in-Editor **Motion** (60 HTML/CSS/JS scenes) and **Brand** (`DESIGN.md` token contract) panels, timestamped **Review Notes**, and built-in **FFmpeg + Electron Export** with 12-frame contact-sheet verification.
- **Bundled Skills & Runtime Agent Harness:**
  - Ships read-only video skills (`ai-video-editor`, `nazif-motion-scene-library`, `b-roll-finder`, and playbooks) inside `resources/` while keeping all user ideas, projects, brand kits, and custom scenes isolated in the active **Vault**.
  - Automatically generates `CLAUDE.md`, `AGENTS.md`, `.mcp.json`, and `.agents/skills`, `.claude/skills`, `.gemini/skills` symlinks in the runtime harness workspace.
- **Native PTY + WebGL Terminal:**
  - Lightweight C `forkpty()` helper (`native/pty-helper.c`) + `@xterm/addon-webgl` + `@xterm/addon-unicode11` + 1-click External Terminal launch (`Ghostty`, `Alacritty`, `iTerm`, `Warp`, `Terminal.app`).
- **Transactional Undo (Borumi Pattern):**
  - Every MCP or UI timeline edit snapshots state to `.history/commits/` for 1-click **Undo Pass**.

## Quick Start

```bash
npm install
npm run start
```

### Development & Verification

```bash
npm run dev          # Vite HMR + Electron
npm run typecheck    # TypeScript check (main + renderer)
npm run build        # Compile main, native pty-helper, and renderer
npm run test:smoke   # Run vault, asset server, exporter, and MCP smoke tests
```

## Architecture
See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full technical design, IPC/MCP contract, and vault layout.
