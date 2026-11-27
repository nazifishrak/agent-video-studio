import type { IdeaRecord, ProjectManifest } from '../../shared/schemas';

export interface UnifiedVideoItem {
  key: string;
  title: string;
  status: string;
  pillar: string;
  format: string;
  projectSlug: string | null;
  ideaSlug: string | null;
  project: ProjectManifest | null;
  idea: IdeaRecord | null;
  mediaCount: number;
  checklistTotal: number;
  checklistDone: number;
}

export function buildUnifiedVideos(
  ideas: IdeaRecord[],
  projects: ProjectManifest[]
): UnifiedVideoItem[] {
  const ideaBySlug = new Map(ideas.map((i) => [i.slug, i]));
  const claimedIdeaSlugs = new Set<string>();
  const items: UnifiedVideoItem[] = [];

  for (const project of projects) {
    const linkedIdea = project.ideaId ? ideaBySlug.get(project.ideaId) ?? null : null;
    if (linkedIdea) {
      claimedIdeaSlugs.add(linkedIdea.slug);
    }
    items.push({
      key: `proj:${project.slug}`,
      title: linkedIdea?.frontmatter.title || project.title,
      status: linkedIdea?.frontmatter.status || project.status || 'Draft',
      pillar: linkedIdea?.frontmatter.pillar || 'Video Project',
      format:
        linkedIdea?.frontmatter.format ||
        (project.aspectRatio === '9:16' ? 'Short (9:16)' : 'Long-Form (16:9)'),
      projectSlug: project.slug,
      ideaSlug: linkedIdea?.slug ?? project.ideaId ?? null,
      project,
      idea: linkedIdea,
      mediaCount: linkedIdea?.frontmatter.media_pool?.length ?? 0,
      checklistTotal: linkedIdea?.checklistItems.length ?? 0,
      checklistDone: linkedIdea?.checklistItems.filter((c) => c.checked).length ?? 0,
    });
  }

  for (const idea of ideas) {
    if (claimedIdeaSlugs.has(idea.slug)) continue;
    items.push({
      key: `idea:${idea.slug}`,
      title: idea.frontmatter.title,
      status: idea.frontmatter.status,
      pillar: idea.frontmatter.pillar,
      format: idea.frontmatter.format,
      projectSlug: null,
      ideaSlug: idea.slug,
      project: null,
      idea,
      mediaCount: idea.frontmatter.media_pool?.length ?? 0,
      checklistTotal: idea.checklistItems.length,
      checklistDone: idea.checklistItems.filter((c) => c.checked).length,
    });
  }

  return items;
}

export function findActiveUnifiedVideo(
  videos: UnifiedVideoItem[],
  activeVideoKey: string | null,
  activeProjectSlug: string | null,
  selectedIdeaSlug: string | null
): UnifiedVideoItem | null {
  if (videos.length === 0) return null;
  if (activeVideoKey) {
    const byKey = videos.find((v) => v.key === activeVideoKey);
    if (byKey) return byKey;
  }
  if (activeProjectSlug) {
    const byProj = videos.find((v) => v.projectSlug === activeProjectSlug);
    if (byProj) return byProj;
  }
  if (selectedIdeaSlug) {
    const byIdea = videos.find((v) => v.ideaSlug === selectedIdeaSlug);
    if (byIdea) return byIdea;
  }
  return videos[0];
}
