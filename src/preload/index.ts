import { contextBridge, ipcRenderer } from 'electron';
import type { BrandTokens } from '../shared/designTokens.js';
import type {
  EditPlanV2,
  IdeaFrontmatter,
  ProjectManifest,
  TimelineOp,
  TranscriptDoc,
} from '../shared/schemas.js';

export const studioApi = {
  getBootstrap: () => ipcRenderer.invoke('studio:bootstrap'),
  pickVaultFolder: () => ipcRenderer.invoke('vault:pickFolder'),
  createStarterVault: () => ipcRenderer.invoke('vault:createStarter'),
  openVault: (vaultRoot: string) => ipcRenderer.invoke('vault:open', vaultRoot),

  listIdeas: () => ipcRenderer.invoke('ideas:list'),
  readIdea: (slug: string) => ipcRenderer.invoke('ideas:read', slug),
  createIdea: (input: { title: string; pillar?: string; format?: string; status?: string; body?: string }) =>
    ipcRenderer.invoke('ideas:create', input),
  updateIdea: (
    slug: string,
    patch: { frontmatter?: Partial<IdeaFrontmatter>; body?: string; toggleChecklistIndex?: number }
  ) => ipcRenderer.invoke('ideas:update', slug, patch),

  listProjects: () => ipcRenderer.invoke('projects:list'),
  createProjectFromIdea: (options: {
    ideaSlug?: string;
    title: string;
    slug?: string;
    aspectRatio?: '16:9' | '9:16';
    brandKitId?: string;
  }) => ipcRenderer.invoke('projects:createFromIdea', options),
  getProjectState: (slug: string) => ipcRenderer.invoke('projects:getState', slug),
  updateProjectManifest: (slug: string, patch: Partial<ProjectManifest>) =>
    ipcRenderer.invoke('projects:updateManifest', slug, patch),
  saveProjectEditPlan: (slug: string, editPlan: EditPlanV2, summary?: string) =>
    ipcRenderer.invoke('projects:saveEditPlan', slug, editPlan, summary),
  saveProjectTranscript: (slug: string, transcript: TranscriptDoc, summary?: string) =>
    ipcRenderer.invoke('projects:saveTranscript', slug, transcript, summary),
  importMediaDialog: (slug: string) => ipcRenderer.invoke('projects:importMediaDialog', slug),

  applyTimelineOps: (slug: string, ops: TimelineOp[], summary?: string) =>
    ipcRenderer.invoke('projects:applyOps', slug, ops, summary),
  undoLastTransaction: (slug: string) => ipcRenderer.invoke('projects:undo', slug),
  probeMedia: (paths: string[]) => ipcRenderer.invoke('projects:probeMedia', paths),
  registerMedia: (slug: string, paths: string[], mode?: 'link' | 'copy') =>
    ipcRenderer.invoke('projects:registerMedia', slug, paths, mode),
  exportVideo: (slug: string, preset?: 'preview-720p' | 'master-1080p') =>
    ipcRenderer.invoke('projects:exportVideo', slug, preset),
  inspectTimeline: (slug: string, frameCount?: number) =>
    ipcRenderer.invoke('projects:inspectTimeline', slug, frameCount),
  revealPath: (targetPath: string) => ipcRenderer.invoke('studio:revealPath', targetPath),

  listMotionScenes: () => ipcRenderer.invoke('motion:list'),
  listBrandKits: () => ipcRenderer.invoke('brand:list'),
  saveProjectBrandKit: (projectSlug: string, tokens: BrandTokens) =>
    ipcRenderer.invoke('brand:saveProject', projectSlug, tokens),
  saveGlobalBrandKit: (name: string, tokens: BrandTokens) =>
    ipcRenderer.invoke('brand:saveGlobal', name, tokens),

  getMcpConfigInfo: () => ipcRenderer.invoke('mcp:configInfo'),
  getHarnessInfo: () => ipcRenderer.invoke('harness:info'),
  openExternalUrl: (url: string) => ipcRenderer.invoke('studio:openExternalUrl', url),
  openInExternalTerminal: () => ipcRenderer.invoke('terminal:openExternal'),
  terminalStart: (opts: { sessionId: number; cols: number; rows: number; initialCommand?: string }) =>
    ipcRenderer.invoke('terminal:start', opts),
  terminalWrite: (data: string) => ipcRenderer.send('terminal:write', data),
  terminalResize: (cols: number, rows: number) => ipcRenderer.send('terminal:resize', cols, rows),
  terminalStop: (sessionId?: number) => ipcRenderer.invoke('terminal:stop', sessionId),

  onVaultChanged: (cb: (payload: { event: string; path: string }) => void) => {
    const listener = (_: unknown, payload: { event: string; path: string }) => cb(payload);
    ipcRenderer.on('vault:changed', listener);
    return () => ipcRenderer.removeListener('vault:changed', listener);
  },
  onExportProgress: (cb: (payload: { slug: string; pct: number; message: string }) => void) => {
    const listener = (_: unknown, payload: { slug: string; pct: number; message: string }) => cb(payload);
    ipcRenderer.on('export:progress', listener);
    return () => ipcRenderer.removeListener('export:progress', listener);
  },
  onTerminalData: (cb: (data: string) => void) => {
    const listener = (_: unknown, data: string) => cb(data);
    ipcRenderer.on('terminal:data', listener);
    return () => ipcRenderer.removeListener('terminal:data', listener);
  },
  onTerminalExit: (cb: (code: number | null) => void) => {
    const listener = (_: unknown, code: number | null) => cb(code);
    ipcRenderer.on('terminal:exit', listener);
    return () => ipcRenderer.removeListener('terminal:exit', listener);
  },
};

contextBridge.exposeInMainWorld('studio', studioApi);
