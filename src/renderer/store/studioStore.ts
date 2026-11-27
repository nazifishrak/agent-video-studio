import { create } from 'zustand';
import type { BrandTokens } from '../../shared/designTokens';
import { DEFAULT_BRAND_TOKENS } from '../../shared/designTokens';
import type {
  ContextChip,
  IdeaRecord,
  MotionSceneMeta,
  ProjectManifest,
  TimelineOp,
} from '../../shared/schemas';
import type { BrandKitEntry, ProjectState } from '../types';
import { buildUnifiedVideos, findActiveUnifiedVideo } from '../utils/unifiedVideos';

export type StudioTab = 'planner' | 'editor';
export type EditorLeftTab = 'transcript' | 'script' | 'media' | 'motion' | 'brand';
export type TrackKey = 'video' | 'camera' | 'broll' | 'motion' | 'captions' | 'audio';

export interface LiveSyncNotice {
  id: string;
  message: string;
  projectSlug?: string;
}

export type SelectedTimelineItem =
  | { kind: 'motionPlate'; id: string }
  | { kind: 'caption'; id: string }
  | { kind: 'cameraMove'; index: number }
  | { kind: 'broll'; index: number }
  | { kind: 'shot'; id: string }
  | { kind: 'audioTrack' }
  | { kind: 'reviewNote'; id: string }
  | null;

export interface AuditionMotionEntry {
  scene: MotionSceneMeta;
  props: Record<string, unknown>;
}

interface StudioStore {
  initialized: boolean;
  activeVault: string | null;
  recentVaults: string[];
  assetServerUrl: string;
  assetServerToken: string;
  uiTheme: 'dark' | 'light';
  activeTab: StudioTab;
  editorLeftTab: EditorLeftTab;

  ideas: IdeaRecord[];
  selectedIdeaSlug: string | null;

  projects: ProjectManifest[];
  activeProjectSlug: string | null;
  projectState: ProjectState | null;
  activeVideoKey: string | null;

  motionScenes: MotionSceneMeta[];
  brandKits: BrandKitEntry[];
  previewTokensOverride: BrandTokens | null;

  currentTimeSec: number;
  isPlaying: boolean;
  selectedItem: SelectedTimelineItem;
  trackVisibility: Record<TrackKey, boolean>;
  mediaRevision: number;
  liveSyncNotice: LiveSyncNotice | null;
  auditionMotionScene: AuditionMotionEntry | null;

  contextChips: ContextChip[];
  agentDrawerOpen: boolean;
  terminalSessionActive: boolean;
  mcpModalOpen: boolean;
  onboardingOpen: boolean;
  exportModalOpen: boolean;

  bootstrap: () => Promise<void>;
  refreshVaultData: () => Promise<void>;
  setUiTheme: (theme: 'dark' | 'light') => void;
  setActiveTab: (tab: StudioTab) => void;
  setEditorLeftTab: (tab: EditorLeftTab) => void;
  setSelectedIdeaSlug: (slug: string | null) => void;
  selectProject: (slug: string) => Promise<void>;
  selectVideo: (target: { projectSlug?: string | null; ideaSlug?: string | null }) => Promise<void>;
  openActiveVideoInEdit: (overrideTarget?: {
    projectSlug?: string | null;
    ideaSlug?: string | null;
  }) => Promise<void>;
  setCurrentTimeSec: (t: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setSelectedItem: (item: SelectedTimelineItem) => void;
  setPreviewTokensOverride: (tokens: BrandTokens | null) => void;
  toggleTrackVisibility: (key: TrackKey) => void;
  bumpMediaRevision: () => void;
  setLiveSyncNotice: (notice: LiveSyncNotice | null) => void;
  setAuditionMotionScene: (entry: AuditionMotionEntry | null) => void;

  pinContextChip: (chip: Omit<ContextChip, 'id'>) => void;
  removeContextChip: (id: string) => void;
  clearContextChips: () => void;

  setAgentDrawerOpen: (open: boolean) => void;
  setTerminalSessionActive: (active: boolean) => void;
  setMcpModalOpen: (open: boolean) => void;
  setOnboardingOpen: (open: boolean) => void;
  setExportModalOpen: (open: boolean) => void;

  applyOps: (ops: TimelineOp[], summary?: string) => Promise<void>;
  undoProject: () => Promise<void>;
  getActiveBrandTokens: () => BrandTokens;
}

let refreshSeqCounter = 0;

export const useStudioStore = create<StudioStore>((set, get) => ({
  initialized: false,
  activeVault: null,
  recentVaults: [],
  assetServerUrl: '',
  assetServerToken: '',
  uiTheme: 'dark',
  activeTab: 'planner',
  editorLeftTab: 'transcript',

  ideas: [],
  selectedIdeaSlug: null,

  projects: [],
  activeProjectSlug: null,
  projectState: null,
  activeVideoKey: null,

  motionScenes: [],
  brandKits: [],
  previewTokensOverride: null,

  currentTimeSec: 0,
  isPlaying: false,
  selectedItem: null,
  trackVisibility: {
    video: true,
    camera: true,
    broll: true,
    motion: true,
    captions: true,
    audio: true,
  },
  mediaRevision: 1,
  liveSyncNotice: null,
  auditionMotionScene: null,

  contextChips: [],
  agentDrawerOpen: false,
  terminalSessionActive: false,
  mcpModalOpen: false,
  onboardingOpen: false,
  exportModalOpen: false,

  bootstrap: async () => {
    const boot = await window.studio.getBootstrap();
    set({
      initialized: true,
      activeVault: boot.activeVault,
      recentVaults: boot.recentVaults,
      assetServerUrl: boot.assetServerUrl,
      assetServerToken: boot.assetServerToken,
      onboardingOpen: !boot.activeVault,
    });
    if (boot.activeVault) {
      await get().refreshVaultData();
    }
  },

  refreshVaultData: async () => {
    const state = get();
    if (!state.activeVault) return;
    const seq = ++refreshSeqCounter;
    const [ideas, projects, motionScenes, brandKits] = await Promise.all([
      window.studio.listIdeas(),
      window.studio.listProjects(),
      window.studio.listMotionScenes(),
      window.studio.listBrandKits(),
    ]);
    if (seq !== refreshSeqCounter) return;

    const latest = get();
    const unified = buildUnifiedVideos(ideas, projects);
    const activeUnified = findActiveUnifiedVideo(
      unified,
      latest.activeVideoKey,
      latest.activeProjectSlug,
      latest.selectedIdeaSlug
    );

    const nextVideoKey = activeUnified?.key ?? null;
    const nextProjSlug = activeUnified?.projectSlug ?? null;
    const nextIdeaSlug = activeUnified?.ideaSlug ?? null;

    let projectState: ProjectState | null = null;
    if (nextProjSlug) {
      projectState = await window.studio.getProjectState(nextProjSlug);
      if (seq !== refreshSeqCounter) return;
    }

    set({
      ideas,
      projects,
      motionScenes,
      brandKits,
      activeVideoKey: nextVideoKey,
      selectedIdeaSlug: nextIdeaSlug,
      activeProjectSlug: nextProjSlug,
      projectState,
    });
  },

  setUiTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    set({ uiTheme: theme });
  },

  setActiveTab: (tab) => set({ activeTab: tab }),
  setEditorLeftTab: (tab) => set({ editorLeftTab: tab }),
  setSelectedIdeaSlug: (slug) =>
    set({
      selectedIdeaSlug: slug,
      activeVideoKey: slug ? `idea:${slug}` : null,
    }),

  selectProject: async (slug) => {
    const projectState = await window.studio.getProjectState(slug);
    set({
      activeVideoKey: `proj:${slug}`,
      activeProjectSlug: slug,
      projectState,
      selectedIdeaSlug: projectState.manifest.ideaId ?? null,
      previewTokensOverride: null,
      auditionMotionScene: null,
      currentTimeSec: 0,
      isPlaying: false,
      selectedItem: null,
    });
  },

  selectVideo: async ({ projectSlug, ideaSlug }) => {
    if (projectSlug) {
      await get().selectProject(projectSlug);
      return;
    }
    if (ideaSlug) {
      const linked = get().projects.find((p) => p.ideaId === ideaSlug);
      if (linked) {
        await get().selectProject(linked.slug);
        return;
      }
      set({
        activeVideoKey: `idea:${ideaSlug}`,
        selectedIdeaSlug: ideaSlug,
        activeProjectSlug: null,
        projectState: null,
        previewTokensOverride: null,
        auditionMotionScene: null,
        currentTimeSec: 0,
        isPlaying: false,
        selectedItem: null,
      });
    }
  },

  openActiveVideoInEdit: async (overrideTarget) => {
    const state = get();
    const unified = buildUnifiedVideos(state.ideas, state.projects);
    const target = overrideTarget
      ? unified.find(
          (v) =>
            (overrideTarget.projectSlug && v.projectSlug === overrideTarget.projectSlug) ||
            (overrideTarget.ideaSlug && v.ideaSlug === overrideTarget.ideaSlug)
        ) ?? null
      : findActiveUnifiedVideo(
          unified,
          state.activeVideoKey,
          state.activeProjectSlug,
          state.selectedIdeaSlug
        );

    if (!target) {
      set({ activeTab: 'editor' });
      return;
    }

    if (target.projectSlug) {
      if (state.activeProjectSlug !== target.projectSlug || !state.projectState) {
        await get().selectProject(target.projectSlug);
      }
      set({ activeTab: 'editor' });
      return;
    }

    if (target.ideaSlug) {
      const idea = state.ideas.find((i) => i.slug === target.ideaSlug) ?? target.idea;
      if (idea) {
        const isShort = idea.frontmatter.format.toLowerCase().includes('short');
        const created = await window.studio.createProjectFromIdea({
          ideaSlug: idea.slug,
          title: idea.frontmatter.title,
          aspectRatio: isShort ? '9:16' : '16:9',
        });
        await get().refreshVaultData();
        set({
          activeVideoKey: `proj:${created.manifest.slug}`,
          activeProjectSlug: created.manifest.slug,
          projectState: created,
          selectedIdeaSlug: idea.slug,
          activeTab: 'editor',
        });
        return;
      }
    }

    set({ activeTab: 'editor' });
  },

  setCurrentTimeSec: (t) => set({ currentTimeSec: Math.max(0, t) }),
  setIsPlaying: (playing) =>
    set((s) => ({
      isPlaying: playing,
      auditionMotionScene: playing ? null : s.auditionMotionScene,
    })),
  setSelectedItem: (item) => set({ selectedItem: item }),
  setPreviewTokensOverride: (tokens) => set({ previewTokensOverride: tokens }),
  toggleTrackVisibility: (key) =>
    set((s) => ({
      trackVisibility: { ...s.trackVisibility, [key]: !s.trackVisibility[key] },
    })),
  bumpMediaRevision: () => set((s) => ({ mediaRevision: s.mediaRevision + 1 })),
  setLiveSyncNotice: (notice) => set({ liveSyncNotice: notice }),
  setAuditionMotionScene: (entry) => set({ auditionMotionScene: entry }),

  pinContextChip: (chip) =>
    set((s) => ({
      contextChips: [
        ...s.contextChips,
        { ...chip, id: `chip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` },
      ],
      agentDrawerOpen: true,
    })),

  removeContextChip: (id) =>
    set((s) => ({ contextChips: s.contextChips.filter((c) => c.id !== id) })),

  clearContextChips: () => set({ contextChips: [] }),

  setAgentDrawerOpen: (open) => set({ agentDrawerOpen: open }),
  setTerminalSessionActive: (active) => set({ terminalSessionActive: active }),
  setMcpModalOpen: (open) => set({ mcpModalOpen: open }),
  setOnboardingOpen: (open) => set({ onboardingOpen: open }),
  setExportModalOpen: (open) => set({ exportModalOpen: open }),

  applyOps: async (ops, summary) => {
    const slug = get().activeProjectSlug;
    if (!slug) return;
    const next = await window.studio.applyTimelineOps(slug, ops, summary);
    set({ projectState: next });
  },

  undoProject: async () => {
    const slug = get().activeProjectSlug;
    if (!slug) return;
    await window.studio.undoLastTransaction(slug);
    const next = await window.studio.getProjectState(slug);
    set({ projectState: next, previewTokensOverride: null });
  },

  getActiveBrandTokens: () => {
    return get().previewTokensOverride ?? get().projectState?.brandTokens ?? DEFAULT_BRAND_TOKENS;
  },
}));
