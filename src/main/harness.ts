import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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
     - \`nazif-motion-scene-library/\` — 59 built-in HTML/CSS/JS motion scenes + \`motion-engine.js\`
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
- **Always inspect what the user is currently viewing first:** Call \`get_active_studio_context\` via MCP (or run \`node ./studio-cli.mjs context\` / read \`./studio-context.json\`) to get the active project slug, open tab (\`planner\`/\`editor\`), live playhead timestamp (\`playheadSec\`), selected timeline item, and pinned context chips.
- **Automatic Live Preview Sync:** Every \`commit_project_edit\`, \`update_brand_tokens\`, \`register_media\`, and \`set_transcript\` automatically notifies the open desktop Studio UI so the stage preview, timeline tracks, and brand tokens hot-reload immediately.
- **Zero-Config Fallback when MCP Tools Are Disconnected:** If the \`agent-video-studio\` MCP tools are not connected in your current agent session, **NEVER edit \`edit-plan.json\` raw or tell the user you couldn't register a clip**. Immediately use \`./studio-cli.mjs\` in this workspace — it uses the exact same transactional engine and live UI sync:
  - \`node ./studio-cli.mjs context\`
  - \`node ./studio-cli.mjs plan [--project <slug>] [--idea <slug>]\`
  - \`node ./studio-cli.mjs register-media <file1> [file2...] [--project <slug>] [--set-source]\`
  - \`node ./studio-cli.mjs apply-ops '<json-array-or-file>' [--project <slug>] [--summary "..."]\`
  - \`node ./studio-cli.mjs focus [--project <slug>] [--idea <slug>] [--tab edit|plan] [--playhead <sec>]\`
  - \`node ./studio-cli.mjs update-brand '<json-patch>' [--project <slug>]\`
- **Focus & Seek the Viewer:** When creating a new project or editing a specific moment, call \`focus_studio_view\` (or \`node ./studio-cli.mjs focus --tab edit --playhead <sec>\`) so the user's preview jumps straight to your update.

## Building Directly From a Tagged Plan (Unified Plan ↔ Edit Media Bin)
- Every video in Studio has a Markdown plan (either \`./vault/ideas/<slug>.md\` / \`./vault/03-video-ideas/<slug>.md\` or \`./vault/projects/<slug>/plan.md\`) that can hold a frontmatter \`media_pool\` array (link-only local paths, roles \`A-Roll\` / \`B-Roll\` / \`Music\` / \`SFX\` / \`Reference\` / \`Asset\`, durations, and user notes) plus inline \`[MEDIA:<id> | <role> | <label>]\` tags placed at specific beats in the Markdown script (sometimes with multiple candidate clips per beat).
- When the user asks you to build the currently open plan, call \`get_active_studio_context\` (which returns \`activeIdea\` + \`mediaPool\`) and \`read_video_plan\` (or \`list_videos\` / \`update_video_plan\`). Inspect the tagged clips with \`probe_media\`, choose the strongest cuts/options per beat, \`create_project_from_idea\` (if idea-only), \`register_media\` (always \`mode: "link"\`, never copy), build the full timeline (\`set_shots\`, \`add_broll\`, \`add_motion_plate\`, \`add_caption\`, \`update_audio\`), and call \`focus_studio_view\` so \`Edit\` opens with the finished cut.

## Look vs. Moves Design Contract (Mandatory for Every Motion Build)
1. **User's \`brand/DESIGN.md\` owns the LOOK:** colors, typography, radii, shadows, and caption variant. If a project has no \`DESIGN.md\`, fall back to an approved Brand Kit preset (\`cinema-daily-vlog\`, \`apple-keynote-clean\`, \`figma-lime\`, \`editorial-warm\`, \`linear-dark\`) or ask.
2. **\`./skills/nazif-motion-scene-library/\` owns the MOVES:** easing curves, durations, staggers, staging, and reusable scenes. Always adapt them to the user's \`DESIGN.md\` tokens — **never** copy a scene's hardcoded colors over the user's brand.

### Mandatory 5-Step Motion Build Sequence (Studio Plates & HyperFrames)
1. Read the project's \`brand/DESIGN.md\` and \`./skills/ai-video-editor/references/APPROVED_LOOKS.md\`.
2. Call \`search_motion_scenes\` (or inspect \`./skills/nazif-motion-scene-library/catalog/scenes.json\`) for the 2–3 closest scenes by use case, and read \`./skills/nazif-motion-scene-library/references/MOTION_LANGUAGE.md\`.
3. Inspect those matching scene HTMLs for easing, stagger, and staging (or reuse them directly via \`add_motion_plate\`).
4. Build or customize using the user's \`DESIGN.md\` tokens (non-blank frame-0, continuous subtle drift during holds).
5. Run \`check\` / \`snapshot\` (HyperFrames) or \`inspect_timeline\` (Studio) and verify against the \`APPROVED_LOOKS.md\` checklist before delivering.

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
  2. \`search_motion_scenes\` (browse the 59 bundled + custom scenes)
  3. \`begin_project_edit\` -> \`apply_timeline_ops\` -> \`commit_project_edit\` (or \`abort_project_edit\`)
  4. \`create_custom_motion_scene\` (automatically writes to \`./vault/custom-scenes/\` without touching app resources)
  5. \`update_brand_tokens\` (updates \`DESIGN.md\` for both motion scenes and captions)
`;
}

function buildStudioCliSource(opts: HarnessOptions): string {
  const mainDir = path.resolve(path.dirname(opts.mcpServerScript), '..', 'main');
  const vaultUrl = pathToFileURL(path.join(mainDir, 'vault.js')).href;
  const liveCtxUrl = pathToFileURL(path.join(mainDir, 'liveContextStore.js')).href;
  const tokensUrl = pathToFileURL(path.resolve(path.dirname(opts.mcpServerScript), '..', 'shared', 'designTokens.js')).href;

  return `#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import * as vault from ${JSON.stringify(vaultUrl)};
import * as live from ${JSON.stringify(liveCtxUrl)};
import { DEFAULT_BRAND_TOKENS } from ${JSON.stringify(tokensUrl)};

const VAULT_ROOT = ${JSON.stringify(path.resolve(opts.vaultRoot))};

function parseFlags(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[k] = next;
        i++;
      } else {
        flags[k] = true;
      }
    } else {
      pos.push(a);
    }
  }
  return { pos, flags };
}

function resolveSlug(explicit) {
  if (explicit && typeof explicit === 'string') return explicit.trim();
  const ctx = live.readLiveContext(VAULT_ROOT);
  if (ctx?.activeProjectSlug) return ctx.activeProjectSlug;
  throw new Error('No --project specified and no active project open in Studio.');
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { pos, flags } = parseFlags(rest);

  if (!cmd || cmd === 'help' || cmd === '--help') {
    console.log('Usage: node ./studio-cli.mjs <context|plan|register-media|apply-ops|focus|update-brand> [args]');
    return;
  }

  if (cmd === 'context') {
    const ctx = live.readLiveContext(VAULT_ROOT);
    let project = null;
    let activeIdea = null;
    if (ctx?.selectedIdeaSlug) {
      try {
        const idea = await vault.readIdea(VAULT_ROOT, ctx.selectedIdeaSlug);
        activeIdea = {
          slug: idea.slug,
          title: idea.frontmatter.title,
          status: idea.frontmatter.status,
          filePath: idea.filePath,
          mediaPoolCount: idea.frontmatter.media_pool?.length ?? 0,
          mediaPool: idea.frontmatter.media_pool ?? [],
        };
      } catch {}
    }
    if (ctx?.activeProjectSlug) {
      try {
        const st = await vault.getProjectState(VAULT_ROOT, ctx.activeProjectSlug);
        project = {
          manifest: st.manifest,
          sourceVideo: st.editPlan.sourceVideo,
          counts: {
            assets: st.editPlan.assets.length,
            shots: st.editPlan.shots.length,
            broll: st.editPlan.broll.length,
            motionPlates: st.editPlan.motionPlates.length,
            captions: st.editPlan.captions.length,
          },
        };
        if (!activeIdea && st.linkedIdea) {
          activeIdea = {
            slug: st.linkedIdea.slug,
            title: st.linkedIdea.frontmatter.title,
            status: st.linkedIdea.frontmatter.status,
            filePath: st.linkedIdea.filePath,
            mediaPoolCount: st.linkedIdea.frontmatter.media_pool?.length ?? 0,
            mediaPool: st.linkedIdea.frontmatter.media_pool ?? [],
          };
        }
      } catch {}
    }
    console.log(JSON.stringify({ vaultRoot: VAULT_ROOT, context: ctx, project, activeIdea }, null, 2));
    return;
  }

  if (cmd === 'plan') {
    const ctx = live.readLiveContext(VAULT_ROOT);
    const projSlug = flags.project ? String(flags.project).trim() : (!flags.idea ? ctx?.activeProjectSlug || '' : '');
    const ideaSlug = flags.idea ? String(flags.idea).trim() : (!projSlug ? ctx?.selectedIdeaSlug || '' : '');
    if (projSlug) {
      console.log(JSON.stringify(await vault.readProjectPlan(VAULT_ROOT, projSlug), null, 2));
      return;
    }
    if (ideaSlug) {
      console.log(JSON.stringify(await vault.readIdea(VAULT_ROOT, ideaSlug), null, 2));
      return;
    }
    throw new Error('No --project or --idea specified and no active video open in Studio.');
  }

  if (cmd === 'register-media') {
    if (pos.length === 0) throw new Error('Pass one or more media file paths.');
    const slug = resolveSlug(flags.project);
    const mode = flags.mode === 'copy' ? 'copy' : 'link';
    const res = await vault.registerMediaInProject(VAULT_ROOT, slug, pos, mode);
    if (flags['set-source'] && res.registered.length > 0) {
      const { txId } = await vault.beginProjectEdit(VAULT_ROOT, slug, {
        actor: 'agent',
        agentName: 'studio-cli',
        reason: 'Set sourceVideo from studio-cli',
      });
      await vault.applyTimelineOps(VAULT_ROOT, txId, [{ op: 'set_source_video', sourceVideo: res.registered[0].id }], slug);
      await vault.commitProjectEdit(VAULT_ROOT, txId, 'Loaded ' + (res.registered[0].label || res.registered[0].id), slug);
    }
    await live.writeUiCommand(VAULT_ROOT, {
      kind: 'project_updated',
      projectSlug: slug,
      summary: 'Registered ' + res.registered.length + ' media file(s)',
      reloadMedia: true,
    });
    console.log(JSON.stringify({ projectSlug: slug, registered: res.registered }, null, 2));
    return;
  }

  if (cmd === 'apply-ops') {
    const slug = resolveSlug(flags.project);
    const rawArg = pos[0];
    if (!rawArg) throw new Error('Pass ops JSON string or path to JSON file.');
    let rawJson = rawArg;
    if (!rawArg.trim().startsWith('[') && !rawArg.trim().startsWith('{')) {
      rawJson = await fs.readFile(path.resolve(rawArg), 'utf8');
    }
    const parsed = JSON.parse(rawJson);
    const ops = Array.isArray(parsed) ? parsed : [parsed];
    const summary = typeof flags.summary === 'string' ? flags.summary : 'Applied timeline ops via studio-cli';
    const { txId } = await vault.beginProjectEdit(VAULT_ROOT, slug, {
      actor: 'agent',
      agentName: 'studio-cli',
      reason: summary,
    });
    await vault.applyTimelineOps(VAULT_ROOT, txId, ops, slug);
    const commit = await vault.commitProjectEdit(VAULT_ROOT, txId, summary, slug);
    await live.writeUiCommand(VAULT_ROOT, {
      kind: 'project_updated',
      projectSlug: slug,
      summary: commit.summary,
      reloadMedia: true,
    });
    console.log(JSON.stringify(commit, null, 2));
    return;
  }

  if (cmd === 'focus') {
    const slug = flags.project ? String(flags.project) : (!flags.idea ? live.readLiveContext(VAULT_ROOT)?.activeProjectSlug || undefined : undefined);
    const ideaSlug = flags.idea ? String(flags.idea) : undefined;
    const playheadSec = flags.playhead !== undefined ? Number(flags.playhead) : undefined;
    const rawTab = typeof flags.tab === 'string' ? flags.tab.toLowerCase() : '';
    const tab = rawTab === 'planner' || rawTab === 'plan' ? 'planner' : 'editor';
    const command = await live.writeUiCommand(VAULT_ROOT, {
      kind: 'focus_view',
      projectSlug: slug,
      ideaSlug,
      tab,
      playheadSec: Number.isFinite(playheadSec) ? playheadSec : undefined,
      summary: typeof flags.summary === 'string' ? flags.summary : 'Focused Studio view from studio-cli',
    });
    console.log(JSON.stringify({ sent: true, command }, null, 2));
    return;
  }

  if (cmd === 'update-brand') {
    const slug = resolveSlug(flags.project);
    const patch = JSON.parse(pos[0] || '{}');
    const st = await vault.getProjectState(VAULT_ROOT, slug);
    const next = { ...DEFAULT_BRAND_TOKENS, ...st.brandTokens, ...patch };
    const saved = await vault.saveProjectBrandKit(VAULT_ROOT, slug, next);
    await live.writeUiCommand(VAULT_ROOT, {
      kind: 'brand_updated',
      projectSlug: slug,
      summary: 'Updated brand & caption styling',
    });
    console.log(JSON.stringify({ projectSlug: slug, tokens: saved }, null, 2));
    return;
  }

  throw new Error('Unknown command: ' + cmd);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
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

  // Auto-discoverable Antigravity (agy) workspace plugin with MCP config
  const agyPluginDir = path.join(harnessDir, '.agents', 'plugins', 'agent-video-studio');
  await fs.mkdir(agyPluginDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(agyPluginDir, 'plugin.json'), JSON.stringify({ name: 'agent-video-studio' }, null, 2), 'utf8'),
    fs.writeFile(path.join(agyPluginDir, 'mcp_config.json'), JSON.stringify(mcpConfig, null, 2), 'utf8'),
  ]);

  const instructions = buildAgentInstructions(opts);
  await Promise.all([
    fs.writeFile(path.join(harnessDir, 'CLAUDE.md'), instructions, 'utf8'),
    fs.writeFile(path.join(harnessDir, 'AGENTS.md'), instructions, 'utf8'),
    fs.writeFile(path.join(harnessDir, 'GEMINI.md'), instructions, 'utf8'),
    fs.writeFile(path.join(harnessDir, 'studio-cli.mjs'), buildStudioCliSource(opts), 'utf8'),
  ]);

  return {
    harnessDir,
    resourcesDir,
    vaultRoot,
    mcpConfigPath,
  };
}
