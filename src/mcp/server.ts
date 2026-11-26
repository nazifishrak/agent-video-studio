import path from 'node:path';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  abortProjectEdit,
  applyTimelineOps,
  beginProjectEdit,
  commitProjectEdit,
  createCustomMotionScene,
  createIdea,
  createProjectFromIdea,
  getProjectState,
  listBrandKits,
  listIdeas,
  listMotionScenes,
  listProjects,
  probeMediaPaths,
  readIdea,
  registerMediaInProject,
  resolveVaultPaths,
  saveProjectBrandKit,
  saveProjectTranscriptDirect,
  undoLastTransaction,
  updateIdea,
} from '../main/vault.js';
import { exportProjectVideo, inspectTimelineContactSheet } from '../main/exporter.js';
import { DEFAULT_BRAND_TOKENS, BrandTokens } from '../shared/designTokens.js';
import { TimelineOpSchema, TranscriptDocSchema } from '../shared/schemas.js';
import { getAppResourcesDir } from '../main/harness.js';

function resolveVaultArg(): string {
  const idx = process.argv.indexOf('--vault');
  if (idx !== -1 && process.argv[idx + 1]) {
    return path.resolve(process.argv[idx + 1]);
  }
  if (process.env.STUDIO_VAULT_PATH) {
    return path.resolve(process.env.STUDIO_VAULT_PATH);
  }
  return process.cwd();
}

function ok(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message }, null, 2) }],
  };
}

async function main() {
  const vaultRoot = resolveVaultArg();
  const resourcesDir = getAppResourcesDir();
  const server = new McpServer({
    name: 'agent-video-studio',
    version: '0.1.0',
  });

  server.tool('get_vault_overview', 'Get vault paths, idea count, project count, and motion scene count', {}, async () => {
    try {
      const [ideas, projects, scenes, brandKits] = await Promise.all([
        listIdeas(vaultRoot),
        listProjects(vaultRoot),
        listMotionScenes(vaultRoot, resourcesDir),
        listBrandKits(vaultRoot, resourcesDir),
      ]);
      return ok({
        vaultRoot,
        resourcesDir,
        paths: resolveVaultPaths(vaultRoot, resourcesDir),
        counts: {
          ideas: ideas.length,
          projects: projects.length,
          motionScenes: scenes.length,
          brandKits: brandKits.length,
        },
        projects: projects.map((p) => ({ slug: p.slug, title: p.title, status: p.status, aspectRatio: p.aspectRatio })),
      });
    } catch (err) {
      return fail(err);
    }
  });

  server.tool('list_ideas', 'List all video ideas in the vault with frontmatter status and counts', {}, async () => {
    try {
      const ideas = await listIdeas(vaultRoot);
      return ok(
        ideas.map((i) => ({
          slug: i.slug,
          title: i.frontmatter.title,
          pillar: i.frontmatter.pillar,
          format: i.frontmatter.format,
          status: i.frontmatter.status,
          checklistTotal: i.checklistItems.length,
          checklistDone: i.checklistItems.filter((c) => c.checked).length,
        }))
      );
    } catch (err) {
      return fail(err);
    }
  });

  server.tool(
    'read_idea',
    'Read full Markdown script, frontmatter, cues, and checklist for a video idea',
    { slug: z.string() },
    async ({ slug }) => {
      try {
        return ok(await readIdea(vaultRoot, slug));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'create_idea',
    'Create a new video idea Markdown file in the vault',
    {
      title: z.string(),
      pillar: z.string().optional(),
      format: z.string().optional(),
      status: z.string().optional(),
      body: z.string().optional(),
    },
    async (args) => {
      try {
        return ok(await createIdea(vaultRoot, args));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'update_idea',
    'Update an existing video idea frontmatter, body, or toggle a checklist item',
    {
      slug: z.string(),
      status: z.string().optional(),
      title: z.string().optional(),
      body: z.string().optional(),
      toggleChecklistIndex: z.number().int().optional(),
    },
    async ({ slug, status, title, body, toggleChecklistIndex }) => {
      try {
        const frontmatter: Record<string, string> = {};
        if (status) frontmatter.status = status;
        if (title) frontmatter.title = title;
        return ok(
          await updateIdea(vaultRoot, slug, {
            frontmatter: Object.keys(frontmatter).length ? frontmatter : undefined,
            body,
            toggleChecklistIndex,
          })
        );
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool('list_projects', 'List all video production projects in the vault', {}, async () => {
    try {
      return ok(await listProjects(vaultRoot));
    } catch (err) {
      return fail(err);
    }
  });

  server.tool(
    'create_project_from_idea',
    'Promote a video idea (or standalone title) into a full isolated production project',
    {
      title: z.string(),
      ideaSlug: z.string().optional(),
      aspectRatio: z.enum(['16:9', '9:16']).optional(),
      brandKitId: z.string().optional(),
    },
    async (args) => {
      try {
        return ok(await createProjectFromIdea(vaultRoot, args));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'get_project_state',
    'Get project manifest, edit-plan.json, word-level transcript.json, active brand tokens, and history',
    { projectSlug: z.string() },
    async ({ projectSlug }) => {
      try {
        return ok(await getProjectState(vaultRoot, projectSlug));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool('list_motion_scenes', 'List all available HTML/CSS motion scenes in the library', {}, async () => {
    try {
      return ok(await listMotionScenes(vaultRoot, resourcesDir));
    } catch (err) {
      return fail(err);
    }
  });

  server.tool(
    'search_motion_scenes',
    'Search motion scenes by keyword, category, or transparency support',
    {
      query: z.string().optional(),
      category: z.string().optional(),
      transparentOnly: z.boolean().optional(),
    },
    async ({ query, category, transparentOnly }) => {
      try {
        const scenes = await listMotionScenes(vaultRoot, resourcesDir);
        const q = (query ?? '').toLowerCase();
        const filtered = scenes.filter((s) => {
          if (transparentOnly && !s.transparent_ready) return false;
          if (category && s.category.toLowerCase() !== category.toLowerCase()) return false;
          if (!q) return true;
          return (
            s.name.toLowerCase().includes(q) ||
            s.description.toLowerCase().includes(q) ||
            s.category.toLowerCase().includes(q) ||
            s.id.toLowerCase().includes(q)
          );
        });
        return ok({ count: filtered.length, scenes: filtered });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'create_custom_motion_scene',
    'Author a new custom HTML/CSS/JS motion scene using motion-engine.js and register it in catalog/scenes.json',
    {
      id: z.string(),
      name: z.string(),
      category: z.string().optional(),
      description: z.string().optional(),
      duration: z.number().positive().optional(),
      transparentReady: z.boolean().optional(),
      defaultProps: z.record(z.unknown()).optional(),
      htmlContent: z.string(),
    },
    async (args) => {
      try {
        return ok(await createCustomMotionScene(vaultRoot, args, resourcesDir));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'get_brand_tokens',
    'Get active DESIGN.md brand & caption tokens for a project, plus available presets',
    { projectSlug: z.string() },
    async ({ projectSlug }) => {
      try {
        const [state, kits] = await Promise.all([
          getProjectState(vaultRoot, projectSlug),
          listBrandKits(vaultRoot, resourcesDir),
        ]);
        return ok({
          projectSlug,
          tokens: state.brandTokens,
          availableKits: kits.map((k) => ({ id: k.id, name: k.name, source: k.source })),
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'update_brand_tokens',
    'Update specific DESIGN.md brand or caption tokens (fonts, colors, caption style) for a project',
    {
      projectSlug: z.string(),
      patch: z.record(z.string()),
    },
    async ({ projectSlug, patch }) => {
      try {
        const state = await getProjectState(vaultRoot, projectSlug);
        const next: BrandTokens = {
          ...DEFAULT_BRAND_TOKENS,
          ...state.brandTokens,
          ...(patch as Partial<BrandTokens>),
        };
        const saved = await saveProjectBrandKit(vaultRoot, projectSlug, next);
        return ok({ projectSlug, tokens: saved });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'begin_project_edit',
    'Start a transactional edit session on a project (snapshots state for atomic undo)',
    {
      projectSlug: z.string(),
      agentName: z.string().optional(),
      reason: z.string().optional(),
    },
    async ({ projectSlug, agentName, reason }) => {
      try {
        return ok(
          await beginProjectEdit(vaultRoot, projectSlug, {
            actor: 'agent',
            agentName: agentName ?? 'MCP Agent',
            reason,
          })
        );
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'apply_timeline_ops',
    'Apply structured timeline operations (motion plates, B-roll, camera moves, captions, cuts, transcript deletions, color/audio) inside an active transaction',
    {
      txId: z.string(),
      projectSlug: z.string().optional(),
      ops: z.array(TimelineOpSchema),
    },
    async ({ txId, projectSlug, ops }) => {
      try {
        return ok(await applyTimelineOps(vaultRoot, txId, ops, projectSlug));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'commit_project_edit',
    'Commit an active project edit transaction atomically and notify the live desktop studio',
    {
      txId: z.string(),
      summary: z.string().optional(),
      projectSlug: z.string().optional(),
    },
    async ({ txId, summary, projectSlug }) => {
      try {
        return ok(await commitProjectEdit(vaultRoot, txId, summary, projectSlug));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'abort_project_edit',
    'Discard an active transaction without modifying the project',
    {
      txId: z.string(),
      projectSlug: z.string().optional(),
    },
    async ({ txId, projectSlug }) => {
      try {
        return ok(await abortProjectEdit(vaultRoot, txId, projectSlug));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'undo_last_project_edit',
    'Atomically revert the last committed transaction on a project',
    { projectSlug: z.string() },
    async ({ projectSlug }) => {
      try {
        return ok(await undoLastTransaction(vaultRoot, projectSlug));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'probe_media',
    'Probe local video/audio files for FPS, dimensions, duration, safe trim margins, and FFmpeg capabilities',
    { paths: z.array(z.string()) },
    async ({ paths }) => {
      try {
        return ok(await probeMediaPaths(paths));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'register_media',
    'Link or copy media files into a project edit-plan.json assets[] registry',
    {
      projectSlug: z.string(),
      paths: z.array(z.string()),
      mode: z.enum(['link', 'copy']).optional(),
    },
    async ({ projectSlug, paths, mode }) => {
      try {
        const res = await registerMediaInProject(vaultRoot, projectSlug, paths, mode ?? 'link');
        return ok({ registered: res.registered, assetCount: res.state.editPlan.assets.length });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'set_transcript',
    'Save word-level transcript.json for a project inside a transaction',
    {
      projectSlug: z.string(),
      transcript: TranscriptDocSchema,
      summary: z.string().optional(),
    },
    async ({ projectSlug, transcript, summary }) => {
      try {
        const state = await saveProjectTranscriptDirect(
          vaultRoot,
          projectSlug,
          transcript,
          summary ?? 'Updated word-level transcript'
        );
        return ok({ projectSlug, wordCount: state.transcript.words.length });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'list_review_notes',
    'List timestamped human/agent review notes on a project timeline',
    { projectSlug: z.string() },
    async ({ projectSlug }) => {
      try {
        const state = await getProjectState(vaultRoot, projectSlug);
        return ok({ projectSlug, reviewNotes: state.editPlan.reviewNotes });
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'add_review_note',
    'Add a timestamped review note on a project timeline',
    {
      projectSlug: z.string(),
      atSec: z.number().nonnegative(),
      endSec: z.number().nonnegative().optional(),
      text: z.string(),
      author: z.enum(['human', 'agent']).optional(),
    },
    async ({ projectSlug, atSec, endSec, text, author }) => {
      try {
        const { txId } = await beginProjectEdit(vaultRoot, projectSlug, {
          actor: author ?? 'agent',
          reason: 'Added review note',
        });
        const note = {
          id: `note_${Date.now().toString(36)}`,
          atSec,
          endSec,
          text,
          author: author ?? ('agent' as const),
          resolved: false,
          createdAt: new Date().toISOString(),
        };
        await applyTimelineOps(vaultRoot, txId, [{ op: 'add_review_note', note }], projectSlug);
        await commitProjectEdit(vaultRoot, txId, `Added note at ${atSec.toFixed(1)}s`, projectSlug);
        return ok(note);
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'inspect_timeline',
    'Generate a multi-frame contact sheet PNG across the project video for visual verification',
    {
      projectSlug: z.string(),
      frameCount: z.number().int().min(4).max(24).optional(),
    },
    async ({ projectSlug, frameCount }) => {
      try {
        return ok(await inspectTimelineContactSheet({ vaultRoot, projectSlug, frameCount }));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'check_environment',
    'Check installed video tools (ffmpeg, ffprobe, node, npx, hyperframes, Chrome), FFmpeg capabilities, and all bundled skills',
    {},
    async () => {
      try {
        const scriptPath = path.join(resourcesDir, 'skills', 'ai-video-editor', 'scripts', 'bootstrap_env.mjs');
        const mod = await import(scriptPath);
        return ok(mod.checkEnvironment(path.join(resourcesDir, 'skills')));
      } catch (err) {
        return fail(err);
      }
    }
  );

  server.tool(
    'export_video',
    'Render and export the project timeline (shots, cuts, captions, color grade, music) to MP4 at 720p, 1080p, 4K, or custom resolution',
    {
      projectSlug: z.string(),
      preset: z.enum(['preview-720p', 'master-1080p', 'master-4k', 'custom']).optional(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      fps: z.number().int().positive().optional(),
      outPath: z.string().optional(),
    },
    async ({ projectSlug, preset, width, height, fps, outPath }) => {
      try {
        return ok(
          await exportProjectVideo({
            vaultRoot,
            projectSlug,
            resourcesDir,
            preset,
            width,
            height,
            fps,
            outPath,
          })
        );
      } catch (err) {
        return fail(err);
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('MCP server fatal error:', err);
  process.exit(1);
});
