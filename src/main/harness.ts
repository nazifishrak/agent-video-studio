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

1. **App-Shipped Skills & Playbooks (READ-ONLY — NEVER MODIFY OR COPY INTO PROJECTS):**
   - \`./skills/\` (\`${path.join(opts.resourcesDir, 'skills')}\`, also linked at \`.agents/skills/\`, \`.claude/skills/\`, \`.gemini/skills/\`):
     - \`ai-video-editor/\` — declarative \`edit-plan.json\` craft rules, zero-shake montage workflow, \`probe_clips.py\`, \`bootstrap_env.mjs\`
     - \`nazif-motion-scene-library/\` — 60 built-in HTML/CSS/JS motion scenes + \`motion-engine.js\`
     - \`b-roll-finder/\` — free B-roll sourcing, rights tagging (\`CLEARED\` vs \`UNCLEARED_REFERENCE\`), contact sheets
     - \`hyperframes/\`, \`hyperframes-core/\`, \`hyperframes-animation/\`, \`hyperframes-cli/\`, \`faceless-explainer/\`, \`product-launch-video/\`, \`motion-graphics/\` — HTML-to-video motion engine
   - \`./playbooks/\` (\`${path.join(opts.resourcesDir, 'playbooks')}\`) — anti-slop scriptwriting, voice/engagement, filming guides

## First-Time Environment Check
- Before building or rendering, run \`check_environment\` via MCP (or \`node ./skills/ai-video-editor/scripts/bootstrap_env.mjs --check\`) to verify \`ffmpeg\`, \`ffprobe\`, \`hyperframes\`, and local filters (\`has_vidstab\`, \`has_deshake\`, \`has_videotoolbox\`).
- If \`hyperframes\` is needed and not installed globally, run \`node ./skills/ai-video-editor/scripts/bootstrap_env.mjs --install-hyperframes\` (or \`npx -y hyperframes\`).

## 2-Path Tool Routing Contract (Keep Studio Editable!)
1. **Footage / Vlog / Montage / Talking-Head Edits:**
   - Always build directly on the Studio Timeline via MCP: \`probe_media\` -> \`register_media\` -> \`begin_project_edit\` -> \`apply_timeline_ops\` (\`set_shots\`, \`add_motion_plate\`, \`add_caption\`, \`update_audio\`) -> \`commit_project_edit\` -> \`inspect_timeline\` -> \`export_video\` (\`preview-720p\`, \`master-1080p\`, \`master-4k\`, or \`custom\`).
   - **NEVER copy \`./skills/nazif-motion-scene-library/\` into a project folder** or install Playwright per project — Studio's built-in exporter renders \`motionPlates[]\` natively!
2. **HTML-First Motion Graphics / Launch Films / Explainers:**
   - Read \`./skills/hyperframes/SKILL.md\` and \`./skills/hyperframes-core/SKILL.md\`, build inside \`./vault/projects/<slug>/hyperframes/\` with \`npx hyperframes init\` -> \`check\` -> \`snapshot\` -> \`render\`, and register the rendered MP4 into the Studio project via \`register_media\` + \`set_source_video\`.

2. **User Vault (READ / WRITE TARGET FOR ALL USER DATA):**
   - \`./vault/\` -> \`${opts.vaultRoot}\`
   - **ALL user-specific assets MUST be created or updated inside \`./vault/\` (or via the connected \`agent-video-studio\` MCP tools):**
     - Video Ideas & Scripts: \`./vault/ideas/\` (or \`./vault/03-video-ideas/\`)
     - Video Projects, Timelines, Media & Exports: \`./vault/projects/<slug>/\` (or \`./vault/04-projects/<slug>/\`)
     - User Custom Brand Kits: \`./vault/brand-kits/\`
     - User/Agent Custom Motion Scenes: \`./vault/custom-scenes/\`

## Live Viewer Context Sync (In-App & External Terminals)
- **Always inspect what the user is currently viewing first:** Call \`get_active_studio_context\` via MCP (or read \`./studio-context.json\` / \`./vault/.studio-live-context.json\`) to get the active project slug, open tab (\`planner\`/\`editor\`), live playhead timestamp (\`playheadSec\`), selected timeline item, and pinned context chips.
- **Automatic Live Preview Sync:** Every \`commit_project_edit\`, \`update_brand_tokens\`, \`register_media\`, and \`set_transcript\` automatically notifies the open desktop Studio UI so the stage preview, timeline tracks, and brand tokens hot-reload immediately.
- **Focus & Seek the Viewer:** When creating a new project or editing a specific moment, call \`focus_studio_view\` (\`projectSlug\`, \`tab: 'editor'\`, \`playheadSec\`) so the user's preview jumps straight to your update.

## Mandatory Video Craft & Approved Looks Guardrails (Read Before Editing/Rendering)
- **Read \`./skills/ai-video-editor/SKILL.md\`, \`./skills/ai-video-editor/EDIT_STYLE.md\`, and \`./skills/ai-video-editor/references/APPROVED_LOOKS.md\` BEFORE writing any video build or render script.**
- **Approved Looks & Sleek Typography Only:** Use the 4 approved caption variants (\`cinema-clean\`, \`vlog-minimal\`, \`editorial-glass\`, \`editorial-serif\`) with Apple SF Pro / Inter / Instrument Serif typography and approved motion scenes matching the active Brand Kit. **NEVER** use \`#60A5FA\` blue caption highlights, heavy dark-navy caption boxes, or \`Google Sans Flex\`.
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
