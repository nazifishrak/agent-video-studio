import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import matter from 'gray-matter';
import {
  ChecklistItem,
  EditPlanV2,
  EditPlanV2Schema,
  IdeaCue,
  IdeaFrontmatter,
  IdeaFrontmatterSchema,
  IdeaMediaItem,
  IdeaRecord,
  MediaAsset,
  MotionSceneMeta,
  MotionSceneMetaSchema,
  ProjectManifest,
  ProjectManifestSchema,
  TimelineOp,
  TimelineOpSchema,
  TransactionRecord,
  TranscriptDoc,
  TranscriptDocSchema,
} from '../shared/schemas.js';

const execFileAsync = promisify(execFile);
import {
  BrandTokens,
  BUILTIN_BRAND_PRESETS,
  DEFAULT_BRAND_TOKENS,
  parseDesignMd,
  serializeDesignMd,
} from '../shared/designTokens.js';

export interface VaultPaths {
  root: string;
  ideasDir: string;
  projectsDir: string;
  motionLibraryDir: string;
  userCustomScenesDir: string;
  brandKitsDir: string;
  bundledThemesDir?: string;
  templatesDir: string;
  strategyDir: string;
}

export interface ActiveTransaction {
  txId: string;
  projectSlug: string;
  actor: 'human' | 'agent';
  agentName?: string;
  reason?: string;
  startedAt: string;
  before: {
    editPlan: EditPlanV2;
    transcript: TranscriptDoc;
    brandTokens: BrandTokens;
  };
  draft: {
    editPlan: EditPlanV2;
    transcript: TranscriptDoc;
    brandTokens: BrandTokens;
  };
  opsLog: string[];
  dirty?: {
    editPlan: boolean;
    transcript: boolean;
    brandTokens: boolean;
  };
}

export interface CommittedTransaction extends TransactionRecord {
  before: {
    editPlan: EditPlanV2;
    transcript: TranscriptDoc;
    brandTokens: BrandTokens;
  };
  after: {
    editPlan: EditPlanV2;
    transcript: TranscriptDoc;
    brandTokens: BrandTokens;
  };
}

export interface ProjectState {
  manifest: ProjectManifest;
  editPlan: EditPlanV2;
  transcript: TranscriptDoc;
  brandTokens: BrandTokens;
  mediaFiles: string[];
  transactions: TransactionRecord[];
  linkedIdea?: IdeaRecord;
}

export interface BrandKitEntry {
  id: string;
  name: string;
  filePath?: string;
  source: 'vault' | 'builtin';
  tokens: BrandTokens;
}

function existsSync(p: string): boolean {
  try {
    fsSync.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'untitled';
}

export async function atomicWriteFile(targetPath: string, content: string): Promise<void> {
  const dir = path.dirname(targetPath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = path.join(dir, `.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
  await fs.writeFile(tmpPath, content, 'utf8');
  await fs.rename(tmpPath, targetPath);
}

export function assertSafeChild(parentDir: string, targetPath: string): string {
  const resolvedParent = existsSync(parentDir)
    ? fsSync.realpathSync(parentDir)
    : path.resolve(parentDir);
  let resolvedTarget = path.resolve(targetPath);
  if (existsSync(resolvedTarget)) {
    resolvedTarget = fsSync.realpathSync(resolvedTarget);
  } else {
    const targetParent = path.dirname(resolvedTarget);
    if (existsSync(targetParent)) {
      resolvedTarget = path.join(fsSync.realpathSync(targetParent), path.basename(resolvedTarget));
    }
  }
  if (resolvedTarget !== resolvedParent && !resolvedTarget.startsWith(resolvedParent + path.sep)) {
    throw new Error(`Unsafe path traversal outside ${resolvedParent}`);
  }
  return resolvedTarget;
}

export function resolveVaultPaths(vaultRoot: string, bundledResourcesDir?: string): VaultPaths {
  const root = path.resolve(vaultRoot);
  const pick = (preferred: string, legacy: string) =>
    existsSync(path.join(root, legacy)) ? path.join(root, legacy) : path.join(root, preferred);

  const bundledMotion = bundledResourcesDir
    ? path.join(bundledResourcesDir, 'skills', 'nazif-motion-scene-library')
    : '';
  const motionPreferred = path.join(root, 'library', 'motion-scenes');
  const motionLegacy = path.join(root, 'skills', 'nazif-motion-scene-library');
  const motionLibraryDir =
    bundledMotion && existsSync(bundledMotion)
      ? bundledMotion
      : existsSync(motionPreferred)
        ? motionPreferred
        : existsSync(motionLegacy)
          ? motionLegacy
          : motionPreferred;

  const userCustomScenesDir = path.join(root, 'custom-scenes');

  const brandPreferred = path.join(root, 'brand-kits');
  const brandLib = path.join(root, 'library', 'brand-kits');
  const brandLegacy = path.join(root, 'skills', 'nazif-motion-scene-library', 'themes');
  const brandKitsDir = existsSync(brandPreferred)
    ? brandPreferred
    : existsSync(brandLib)
      ? brandLib
      : existsSync(brandLegacy)
        ? brandLegacy
        : brandPreferred;

  const bundledThemesDir =
    bundledMotion && existsSync(path.join(bundledMotion, 'themes'))
      ? path.join(bundledMotion, 'themes')
      : undefined;

  return {
    root,
    ideasDir: pick('ideas', '03-video-ideas'),
    projectsDir: pick('projects', '04-projects'),
    motionLibraryDir,
    userCustomScenesDir,
    brandKitsDir,
    bundledThemesDir,
    templatesDir: pick('templates', '02-templates'),
    strategyDir: pick('strategy', '00-strategy'),
  };
}

export async function createStarterVault(targetDir: string): Promise<VaultPaths> {
  const root = path.resolve(targetDir);
  const dirs = [
    path.join(root, 'strategy'),
    path.join(root, 'templates'),
    path.join(root, 'ideas'),
    path.join(root, 'projects'),
    path.join(root, 'brand-kits'),
    path.join(root, 'custom-scenes'),
  ];
  await Promise.all(dirs.map((d) => fs.mkdir(d, { recursive: true })));

  // Seed default brand kit
  const defaultBrandPath = path.join(root, 'brand-kits', 'studio-dark.design.md');
  if (!existsSync(defaultBrandPath)) {
    const preset = BUILTIN_BRAND_PRESETS.find((p) => p.id === 'electric-lime-dark') ?? BUILTIN_BRAND_PRESETS[0];
    await fs.writeFile(defaultBrandPath, serializeDesignMd('Studio Dark', preset.tokens), 'utf8');
  }

  // Seed starter idea
  const starterIdeaPath = path.join(root, 'ideas', '01-welcome-starter-video.md');
  if (!existsSync(starterIdeaPath)) {
    const starterMd = matter.stringify(
      `# How I Structure Videos With AI Agents

## 1. Hook (0:00 - 0:15)
- [VISUAL]: Clean kinetic hook title over desk setup
- [SAY]: "Here is how I go from a rough Markdown idea to a fully edited video without touching tedious keyframes."

## 2. Body Beats
- [B-ROLL CUE]: Screen capture of timeline + transcript editing
- [DELIVERY CUE]: Slow down on the core takeaway

## 3. Shot List
- [ ] Talking head A-roll (desk or outdoor walk)
- [ ] Screen recording of the workflow
`,
      {
        title: 'How I Structure Videos With AI Agents',
        pillar: 'AI & Build',
        format: 'Long-Form (8-12 min)',
        status: 'Ready to Film',
        target_length: '8 min',
        intro_formula: 'Receipts First',
        repurpose_short: true,
        tags: ['starter', 'workflow'],
      }
    );
    await fs.writeFile(starterIdeaPath, starterMd, 'utf8');
  }

  return resolveVaultPaths(root);
}

function parseIdeaContent(raw: string, filePath: string): IdeaRecord {
  const parsed = matter(raw);
  const fmResult = IdeaFrontmatterSchema.safeParse(parsed.data);
  const frontmatter: IdeaFrontmatter = fmResult.success
    ? fmResult.data
    : IdeaFrontmatterSchema.parse({});

  const lines = parsed.content.split(/\r?\n/);
  const checklistItems: ChecklistItem[] = [];
  const cues: IdeaCue[] = [];

  lines.forEach((line, idx) => {
    const checkMatch = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/);
    if (checkMatch) {
      checklistItems.push({
        index: checklistItems.length,
        checked: checkMatch[1].toLowerCase() === 'x',
        text: checkMatch[2].trim(),
        line: idx,
      });
    }

    const cueMatch = line.match(
      /(?:`|\*\*)?\[(VISUAL|B-ROLL CUE|DELIVERY CUE|SCREEN \/ ARTIFACT CUE|B-ROLL RESET|SAY)\]:?(?:`|\*\*)?:?\s+(.+)/
    );
    if (cueMatch) {
      cues.push({
        type: cueMatch[1] as IdeaCue['type'],
        text: cueMatch[2].trim(),
        line: idx,
      });
    }
  });

  const slug = path.basename(filePath, '.md');
  return {
    id: slug,
    slug,
    filePath,
    frontmatter,
    body: parsed.content.trimStart(),
    checklistItems,
    cues,
  };
}

export async function listIdeas(vaultRoot: string): Promise<IdeaRecord[]> {
  const paths = resolveVaultPaths(vaultRoot);
  if (!existsSync(paths.ideasDir)) return [];
  const entries = await fs.readdir(paths.ideasDir, { withFileTypes: true });
  const mdFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name)
    .sort();

  const ideas: IdeaRecord[] = [];
  for (const file of mdFiles) {
    const full = path.join(paths.ideasDir, file);
    const raw = await fs.readFile(full, 'utf8');
    ideas.push(parseIdeaContent(raw, full));
  }
  return ideas;
}

export async function readIdea(vaultRoot: string, slug: string): Promise<IdeaRecord> {
  const paths = resolveVaultPaths(vaultRoot);
  const filePath = assertSafeChild(paths.ideasDir, path.join(paths.ideasDir, `${slug}.md`));
  const raw = await fs.readFile(filePath, 'utf8');
  return parseIdeaContent(raw, filePath);
}

export async function createIdea(
  vaultRoot: string,
  input: { title: string; pillar?: string; format?: string; status?: string; body?: string }
): Promise<IdeaRecord> {
  const paths = resolveVaultPaths(vaultRoot);
  await fs.mkdir(paths.ideasDir, { recursive: true });
  const existing = await listIdeas(vaultRoot);
  const maxPrefix = existing.reduce((max, item) => {
    const m = item.slug.match(/^(\d+)-/);
    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0);
  const nextNum = String(maxPrefix + 1).padStart(2, '0');
  const slug = `${nextNum}-${slugify(input.title)}`;
  const filePath = assertSafeChild(paths.ideasDir, path.join(paths.ideasDir, `${slug}.md`));

  const frontmatter = IdeaFrontmatterSchema.parse({
    title: input.title,
    pillar: input.pillar ?? 'AI & Build',
    format: input.format ?? 'Long-Form (8-12 min)',
    status: input.status ?? 'Idea',
    target_length: '10 min',
    repurpose_short: true,
    tags: ['video-idea'],
  });

  const body =
    input.body ??
    `# ${input.title}\n\n## 1. Hook & Packaging\n- [VISUAL]: \n- [SAY]: ""\n\n## 2. Core Beats\n- \n\n## 3. B-Roll Shot List\n- [ ] Talking head A-roll\n- [ ] Screen capture / receipt\n`;

  const fullText = matter.stringify(body, frontmatter);
  await fs.writeFile(filePath, fullText, 'utf8');
  return parseIdeaContent(fullText, filePath);
}

export async function updateIdea(
  vaultRoot: string,
  slug: string,
  patch: { frontmatter?: Partial<IdeaFrontmatter>; body?: string; toggleChecklistIndex?: number }
): Promise<IdeaRecord> {
  const current = await readIdea(vaultRoot, slug);
  const nextFm = IdeaFrontmatterSchema.parse({
    ...current.frontmatter,
    ...(patch.frontmatter ?? {}),
  });

  let nextBody = patch.body !== undefined ? patch.body : current.body;

  if (patch.toggleChecklistIndex !== undefined) {
    const item = current.checklistItems.find((c) => c.index === patch.toggleChecklistIndex);
    if (item) {
      const lines = nextBody.split(/\r?\n/);
      const targetLine = lines[item.line];
      if (targetLine !== undefined) {
        lines[item.line] = item.checked
          ? targetLine.replace(/\[[xX]\]/, '[ ]')
          : targetLine.replace(/\[ \]/, '[x]');
        nextBody = lines.join('\n');
      }
    }
  }

  const cleanFm = JSON.parse(JSON.stringify(nextFm));
  const fullText = matter.stringify(nextBody.trimEnd() + '\n', cleanFm);
  await fs.writeFile(current.filePath, fullText, 'utf8');
  if (patch.frontmatter?.media_pool) {
    const projects = await listProjects(vaultRoot);
    for (const p of projects) {
      if (p.ideaId === slug) {
        await syncMediaPoolToProjectAssets(vaultRoot, p.slug, nextFm.media_pool ?? []);
      }
    }
  }
  return parseIdeaContent(fullText, current.filePath);
}

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.mkv']);
const MEDIA_EXTS = new Set(['.mp4', '.mov', '.webm', '.mkv', '.mp3', '.wav', '.m4a']);

function formatSlugTitle(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

async function scanProjectMediaFiles(projectDir: string): Promise<string[]> {
  const results: string[] = [];
  const scanSubdir = async (subDirRel: string) => {
    const dirPath = subDirRel ? path.join(projectDir, subDirRel) : projectDir;
    if (!existsSync(dirPath)) return;
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || entry.name.startsWith('.')) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!MEDIA_EXTS.has(ext)) continue;
      results.push(subDirRel ? `${subDirRel}/${entry.name}` : entry.name);
    }
  };

  await Promise.all([scanSubdir(''), scanSubdir('media'), scanSubdir('exports')]);
  return results.sort();
}

function pickBestPrimaryVideo(slug: string, mediaFiles: string[]): string {
  const videos = mediaFiles.filter((f) => VIDEO_EXTS.has(path.extname(f).toLowerCase()));
  if (videos.length === 0) return '';

  const normalizedSlug = slug.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const scoreVideo = (relPath: string): number => {
    const base = path.basename(relPath, path.extname(relPath)).toLowerCase();
    const normBase = base.replace(/[^a-z0-9]/g, '');
    let score = 0;
    if (normBase === normalizedSlug) score += 100;
    if (relPath.startsWith('exports/')) score += 40;
    else if (!relPath.includes('/')) score += 25;
    else if (relPath.startsWith('media/')) score += 15;
    if (/^(base|temp|tmp|raw|intermediate|preview)$/.test(base)) score -= 50;
    return score;
  };

  return [...videos].sort((a, b) => scoreVideo(b) - scoreVideo(a) || a.localeCompare(b))[0];
}

async function buildSynthesizedManifest(slug: string, projectDir: string): Promise<ProjectManifest> {
  let mtimeIso = new Date().toISOString();
  try {
    const stat = await fs.stat(projectDir);
    mtimeIso = stat.mtime.toISOString();
  } catch {
    // Keep current timestamp fallback
  }
  return ProjectManifestSchema.parse({
    id: `auto-${slug}`,
    slug,
    title: formatSlugTitle(slug),
    aspectRatio: '16:9',
    fps: 30,
    brandKitId: 'electric-lime-dark',
    status: 'Draft',
    createdAt: mtimeIso,
    updatedAt: mtimeIso,
  });
}

function buildSynthesizedEditPlan(slug: string, mediaFiles: string[]): EditPlanV2 {
  return EditPlanV2Schema.parse({
    version: 2,
    project: slug,
    sourceVideo: pickBestPrimaryVideo(slug, mediaFiles),
    width: 1920,
    height: 1080,
    fps: 30,
    cuts: [],
    cameraMoves: [],
    broll: [],
    motionPlates: [],
    captions: [],
    callouts: [],
    colorGrade: { contrast: 1.04, saturate: 1.03, filmGrain: 0.03 },
    audio: { sidechainDuck: true, musicDb: -18, targetLufs: -14, autoSfx: true },
  });
}

async function ensureProjectFilesExist(vaultRoot: string, slug: string): Promise<void> {
  const projectDir = getProjectDir(vaultRoot, slug);
  if (!existsSync(projectDir)) {
    throw new Error(`Project not found: ${slug}`);
  }
  const mediaFiles = await scanProjectMediaFiles(projectDir);
  await Promise.all([
    fs.mkdir(path.join(projectDir, 'brand'), { recursive: true }),
    fs.mkdir(path.join(projectDir, 'media'), { recursive: true }),
    fs.mkdir(path.join(projectDir, 'exports'), { recursive: true }),
    fs.mkdir(path.join(projectDir, '.history', 'active-tx'), { recursive: true }),
    fs.mkdir(path.join(projectDir, '.history', 'commits'), { recursive: true }),
  ]);

  const manifestPath = path.join(projectDir, 'project.json');
  if (!existsSync(manifestPath)) {
    const manifest = await buildSynthesizedManifest(slug, projectDir);
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  }

  const planPath = path.join(projectDir, 'edit-plan.json');
  if (!existsSync(planPath)) {
    const editPlan = buildSynthesizedEditPlan(slug, mediaFiles);
    await fs.writeFile(planPath, JSON.stringify(editPlan, null, 2), 'utf8');
  }

  const transcriptPath = path.join(projectDir, 'transcript.json');
  if (!existsSync(transcriptPath)) {
    const transcript = TranscriptDocSchema.parse({ version: 1, language: 'en', words: [] });
    await fs.writeFile(transcriptPath, JSON.stringify(transcript, null, 2), 'utf8');
  }

  const designPath = path.join(projectDir, 'brand', 'DESIGN.md');
  if (!existsSync(designPath)) {
    const preset =
      BUILTIN_BRAND_PRESETS.find((p) => p.id === 'electric-lime-dark') ?? BUILTIN_BRAND_PRESETS[0];
    await atomicWriteFile(designPath, serializeDesignMd(formatSlugTitle(slug), preset.tokens));
  }
}

export async function listProjects(vaultRoot: string): Promise<ProjectManifest[]> {
  const paths = resolveVaultPaths(vaultRoot);
  if (!existsSync(paths.projectsDir)) return [];
  const entries = await fs.readdir(paths.projectsDir, { withFileTypes: true });
  const manifests: ProjectManifest[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const projectDir = path.join(paths.projectsDir, entry.name);
    const manifestPath = path.join(projectDir, 'project.json');
    if (existsSync(manifestPath)) {
      try {
        const raw = await fs.readFile(manifestPath, 'utf8');
        const parsed = ProjectManifestSchema.parse(JSON.parse(raw));
        manifests.push(parsed);
        continue;
      } catch {
        // Fall through to synthesized discovery if manifest is malformed
      }
    }

    const mediaFiles = await scanProjectMediaFiles(projectDir);
    const hasVideo = mediaFiles.some((f) => VIDEO_EXTS.has(path.extname(f).toLowerCase()));
    if (hasVideo) {
      manifests.push(await buildSynthesizedManifest(entry.name, projectDir));
    }
  }

  return manifests.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function getProjectDir(vaultRoot: string, slug: string): string {
  const paths = resolveVaultPaths(vaultRoot);
  return assertSafeChild(paths.projectsDir, path.join(paths.projectsDir, slug));
}

export async function createProjectFromIdea(
  vaultRoot: string,
  options: {
    ideaSlug?: string;
    title: string;
    slug?: string;
    aspectRatio?: '16:9' | '9:16';
    brandKitId?: string;
  }
): Promise<ProjectState> {
  const paths = resolveVaultPaths(vaultRoot);
  await fs.mkdir(paths.projectsDir, { recursive: true });

  const baseSlug = slugify(options.slug || options.title);
  let slug = baseSlug;
  let counter = 2;
  while (existsSync(path.join(paths.projectsDir, slug))) {
    slug = `${baseSlug}-${counter++}`;
  }

  const projectDir = getProjectDir(vaultRoot, slug);
  await Promise.all([
    fs.mkdir(path.join(projectDir, 'brand'), { recursive: true }),
    fs.mkdir(path.join(projectDir, 'media'), { recursive: true }),
    fs.mkdir(path.join(projectDir, 'exports'), { recursive: true }),
    fs.mkdir(path.join(projectDir, '.history', 'active-tx'), { recursive: true }),
    fs.mkdir(path.join(projectDir, '.history', 'commits'), { recursive: true }),
  ]);

  const now = new Date().toISOString();
  const aspectRatio = options.aspectRatio ?? '16:9';
  const manifest: ProjectManifest = ProjectManifestSchema.parse({
    id: crypto.randomUUID(),
    slug,
    title: options.title,
    ideaId: options.ideaSlug,
    aspectRatio,
    fps: 30,
    brandKitId: options.brandKitId ?? 'linear-dark',
    status: 'Draft',
    createdAt: now,
    updatedAt: now,
  });

  // Seed sample captions from idea cues if available
  let linkedIdea: IdeaRecord | undefined;
  if (options.ideaSlug) {
    try {
      linkedIdea = await readIdea(vaultRoot, options.ideaSlug);
    } catch {
      linkedIdea = undefined;
    }
  }

function cleanSeedCaptionText(raw: string): string {
  const stripped = raw
    .replace(/`+/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^["']+|["']+$/g, '')
    .trim();
  if (stripped.length <= 90) return stripped;
  const cut = stripped.slice(0, 90);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim();
}

  const starterCaptions = linkedIdea
    ? linkedIdea.cues
        .filter((c) => c.type === 'SAY' && cleanSeedCaptionText(c.text).length > 0)
        .slice(0, 3)
        .map((c, idx) => ({
          id: `cap-${idx + 1}`,
          text: cleanSeedCaptionText(c.text),
          start: idx * 4.5,
          end: idx * 4.5 + 4.0,
        }))
    : [
        {
          id: 'cap-1',
          text: options.title,
          start: 0.5,
          end: 4.5,
        },
      ];

  const seededAssets: MediaAsset[] = (linkedIdea?.frontmatter.media_pool ?? []).map((item) => ({
    id: item.id,
    kind: item.kind,
    uri: `file://${path.resolve(item.path)}`,
    label: item.label,
    durationSec: item.durationSec,
    fps: item.fps,
    width: item.width,
    height: item.height,
  }));

  const editPlan: EditPlanV2 = EditPlanV2Schema.parse({
    version: 2,
    project: slug,
    sourceVideo: '',
    width: aspectRatio === '9:16' ? 1080 : 1920,
    height: aspectRatio === '9:16' ? 1920 : 1080,
    fps: 30,
    assets: seededAssets,
    cuts: [],
    cameraMoves: [],
    broll: [],
    motionPlates: [],
    captions: starterCaptions,
    callouts: [],
    colorGrade: { contrast: 1.04, saturate: 1.03, filmGrain: 0.03 },
    audio: { sidechainDuck: true, musicDb: -18, targetLufs: -14, autoSfx: true },
  });

  const transcript: TranscriptDoc = TranscriptDocSchema.parse({
    version: 1,
    language: 'en',
    words: [],
  });

  const preset =
    BUILTIN_BRAND_PRESETS.find((p) => p.id === manifest.brandKitId) ?? BUILTIN_BRAND_PRESETS[1];
  const brandTokens = preset.tokens;

  await Promise.all([
    fs.writeFile(path.join(projectDir, 'project.json'), JSON.stringify(manifest, null, 2), 'utf8'),
    fs.writeFile(path.join(projectDir, 'edit-plan.json'), JSON.stringify(editPlan, null, 2), 'utf8'),
    fs.writeFile(path.join(projectDir, 'transcript.json'), JSON.stringify(transcript, null, 2), 'utf8'),
    fs.writeFile(
      path.join(projectDir, 'brand', 'DESIGN.md'),
      serializeDesignMd(options.title, brandTokens),
      'utf8'
    ),
  ]);

  return getProjectState(vaultRoot, slug);
}

export async function getProjectState(vaultRoot: string, slug: string): Promise<ProjectState> {
  const projectDir = getProjectDir(vaultRoot, slug);
  if (!existsSync(projectDir)) {
    throw new Error(`Project not found: ${slug}`);
  }

  const mediaFiles = await scanProjectMediaFiles(projectDir);

  const manifestPath = path.join(projectDir, 'project.json');
  const manifest = existsSync(manifestPath)
    ? ProjectManifestSchema.parse(JSON.parse(await fs.readFile(manifestPath, 'utf8')))
    : await buildSynthesizedManifest(slug, projectDir);

  const planPath = path.join(projectDir, 'edit-plan.json');
  let editPlan = existsSync(planPath)
    ? EditPlanV2Schema.parse(JSON.parse(await fs.readFile(planPath, 'utf8')))
    : buildSynthesizedEditPlan(slug, mediaFiles);

  if (!editPlan.sourceVideo && mediaFiles.length > 0) {
    const inferred = pickBestPrimaryVideo(slug, mediaFiles);
    if (inferred) {
      editPlan = { ...editPlan, sourceVideo: inferred };
    }
  }

  let transcript: TranscriptDoc = { version: 1, language: 'en', words: [] };
  const transcriptPath = path.join(projectDir, 'transcript.json');
  if (existsSync(transcriptPath)) {
    transcript = TranscriptDocSchema.parse(JSON.parse(await fs.readFile(transcriptPath, 'utf8')));
  }

  let brandTokens: BrandTokens = { ...DEFAULT_BRAND_TOKENS };
  const designMdPath = path.join(projectDir, 'brand', 'DESIGN.md');
  if (existsSync(designMdPath)) {
    const rawDesign = await fs.readFile(designMdPath, 'utf8');
    const inferredMode =
      manifest.brandKitId.includes('dark') || /stage_bg:\s*#0/i.test(rawDesign) ? 'dark' : 'light';
    brandTokens = parseDesignMd(rawDesign, inferredMode);
  }

  const transactions = await listTransactions(vaultRoot, slug);

  let linkedIdea: IdeaRecord | undefined;
  if (manifest.ideaId) {
    try {
      linkedIdea = await readIdea(vaultRoot, manifest.ideaId);
    } catch {
      linkedIdea = undefined;
    }
  }
  if (!linkedIdea) {
    const localPlanPath = path.join(projectDir, 'plan.md');
    if (existsSync(localPlanPath)) {
      try {
        const rawPlan = await fs.readFile(localPlanPath, 'utf8');
        linkedIdea = parseIdeaContent(rawPlan, localPlanPath);
      } catch {
        linkedIdea = undefined;
      }
    }
  }

  return {
    manifest,
    editPlan,
    transcript,
    brandTokens,
    mediaFiles,
    transactions,
    linkedIdea,
  };
}

function resolveLocalAssetPath(projectDir: string, uri: string): string {
  if (uri.startsWith('file://')) {
    return path.resolve(decodeURIComponent(uri.slice('file://'.length)));
  }
  if (path.isAbsolute(uri)) {
    return path.resolve(uri);
  }
  return path.resolve(projectDir, uri);
}

export async function syncMediaPoolToProjectAssets(
  vaultRoot: string,
  projectSlug: string,
  mediaPool: IdeaMediaItem[]
): Promise<void> {
  if (mediaPool.length === 0) return;
  await ensureProjectFilesExist(vaultRoot, projectSlug);
  const projectDir = getProjectDir(vaultRoot, projectSlug);
  const planPath = path.join(projectDir, 'edit-plan.json');
  const currentPlan = EditPlanV2Schema.parse(JSON.parse(await fs.readFile(planPath, 'utf8')));

  const existingPaths = new Set(
    currentPlan.assets.map((a) => resolveLocalAssetPath(projectDir, a.uri))
  );
  const existingIds = new Set(currentPlan.assets.map((a) => a.id));
  const additions: MediaAsset[] = [];

  for (const item of mediaPool) {
    const abs = path.resolve(item.path);
    if (existingPaths.has(abs)) continue;
    existingPaths.add(abs);
    let assetId = item.id;
    if (existingIds.has(assetId)) {
      assetId = `${item.id}_${Math.random().toString(36).slice(2, 6)}`;
    }
    existingIds.add(assetId);
    additions.push({
      id: assetId,
      kind: item.kind,
      uri: `file://${abs}`,
      label: item.label,
      durationSec: item.durationSec,
      fps: item.fps,
      width: item.width,
      height: item.height,
    });
  }

  if (additions.length === 0) return;
  const nextPlan = EditPlanV2Schema.parse({
    ...currentPlan,
    assets: [...currentPlan.assets, ...additions],
  });
  await atomicWriteFile(planPath, JSON.stringify(nextPlan, null, 2));
}

export async function readProjectPlan(vaultRoot: string, projectSlug: string): Promise<IdeaRecord> {
  const state = await getProjectState(vaultRoot, projectSlug);
  if (state.linkedIdea) {
    return state.linkedIdea;
  }

  const projectDir = getProjectDir(vaultRoot, projectSlug);
  const planMdPath = path.join(projectDir, 'plan.md');

  // Synthesize an in-memory starter plan pre-seeded with any existing project media (without writing to disk)
  const seenPaths = new Set<string>();
  const seededPool: IdeaMediaItem[] = [];

  for (const asset of state.editPlan.assets) {
    const abs = resolveLocalAssetPath(projectDir, asset.uri);
    if (seenPaths.has(abs)) continue;
    seenPaths.add(abs);
    seededPool.push({
      id: asset.id,
      label: asset.label || path.basename(abs),
      path: abs,
      kind: asset.kind,
      role: asset.kind === 'audio' ? 'Music' : asset.kind === 'image' ? 'Asset' : 'B-Roll',
      durationSec: asset.durationSec,
      width: asset.width,
      height: asset.height,
      fps: asset.fps,
    });
  }

  for (const rel of state.mediaFiles) {
    const abs = path.resolve(projectDir, rel);
    if (seenPaths.has(abs)) continue;
    seenPaths.add(abs);
    const ext = path.extname(rel).toLowerCase();
    const kind: IdeaMediaItem['kind'] = ['.mp3', '.wav', '.m4a'].includes(ext)
      ? 'audio'
      : ['.png', '.jpg', '.jpeg', '.webp'].includes(ext)
        ? 'image'
        : 'video';
    seededPool.push({
      id: `m_${slugify(path.basename(rel, ext)).slice(0, 20)}`,
      label: path.basename(rel),
      path: abs,
      kind,
      role: kind === 'audio' ? 'Music' : rel === state.editPlan.sourceVideo ? 'A-Roll' : 'B-Roll',
    });
  }

  const frontmatter = IdeaFrontmatterSchema.parse({
    title: state.manifest.title,
    pillar: 'Video Project',
    format: state.manifest.aspectRatio === '9:16' ? 'Short (9:16)' : 'Long-Form (16:9)',
    status: state.manifest.status || 'Draft',
    media_pool: seededPool,
  });

  const body = `# ${state.manifest.title}\n\n## 1. Hook & Beats\n- [VISUAL]: \n- [SAY]: ""\n\n## 2. Shot List\n- [ ] Review footage & beats\n`;
  const cleanFm = JSON.parse(JSON.stringify(frontmatter));
  return parseIdeaContent(matter.stringify(body, cleanFm), planMdPath);
}

export async function saveProjectPlan(
  vaultRoot: string,
  projectSlug: string,
  patch: { frontmatter?: Partial<IdeaFrontmatter>; body?: string; toggleChecklistIndex?: number }
): Promise<IdeaRecord> {
  const state = await getProjectState(vaultRoot, projectSlug);
  if (state.manifest.ideaId) {
    try {
      const updated = await updateIdea(vaultRoot, state.manifest.ideaId, patch);
      if (patch.frontmatter?.title && patch.frontmatter.title !== state.manifest.title) {
        await updateProjectManifest(vaultRoot, projectSlug, { title: patch.frontmatter.title });
      }
      return updated;
    } catch {
      // Fall through to project-local plan.md if idea file was removed
    }
  }

  const current = await readProjectPlan(vaultRoot, projectSlug);
  const nextFm = IdeaFrontmatterSchema.parse({
    ...current.frontmatter,
    ...(patch.frontmatter ?? {}),
  });

  let nextBody = patch.body !== undefined ? patch.body : current.body;
  if (patch.toggleChecklistIndex !== undefined) {
    const item = current.checklistItems.find((c) => c.index === patch.toggleChecklistIndex);
    if (item) {
      const lines = nextBody.split(/\r?\n/);
      const targetLine = lines[item.line];
      if (targetLine !== undefined) {
        lines[item.line] = item.checked
          ? targetLine.replace(/\[[xX]\]/, '[ ]')
          : targetLine.replace(/\[ \]/, '[x]');
        nextBody = lines.join('\n');
      }
    }
  }

  const projectDir = getProjectDir(vaultRoot, projectSlug);
  const planMdPath = path.join(projectDir, 'plan.md');
  const cleanFm = JSON.parse(JSON.stringify(nextFm));
  const fullText = matter.stringify(nextBody.trimEnd() + '\n', cleanFm);
  await atomicWriteFile(planMdPath, fullText);

  if (patch.frontmatter?.title && patch.frontmatter.title !== state.manifest.title) {
    await updateProjectManifest(vaultRoot, projectSlug, { title: patch.frontmatter.title });
  }
  if (nextFm.media_pool && nextFm.media_pool.length > 0) {
    await syncMediaPoolToProjectAssets(vaultRoot, projectSlug, nextFm.media_pool);
  }

  return parseIdeaContent(fullText, planMdPath);
}

export async function updateProjectManifest(
  vaultRoot: string,
  slug: string,
  patch: Partial<ProjectManifest>
): Promise<ProjectManifest> {
  await ensureProjectFilesExist(vaultRoot, slug);
  const projectDir = getProjectDir(vaultRoot, slug);
  const manifestPath = path.join(projectDir, 'project.json');
  const current = ProjectManifestSchema.parse(JSON.parse(await fs.readFile(manifestPath, 'utf8')));
  const next = ProjectManifestSchema.parse({
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
  await fs.writeFile(manifestPath, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export async function importMediaToProject(
  vaultRoot: string,
  slug: string,
  sourceFilePath: string,
  setAsSourceVideo = true
): Promise<{ fileName: string; relativePath: string }> {
  await ensureProjectFilesExist(vaultRoot, slug);
  const projectDir = getProjectDir(vaultRoot, slug);
  const mediaDir = path.join(projectDir, 'media');
  await fs.mkdir(mediaDir, { recursive: true });
  const fileName = path.basename(sourceFilePath);
  const destPath = assertSafeChild(mediaDir, path.join(mediaDir, fileName));
  await fs.copyFile(sourceFilePath, destPath);
  const relativePath = `media/${fileName}`;

  if (setAsSourceVideo) {
    const state = await getProjectState(vaultRoot, slug);
    const nextPlan: EditPlanV2 = {
      ...state.editPlan,
      sourceVideo: relativePath,
    };
    await fs.writeFile(path.join(projectDir, 'edit-plan.json'), JSON.stringify(nextPlan, null, 2), 'utf8');
  }

  return { fileName, relativePath };
}

// ---------- Motion Scenes Library ----------

export async function listMotionScenes(
  vaultRoot: string,
  bundledResourcesDir?: string
): Promise<MotionSceneMeta[]> {
  const paths = resolveVaultPaths(vaultRoot, bundledResourcesDir);
  const catalogPath = path.join(paths.motionLibraryDir, 'catalog', 'scenes.json');
  const scenesDir = path.join(paths.motionLibraryDir, 'scenes');

  let catalogScenes: MotionSceneMeta[] = [];
  if (existsSync(catalogPath)) {
    const raw = await fs.readFile(catalogPath, 'utf8');
    const parsed = JSON.parse(raw) as { scenes?: unknown[] };
    catalogScenes = (parsed.scenes ?? []).map((s) => MotionSceneMetaSchema.parse(s));
  }

  // Detect any extra .html files in base scenes/ not yet in scenes.json
  const knownFiles = new Set(catalogScenes.map((s) => s.file));
  if (existsSync(scenesDir)) {
    const files = await fs.readdir(scenesDir);
    for (const f of files.sort()) {
      if (!f.endsWith('.html')) continue;
      const rel = `scenes/${f}`;
      if (!knownFiles.has(rel)) {
        const id = path.basename(f, '.html');
        catalogScenes.push(
          MotionSceneMetaSchema.parse({
            id,
            number: String(catalogScenes.length + 1).padStart(2, '0'),
            name: id.replace(/^\d+-/, '').replace(/-/g, ' '),
            category: 'Custom',
            inspiration: 'Custom Agent Scene',
            duration: 5.0,
            fps: 30,
            transparent_ready: false,
            file: rel,
            description: 'Custom HTML motion scene',
            default_props: {},
            isCustom: true,
          })
        );
      }
    }
  }

  // Merge user-specific custom scenes from <vault>/custom-scenes/
  const customCatalogPath = path.join(paths.userCustomScenesDir, 'catalog.json');
  const customMap = new Map<string, MotionSceneMeta>();
  if (existsSync(customCatalogPath)) {
    try {
      const raw = await fs.readFile(customCatalogPath, 'utf8');
      const parsed = JSON.parse(raw) as { scenes?: unknown[] };
      for (const s of parsed.scenes ?? []) {
        const meta = MotionSceneMetaSchema.parse(s);
        customMap.set(meta.file, { ...meta, isCustom: true });
      }
    } catch {
      // Ignore malformed custom catalog
    }
  }

  if (existsSync(paths.userCustomScenesDir)) {
    const files = await fs.readdir(paths.userCustomScenesDir);
    for (const f of files.sort()) {
      if (!f.endsWith('.html')) continue;
      const rel = `custom/${f}`;
      if (customMap.has(rel)) {
        catalogScenes.push(customMap.get(rel)!);
      } else {
        const id = path.basename(f, '.html');
        catalogScenes.push(
          MotionSceneMetaSchema.parse({
            id,
            number: String(catalogScenes.length + 1).padStart(2, '0'),
            name: id.replace(/^\d+-/, '').replace(/-/g, ' '),
            category: 'Custom',
            inspiration: 'User Vault Scene',
            duration: 5.0,
            fps: 30,
            transparent_ready: false,
            file: rel,
            description: 'Custom HTML motion scene in user vault',
            default_props: {},
            isCustom: true,
          })
        );
      }
    }
  }

  return catalogScenes;
}

export async function createCustomMotionScene(
  vaultRoot: string,
  input: {
    id: string;
    name: string;
    category?: string;
    description?: string;
    duration?: number;
    transparentReady?: boolean;
    defaultProps?: Record<string, unknown>;
    htmlContent: string;
  },
  bundledResourcesDir?: string
): Promise<MotionSceneMeta> {
  const paths = resolveVaultPaths(vaultRoot, bundledResourcesDir);
  const customDir = paths.userCustomScenesDir;
  const customCatalogPath = path.join(customDir, 'catalog.json');
  await fs.mkdir(customDir, { recursive: true });

  const safeId = slugify(input.id);
  const relFile = `custom/${safeId}.html`;
  const destHtml = assertSafeChild(customDir, path.join(customDir, `${safeId}.html`));
  await fs.writeFile(destHtml, input.htmlContent, 'utf8');

  const allExisting = await listMotionScenes(vaultRoot, bundledResourcesDir);
  const entry = MotionSceneMetaSchema.parse({
    id: safeId,
    number: String(allExisting.length + 1).padStart(2, '0'),
    name: input.name,
    category: input.category ?? 'Custom',
    inspiration: 'Custom Agent Scene',
    duration: input.duration ?? 5.0,
    fps: 30,
    transparent_ready: input.transparentReady ?? false,
    file: relFile,
    description: input.description ?? 'Custom HTML motion scene',
    default_props: input.defaultProps ?? {},
    isCustom: true,
  });

  let customList: MotionSceneMeta[] = [];
  if (existsSync(customCatalogPath)) {
    try {
      const raw = JSON.parse(await fs.readFile(customCatalogPath, 'utf8')) as { scenes?: unknown[] };
      customList = (raw.scenes ?? []).map((s) => MotionSceneMetaSchema.parse(s));
    } catch {
      customList = [];
    }
  }
  const filtered = customList.filter((s) => s.id !== safeId);
  filtered.push(entry);
  await fs.writeFile(
    customCatalogPath,
    JSON.stringify({ count: filtered.length, scenes: filtered }, null, 2),
    'utf8'
  );

  return entry;
}

// ---------- Brand Kits ----------

export async function listBrandKits(
  vaultRoot: string,
  bundledResourcesDir?: string
): Promise<BrandKitEntry[]> {
  const paths = resolveVaultPaths(vaultRoot, bundledResourcesDir);
  const byNormName = new Map<string, BrandKitEntry>();

  const normalizeName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

  const scanDir = async (dir: string | undefined, sourceLabel: 'vault' | 'builtin') => {
    if (!dir || !existsSync(dir)) return;
    const files = await fs.readdir(dir);
    for (const f of files.sort()) {
      if (!f.endsWith('.md')) continue;
      const full = path.join(dir, f);
      const raw = await fs.readFile(full, 'utf8');
      const mode = f.includes('dark') ? 'dark' : 'light';
      const displayName = path
        .basename(f, '.design.md')
        .replace('.md', '')
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      byNormName.set(normalizeName(displayName), {
        id: `${sourceLabel}:${path.basename(f, '.md')}`,
        name: displayName,
        filePath: full,
        source: sourceLabel,
        tokens: parseDesignMd(raw, mode),
      });
    }
  };

  // Lower priority first, higher priority overrides by normalized name
  await scanDir(paths.bundledThemesDir, 'builtin');
  for (const p of BUILTIN_BRAND_PRESETS) {
    byNormName.set(normalizeName(p.name), {
      id: p.id,
      name: p.name,
      source: 'builtin',
      tokens: p.tokens,
    });
  }
  await scanDir(paths.brandKitsDir, 'vault');
  return [...byNormName.values()];
}

export async function saveProjectBrandKit(
  vaultRoot: string,
  projectSlug: string,
  tokens: BrandTokens
): Promise<BrandTokens> {
  const { txId } = await beginProjectEdit(vaultRoot, projectSlug, {
    actor: 'human',
    reason: 'Updated Brand Kit (DESIGN.md)',
  });
  await applyTimelineOps(
    vaultRoot,
    txId,
    [{ op: 'update_brand_tokens', tokens: tokens as unknown as Record<string, string> }],
    projectSlug
  );
  await commitProjectEdit(vaultRoot, txId, 'Updated Brand Kit (DESIGN.md)', projectSlug);
  return tokens;
}

export async function saveGlobalBrandKit(
  vaultRoot: string,
  name: string,
  tokens: BrandTokens
): Promise<BrandKitEntry> {
  const paths = resolveVaultPaths(vaultRoot);
  await fs.mkdir(paths.brandKitsDir, { recursive: true });
  const id = slugify(name);
  const filePath = assertSafeChild(paths.brandKitsDir, path.join(paths.brandKitsDir, `${id}.design.md`));
  await fs.writeFile(filePath, serializeDesignMd(name, tokens), 'utf8');
  return {
    id: `vault:${id}`,
    name,
    filePath,
    source: 'vault',
    tokens,
  };
}

// ---------- Transactional Edit Engine (Borumi Pattern) ----------

export async function beginProjectEdit(
  vaultRoot: string,
  projectSlug: string,
  meta: { actor?: 'human' | 'agent'; agentName?: string; reason?: string } = {}
): Promise<{ txId: string; projectSlug: string; startedAt: string }> {
  await ensureProjectFilesExist(vaultRoot, projectSlug);
  const state = await getProjectState(vaultRoot, projectSlug);
  const projectDir = getProjectDir(vaultRoot, projectSlug);
  const txDir = path.join(projectDir, '.history', 'active-tx');
  await fs.mkdir(txDir, { recursive: true });

  const txId = `tx_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const startedAt = new Date().toISOString();

  const tx: ActiveTransaction = {
    txId,
    projectSlug,
    actor: meta.actor ?? 'agent',
    agentName: meta.agentName,
    reason: meta.reason,
    startedAt,
    before: {
      editPlan: structuredClone(state.editPlan),
      transcript: structuredClone(state.transcript),
      brandTokens: structuredClone(state.brandTokens),
    },
    draft: {
      editPlan: structuredClone(state.editPlan),
      transcript: structuredClone(state.transcript),
      brandTokens: structuredClone(state.brandTokens),
    },
    opsLog: [],
    dirty: {
      editPlan: false,
      transcript: false,
      brandTokens: false,
    },
  };

  await atomicWriteFile(path.join(txDir, `${txId}.json`), JSON.stringify(tx, null, 2));
  return { txId, projectSlug, startedAt };
}

async function findActiveTransaction(
  vaultRoot: string,
  txId: string,
  projectSlug?: string
): Promise<{ tx: ActiveTransaction; txPath: string; projectDir: string }> {
  if (!/^[a-zA-Z0-9_-]+$/.test(txId)) {
    throw new Error(`Invalid transaction ID: ${txId}`);
  }
  const slugs = projectSlug
    ? [projectSlug]
    : (await listProjects(vaultRoot)).map((p) => p.slug);

  for (const slug of slugs) {
    const projectDir = getProjectDir(vaultRoot, slug);
    const activeTxDir = path.join(projectDir, '.history', 'active-tx');
    const txPath = assertSafeChild(activeTxDir, path.join(activeTxDir, `${txId}.json`));
    if (existsSync(txPath)) {
      const tx = JSON.parse(await fs.readFile(txPath, 'utf8')) as ActiveTransaction;
      return { tx, txPath, projectDir };
    }
  }
  throw new Error(`Active transaction not found: ${txId}`);
}

export async function applyTimelineOps(
  vaultRoot: string,
  txId: string,
  rawOps: TimelineOp[],
  projectSlug?: string
): Promise<{ txId: string; appliedCount: number; opsLog: string[]; editPlan: EditPlanV2 }> {
  const { tx, txPath } = await findActiveTransaction(vaultRoot, txId, projectSlug);
  const ops = rawOps.map((o) => TimelineOpSchema.parse(o));
  const dirty = tx.dirty ?? { editPlan: false, transcript: false, brandTokens: false };

  for (const op of ops) {
    switch (op.op) {
      case 'add_motion_plate': {
        tx.draft.editPlan.motionPlates = tx.draft.editPlan.motionPlates.filter(
          (p) => p.id !== op.plate.id
        );
        tx.draft.editPlan.motionPlates.push(op.plate);
        tx.opsLog.push(`Added motion plate ${op.plate.sceneId} (${op.plate.start}s–${op.plate.end}s)`);
        dirty.editPlan = true;
        break;
      }
      case 'update_motion_plate': {
        tx.draft.editPlan.motionPlates = tx.draft.editPlan.motionPlates.map((p) =>
          p.id === op.id ? { ...p, ...op.patch } : p
        );
        tx.opsLog.push(`Updated motion plate ${op.id}`);
        dirty.editPlan = true;
        break;
      }
      case 'remove_motion_plate': {
        tx.draft.editPlan.motionPlates = tx.draft.editPlan.motionPlates.filter((p) => p.id !== op.id);
        tx.opsLog.push(`Removed motion plate ${op.id}`);
        dirty.editPlan = true;
        break;
      }
      case 'add_broll': {
        tx.draft.editPlan.broll.push(op.broll);
        tx.opsLog.push(`Added B-roll "${op.broll.label}" (${op.broll.start}s–${op.broll.end}s)`);
        dirty.editPlan = true;
        break;
      }
      case 'update_broll': {
        tx.draft.editPlan.broll = tx.draft.editPlan.broll.map((b, idx) =>
          (op.id && b.id === op.id) || (op.index !== undefined && idx === op.index)
            ? { ...b, ...op.patch }
            : b
        );
        tx.opsLog.push('Updated B-roll beat');
        dirty.editPlan = true;
        break;
      }
      case 'remove_broll': {
        tx.draft.editPlan.broll = tx.draft.editPlan.broll.filter(
          (b, idx) => !((op.id && b.id === op.id) || (op.index !== undefined && idx === op.index))
        );
        tx.opsLog.push('Removed B-roll beat');
        dirty.editPlan = true;
        break;
      }
      case 'add_camera_move': {
        tx.draft.editPlan.cameraMoves.push(op.move);
        tx.opsLog.push(`Added camera move (${op.move.start}s–${op.move.end}s)`);
        dirty.editPlan = true;
        break;
      }
      case 'update_camera_move': {
        tx.draft.editPlan.cameraMoves = tx.draft.editPlan.cameraMoves.map((m, idx) =>
          (op.id && m.id === op.id) || (op.index !== undefined && idx === op.index)
            ? { ...m, ...op.patch }
            : m
        );
        tx.opsLog.push('Updated camera move');
        dirty.editPlan = true;
        break;
      }
      case 'remove_camera_move': {
        tx.draft.editPlan.cameraMoves = tx.draft.editPlan.cameraMoves.filter(
          (m, idx) => !((op.id && m.id === op.id) || (op.index !== undefined && idx === op.index))
        );
        tx.opsLog.push('Removed camera move');
        dirty.editPlan = true;
        break;
      }
      case 'add_callout': {
        tx.draft.editPlan.callouts.push(op.callout);
        tx.opsLog.push(`Added callout "${op.callout.title}"`);
        dirty.editPlan = true;
        break;
      }
      case 'update_callout': {
        tx.draft.editPlan.callouts = tx.draft.editPlan.callouts.map((c, idx) =>
          (op.id && c.id === op.id) || (op.index !== undefined && idx === op.index)
            ? { ...c, ...op.patch }
            : c
        );
        tx.opsLog.push('Updated callout');
        dirty.editPlan = true;
        break;
      }
      case 'remove_callout': {
        tx.draft.editPlan.callouts = tx.draft.editPlan.callouts.filter(
          (c, idx) => !((op.id && c.id === op.id) || (op.index !== undefined && idx === op.index))
        );
        tx.opsLog.push('Removed callout');
        dirty.editPlan = true;
        break;
      }
      case 'add_caption': {
        tx.draft.editPlan.captions = tx.draft.editPlan.captions.filter((c) => c.id !== op.caption.id);
        tx.draft.editPlan.captions.push(op.caption);
        tx.opsLog.push(`Added caption "${op.caption.text.slice(0, 30)}"`);
        dirty.editPlan = true;
        break;
      }
      case 'update_caption': {
        tx.draft.editPlan.captions = tx.draft.editPlan.captions.map((c) =>
          c.id === op.id ? { ...c, ...op.patch } : c
        );
        tx.opsLog.push(`Updated caption ${op.id}`);
        dirty.editPlan = true;
        break;
      }
      case 'remove_caption': {
        tx.draft.editPlan.captions = tx.draft.editPlan.captions.filter((c) => c.id !== op.id);
        tx.opsLog.push(`Removed caption ${op.id}`);
        dirty.editPlan = true;
        break;
      }
      case 'set_cuts': {
        tx.draft.editPlan.cuts = op.cuts;
        tx.opsLog.push(`Set ${op.cuts.length} timeline cuts`);
        dirty.editPlan = true;
        break;
      }
      case 'set_source_video': {
        tx.draft.editPlan.sourceVideo = op.sourceVideo;
        tx.opsLog.push(`Set stage video to ${op.sourceVideo}`);
        dirty.editPlan = true;
        break;
      }
      case 'set_canvas': {
        tx.draft.editPlan.width = op.width;
        tx.draft.editPlan.height = op.height;
        if (op.fps) tx.draft.editPlan.fps = op.fps;
        tx.opsLog.push(`Set canvas ${op.width}x${op.height}`);
        dirty.editPlan = true;
        break;
      }
      case 'upsert_asset': {
        tx.draft.editPlan.assets = tx.draft.editPlan.assets.filter((a) => a.id !== op.asset.id);
        tx.draft.editPlan.assets.push(op.asset);
        tx.opsLog.push(`Registered asset ${op.asset.label || op.asset.id}`);
        dirty.editPlan = true;
        break;
      }
      case 'remove_asset': {
        tx.draft.editPlan.assets = tx.draft.editPlan.assets.filter((a) => a.id !== op.id);
        tx.opsLog.push(`Removed asset ${op.id}`);
        dirty.editPlan = true;
        break;
      }
      case 'set_shots': {
        tx.draft.editPlan.shots = op.shots;
        tx.opsLog.push(`Set ${op.shots.length} sequence shots`);
        dirty.editPlan = true;
        break;
      }
      case 'add_shot': {
        tx.draft.editPlan.shots = tx.draft.editPlan.shots.filter((s) => s.id !== op.shot.id);
        tx.draft.editPlan.shots.push(op.shot);
        tx.opsLog.push(`Added shot "${op.shot.label}"`);
        dirty.editPlan = true;
        break;
      }
      case 'update_shot': {
        tx.draft.editPlan.shots = tx.draft.editPlan.shots.map((s) =>
          s.id === op.id ? { ...s, ...op.patch } : s
        );
        tx.opsLog.push(`Updated shot ${op.id}`);
        dirty.editPlan = true;
        break;
      }
      case 'remove_shot': {
        tx.draft.editPlan.shots = tx.draft.editPlan.shots.filter((s) => s.id !== op.id);
        tx.opsLog.push(`Removed shot ${op.id}`);
        dirty.editPlan = true;
        break;
      }
      case 'add_review_note': {
        tx.draft.editPlan.reviewNotes = tx.draft.editPlan.reviewNotes.filter((n) => n.id !== op.note.id);
        tx.draft.editPlan.reviewNotes.push(op.note);
        tx.opsLog.push(`Added review note at ${op.note.atSec.toFixed(1)}s`);
        dirty.editPlan = true;
        break;
      }
      case 'resolve_review_note': {
        tx.draft.editPlan.reviewNotes = tx.draft.editPlan.reviewNotes.map((n) =>
          n.id === op.id ? { ...n, resolved: op.resolved } : n
        );
        tx.opsLog.push(`${op.resolved ? 'Resolved' : 'Reopened'} review note`);
        dirty.editPlan = true;
        break;
      }
      case 'remove_review_note': {
        tx.draft.editPlan.reviewNotes = tx.draft.editPlan.reviewNotes.filter((n) => n.id !== op.id);
        tx.opsLog.push('Removed review note');
        dirty.editPlan = true;
        break;
      }
      case 'toggle_word_deleted': {
        tx.draft.transcript.words = tx.draft.transcript.words.map((w) =>
          w.id === op.wordId ? { ...w, deleted: op.deleted } : w
        );
        tx.opsLog.push(`${op.deleted ? 'Deleted' : 'Restored'} word ${op.wordId}`);
        dirty.transcript = true;
        break;
      }
      case 'update_color_grade': {
        tx.draft.editPlan.colorGrade = {
          ...(tx.draft.editPlan.colorGrade ?? {}),
          ...op.colorGrade,
        };
        tx.opsLog.push('Updated color grade');
        dirty.editPlan = true;
        break;
      }
      case 'update_audio': {
        tx.draft.editPlan.audio = {
          ...(tx.draft.editPlan.audio ?? {}),
          ...op.audio,
        };
        tx.opsLog.push('Updated audio mix settings');
        dirty.editPlan = true;
        break;
      }
      case 'update_brand_tokens': {
        tx.draft.brandTokens = {
          ...tx.draft.brandTokens,
          ...(op.tokens as Partial<BrandTokens>),
        };
        tx.opsLog.push('Updated Brand Kit tokens');
        dirty.brandTokens = true;
        break;
      }
    }
  }

  tx.dirty = dirty;
  await atomicWriteFile(txPath, JSON.stringify(tx, null, 2));
  return {
    txId: tx.txId,
    appliedCount: ops.length,
    opsLog: tx.opsLog,
    editPlan: tx.draft.editPlan,
  };
}

export async function commitProjectEdit(
  vaultRoot: string,
  txId: string,
  summary?: string,
  projectSlug?: string
): Promise<TransactionRecord> {
  const { tx, txPath, projectDir } = await findActiveTransaction(vaultRoot, txId, projectSlug);

  const finalSummary =
    summary || (tx.opsLog.length > 0 ? tx.opsLog.join('; ') : tx.reason || 'Updated project');

  const dirty = tx.dirty ?? { editPlan: true, transcript: true, brandTokens: true };
  const changedFiles: string[] = [];
  const writes: Promise<void>[] = [];

  if (dirty.editPlan || (!dirty.transcript && !dirty.brandTokens)) {
    tx.draft.editPlan.revision = (tx.draft.editPlan.revision ?? 0) + 1;
    changedFiles.push('edit-plan.json');
    writes.push(
      atomicWriteFile(
        path.join(projectDir, 'edit-plan.json'),
        JSON.stringify(EditPlanV2Schema.parse(tx.draft.editPlan), null, 2)
      )
    );
  }
  if (dirty.transcript) {
    changedFiles.push('transcript.json');
    writes.push(
      atomicWriteFile(
        path.join(projectDir, 'transcript.json'),
        JSON.stringify(TranscriptDocSchema.parse(tx.draft.transcript), null, 2)
      )
    );
  }
  if (dirty.brandTokens) {
    changedFiles.push('brand/DESIGN.md');
    writes.push(
      atomicWriteFile(
        path.join(projectDir, 'brand', 'DESIGN.md'),
        serializeDesignMd(tx.projectSlug, tx.draft.brandTokens)
      )
    );
  }

  await Promise.all(writes);

  const commitsDir = path.join(projectDir, '.history', 'commits');
  await fs.mkdir(commitsDir, { recursive: true });

  const timestamp = new Date().toISOString();
  const committed: CommittedTransaction = {
    txId: tx.txId,
    actor: tx.actor,
    agentName: tx.agentName,
    summary: finalSummary,
    timestamp,
    projectSlug: tx.projectSlug,
    changedFiles,
    before: tx.before,
    after: tx.draft,
  };

  const safeTs = timestamp.replace(/[:.]/g, '-');
  await atomicWriteFile(
    path.join(commitsDir, `${safeTs}-${tx.txId}.json`),
    JSON.stringify(committed, null, 2)
  );
  await fs.unlink(txPath).catch(() => undefined);

  await updateProjectManifest(vaultRoot, tx.projectSlug, { status: 'Editing' });

  const { before: _b, after: _a, ...record } = committed;
  return record;
}

export async function abortProjectEdit(
  vaultRoot: string,
  txId: string,
  projectSlug?: string
): Promise<{ aborted: true; txId: string }> {
  const { txPath } = await findActiveTransaction(vaultRoot, txId, projectSlug);
  await fs.unlink(txPath);
  return { aborted: true, txId };
}

export async function listTransactions(
  vaultRoot: string,
  projectSlug: string
): Promise<TransactionRecord[]> {
  const projectDir = getProjectDir(vaultRoot, projectSlug);
  const commitsDir = path.join(projectDir, '.history', 'commits');
  if (!existsSync(commitsDir)) return [];
  const files = (await fs.readdir(commitsDir)).filter((f) => f.endsWith('.json')).sort().reverse();
  const records: TransactionRecord[] = [];

  for (const file of files.slice(0, 30)) {
    try {
      const raw = JSON.parse(await fs.readFile(path.join(commitsDir, file), 'utf8')) as CommittedTransaction;
      records.push({
        txId: raw.txId,
        actor: raw.actor,
        agentName: raw.agentName,
        summary: raw.summary,
        timestamp: raw.timestamp,
        projectSlug: raw.projectSlug,
        changedFiles: raw.changedFiles,
      });
    } catch {
      // Skip corrupt history entry
    }
  }
  return records;
}

export async function undoLastTransaction(
  vaultRoot: string,
  projectSlug: string
): Promise<{ undoneTxId: string; summary: string } | null> {
  const projectDir = getProjectDir(vaultRoot, projectSlug);
  const commitsDir = path.join(projectDir, '.history', 'commits');
  if (!existsSync(commitsDir)) return null;
  const files = (await fs.readdir(commitsDir)).filter((f) => f.endsWith('.json')).sort().reverse();
  if (files.length === 0) return null;

  const latestFile = path.join(commitsDir, files[0]);
  const committed = JSON.parse(await fs.readFile(latestFile, 'utf8')) as CommittedTransaction;

  await Promise.all([
    fs.writeFile(
      path.join(projectDir, 'edit-plan.json'),
      JSON.stringify(committed.before.editPlan, null, 2),
      'utf8'
    ),
    fs.writeFile(
      path.join(projectDir, 'transcript.json'),
      JSON.stringify(committed.before.transcript, null, 2),
      'utf8'
    ),
    fs.writeFile(
      path.join(projectDir, 'brand', 'DESIGN.md'),
      serializeDesignMd(projectSlug, committed.before.brandTokens),
      'utf8'
    ),
  ]);

  await fs.unlink(latestFile);
  return { undoneTxId: committed.txId, summary: committed.summary };
}

export async function saveProjectEditPlanDirect(
  vaultRoot: string,
  projectSlug: string,
  editPlan: EditPlanV2,
  summary = 'Manual studio edit'
): Promise<ProjectState> {
  const { txId } = await beginProjectEdit(vaultRoot, projectSlug, {
    actor: 'human',
    reason: summary,
  });
  const { txPath } = await findActiveTransaction(vaultRoot, txId, projectSlug);
  const tx = JSON.parse(await fs.readFile(txPath, 'utf8')) as ActiveTransaction;
  tx.draft.editPlan = EditPlanV2Schema.parse(editPlan);
  tx.dirty = { editPlan: true, transcript: false, brandTokens: false };
  await atomicWriteFile(txPath, JSON.stringify(tx, null, 2));
  await commitProjectEdit(vaultRoot, txId, summary, projectSlug);
  return getProjectState(vaultRoot, projectSlug);
}

export async function saveProjectTranscriptDirect(
  vaultRoot: string,
  projectSlug: string,
  transcript: TranscriptDoc,
  summary = 'Transcript edit'
): Promise<ProjectState> {
  const { txId } = await beginProjectEdit(vaultRoot, projectSlug, {
    actor: 'human',
    reason: summary,
  });
  const { txPath } = await findActiveTransaction(vaultRoot, txId, projectSlug);
  const tx = JSON.parse(await fs.readFile(txPath, 'utf8')) as ActiveTransaction;
  tx.draft.transcript = TranscriptDocSchema.parse(transcript);
  tx.dirty = { editPlan: false, transcript: true, brandTokens: false };
  await atomicWriteFile(txPath, JSON.stringify(tx, null, 2));
  await commitProjectEdit(vaultRoot, txId, summary, projectSlug);
  return getProjectState(vaultRoot, projectSlug);
}

export interface ProbedClipInfo {
  path: string;
  filename: string;
  kind: 'video' | 'audio' | 'image';
  width?: number;
  height?: number;
  fps?: number;
  durationSec: number;
  hasAudio: boolean;
  safeIn: number;
  safeOut: number;
  slowmoHint: boolean;
}

export async function probeMediaPaths(inputPaths: string[]): Promise<{
  ffmpegCapabilities: { hasVidstab: boolean; hasDeshake: boolean; hasVideotoolbox: boolean };
  clips: ProbedClipInfo[];
}> {
  let hasVidstab = false;
  let hasDeshake = false;
  let hasVideotoolbox = false;
  try {
    const { stdout: filters } = await execFileAsync('ffmpeg', ['-hide_banner', '-filters']);
    hasVidstab = filters.includes('vidstabdetect') && filters.includes('vidstabtransform');
    hasDeshake = filters.includes('deshake');
  } catch {
    // ffmpeg optional
  }
  try {
    const { stdout: encoders } = await execFileAsync('ffmpeg', ['-hide_banner', '-encoders']);
    hasVideotoolbox = encoders.includes('h264_videotoolbox');
  } catch {
    // ignore
  }

  const clips: ProbedClipInfo[] = [];
  const parseRate = (rate?: string): number => {
    if (!rate || rate === '0/0') return 0;
    if (rate.includes('/')) {
      const [n, d] = rate.split('/');
      const den = Number(d);
      return den > 0 ? Number((Number(n) / den).toFixed(3)) : 0;
    }
    return Number(Number(rate).toFixed(3)) || 0;
  };

  for (const rawPath of inputPaths) {
    const abs = path.resolve(rawPath);
    if (!existsSync(abs)) continue;
    const ext = path.extname(abs).toLowerCase();
    const isAudio = ['.mp3', '.wav', '.m4a'].includes(ext);
    const isImage = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);
    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_streams',
        '-show_format',
        abs,
      ]);
      const data = JSON.parse(stdout) as {
        streams?: Array<Record<string, unknown>>;
        format?: Record<string, unknown>;
      };
      const vStream = data.streams?.find((s) => s.codec_type === 'video');
      const aStream = data.streams?.find((s) => s.codec_type === 'audio');
      const durationSec = Number(
        Number(vStream?.duration ?? data.format?.duration ?? 0).toFixed(3)
      );
      const fps = parseRate((vStream?.r_frame_rate ?? vStream?.avg_frame_rate) as string | undefined);
      const safeIn = durationSec >= 1.5 ? 0.4 : durationSec >= 0.6 ? 0.15 : 0;
      const safeOut =
        durationSec >= 1.5
          ? Number((durationSec - 0.4).toFixed(3))
          : durationSec >= 0.6
            ? Number((durationSec - 0.15).toFixed(3))
            : durationSec;
      clips.push({
        path: abs,
        filename: path.basename(abs),
        kind: isImage ? 'image' : isAudio ? 'audio' : 'video',
        width: typeof vStream?.width === 'number' ? vStream.width : undefined,
        height: typeof vStream?.height === 'number' ? vStream.height : undefined,
        fps: fps > 0 ? fps : undefined,
        durationSec,
        hasAudio: Boolean(aStream),
        safeIn,
        safeOut,
        slowmoHint: fps >= 48,
      });
    } catch {
      // Skip unprobeable files
    }
  }

  return {
    ffmpegCapabilities: { hasVidstab, hasDeshake, hasVideotoolbox },
    clips,
  };
}

export async function registerMediaInProject(
  vaultRoot: string,
  projectSlug: string,
  filePaths: string[],
  mode: 'link' | 'copy' = 'link'
): Promise<{ registered: MediaAsset[]; state: ProjectState }> {
  await ensureProjectFilesExist(vaultRoot, projectSlug);
  const projectDir = getProjectDir(vaultRoot, projectSlug);
  const mediaDir = path.join(projectDir, 'media');
  await fs.mkdir(mediaDir, { recursive: true });

  const probed = await probeMediaPaths(filePaths);
  const { txId } = await beginProjectEdit(vaultRoot, projectSlug, {
    actor: 'agent',
    reason: `Registered ${filePaths.length} media file(s)`,
  });

  const ops: TimelineOp[] = [];
  const registered: MediaAsset[] = [];

  for (let i = 0; i < filePaths.length; i++) {
    const abs = path.resolve(filePaths[i]);
    if (!existsSync(abs)) continue;
    const probe = probed.clips.find((c) => c.path === abs);
    let uri = `file://${abs}`;
    if (mode === 'copy') {
      const dest = assertSafeChild(mediaDir, path.join(mediaDir, path.basename(abs)));
      if (dest !== abs) {
        await fs.copyFile(abs, dest);
      }
      uri = `media/${path.basename(abs)}`;
    }
    const ext = path.extname(abs).toLowerCase();
    const kind: MediaAsset['kind'] = ['.mp3', '.wav', '.m4a'].includes(ext)
      ? 'audio'
      : ['.png', '.jpg', '.jpeg', '.webp'].includes(ext)
        ? 'image'
        : 'video';
    const asset: MediaAsset = {
      id: `asset_${slugify(path.basename(abs, ext))}_${Date.now().toString(36)}_${i}`,
      kind,
      uri,
      label: path.basename(abs),
      durationSec: probe?.durationSec,
      fps: probe?.fps,
      width: probe?.width,
      height: probe?.height,
      hasAudio: probe?.hasAudio,
    };
    registered.push(asset);
    ops.push({ op: 'upsert_asset', asset });
  }

  if (ops.length > 0) {
    await applyTimelineOps(vaultRoot, txId, ops, projectSlug);
    await commitProjectEdit(vaultRoot, txId, `Registered ${registered.length} media asset(s)`, projectSlug);

    // Mirror newly registered assets into linked idea or project plan.md if present on disk
    const latestState = await getProjectState(vaultRoot, projectSlug);
    if (latestState.linkedIdea) {
      const existingPool = latestState.linkedIdea.frontmatter.media_pool ?? [];
      const seenPaths = new Set(existingPool.map((m) => path.resolve(m.path)));
      const additions: IdeaMediaItem[] = [];
      for (const asset of registered) {
        const abs = resolveLocalAssetPath(projectDir, asset.uri);
        if (seenPaths.has(abs)) continue;
        seenPaths.add(abs);
        additions.push({
          id: asset.id,
          label: asset.label || path.basename(abs),
          path: abs,
          kind: asset.kind,
          role: asset.kind === 'audio' ? 'Music' : asset.kind === 'image' ? 'Asset' : 'B-Roll',
          durationSec: asset.durationSec,
          width: asset.width,
          height: asset.height,
          fps: asset.fps,
        });
      }
      if (additions.length > 0) {
        await saveProjectPlan(vaultRoot, projectSlug, {
          frontmatter: { media_pool: [...existingPool, ...additions] },
        });
      }
    }
  } else {
    await abortProjectEdit(vaultRoot, txId, projectSlug);
  }

  return { registered, state: await getProjectState(vaultRoot, projectSlug) };
}

export function resolveIdeaFilePath(vaultRoot: string, slug: string): string {
  const paths = resolveVaultPaths(vaultRoot);
  const direct = assertSafeChild(paths.ideasDir, path.join(paths.ideasDir, `${slug}.md`));
  if (existsSync(direct)) return direct;
  if (existsSync(paths.ideasDir)) {
    const entries = fsSync.readdirSync(paths.ideasDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isFile() && ent.name.endsWith('.md') && slugify(ent.name.replace(/\.md$/, '')) === slug) {
        return assertSafeChild(paths.ideasDir, path.join(paths.ideasDir, ent.name));
      }
    }
  }
  throw new Error(`Idea "${slug}" not found`);
}

export function resolveProjectDirPath(vaultRoot: string, slug: string): string {
  const paths = resolveVaultPaths(vaultRoot);
  const dir = assertSafeChild(paths.projectsDir, path.join(paths.projectsDir, slug));
  if (!existsSync(dir)) {
    throw new Error(`Project "${slug}" not found`);
  }
  return dir;
}

export async function deleteIdea(
  vaultRoot: string,
  slug: string,
  trashFn?: (targetPath: string) => Promise<void>
): Promise<{ deletedSlug: string; filePath: string }> {
  const filePath = resolveIdeaFilePath(vaultRoot, slug);
  if (trashFn) {
    await trashFn(filePath);
  } else {
    await fs.unlink(filePath);
  }
  return { deletedSlug: slug, filePath };
}

export async function deleteProject(
  vaultRoot: string,
  slug: string,
  trashFn?: (targetPath: string) => Promise<void>
): Promise<{ deletedSlug: string; dirPath: string }> {
  const dirPath = resolveProjectDirPath(vaultRoot, slug);
  if (trashFn) {
    await trashFn(dirPath);
  } else {
    await fs.rm(dirPath, { recursive: true, force: true });
  }
  return { deletedSlug: slug, dirPath };
}
