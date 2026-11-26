export const LIVE_CONTEXT_FILENAME = '.studio-live-context.json';
export const UI_COMMAND_FILENAME = '.studio-ui-command.json';

export interface StudioLiveContext {
  version: 1;
  updatedAt: string;
  vaultRoot: string;
  activeTab: 'planner' | 'editor';
  activeProjectSlug: string | null;
  activeProjectTitle?: string;
  aspectRatio?: '16:9' | '9:16';
  playheadSec: number;
  totalDurationSec?: number;
  selectedItem: Record<string, unknown> | null;
  selectedIdeaSlug: string | null;
  editorLeftTab?: string;
  pinnedContextChips?: Array<{
    kind: string;
    label: string;
    payload: Record<string, unknown>;
  }>;
}

export interface StudioUiCommand {
  id: string;
  timestamp: string;
  kind: 'project_updated' | 'focus_view' | 'brand_updated' | 'project_created';
  projectSlug?: string;
  tab?: 'planner' | 'editor';
  playheadSec?: number;
  summary?: string;
  reloadMedia?: boolean;
}
