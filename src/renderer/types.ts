import type { BrandTokens } from '../shared/designTokens';
import type { StudioUiCommand } from '../shared/liveContext';
import type {
  EditPlanV2,
  IdeaFrontmatter,
  IdeaRecord,
  MotionSceneMeta,
  ProjectManifest,
  TimelineOp,
  TranscriptDoc,
} from '../shared/schemas';

export interface StudioBootstrap {
  activeVault: string | null;
  recentVaults: string[];
  assetServerUrl: string;
  assetServerToken: string;
}

export interface BrandKitEntry {
  id: string;
  name: string;
  filePath?: string;
  source: 'vault' | 'builtin';
  tokens: BrandTokens;
}

export interface ProjectState {
  manifest: ProjectManifest;
  editPlan: EditPlanV2;
  transcript: TranscriptDoc;
  brandTokens: BrandTokens;
  mediaFiles: string[];
  transactions: Array<{
    txId: string;
    actor: 'human' | 'agent';
    agentName?: string;
    summary: string;
    timestamp: string;
    projectSlug: string;
    changedFiles: string[];
  }>;
  linkedIdea?: IdeaRecord;
}

export interface HarnessInfo {
  harnessDir: string;
  resourcesDir: string;
  vaultRoot: string;
  mcpConfigPath: string;
}

export interface StudioApi {
  getBootstrap: () => Promise<StudioBootstrap>;
  pickVaultFolder: () => Promise<{ activeVault: string | null; recentVaults: string[] } | null>;
  createStarterVault: () => Promise<{ activeVault: string | null; recentVaults: string[] } | null>;
  openVault: (vaultRoot: string) => Promise<{ activeVault: string | null; recentVaults: string[] }>;

  listIdeas: () => Promise<IdeaRecord[]>;
  readIdea: (slug: string) => Promise<IdeaRecord>;
  createIdea: (input: {
    title: string;
    pillar?: string;
    format?: string;
    status?: string;
    body?: string;
  }) => Promise<IdeaRecord>;
  updateIdea: (
    slug: string,
    patch: { frontmatter?: Partial<IdeaFrontmatter>; body?: string; toggleChecklistIndex?: number }
  ) => Promise<IdeaRecord>;
  deleteIdea: (slug: string) => Promise<{ deletedSlug: string; filePath: string }>;

  listProjects: () => Promise<ProjectManifest[]>;
  createProjectFromIdea: (options: {
    ideaSlug?: string;
    title: string;
    slug?: string;
    aspectRatio?: '16:9' | '9:16';
    brandKitId?: string;
  }) => Promise<ProjectState>;
  deleteProject: (slug: string) => Promise<{ deletedSlug: string; dirPath: string }>;
  openProjectInFinder: (slug: string) => Promise<boolean>;
  getProjectState: (slug: string) => Promise<ProjectState>;
  updateProjectManifest: (slug: string, patch: Partial<ProjectManifest>) => Promise<ProjectManifest>;
  saveProjectEditPlan: (slug: string, editPlan: EditPlanV2, summary?: string) => Promise<ProjectState>;
  saveProjectTranscript: (slug: string, transcript: TranscriptDoc, summary?: string) => Promise<ProjectState>;
  importMediaDialog: (slug: string) => Promise<{ fileName: string; relativePath: string } | null>;

  applyTimelineOps: (slug: string, ops: TimelineOp[], summary?: string) => Promise<ProjectState>;
  undoLastTransaction: (slug: string) => Promise<{ undoneTxId: string; summary: string } | null>;
  probeMedia: (paths: string[]) => Promise<{
    ffmpegCapabilities: { hasVidstab: boolean; hasDeshake: boolean; hasVideotoolbox: boolean };
    clips: Array<{ path: string; filename: string; durationSec: number; fps?: number }>;
  }>;
  registerMedia: (slug: string, paths: string[], mode?: 'link' | 'copy') => Promise<unknown>;
  exportVideo: (
    slug: string,
    options?:
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
  ) => Promise<{
    outPath: string;
    relativePath: string;
    durationSec: number;
    sizeBytes: number;
    encoder: string;
  }>;
  checkEnvironment: () => Promise<Record<string, unknown>>;
  inspectTimeline: (
    slug: string,
    frameCount?: number
  ) => Promise<{
    imagePath: string;
    relativePath: string;
    frameCount: number;
    sourcePath: string;
  }>;
  revealPath: (targetPath: string) => Promise<boolean>;
  openInFinder: (targetPath: string) => Promise<boolean>;

  listMotionScenes: () => Promise<MotionSceneMeta[]>;
  listBrandKits: () => Promise<BrandKitEntry[]>;
  saveProjectBrandKit: (projectSlug: string, tokens: BrandTokens) => Promise<BrandTokens>;
  saveGlobalBrandKit: (name: string, tokens: BrandTokens) => Promise<BrandKitEntry>;
  importDesignMdDialog: () => Promise<{
    fileName: string;
    name: string;
    raw: string;
    tokens: BrandTokens;
  } | null>;

  getMcpConfigInfo: () => Promise<{ serverScript: string; vaultRoot: string; nodeBin: string }>;
  getHarnessInfo: () => Promise<HarnessInfo | null>;
  syncStudioContext: (ctx: Record<string, unknown>) => Promise<{ synced: boolean }>;
  openExternalUrl: (url: string) => Promise<boolean>;
  openInExternalTerminal: () => Promise<{ opened: boolean; app: string; cwd: string }>;
  getPathForFile: (file: File) => string;
  terminalStart: (opts: {
    sessionId: number;
    cols: number;
    rows: number;
    initialCommand?: string;
  }) => Promise<{
    started: boolean;
    cwd: string;
    harness: HarnessInfo;
    backend?: 'native-pty' | 'python-pty';
  }>;
  terminalWrite: (data: string) => void;
  terminalResize: (cols: number, rows: number) => void;
  terminalStop: (sessionId?: number) => Promise<void>;

  onVaultChanged: (cb: (payload: { event: string; path: string }) => void) => () => void;
  onUiCommand: (cb: (cmd: StudioUiCommand) => void) => () => void;
  onExportProgress: (
    cb: (payload: { slug: string; pct: number; message: string }) => void
  ) => () => void;
  onTerminalData: (cb: (data: string) => void) => () => void;
  onTerminalExit: (cb: (code: number | null) => void) => () => void;
}

declare global {
  interface Window {
    studio: StudioApi;
  }
}
