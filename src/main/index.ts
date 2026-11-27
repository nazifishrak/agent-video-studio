import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { execFile, spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import chokidar, { FSWatcher } from 'chokidar';
import {
  applyTimelineOps,
  beginProjectEdit,
  commitProjectEdit,
  createIdea,
  createProjectFromIdea,
  createStarterVault,
  deleteIdea,
  deleteProject,
  getProjectState,
  importMediaToProject,
  listBrandKits,
  listIdeas,
  listMotionScenes,
  listProjects,
  probeMediaPaths,
  readIdea,
  readProjectPlan,
  registerMediaInProject,
  resolveProjectDirPath,
  resolveVaultPaths,
  saveGlobalBrandKit,
  saveProjectBrandKit,
  saveProjectEditPlanDirect,
  saveProjectPlan,
  saveProjectTranscriptDirect,
  undoLastTransaction,
  updateIdea,
  updateProjectManifest,
} from './vault.js';
import { exportProjectVideo, inspectTimelineContactSheet } from './exporter.js';
import { AssetServer, startAssetServer } from './server.js';
import { getAppResourcesDir, HarnessInfo, prepareAgentHarness } from './harness.js';
import { TerminalManager } from './terminal.js';
import type { BrandTokens } from '../shared/designTokens.js';
import { getCaptionVisualSpec, parseDesignMd } from '../shared/designTokens.js';
import type { StudioLiveContext } from '../shared/liveContext.js';
import {
  getUiCommandPath,
  readUiCommand,
  writeLiveContext,
} from './liveContextStore.js';
import type {
  EditPlanV2,
  IdeaFrontmatter,
  IdeaMediaItem,
  ProjectManifest,
  TimelineOp,
  TranscriptDoc,
} from '../shared/schemas.js';

interface AppConfig {
  activeVault: string | null;
  recentVaults: string[];
}

let mainWindow: BrowserWindow | null = null;
let assetServer: AssetServer | null = null;
let watcher: FSWatcher | null = null;
let commandWatcher: FSWatcher | null = null;
let activeVaultRoot: string | null = null;
let activeHarness: HarnessInfo | null = null;
let latestLiveContext: StudioLiveContext | null = null;
let lastCommandId = '';
const terminalManager = new TerminalManager();

function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'studio-config.json');
}

function getHarnessDir(): string {
  return path.join(app.getPath('userData'), 'agent-workspace');
}

function getMcpEntryPath(): string {
  return path.resolve(__dirname, '..', 'mcp', 'server.js');
}

async function loadConfig(): Promise<AppConfig> {
  try {
    const raw = await fs.readFile(getConfigPath(), 'utf8');
    return JSON.parse(raw) as AppConfig;
  } catch {
    const parentCandidate = path.resolve(__dirname, '..', '..', '..');
    const hasIdeas = fsSync.existsSync(path.join(parentCandidate, '03-video-ideas'));
    if (hasIdeas) {
      return { activeVault: parentCandidate, recentVaults: [parentCandidate] };
    }
    return { activeVault: null, recentVaults: [] };
  }
}

async function saveConfig(cfg: AppConfig): Promise<void> {
  await fs.mkdir(path.dirname(getConfigPath()), { recursive: true });
  await fs.writeFile(getConfigPath(), JSON.stringify(cfg, null, 2), 'utf8');
}

async function refreshHarness(vaultRoot: string): Promise<HarnessInfo> {
  const info = await prepareAgentHarness({
    harnessDir: getHarnessDir(),
    resourcesDir: getAppResourcesDir(),
    vaultRoot,
    mcpServerScript: getMcpEntryPath(),
  });
  activeHarness = info;
  return info;
}

async function startVaultWatcher(vaultRoot: string): Promise<void> {
  if (watcher) {
    await watcher.close();
    watcher = null;
  }
  if (commandWatcher) {
    await commandWatcher.close();
    commandWatcher = null;
  }
  const paths = resolveVaultPaths(vaultRoot, getAppResourcesDir());
  if (fsSync.existsSync(vaultRoot)) {
    fsSync.mkdirSync(paths.projectsDir, { recursive: true });
  }
  const watchTargets = [
    paths.ideasDir,
    paths.projectsDir,
    paths.userCustomScenesDir,
    paths.brandKitsDir,
  ].filter((p) => fsSync.existsSync(p));
  if (watchTargets.length > 0) {
    let debounceTimer: NodeJS.Timeout | null = null;
    let lastPayload = { event: 'change', path: '' };

    watcher = chokidar.watch(watchTargets, {
      ignoreInitial: true,
      ignored: /(^|[/\\])\..*|node_modules|\.history[/\\]active-tx|[/\\]segs([/\\]|$)|\.log$|\.tmp-|inspect-.*\.png$/,
      depth: 5,
    });

    const emitDebounced = (event: string, filePath: string) => {
      lastPayload = { event, path: filePath };
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        mainWindow?.webContents.send('vault:changed', lastPayload);
      }, 150);
    };

    watcher.on('add', (p) => emitDebounced('add', p));
    watcher.on('addDir', (p) => emitDebounced('addDir', p));
    watcher.on('change', (p) => emitDebounced('change', p));
    watcher.on('unlink', (p) => emitDebounced('unlink', p));
  }

  const cmdPath = getUiCommandPath(vaultRoot);
  commandWatcher = chokidar.watch(cmdPath, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 60, pollInterval: 20 },
  });
  const emitCommand = () => {
    const cmd = readUiCommand(vaultRoot);
    if (cmd && cmd.id !== lastCommandId) {
      lastCommandId = cmd.id;
      mainWindow?.webContents.send('studio:uiCommand', cmd);
    }
  };
  commandWatcher.on('add', emitCommand);
  commandWatcher.on('change', emitCommand);
}

async function setActiveVault(vaultRoot: string): Promise<AppConfig> {
  activeVaultRoot = path.resolve(vaultRoot);
  assetServer?.setVaultRoot(activeVaultRoot);
  await Promise.all([startVaultWatcher(activeVaultRoot), refreshHarness(activeVaultRoot)]);

  const prev = await loadConfig();
  const recent = [activeVaultRoot, ...prev.recentVaults.filter((r) => r !== activeVaultRoot)].slice(0, 6);
  const next: AppConfig = { activeVault: activeVaultRoot, recentVaults: recent };
  await saveConfig(next);
  return next;
}

function requireVault(): string {
  if (!activeVaultRoot) {
    throw new Error('No vault is currently open.');
  }
  return activeVaultRoot;
}

async function createWindow(): Promise<void> {
  const cfg = await loadConfig();
  activeVaultRoot = cfg.activeVault && fsSync.existsSync(cfg.activeVault) ? cfg.activeVault : null;
  const resourcesDir = getAppResourcesDir();
  assetServer = await startAssetServer(activeVaultRoot ?? '', resourcesDir);
  if (activeVaultRoot) {
    await Promise.all([startVaultWatcher(activeVaultRoot), refreshHarness(activeVaultRoot)]);
  }

  mainWindow = new BrowserWindow({
    width: 1460,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#090B0A',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.ELECTRON_DEV_URL;
  if (devUrl) {
    await mainWindow.loadURL(devUrl);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const PLANNER_MEDIA_EXTS = new Set([
  '.mp4',
  '.mov',
  '.webm',
  '.mkv',
  '.mp3',
  '.wav',
  '.m4a',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
]);

async function expandAndProbePlannerMedia(rawPaths: string[]): Promise<IdeaMediaItem[]> {
  const collected: string[] = [];
  const seen = new Set<string>();

  const walk = async (target: string, depth: number) => {
    if (collected.length >= 60) return;
    const abs = path.resolve(target);
    let st: fsSync.Stats;
    try {
      st = await fs.stat(abs);
    } catch {
      return;
    }
    if (st.isFile()) {
      const ext = path.extname(abs).toLowerCase();
      if (PLANNER_MEDIA_EXTS.has(ext) && !seen.has(abs)) {
        seen.add(abs);
        collected.push(abs);
      }
      return;
    }
    if (st.isDirectory() && depth < 2) {
      const entries = await fs.readdir(abs, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.name.startsWith('.')) continue;
        await walk(path.join(abs, ent.name), depth + 1);
        if (collected.length >= 60) break;
      }
    }
  };

  for (const p of rawPaths) {
    if (p) await walk(p, 0);
  }
  if (collected.length === 0) return [];

  const probed = await probeMediaPaths(collected);
  return collected.map((abs) => {
    const ext = path.extname(abs).toLowerCase();
    const base = path.basename(abs, ext);
    const kind: IdeaMediaItem['kind'] = ['.mp3', '.wav', '.m4a'].includes(ext)
      ? 'audio'
      : ['.png', '.jpg', '.jpeg', '.webp'].includes(ext)
        ? 'image'
        : 'video';
    const role: IdeaMediaItem['role'] =
      kind === 'audio' ? 'Music' : kind === 'image' ? 'Asset' : 'B-Roll';
    const clip = probed.clips.find((c) => c.path === abs);
    const safeSlug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'media';
    return {
      id: `m_${safeSlug}_${Math.random().toString(36).slice(2, 6)}`,
      label: path.basename(abs),
      path: abs,
      kind,
      role,
      durationSec: clip?.durationSec,
      width: clip?.width,
      height: clip?.height,
      fps: clip?.fps,
    };
  });
}

function registerIpcHandlers(): void {
  const resourcesDir = getAppResourcesDir();

  ipcMain.handle('studio:bootstrap', async () => {
    const cfg = await loadConfig();
    return {
      activeVault: activeVaultRoot,
      recentVaults: cfg.recentVaults,
      assetServerUrl: assetServer?.baseUrl ?? '',
      assetServerToken: assetServer?.token ?? '',
    };
  });

  ipcMain.handle('studio:revealPath', async (_, targetPath: string) => {
    if (targetPath && fsSync.existsSync(targetPath)) {
      shell.showItemInFolder(targetPath);
      return true;
    }
    return false;
  });

  ipcMain.handle('studio:openInFinder', async (_, targetPath: string) => {
    if (!targetPath || !fsSync.existsSync(targetPath)) return false;
    if (fsSync.statSync(targetPath).isDirectory()) {
      const err = await shell.openPath(targetPath);
      return err === '';
    }
    shell.showItemInFolder(targetPath);
    return true;
  });

  ipcMain.handle('vault:pickFolder', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Open Video Studio Vault Folder',
      properties: ['openDirectory'],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    const cfg = await setActiveVault(res.filePaths[0]);
    return { activeVault: activeVaultRoot, recentVaults: cfg.recentVaults };
  });

  ipcMain.handle('vault:createStarter', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Choose Folder for New Starter Vault',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    const targetDir = res.filePaths[0];
    await createStarterVault(targetDir);
    const cfg = await setActiveVault(targetDir);
    return { activeVault: activeVaultRoot, recentVaults: cfg.recentVaults };
  });

  ipcMain.handle('vault:open', async (_, vaultRoot: string) => {
    const cfg = await setActiveVault(vaultRoot);
    return { activeVault: activeVaultRoot, recentVaults: cfg.recentVaults };
  });

  ipcMain.handle('ideas:list', async () => listIdeas(requireVault()));
  ipcMain.handle('ideas:read', async (_, slug: string) => readIdea(requireVault(), slug));
  ipcMain.handle(
    'ideas:create',
    async (_, input: { title: string; pillar?: string; format?: string; status?: string; body?: string }) =>
      createIdea(requireVault(), input)
  );
  ipcMain.handle('ideas:delete', async (_, slug: string) =>
    deleteIdea(requireVault(), slug, (p) => shell.trashItem(p))
  );
  ipcMain.handle('planner:pickMedia', async (_, mode: 'files' | 'folder' = 'files') => {
    const res = await dialog.showOpenDialog({
      title: mode === 'folder' ? 'Select Media Folder for Plan' : 'Select Footage, Music, or Images for Plan',
      properties: mode === 'folder' ? ['openDirectory', 'multiSelections'] : ['openFile', 'multiSelections'],
      filters:
        mode === 'folder'
          ? undefined
          : [
              {
                name: 'Media',
                extensions: ['mp4', 'mov', 'webm', 'mkv', 'mp3', 'wav', 'm4a', 'png', 'jpg', 'jpeg', 'webp'],
              },
            ],
    });
    if (res.canceled || res.filePaths.length === 0) return [];
    return expandAndProbePlannerMedia(res.filePaths);
  });
  ipcMain.handle('planner:inspectMediaPaths', async (_, rawPaths: string[]) =>
    expandAndProbePlannerMedia(rawPaths)
  );
  ipcMain.handle('projects:delete', async (_, slug: string) =>
    deleteProject(requireVault(), slug, (p) => shell.trashItem(p))
  );
  ipcMain.handle('projects:openInFinder', async (_, slug: string) => {
    const dir = resolveProjectDirPath(requireVault(), slug);
    const err = await shell.openPath(dir);
    return err === '';
  });
  ipcMain.handle(
    'ideas:update',
    async (
      _,
      slug: string,
      patch: { frontmatter?: Partial<IdeaFrontmatter>; body?: string; toggleChecklistIndex?: number }
    ) => updateIdea(requireVault(), slug, patch)
  );

  ipcMain.handle('projects:list', async () => listProjects(requireVault()));
  ipcMain.handle(
    'projects:createFromIdea',
    async (
      _,
      options: {
        ideaSlug?: string;
        title: string;
        slug?: string;
        aspectRatio?: '16:9' | '9:16';
        brandKitId?: string;
      }
    ) => createProjectFromIdea(requireVault(), options)
  );
  ipcMain.handle('projects:getState', async (_, slug: string) => getProjectState(requireVault(), slug));
  ipcMain.handle('projects:readPlan', async (_, slug: string) => readProjectPlan(requireVault(), slug));
  ipcMain.handle(
    'projects:savePlan',
    async (
      _,
      slug: string,
      patch: { frontmatter?: Partial<IdeaFrontmatter>; body?: string; toggleChecklistIndex?: number }
    ) => saveProjectPlan(requireVault(), slug, patch)
  );
  ipcMain.handle('projects:updateManifest', async (_, slug: string, patch: Partial<ProjectManifest>) =>
    updateProjectManifest(requireVault(), slug, patch)
  );
  ipcMain.handle('projects:saveEditPlan', async (_, slug: string, plan: EditPlanV2, summary?: string) =>
    saveProjectEditPlanDirect(requireVault(), slug, plan, summary)
  );
  ipcMain.handle(
    'projects:saveTranscript',
    async (_, slug: string, transcript: TranscriptDoc, summary?: string) =>
      saveProjectTranscriptDirect(requireVault(), slug, transcript, summary)
  );
  ipcMain.handle('projects:importMediaDialog', async (_, slug: string) => {
    const res = await dialog.showOpenDialog({
      title: 'Import Video, Audio, or Image Footage',
      properties: ['openFile'],
      filters: [{ name: 'Media', extensions: ['mp4', 'mov', 'webm', 'mkv', 'mp3', 'wav', 'm4a', 'png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    return importMediaToProject(requireVault(), slug, res.filePaths[0], true);
  });

  ipcMain.handle('projects:applyOps', async (_, slug: string, ops: TimelineOp[], summary?: string) => {
    const root = requireVault();
    const { txId } = await beginProjectEdit(root, slug, { actor: 'human', reason: summary });
    await applyTimelineOps(root, txId, ops, slug);
    await commitProjectEdit(root, txId, summary, slug);
    return getProjectState(root, slug);
  });

  ipcMain.handle('projects:undo', async (_, slug: string) => undoLastTransaction(requireVault(), slug));

  ipcMain.handle('projects:probeMedia', async (_, paths: string[]) => probeMediaPaths(paths));
  ipcMain.handle(
    'projects:registerMedia',
    async (_, slug: string, paths: string[], mode?: 'link' | 'copy') =>
      registerMediaInProject(requireVault(), slug, paths, mode ?? 'link')
  );
  ipcMain.handle('studio:checkEnvironment', async () => {
    const scriptPath = path.join(resourcesDir, 'skills', 'ai-video-editor', 'scripts', 'bootstrap_env.mjs');
    const mod = await import(scriptPath);
    return mod.checkEnvironment(path.join(resourcesDir, 'skills'));
  });

  ipcMain.handle(
    'projects:exportVideo',
    async (
      _,
      slug: string,
      presetOrOpts?:
        | 'preview-720p'
        | 'master-1080p'
        | 'master-4k'
        | 'custom'
        | {
            preset?: 'preview-720p' | 'master-1080p' | 'master-4k' | 'custom';
            width?: number;
            height?: number;
            fps?: number;
          }
    ) => {
      const optsObj =
        typeof presetOrOpts === 'string'
          ? { preset: presetOrOpts }
          : presetOrOpts ?? { preset: 'master-1080p' as const };
      return exportProjectVideo({
        vaultRoot: requireVault(),
        projectSlug: slug,
        resourcesDir,
        preset: optsObj.preset ?? 'master-1080p',
        width: optsObj.width,
        height: optsObj.height,
        fps: optsObj.fps,
        renderMotionPlateVideo: async ({ plate, sceneFile, tokens, width, height, fps, outVideoPath }) => {
          if (!assetServer) return false;
          const win = new BrowserWindow({
            width,
            height,
            show: false,
            frame: false,
            transparent: plate.transparent,
            enableLargerThanScreen: true,
            webPreferences: { offscreen: true },
          });
          try {
            const url = `${assetServer.baseUrl}/scenes/${sceneFile}?manual=1&w=${width}&h=${height}${
              plate.transparent ? '&transparent=1' : ''
            }&token=${assetServer.token}`;
            await win.loadURL(url);
            await win.webContents.executeJavaScript(`
              (() => {
                if (window.applyDesignTokens) window.applyDesignTokens(${JSON.stringify(tokens)});
                if (window.setProps) window.setProps(${JSON.stringify(plate.props ?? {})});
              })()
            `);
            const dur = Math.max(0.2, plate.end - plate.start);
            const totalFrames = Math.ceil(dur * fps);
            const ffArgs = plate.transparent
              ? ['-y', '-f', 'image2pipe', '-vcodec', 'png', '-r', String(fps), '-i', '-', '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', outVideoPath]
              : ['-y', '-f', 'image2pipe', '-vcodec', 'png', '-r', String(fps), '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', outVideoPath];
            const ff = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'ignore', 'ignore'] });
            for (let f = 0; f < totalFrames; f++) {
              const t = f / fps;
              await win.webContents.executeJavaScript(`window.renderFrame && window.renderFrame(${t})`);
              const png = (await win.webContents.capturePage()).toPNG();
              if (!ff.stdin.write(png)) {
                await new Promise<void>((r) => ff.stdin.once('drain', () => r()));
              }
            }
            ff.stdin.end();
            await new Promise<void>((resolve, reject) => {
              ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
            });
            return true;
          } finally {
            win.destroy();
          }
        },
        renderCaptionPng: async ({ text, highlightWord, tokens, width, height, outPngPath }) => {
          const win = new BrowserWindow({
            width,
            height,
            show: false,
            frame: false,
            transparent: true,
            enableLargerThanScreen: true,
            webPreferences: { offscreen: true },
          });
          try {
            const spec = getCaptionVisualSpec(tokens, {
              isVertical: height > width,
              renderHeight: height,
            });
            const esc = (s: string) =>
              s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const bodyText = highlightWord
              ? text
                  .split(new RegExp(`(${highlightWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
                  .map((p) =>
                    p.toLowerCase() === highlightWord.toLowerCase()
                      ? `<span style="font-weight:${Math.min(700, spec.fontWeight + 150)};color:${spec.emphasizeColor};">${esc(p)}</span>`
                      : esc(p)
                  )
                  .join('')
              : esc(text);
            const posCss =
              tokens.caption_position === 'center'
                ? 'top:50%;transform:translateY(-50%);'
                : tokens.caption_position === 'lower-third'
                  ? 'bottom:12%;'
                  : 'bottom:6%;';
            const html = `<!doctype html><html><body style="margin:0;width:${width}px;height:${height}px;background:transparent;position:relative;overflow:hidden;font-family:${spec.fontFamily};"><div style="position:absolute;left:6%;right:6%;${posCss}display:flex;justify-content:center;"><div style="padding:${spec.padding};font-weight:${spec.fontWeight};font-size:${spec.fontSizePx}px;letter-spacing:${spec.letterSpacing};line-height:${spec.lineHeight};color:${spec.color};background:${spec.backgroundColor};border:${spec.border};border-radius:${spec.borderRadius};backdrop-filter:${spec.backdropFilter};text-shadow:${spec.textShadow};text-align:center;max-width:86%;">${bodyText}</div></div></body></html>`;
            await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
            await new Promise((r) => setTimeout(r, 40));
            const img = await win.webContents.capturePage();
            await fs.writeFile(outPngPath, img.toPNG());
            return true;
          } finally {
            win.destroy();
          }
        },
        onProgress: (pct, message) => {
          mainWindow?.webContents.send('export:progress', { slug, pct, message });
        },
      });
    }
  );
  ipcMain.handle('projects:inspectTimeline', async (_, slug: string, frameCount?: number) =>
    inspectTimelineContactSheet({
      vaultRoot: requireVault(),
      projectSlug: slug,
      frameCount: frameCount ?? 12,
    })
  );

  ipcMain.handle('motion:list', async () => listMotionScenes(requireVault(), resourcesDir));
  ipcMain.handle('brand:list', async () => listBrandKits(requireVault(), resourcesDir));
  ipcMain.handle('brand:saveProject', async (_, projectSlug: string, tokens: BrandTokens) =>
    saveProjectBrandKit(requireVault(), projectSlug, tokens)
  );
  ipcMain.handle('brand:saveGlobal', async (_, name: string, tokens: BrandTokens) =>
    saveGlobalBrandKit(requireVault(), name, tokens)
  );
  ipcMain.handle('brand:importDesignMdDialog', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Import DESIGN.md Brand Kit',
      properties: ['openFile'],
      filters: [{ name: 'Design Markdown', extensions: ['md', 'markdown', 'txt'] }],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    const filePath = res.filePaths[0];
    const raw = await fs.readFile(filePath, 'utf8');
    const mode = /\bmode\s*[:=]\s*dark\b|\bdark\b/i.test(raw.slice(0, 400)) ? 'dark' : 'light';
    const tokens = parseDesignMd(raw, mode);
    const headingMatch = raw.match(/^#\s+(.+?)(?:\s+—|\s+-|$)/m);
    const fileName = path.basename(filePath);
    const name = headingMatch?.[1]?.trim() || fileName.replace(/\.(design\.md|md|markdown|txt)$/i, '');
    return { fileName, name, raw, tokens };
  });

  ipcMain.handle('mcp:configInfo', async () => ({
    serverScript: getMcpEntryPath(),
    vaultRoot: activeVaultRoot ?? '',
    nodeBin: process.execPath.includes('Electron') ? 'node' : process.execPath,
  }));

  ipcMain.handle('harness:info', async () => {
    if (!activeHarness && activeVaultRoot) {
      await refreshHarness(activeVaultRoot);
    }
    return activeHarness;
  });

  ipcMain.handle(
    'studio:syncContext',
    async (
      _,
      ctx: Omit<StudioLiveContext, 'version' | 'updatedAt' | 'vaultRoot'>
    ) => {
      const vaultRoot = requireVault();
      const fullCtx: StudioLiveContext = {
        ...ctx,
        version: 1,
        vaultRoot,
        updatedAt: new Date().toISOString(),
      };
      latestLiveContext = fullCtx;
      await writeLiveContext(vaultRoot, fullCtx, activeHarness?.harnessDir);
      return { synced: true };
    }
  );

  ipcMain.handle(
    'terminal:start',
    async (_, opts: { sessionId: number; cols: number; rows: number; initialCommand?: string }) => {
      const vaultRoot = requireVault();
      const harness = activeHarness ?? (await refreshHarness(vaultRoot));
      const backend = terminalManager.start({
        sessionId: opts.sessionId,
        cwd: harness.harnessDir,
        cols: opts.cols,
        rows: opts.rows,
        initialCommand: opts.initialCommand,
        env: {
          STUDIO_VAULT_PATH: vaultRoot,
          STUDIO_APP_RESOURCES: resourcesDir,
          STUDIO_MCP_SERVER: getMcpEntryPath(),
          STUDIO_CONTEXT_FILE: path.join(harness.harnessDir, 'studio-context.json'),
          STUDIO_ACTIVE_PROJECT: latestLiveContext?.activeProjectSlug ?? '',
        },
        onData: (data) => mainWindow?.webContents.send('terminal:data', data),
        onExit: (code) => mainWindow?.webContents.send('terminal:exit', code),
      });
      return { started: true, cwd: harness.harnessDir, harness, backend };
    }
  );

  ipcMain.handle('studio:openExternalUrl', async (_, url: string) => {
    if (/^https?:\/\//i.test(url)) {
      await shell.openExternal(url);
      return true;
    }
    return false;
  });

  ipcMain.handle('terminal:openExternal', async () => {
    const vaultRoot = requireVault();
    const harness = activeHarness ?? (await refreshHarness(vaultRoot));
    if (process.platform === 'darwin') {
      const runOpen = (args: string[]) =>
        new Promise<void>((resolve, reject) => {
          execFile('open', args, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

      const candidates: Array<{ appName: string; appPath: string; args: string[] }> = [
        {
          appName: 'Ghostty',
          appPath: '/Applications/Ghostty.app',
          args: ['-na', 'Ghostty', '--args', `--working-directory=${harness.harnessDir}`],
        },
        {
          appName: 'Alacritty',
          appPath: '/Applications/Alacritty.app',
          args: ['-na', 'Alacritty', '--args', '--working-directory', harness.harnessDir],
        },
        {
          appName: 'iTerm',
          appPath: '/Applications/iTerm.app',
          args: ['-a', 'iTerm', harness.harnessDir],
        },
        {
          appName: 'Warp',
          appPath: '/Applications/Warp.app',
          args: ['-a', 'Warp', harness.harnessDir],
        },
      ];
      const match = candidates.find((c) => fsSync.existsSync(c.appPath));
      if (match) {
        try {
          await runOpen(match.args);
          return { opened: true, app: match.appName, cwd: harness.harnessDir };
        } catch {
          // Fall back to macOS Terminal.app if preferred app rejects launch
        }
      }
      await runOpen(['-a', 'Terminal', harness.harnessDir]);
      return { opened: true, app: 'Terminal', cwd: harness.harnessDir };
    }
    await shell.openPath(harness.harnessDir);
    return { opened: true, app: 'system', cwd: harness.harnessDir };
  });

  ipcMain.on('terminal:write', (_, data: string) => {
    terminalManager.write(data);
  });

  ipcMain.on('terminal:resize', (_, cols: number, rows: number) => {
    terminalManager.resize(cols, rows);
  });

  ipcMain.handle('terminal:stop', async (_, sessionId?: number) => {
    terminalManager.stop(sessionId);
  });
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('before-quit', () => {
  terminalManager.stop();
});

app.on('window-all-closed', async () => {
  terminalManager.stop();
  if (watcher) await watcher.close();
  if (commandWatcher) await commandWatcher.close();
  if (assetServer) await assetServer.close();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
