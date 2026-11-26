import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

export interface HarnessOptions {
  harnessDir: string;
  resourcesDir: string;
  vaultRoot: string;
  mcpServerScript: string;
}

export interface HarnessInfo {
  harnessDir: string;
  resourcesDir: string;
  vaultRoot: string;
  mcpConfigPath: string;
}

export function getAppResourcesDir(): string {
  const packagedResources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (packagedResources) {
    const prodCandidate = path.join(packagedResources, 'resources');
    if (fsSync.existsSync(path.join(prodCandidate, 'skills'))) {
      return prodCandidate;
    }
    if (fsSync.existsSync(path.join(packagedResources, 'skills'))) {
      return packagedResources;
    }
  }
  return path.resolve(__dirname, '..', '..', 'resources');
}

async function ensureSymlink(linkPath: string, targetPath: string): Promise<void> {
  try {
    const stat = await fs.lstat(linkPath);
    if (stat.isSymbolicLink() || stat.isFile() || stat.isDirectory()) {
      await fs.rm(linkPath, { recursive: true, force: true });
    }
  } catch {
    // Does not exist yet
  }
  await fs.symlink(targetPath, linkPath, 'dir');
}

function buildAgentInstructions(opts: HarnessOptions): string {
  return `# Agent Video Studio — Runtime Agent Harness

You are operating inside the **Agent Video Studio** runtime workspace.

## Critical Boundary: App Skills vs. User Vault

1. **App-Shipped Skills & Playbooks (READ-ONLY — NEVER MODIFY):**
   - \`./skills/\` (\`${path.join(opts.resourcesDir, 'skills')}\`):
     - \`ai-video-editor/\` — declarative \`edit-plan.json\` craft rules, camera easing, LUTs, SFX, audio mastering
     - \`nazif-motion-scene-library/\` — 60 built-in HTML/CSS/JS motion scenes + \`motion-engine.js\`
     - \`b-roll-finder/\` — free B-roll sourcing, rights tagging (\`CLEARED\` vs \`UNCLEARED_REFERENCE\`), contact sheets
   - \`./playbooks/\` (\`${path.join(opts.resourcesDir, 'playbooks')}\`) — anti-slop scriptwriting, voice/engagement, filming guides

2. **User Vault (READ / WRITE TARGET FOR ALL USER DATA):**
   - \`./vault/\` -> \`${opts.vaultRoot}\`
   - **ALL user-specific assets MUST be created or updated inside \`./vault/\` (or via the connected \`agent-video-studio\` MCP tools):**
     - Video Ideas & Scripts: \`./vault/ideas/\` (or \`./vault/03-video-ideas/\`)
     - Video Projects, Timelines, Media & Exports: \`./vault/projects/<slug>/\` (or \`./vault/04-projects/<slug>/\`)
     - User Custom Brand Kits: \`./vault/brand-kits/\`
     - User/Agent Custom Motion Scenes: \`./vault/custom-scenes/\`

## Mandatory Video Craft Guardrails (Read Before Editing/Rendering)
- **Read \`./skills/ai-video-editor/SKILL.md\` and \`./skills/ai-video-editor/EDIT_STYLE.md\` BEFORE writing any video build or render script.**
- **NEVER use \`ffmpeg zoompan\`** on video clips (whole-pixel rounding causes 1px shake/wobble).
- **NEVER add fake zoom/pan to moving, handheld, gimbal, or drone footage** (DJI/Sony/iPhone) — use single-pass Lanczos \`scale+crop\` (\`flags=lanczos,setsar=1\`) and trim \`>= 0.4s\` off clip heads/tails (\`safe_in\`/\`safe_out\`).
- **ALWAYS probe source clips first** with \`python3 ./skills/ai-video-editor/scripts/probe_clips.py <dir>\` to match \`recommended_fps\` (never blindly force \`-r 30\` onto 24/25fps clips) and check whether \`vidstab\` or \`deshake\` is supported locally.
- **ALWAYS visually inspect a multi-frame contact sheet** (12+ frames across start, middle, and end — never just 2 frames) before declaring a render complete.

## Registering Rendered Videos for the Studio Editor UI
- Whenever you assemble or render a video in \`./vault/projects/<slug>/\`, always populate \`project.json\` and \`edit-plan.json\` via MCP so the Studio Editor opens with full shot boundaries, captions, and overlays:
  - Call \`create_project_from_idea\` (or \`register_media\` + \`begin_project_edit\` -> \`apply_timeline_ops\` -> \`commit_project_edit\` using \`set_shots\`, \`add_motion_plate\`, \`add_caption\`, \`set_source_video\`).
  - Use \`list_review_notes\` to read timestamped feedback pinned by the creator in the Studio UI, \`inspect_timeline\` to visually verify a 12-frame contact sheet, and \`export_video\` to render the final MP4.

## Preferred Workflow (Live UI Sync + Atomic Undo)
- The **\`agent-video-studio\` MCP server** is pre-configured in \`.mcp.json\` targeting \`${opts.vaultRoot}\`.
- Whenever editing a project timeline, prefer transactional MCP tools so the desktop app hot-reloads and preserves 1-click Undo:
  1. \`get_vault_overview\` / \`list_ideas\` / \`list_projects\`
  2. \`search_motion_scenes\` (browse the 60 bundled + custom scenes)
  3. \`begin_project_edit\` -> \`apply_timeline_ops\` -> \`commit_project_edit\` (or \`abort_project_edit\`)
  4. \`create_custom_motion_scene\` (automatically writes to \`./vault/custom-scenes/\` without touching app resources)
  5. \`update_brand_tokens\` (updates \`DESIGN.md\` for both motion scenes and captions)
`;
}

export async function prepareAgentHarness(opts: HarnessOptions): Promise<HarnessInfo> {
  const harnessDir = path.resolve(opts.harnessDir);
  const resourcesDir = path.resolve(opts.resourcesDir);
  const vaultRoot = path.resolve(opts.vaultRoot);

  await fs.mkdir(harnessDir, { recursive: true });

  const skillsSrc = path.join(resourcesDir, 'skills');
  const playbooksSrc = path.join(resourcesDir, 'playbooks');

  if (fsSync.existsSync(skillsSrc)) {
    await ensureSymlink(path.join(harnessDir, 'skills'), skillsSrc);
    // Standard CLI agent auto-discovery paths (.agents/skills, .claude/skills, .gemini/skills)
    for (const agentDir of ['.agents', '.claude', '.gemini']) {
      await fs.mkdir(path.join(harnessDir, agentDir), { recursive: true });
      await ensureSymlink(path.join(harnessDir, agentDir, 'skills'), skillsSrc);
    }
  }
  if (fsSync.existsSync(playbooksSrc)) {
    await ensureSymlink(path.join(harnessDir, 'playbooks'), playbooksSrc);
  }
  if (fsSync.existsSync(vaultRoot)) {
    await ensureSymlink(path.join(harnessDir, 'vault'), vaultRoot);
  }

  const mcpConfigPath = path.join(harnessDir, '.mcp.json');
  const mcpConfig = {
    mcpServers: {
      'agent-video-studio': {
        command: 'node',
        args: [opts.mcpServerScript, '--vault', vaultRoot],
      },
    },
  };
  await fs.writeFile(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), 'utf8');

  const instructions = buildAgentInstructions(opts);
  await Promise.all([
    fs.writeFile(path.join(harnessDir, 'CLAUDE.md'), instructions, 'utf8'),
    fs.writeFile(path.join(harnessDir, 'AGENTS.md'), instructions, 'utf8'),
  ]);

  return {
    harnessDir,
    resourcesDir,
    vaultRoot,
    mcpConfigPath,
  };
}
