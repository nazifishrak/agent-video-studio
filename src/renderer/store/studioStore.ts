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

export type StudioTab = 'planner' | 'editor';
export type EditorLeftTab = 'transcript' | 'script' | 'media' | 'motion' | 'brand';

export type SelectedTimelineItem =
  | { kind: 'motionPlate'; id: string }
  | { kind: 'caption'; id: string }
  | { kind: 'cameraMove'; index: number }
  | { kind: 'broll'; index: number }
  | { kind: 'shot'; id: string }
  | { kind: 'reviewNote'; id: string }
  | null;

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

  motionScenes: MotionSceneMeta[];
  brandKits: BrandKitEntry[];
  previewTokensOverride: BrandTokens | null;

  currentTimeSec: number;
  isPlaying: boolean;
  selectedItem: SelectedTimelineItem;

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
  setCurrentTimeSec: (t: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setSelectedItem: (item: SelectedTimelineItem) => void;
  setPreviewTokensOverride: (tokens: BrandTokens | null) => void;

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

  motionScenes: [],
  brandKits: [],
  previewTokensOverride: null,

  currentTimeSec: 0,
  isPlaying: false,
  selectedItem: null,

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
    const nextIdeaSlug =
      latest.selectedIdeaSlug && ideas.some((i) => i.slug === latest.selectedIdeaSlug)
        ? latest.selectedIdeaSlug
        : ideas[0]?.slug ?? null;

    const nextProjSlug =
      latest.activeProjectSlug && projects.some((p) => p.slug === latest.activeProjectSlug)
        ? latest.activeProjectSlug
        : projects[0]?.slug ?? null;

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
  setSelectedIdeaSlug: (slug) => set({ selectedIdeaSlug: slug }),

  selectProject: async (slug) => {
    const projectState = await window.studio.getProjectState(slug);
    set({
      activeProjectSlug: slug,
      projectState,
      previewTokensOverride: null,
      currentTimeSec: 0,
      isPlaying: false,
      selectedItem: null,
    });
  },

  setCurrentTimeSec: (t) => set({ currentTimeSec: Math.max(0, t) }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setSelectedItem: (item) => set({ selectedItem: item }),
  setPreviewTokensOverride: (tokens) => set({ previewTokensOverride: tokens }),

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
