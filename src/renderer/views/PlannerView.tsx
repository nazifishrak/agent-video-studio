import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckSquare,
  Clapperboard,
  Columns,
  Edit3,
  ExternalLink,
  Eye,
  Film,
  FolderPlus,
  Image as ImageIcon,
  List,
  Music,
  Play,
  Plus,
  Save,
  Search,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { useStudioStore } from '../store/studioStore';
import { InlineMarkdown, MarkdownRenderer } from '../components/MarkdownRenderer';
import type { IdeaMediaItem, IdeaMediaRole } from '../../shared/schemas';

const STATUS_COLUMNS = ['Idea', 'Outlined', 'Scripted', 'Ready to Film', 'Filmed', 'Published'];
const MEDIA_ROLES: IdeaMediaRole[] = ['A-Roll', 'B-Roll', 'Music', 'SFX', 'Reference', 'Asset'];

export const PlannerView: React.FC = () => {
  const {
    ideas,
    projects,
    selectedIdeaSlug,
    setSelectedIdeaSlug,
    refreshVaultData,
    setActiveTab,
    selectProject,
    pinContextChip,
    agentDrawerOpen,
    setAgentDrawerOpen,
    assetServerUrl,
    assetServerToken,
  } = useStudioStore();

  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [leftPaneTab, setLeftPaneTab] = useState<'ideas' | 'media'>('ideas');
  const [scriptMode, setScriptMode] = useState<'preview' | 'split' | 'edit'>('preview');
  const [query, setQuery] = useState('');
  const [pillarFilter, setPillarFilter] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const selectedIdea = useMemo(
    () => ideas.find((i) => i.slug === selectedIdeaSlug) ?? ideas[0] ?? null,
    [ideas, selectedIdeaSlug]
  );

  const [draftTitle, setDraftTitle] = useState('');
  const [draftStatus, setDraftStatus] = useState('Idea');
  const [draftPillar, setDraftPillar] = useState('AI & Build');
  const [draftFormat, setDraftFormat] = useState('Long-Form');
  const [draftBody, setDraftBody] = useState('');
  const [draftMediaPool, setDraftMediaPool] = useState<IdeaMediaItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [importingMedia, setImportingMedia] = useState(false);
  const [planDropActive, setPlanDropActive] = useState(false);
  const [textareaDropLine, setTextareaDropLine] = useState<number | null>(null);
  const [lightboxMedia, setLightboxMedia] = useState<IdeaMediaItem | null>(null);
  const [confirmDeleteIdeaSlug, setConfirmDeleteIdeaSlug] = useState<string | null>(null);
  const [confirmDeleteProjectSlug, setConfirmDeleteProjectSlug] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!selectedIdea) return;
    setDraftTitle(selectedIdea.frontmatter.title);
    setDraftStatus(selectedIdea.frontmatter.status);
    setDraftPillar(selectedIdea.frontmatter.pillar);
    setDraftFormat(selectedIdea.frontmatter.format);
    setDraftBody(selectedIdea.body);
    setDraftMediaPool(selectedIdea.frontmatter.media_pool ?? []);
  }, [
    selectedIdea?.slug,
    selectedIdea?.body,
    selectedIdea?.frontmatter.status,
    selectedIdea?.frontmatter.media_pool,
  ]);

  const isDirty = useMemo(() => {
    if (!selectedIdea) return false;
    return (
      draftTitle !== selectedIdea.frontmatter.title ||
      draftStatus !== selectedIdea.frontmatter.status ||
      draftPillar !== selectedIdea.frontmatter.pillar ||
      draftFormat !== selectedIdea.frontmatter.format ||
      draftBody !== selectedIdea.body ||
      JSON.stringify(draftMediaPool) !== JSON.stringify(selectedIdea.frontmatter.media_pool ?? [])
    );
  }, [selectedIdea, draftTitle, draftStatus, draftPillar, draftFormat, draftBody, draftMediaPool]);

  const linkedProject = useMemo(
    () => (selectedIdea ? projects.find((p) => p.ideaId === selectedIdea.slug) ?? null : null),
    [projects, selectedIdea]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (isDirty) void handleSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const pillars = useMemo(
    () => [...new Set(ideas.map((i) => i.frontmatter.pillar).filter(Boolean))],
    [ideas]
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return ideas.filter((i) => {
      if (pillarFilter && i.frontmatter.pillar !== pillarFilter) return false;
      if (!q) return true;
      return (
        i.frontmatter.title.toLowerCase().includes(q) ||
        i.body.toLowerCase().includes(q) ||
        i.frontmatter.pillar.toLowerCase().includes(q)
      );
    });
  }, [ideas, query, pillarFilter]);

  const handleCreateIdea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const created = await window.studio.createIdea({ title: newTitle.trim() });
    setNewTitle('');
    setCreating(false);
    await refreshVaultData();
    setSelectedIdeaSlug(created.slug);
  };

  const handleSave = async () => {
    if (!selectedIdea) return;
    setSaving(true);
    try {
      await window.studio.updateIdea(selectedIdea.slug, {
        frontmatter: {
          title: draftTitle,
          status: draftStatus,
          pillar: draftPillar,
          format: draftFormat,
          media_pool: draftMediaPool,
        },
        body: draftBody,
      });
      await refreshVaultData();
    } finally {
      setSaving(false);
    }
  };

  const persistMediaUpdate = async (nextPool: IdeaMediaItem[], nextBody?: string) => {
    setDraftMediaPool(nextPool);
    if (nextBody !== undefined) setDraftBody(nextBody);
    if (!selectedIdea) return;
    await window.studio.updateIdea(selectedIdea.slug, {
      frontmatter: {
        title: draftTitle,
        status: draftStatus,
        pillar: draftPillar,
        format: draftFormat,
        media_pool: nextPool,
      },
      body: nextBody !== undefined ? nextBody : draftBody,
    });
    await refreshVaultData();
  };

  const mergeMediaItems = async (incoming: IdeaMediaItem[], alsoTagInBody = false) => {
    if (incoming.length === 0) return;
    const existingByPath = new Map(draftMediaPool.map((m) => [m.path, m]));
    const added: IdeaMediaItem[] = [];
    for (const item of incoming) {
      if (!existingByPath.has(item.path)) {
        existingByPath.set(item.path, item);
        added.push(item);
      }
    }
    const nextPool = Array.from(existingByPath.values());
    let nextBody = draftBody;
    if (alsoTagInBody) {
      const toTag = added.length > 0 ? added : incoming;
      const tagsText = toTag.map((m) => `- \`[MEDIA:${m.id} | ${m.role} | ${m.label}]\``).join('\n');
      nextBody = `${draftBody.trimEnd()}\n${tagsText}\n`;
    }
    await persistMediaUpdate(nextPool, alsoTagInBody ? nextBody : undefined);
  };

  const handlePickPlannerMedia = async (mode: 'files' | 'folder') => {
    setImportingMedia(true);
    try {
      const items = await window.studio.pickPlannerMedia(mode);
      await mergeMediaItems(items, false);
    } finally {
      setImportingMedia(false);
    }
  };

  const resolveDroppedMediaItems = async (dt: DataTransfer): Promise<IdeaMediaItem[]> => {
    const rawMedia = dt.getData('application/x-planner-media');
    if (rawMedia) {
      try {
        return [JSON.parse(rawMedia) as IdeaMediaItem];
      } catch {
        return [];
      }
    }
    const files = Array.from(dt.files ?? []);
    if (files.length === 0) return [];
    const paths = files.map((f) => window.studio.getPathForFile(f)).filter(Boolean);
    if (paths.length === 0) return [];
    setImportingMedia(true);
    try {
      return await window.studio.inspectPlannerMediaPaths(paths);
    } finally {
      setImportingMedia(false);
    }
  };

  type InsertionTarget =
    | { mode: 'block'; startLine: number; endLine: number; placement: 'before' | 'inline' | 'after' }
    | { mode: 'line'; lineIndex: number }
    | { mode: 'cursor' };

  const applyMediaInsertion = async (items: IdeaMediaItem[], target: InsertionTarget) => {
    if (items.length === 0) return;
    const existingByPath = new Map(draftMediaPool.map((m) => [m.path, m]));
    const resolvedItems: IdeaMediaItem[] = [];
    for (const item of items) {
      const existing = existingByPath.get(item.path);
      if (existing) {
        resolvedItems.push(existing);
      } else {
        existingByPath.set(item.path, item);
        resolvedItems.push(item);
      }
    }
    const nextPool = Array.from(existingByPath.values());
    const formattedTags = resolvedItems.map((m) => `\`[MEDIA:${m.id} | ${m.role} | ${m.label}]\``);

    let nextBody = draftBody;
    if (target.mode === 'block') {
      const lines = draftBody.split(/\r?\n/);
      if (target.placement === 'inline' && lines[target.endLine] !== undefined) {
        lines[target.endLine] = `${lines[target.endLine].trimEnd()} ${formattedTags.join(' ')}`;
      } else if (target.placement === 'before') {
        lines.splice(target.startLine, 0, ...formattedTags.map((t) => `- ${t}`));
      } else {
        lines.splice(target.endLine + 1, 0, ...formattedTags.map((t) => `- ${t}`));
      }
      nextBody = lines.join('\n').trimEnd() + '\n';
    } else if (target.mode === 'line') {
      const lines = draftBody.split(/\r?\n/);
      const idx = Math.max(0, Math.min(lines.length, target.lineIndex));
      if (idx < lines.length && lines[idx].trim() !== '' && !/^\s*#{1,6}\s+/.test(lines[idx])) {
        lines[idx] = `${lines[idx].trimEnd()} ${formattedTags.join(' ')}`;
      } else {
        lines.splice(idx, 0, ...formattedTags.map((t) => `- ${t}`));
      }
      nextBody = lines.join('\n').trimEnd() + '\n';
    } else {
      const ta = textareaRef.current;
      if (ta && (scriptMode === 'edit' || scriptMode === 'split')) {
        const start = ta.selectionStart ?? draftBody.length;
        const end = ta.selectionEnd ?? start;
        nextBody = `${draftBody.slice(0, start)}${formattedTags.join(' ')}${draftBody.slice(end)}`;
      } else {
        nextBody = `${draftBody.trimEnd()}\n${formattedTags.map((t) => `- ${t}`).join('\n')}\n`;
      }
    }

    await persistMediaUpdate(nextPool, nextBody);
  };

  const handleRemoveMediaTag = async (rawTag: string) => {
    const escaped = rawTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nextBody = draftBody
      .replace(new RegExp(`\\s*-\\s*\`${escaped}\`\\s*`, 'm'), '\n')
      .replace(new RegExp(`\\s*\`${escaped}\``, 'm'), '')
      .replace(new RegExp(`\\s*${escaped}`, 'm'), '');
    await persistMediaUpdate(draftMediaPool, nextBody);
  };

  const insertMediaTag = async (item: IdeaMediaItem) => {
    await applyMediaInsertion([item], { mode: 'cursor' });
  };

  const handleBuildWithAgent = async () => {
    if (!selectedIdea) return;
    if (isDirty) {
      await handleSave();
    }
    pinContextChip({
      kind: 'project',
      label: `Plan: ${draftTitle} (${draftMediaPool.length} media)`,
      payload: {
        ideaSlug: selectedIdea.slug,
        title: draftTitle,
        filePath: selectedIdea.filePath,
        mediaPoolCount: draftMediaPool.length,
      },
    });
    setAgentDrawerOpen(true);
  };

  const buildLocalMediaUrl = (absPath: string) =>
    assetServerUrl
      ? `${assetServerUrl}/local-media?path=${encodeURIComponent(absPath)}${
          assetServerToken ? `&token=${assetServerToken}` : ''
        }`
      : '';

  const handleToggleChecklist = async (index: number) => {
    if (!selectedIdea) return;
    const updated = await window.studio.updateIdea(selectedIdea.slug, {
      toggleChecklistIndex: index,
    });
    setDraftBody(updated.body);
    await refreshVaultData();
  };

  const handlePromoteToProject = async () => {
    if (!selectedIdea) return;
    setPromoting(true);
    try {
      const isShort = selectedIdea.frontmatter.format.toLowerCase().includes('short');
      const created = await window.studio.createProjectFromIdea({
        ideaSlug: selectedIdea.slug,
        title: selectedIdea.frontmatter.title,
        aspectRatio: isShort ? '9:16' : '16:9',
      });
      await refreshVaultData();
      await selectProject(created.manifest.slug);
      setActiveTab('editor');
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div
        className="px-4 py-2.5 border-b flex flex-wrap items-center justify-between gap-3"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border"
            style={{ backgroundColor: 'var(--bg-surface-alt)', borderColor: 'var(--border-subtle)' }}
          >
            <Search size={13} style={{ color: 'var(--text-secondary)' }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ideas & scripts..."
              className="bg-transparent text-xs outline-none w-48"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>

          <select
            value={pillarFilter}
            onChange={(e) => setPillarFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border text-xs outline-none cursor-pointer"
            style={{
              backgroundColor: 'var(--bg-surface-alt)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="">All Pillars</option>
            {pillars.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 ${viewMode === 'list' ? 'pill-tab-active' : 'btn-icon'}`}
              title="List + Script View"
            >
              <List size={14} />
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-2 ${viewMode === 'kanban' ? 'pill-tab-active' : 'btn-icon'}`}
              title="Kanban Board"
            >
              <Columns size={14} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {creating ? (
            <form onSubmit={handleCreateIdea} className="flex items-center gap-2">
              <input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="New video idea title..."
                className="px-3 py-1.5 rounded-lg border text-xs outline-none w-56"
                style={{
                  backgroundColor: 'var(--bg-surface-alt)',
                  borderColor: 'var(--accent-primary)',
                  color: 'var(--text-primary)',
                }}
              />
              <button type="submit" className="btn-primary px-4 py-1.5 text-xs">
                Create
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="btn-secondary px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
            </form>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="btn-secondary flex items-center gap-1.5 px-4 py-1.5 text-xs"
            >
              <Plus size={14} />
              <span>New Idea</span>
            </button>
          )}
        </div>
      </div>

      {/* Active Production Projects Strip */}
      {projects.length > 0 && (
        <div
          className="px-4 py-2 border-b flex items-center gap-2 overflow-x-auto shrink-0"
          style={{ backgroundColor: 'var(--bg-canvas)', borderColor: 'var(--border-subtle)' }}
        >
          <span className="caption-label shrink-0 mr-1">PROJECTS</span>
          {projects.map((p) => {
            const confirming = confirmDeleteProjectSlug === p.slug;
            return (
              <div
                key={p.slug}
                className="flex items-center gap-1 rounded-full border pl-3 pr-1.5 py-1 text-xs shrink-0"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderColor: confirming ? '#EF4444' : 'var(--border-subtle)',
                }}
              >
                <button
                  onClick={() => {
                    void selectProject(p.slug);
                    setActiveTab('editor');
                  }}
                  className="flex items-center gap-1.5 cursor-pointer hover:opacity-80"
                >
                  <Film size={12} />
                  <span className="max-w-[160px] truncate font-medium">{p.title}</span>
                  <span className="caption-label opacity-70">{p.status}</span>
                </button>
                <button
                  onClick={() => void window.studio.openProjectInFinder(p.slug)}
                  className="p-1 rounded-full opacity-65 hover:opacity-100 cursor-pointer"
                  title="Open project folder in Finder"
                >
                  <ExternalLink size={11} />
                </button>
                {confirming ? (
                  <>
                    <button
                      onClick={async () => {
                        await window.studio.deleteProject(p.slug);
                        setConfirmDeleteProjectSlug(null);
                        await refreshVaultData();
                      }}
                      className="px-2 py-0.5 rounded-full text-[10px] font-semibold cursor-pointer"
                      style={{ backgroundColor: '#EF4444', color: '#FFFFFF' }}
                    >
                      Trash?
                    </button>
                    <button
                      onClick={() => setConfirmDeleteProjectSlug(null)}
                      className="p-0.5 rounded-full opacity-75 hover:opacity-100 cursor-pointer"
                      title="Cancel"
                    >
                      <X size={11} />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteProjectSlug(p.slug)}
                    className="p-1 rounded-full opacity-65 hover:opacity-100 cursor-pointer"
                    title="Move project to Trash"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Body */}
      {viewMode === 'kanban' ? (
        <div className="flex-1 overflow-x-auto p-5 flex gap-4">
          {STATUS_COLUMNS.map((col) => {
            const colIdeas = filtered.filter(
              (i) => i.frontmatter.status.toLowerCase() === col.toLowerCase()
            );
            return (
              <div
                key={col}
                className="w-72 shrink-0 rounded-2xl border flex flex-col max-h-full"
                style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
              >
                <div
                  className="px-4 py-3 border-b flex items-center justify-between"
                  style={{ borderColor: 'var(--border-subtle)' }}
                >
                  <span className="eyebrow-label">{col}</span>
                  <span className="caption-label t-num">{colIdeas.length}</span>
                </div>
                <div className="p-3 space-y-2.5 overflow-y-auto">
                  {colIdeas.map((idea) => (
                    <button
                      key={idea.slug}
                      onClick={() => {
                        setSelectedIdeaSlug(idea.slug);
                        setViewMode('list');
                      }}
                      className="w-full text-left p-3.5 rounded-xl border cursor-pointer transition hover:opacity-90"
                      style={{
                        backgroundColor: 'var(--bg-surface-alt)',
                        borderColor:
                          selectedIdea?.slug === idea.slug
                            ? 'var(--accent-primary)'
                            : 'var(--border-subtle)',
                      }}
                    >
                      <div className="text-xs font-semibold line-clamp-2">{idea.frontmatter.title}</div>
                      <div className="caption-label mt-2.5">
                        {idea.frontmatter.pillar} / {idea.frontmatter.format}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          {/* Left Sidebar: Ideas | Media Bin */}
          <div
            className="w-80 shrink-0 border-r flex flex-col min-h-0"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            <div
              className="p-2.5 border-b grid grid-cols-2 gap-1.5 shrink-0"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <button
                onClick={() => setLeftPaneTab('ideas')}
                className={`py-1.5 px-2 text-xs font-medium ${
                  leftPaneTab === 'ideas' ? 'pill-tab-active' : 'pill-tab'
                }`}
              >
                Ideas ({filtered.length})
              </button>
              <button
                onClick={() => setLeftPaneTab('media')}
                className={`py-1.5 px-2 text-xs font-medium ${
                  leftPaneTab === 'media' ? 'pill-tab-active' : 'pill-tab'
                }`}
              >
                Media Bin ({draftMediaPool.length})
              </button>
            </div>

            {leftPaneTab === 'ideas' ? (
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {filtered.map((idea) => {
                  const active = selectedIdea?.slug === idea.slug;
                  const confirmingRow = confirmDeleteIdeaSlug === idea.slug;
                  return (
                    <div
                      key={idea.slug}
                      onClick={() => setSelectedIdeaSlug(idea.slug)}
                      className="group w-full text-left p-3.5 rounded-2xl border cursor-pointer transition"
                      style={{
                        backgroundColor: active ? 'var(--bg-surface-alt)' : 'transparent',
                        borderColor: confirmingRow
                          ? '#EF4444'
                          : active
                            ? 'var(--accent-primary)'
                            : 'var(--border-subtle)',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span
                          className="caption-label px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: active ? 'var(--accent-primary)' : 'var(--bg-surface-alt)',
                            color: active ? 'var(--accent-primary-ink)' : 'var(--text-secondary)',
                          }}
                        >
                          {idea.frontmatter.status}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="caption-label">{idea.frontmatter.pillar}</span>
                          {confirmingRow ? (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                await window.studio.deleteIdea(idea.slug);
                                setConfirmDeleteIdeaSlug(null);
                                await refreshVaultData();
                              }}
                              className="px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer"
                              style={{ backgroundColor: '#EF4444', color: '#FFFFFF' }}
                            >
                              Trash?
                            </button>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteIdeaSlug(idea.slug);
                              }}
                              className="opacity-0 group-hover:opacity-75 hover:!opacity-100 p-0.5 rounded cursor-pointer"
                              title="Move idea to Trash"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="text-xs font-semibold leading-snug">{idea.frontmatter.title}</div>
                      <div className="caption-label mt-2 flex items-center gap-2">
                        <span>{idea.frontmatter.format}</span>
                        {(idea.frontmatter.media_pool?.length ?? 0) > 0 && (
                          <span className="t-num">· {idea.frontmatter.media_pool?.length} MEDIA</span>
                        )}
                        {idea.checklistItems.length > 0 && (
                          <span className="t-num">
                            · {idea.checklistItems.filter((c) => c.checked).length}/{idea.checklistItems.length} SHOTS
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  const files = Array.from(e.dataTransfer.files ?? []);
                  if (files.length === 0) return;
                  const paths = files.map((f) => window.studio.getPathForFile(f)).filter(Boolean);
                  if (paths.length === 0) return;
                  setImportingMedia(true);
                  try {
                    const items = await window.studio.inspectPlannerMediaPaths(paths);
                    await mergeMediaItems(items, false);
                  } finally {
                    setImportingMedia(false);
                  }
                }}
                className="flex-1 overflow-y-auto p-3 space-y-2.5"
              >
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => void handlePickPlannerMedia('files')}
                    disabled={!selectedIdea || importingMedia}
                    className="btn-secondary flex items-center justify-center gap-1 py-1.5 px-2 text-xs disabled:opacity-40"
                  >
                    <Upload size={12} /> + Files
                  </button>
                  <button
                    onClick={() => void handlePickPlannerMedia('folder')}
                    disabled={!selectedIdea || importingMedia}
                    className="btn-secondary flex items-center justify-center gap-1 py-1.5 px-2 text-xs disabled:opacity-40"
                  >
                    <FolderPlus size={12} /> + Folder
                  </button>
                </div>

                <div
                  className="p-2.5 rounded-xl border border-dashed text-[11px] text-center"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
                >
                  {importingMedia
                    ? 'Probing media...'
                    : 'Drop clips or folders from Finder (links local paths only — files are never copied)'}
                </div>

                {draftMediaPool.length === 0 ? (
                  <div className="text-xs text-center py-6" style={{ color: 'var(--text-secondary)' }}>
                    No media attached to this plan yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {draftMediaPool.map((item) => (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) =>
                          e.dataTransfer.setData('application/x-planner-media', JSON.stringify(item))
                        }
                        className="p-2.5 rounded-xl border space-y-2 cursor-grab active:cursor-grabbing"
                        style={{
                          backgroundColor: 'var(--bg-canvas)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {item.kind === 'audio' ? (
                              <Music size={12} className="shrink-0" style={{ color: 'var(--accent-mint)' }} />
                            ) : item.kind === 'image' ? (
                              <ImageIcon size={12} className="shrink-0" style={{ color: '#DDD6FE' }} />
                            ) : (
                              <Film size={12} className="shrink-0" style={{ color: 'var(--accent-primary)' }} />
                            )}
                            <span className="text-xs font-medium truncate" title={item.path}>
                              {item.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={() => setLightboxMedia(item)}
                              className="btn-icon w-6 h-6"
                              title="Preview media"
                            >
                              <Play size={11} />
                            </button>
                            <button
                              onClick={() => void window.studio.openInFinder(item.path)}
                              className="btn-icon w-6 h-6"
                              title="Reveal in Finder"
                            >
                              <ExternalLink size={11} />
                            </button>
                            <button
                              onClick={() =>
                                void persistMediaUpdate(draftMediaPool.filter((m) => m.id !== item.id))
                              }
                              className="btn-icon w-6 h-6"
                              title="Remove from plan"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-1.5">
                          <select
                            value={item.role}
                            onChange={(e) => {
                              const role = e.target.value as IdeaMediaRole;
                              void persistMediaUpdate(
                                draftMediaPool.map((m) => (m.id === item.id ? { ...m, role } : m))
                              );
                            }}
                            className="px-2 py-1 rounded-lg border text-[11px] outline-none"
                            style={{
                              backgroundColor: 'var(--bg-surface-alt)',
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--text-primary)',
                            }}
                          >
                            {MEDIA_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>

                          <div className="flex items-center gap-1.5">
                            {item.durationSec !== undefined && (
                              <span className="text-[10px] t-num" style={{ color: 'var(--text-secondary)' }}>
                                {item.durationSec.toFixed(1)}s
                              </span>
                            )}
                            <button
                              onClick={() => void insertMediaTag(item)}
                              className="btn-secondary px-2 py-1 text-[10px]"
                              title="Tag this clip in your script"
                            >
                              + Tag
                            </button>
                          </div>
                        </div>

                        <input
                          defaultValue={item.notes ?? ''}
                          placeholder="Add beat note (e.g. pick best 3s walk shot)..."
                          onBlur={(e) => {
                            const val = e.target.value.trim();
                            if ((item.notes ?? '') === val) return;
                            void persistMediaUpdate(
                              draftMediaPool.map((m) =>
                                m.id === item.id ? { ...m, notes: val || undefined } : m
                              )
                            );
                          }}
                          className="w-full px-2 py-1 rounded-lg border text-[11px] outline-none"
                          style={{
                            backgroundColor: 'var(--bg-surface-alt)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-primary)',
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Center Script Preview / Editor & Right Shot/Cue Inspector */}
          {selectedIdea ? (
            <div className="flex-1 flex min-w-0 min-h-0">
              <div className="flex-1 flex flex-col min-w-0 p-5 gap-4">
                {/* Clean Matte Idea Header Card */}
                <div
                  className="rounded-2xl border p-5 space-y-3"
                  style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="caption-label">
                      {selectedIdea.frontmatter.pillar} · {selectedIdea.frontmatter.format}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={draftStatus}
                        onChange={(e) => setDraftStatus(e.target.value)}
                        className="btn-secondary px-3 py-1.5 text-xs outline-none"
                      >
                        {STATUS_COLUMNS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={() =>
                          pinContextChip({
                            kind: 'project',
                            label: `Idea: ${selectedIdea.slug}`,
                            payload: {
                              ideaSlug: selectedIdea.slug,
                              title: selectedIdea.frontmatter.title,
                              filePath: selectedIdea.filePath,
                            },
                          })
                        }
                        className="btn-secondary flex items-center gap-1.5 px-3.5 py-1.5 text-xs"
                      >
                        <Sparkles size={13} /> Pin
                      </button>

                      <button
                        onClick={() => void window.studio.openInFinder(selectedIdea.filePath)}
                        className="btn-secondary flex items-center gap-1.5 px-3 py-1.5 text-xs"
                        title="Reveal markdown file in Finder"
                      >
                        <ExternalLink size={13} /> Finder
                      </button>

                      {confirmDeleteIdeaSlug === selectedIdea.slug ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={async () => {
                              await window.studio.deleteIdea(selectedIdea.slug);
                              setConfirmDeleteIdeaSlug(null);
                              await refreshVaultData();
                            }}
                            className="px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer"
                            style={{ backgroundColor: '#EF4444', color: '#FFFFFF' }}
                          >
                            Move to Trash
                          </button>
                          <button
                            onClick={() => setConfirmDeleteIdeaSlug(null)}
                            className="btn-secondary px-2.5 py-1.5 text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteIdeaSlug(selectedIdea.slug)}
                          className="btn-secondary flex items-center gap-1 px-2.5 py-1.5 text-xs"
                          title="Move idea to Trash"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}

                      <button
                        onClick={() => void handleBuildWithAgent()}
                        className="btn-secondary flex items-center gap-1.5 px-3.5 py-1.5 text-xs"
                        title="Save plan, pin to Terminal, and ask the agent to build the video"
                      >
                        <Wand2 size={13} /> Build with Agent
                      </button>

                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="btn-secondary flex items-center gap-1.5 px-3.5 py-1.5 text-xs"
                      >
                        <Save size={13} />
                        <span>{saving ? 'Saving...' : isDirty ? 'Save*' : 'Save'}</span>
                      </button>

                      {linkedProject ? (
                        <button
                          onClick={() => {
                            void selectProject(linkedProject.slug);
                            setActiveTab('editor');
                          }}
                          className="btn-primary flex items-center gap-1.5 px-4 py-1.5 text-xs"
                        >
                          <ArrowRight size={13} />
                          <span>Open in Editor</span>
                        </button>
                      ) : (
                        <button
                          onClick={handlePromoteToProject}
                          disabled={promoting}
                          className="btn-primary flex items-center gap-1.5 px-4 py-1.5 text-xs"
                        >
                          <Clapperboard size={13} />
                          <span>{promoting ? 'Creating...' : 'Promote to Project'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <input
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    className="w-full text-xl bg-transparent outline-none display-editorial"
                    style={{ color: 'var(--text-primary)' }}
                  />
                </div>

                {/* Preview / Split / Edit Segmented Bar */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setScriptMode('preview')}
                      className={`flex items-center gap-1.5 px-3 py-1 text-xs ${
                        scriptMode === 'preview' ? 'pill-tab-active' : 'pill-tab'
                      }`}
                    >
                      <Eye size={12} /> Preview
                    </button>
                    <button
                      onClick={() => setScriptMode('split')}
                      className={`flex items-center gap-1.5 px-3 py-1 text-xs ${
                        scriptMode === 'split' ? 'pill-tab-active' : 'pill-tab'
                      }`}
                    >
                      <Columns size={12} /> Split
                    </button>
                    <button
                      onClick={() => setScriptMode('edit')}
                      className={`flex items-center gap-1.5 px-3 py-1 text-xs ${
                        scriptMode === 'edit' ? 'pill-tab-active' : 'pill-tab'
                      }`}
                    >
                      <Edit3 size={12} /> Edit Markdown
                    </button>
                  </div>
                  <span className="caption-label">{selectedIdea.slug}.md</span>
                </div>

                {/* Script Content Area (supports dragging from Media Bin or Finder) */}
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                    if (!planDropActive) setPlanDropActive(true);
                  }}
                  onDragLeave={() => setPlanDropActive(false)}
                  onDrop={async (e) => {
                    e.preventDefault();
                    setPlanDropActive(false);
                    const rawMedia = e.dataTransfer.getData('application/x-planner-media');
                    if (rawMedia) {
                      try {
                        const item = JSON.parse(rawMedia) as IdeaMediaItem;
                        await insertMediaTag(item);
                      } catch {
                        // Ignore malformed drag data
                      }
                      return;
                    }
                    const files = Array.from(e.dataTransfer.files ?? []);
                    if (files.length > 0) {
                      const paths = files.map((f) => window.studio.getPathForFile(f)).filter(Boolean);
                      if (paths.length === 0) return;
                      setImportingMedia(true);
                      try {
                        const items = await window.studio.inspectPlannerMediaPaths(paths);
                        await mergeMediaItems(items, true);
                      } finally {
                        setImportingMedia(false);
                      }
                    }
                  }}
                  className={`flex-1 flex gap-4 min-h-0 rounded-2xl transition ${
                    planDropActive ? 'ring-2 ring-[#C4FF2E]' : ''
                  }`}
                >
                  {(scriptMode === 'edit' || scriptMode === 'split') && (
                    <div className="flex-1 h-full relative">
                      {textareaDropLine !== null && (
                        <div
                          className="absolute top-2 right-3 px-2 py-0.5 rounded-full text-[10px] font-semibold z-10 pointer-events-none"
                          style={{ backgroundColor: '#C4FF2E', color: '#090B0A' }}
                        >
                          Drop at line {textareaDropLine + 1}
                        </div>
                      )}
                      <textarea
                        ref={textareaRef}
                        value={draftBody}
                        onChange={(e) => setDraftBody(e.target.value)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          e.dataTransfer.dropEffect = 'copy';
                          const ta = e.currentTarget;
                          const style = window.getComputedStyle(ta);
                          const lh = parseFloat(style.lineHeight) || 22;
                          const padTop = parseFloat(style.paddingTop) || 20;
                          const relY = e.clientY - ta.getBoundingClientRect().top + ta.scrollTop - padTop;
                          const lineCount = draftBody.split(/\r?\n/).length;
                          setTextareaDropLine(Math.max(0, Math.min(lineCount, Math.floor(relY / lh))));
                        }}
                        onDragLeave={() => setTextareaDropLine(null)}
                        onDrop={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const ta = e.currentTarget;
                          const style = window.getComputedStyle(ta);
                          const lh = parseFloat(style.lineHeight) || 22;
                          const padTop = parseFloat(style.paddingTop) || 20;
                          const relY = e.clientY - ta.getBoundingClientRect().top + ta.scrollTop - padTop;
                          const lineCount = draftBody.split(/\r?\n/).length;
                          const targetLine = Math.max(0, Math.min(lineCount, Math.floor(relY / lh)));
                          setTextareaDropLine(null);
                          setPlanDropActive(false);
                          const items = await resolveDroppedMediaItems(e.dataTransfer);
                          await applyMediaInsertion(items, { mode: 'line', lineIndex: targetLine });
                        }}
                        className="w-full h-full p-5 rounded-2xl border text-sm leading-relaxed resize-none outline-none"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderColor: textareaDropLine !== null ? '#C4FF2E' : 'var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      />
                    </div>
                  )}
                  {(scriptMode === 'preview' || scriptMode === 'split') && (
                    <div
                      className="flex-1 h-full p-6 rounded-2xl border overflow-y-auto"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <MarkdownRenderer
                        content={draftBody}
                        onToggleChecklist={handleToggleChecklist}
                        mediaPool={draftMediaPool}
                        onPreviewMedia={setLightboxMedia}
                        onRemoveMediaTag={(rawTag) => void handleRemoveMediaTag(rawTag)}
                        onDropMediaAtBlock={async (info) => {
                          setPlanDropActive(false);
                          const items = await resolveDroppedMediaItems(info.dataTransfer);
                          await applyMediaInsertion(items, {
                            mode: 'block',
                            startLine: info.startLine,
                            endLine: info.endLine,
                            placement: info.placement,
                          });
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Right Checklist & Cues Panel (auto-hides when Terminal is open on compact viewports) */}
              {!agentDrawerOpen && (
                <div
                  className="w-72 shrink-0 border-l p-5 overflow-y-auto space-y-6"
                  style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
                >
                <div>
                  <div className="eyebrow-label mb-3">
                    SHOT LIST ({selectedIdea.checklistItems.filter((c) => c.checked).length}/
                    {selectedIdea.checklistItems.length})
                  </div>
                  {selectedIdea.checklistItems.length === 0 ? (
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      Add `- [ ] Shot description` lines to your script to track filming shots here.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedIdea.checklistItems.map((item) => (
                        <button
                          key={item.index}
                          onClick={() => handleToggleChecklist(item.index)}
                          className="w-full flex items-start gap-2.5 p-2.5 rounded-xl border text-left text-xs cursor-pointer transition"
                          style={{
                            backgroundColor: 'var(--bg-surface-alt)',
                            borderColor: 'var(--border-subtle)',
                            color: item.checked ? 'var(--text-secondary)' : 'var(--text-primary)',
                          }}
                        >
                          {item.checked ? (
                            <CheckSquare
                              size={15}
                              className="shrink-0 mt-0.5"
                              style={{ color: 'var(--accent-mint)' }}
                            />
                          ) : (
                            <Square size={15} className="shrink-0 mt-0.5" style={{ color: 'var(--text-secondary)' }} />
                          )}
                          <span className={item.checked ? 'line-through' : ''}>
                            <InlineMarkdown
                              text={item.text}
                              mediaPool={draftMediaPool}
                              onPreviewMedia={setLightboxMedia}
                            />
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="eyebrow-label mb-3">PRODUCTION CUES ({selectedIdea.cues.length})</div>
                  <div className="space-y-2.5">
                    {selectedIdea.cues.map((cue, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl border text-xs space-y-1.5"
                        style={{ backgroundColor: 'var(--bg-surface-alt)', borderColor: 'var(--border-subtle)' }}
                      >
                        <span
                          className="inline-block caption-label px-2.5 py-0.5 rounded-full"
                          style={
                            cue.type === 'VISUAL' || cue.type === 'SCREEN / ARTIFACT CUE'
                              ? { backgroundColor: 'var(--accent-blue)', color: 'var(--accent-blue-ink)' }
                              : cue.type === 'B-ROLL CUE' || cue.type === 'B-ROLL RESET'
                                ? { backgroundColor: 'var(--accent-mint)', color: 'var(--accent-mint-ink)' }
                                : {
                                    backgroundColor: 'var(--accent-primary)',
                                    color: 'var(--accent-primary-ink)',
                                    border: '1px solid rgba(9, 11, 10, 0.12)',
                                  }
                          }
                        >
                          {cue.type}
                        </span>
                        <div style={{ color: 'var(--text-secondary)' }}>
                          <InlineMarkdown
                            text={cue.text}
                            mediaPool={draftMediaPool}
                            onPreviewMedia={setLightboxMedia}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm" style={{ color: 'var(--text-secondary)' }}>
              Select or create a video idea to start scripting.
            </div>
          )}
        </div>
      )}
      {/* Quick Media Preview Lightbox */}
      {lightboxMedia && (
        <div
          onClick={() => setLightboxMedia(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ backgroundColor: 'var(--overlay-scrim)' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-3xl rounded-3xl border overflow-hidden"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            <div
              className="px-5 py-3.5 border-b flex items-center justify-between gap-3"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{lightboxMedia.label}</div>
                <div className="caption-label truncate" title={lightboxMedia.path}>
                  {lightboxMedia.role}
                  {lightboxMedia.durationSec !== undefined
                    ? ` · ${lightboxMedia.durationSec.toFixed(1)}s`
                    : ''}
                  {lightboxMedia.width && lightboxMedia.height
                    ? ` · ${lightboxMedia.width}×${lightboxMedia.height}`
                    : ''}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    void insertMediaTag(lightboxMedia);
                    setLightboxMedia(null);
                  }}
                  className="btn-primary px-3 py-1.5 text-xs"
                >
                  + Tag in Plan
                </button>
                <button
                  onClick={() => void window.studio.openInFinder(lightboxMedia.path)}
                  className="btn-secondary flex items-center gap-1 px-3 py-1.5 text-xs"
                >
                  <ExternalLink size={12} /> Finder
                </button>
                <button onClick={() => setLightboxMedia(null)} className="btn-icon w-8 h-8">
                  <X size={15} />
                </button>
              </div>
            </div>

            <div className="bg-black flex items-center justify-center p-4 max-h-[65vh]">
              {lightboxMedia.kind === 'audio' ? (
                <audio
                  src={buildLocalMediaUrl(lightboxMedia.path)}
                  controls
                  autoPlay
                  className="w-full max-w-md my-8"
                />
              ) : lightboxMedia.kind === 'image' ? (
                <img
                  src={buildLocalMediaUrl(lightboxMedia.path)}
                  alt={lightboxMedia.label}
                  className="max-h-[58vh] object-contain rounded-xl"
                />
              ) : (
                <video
                  src={buildLocalMediaUrl(lightboxMedia.path)}
                  controls
                  autoPlay
                  playsInline
                  className="max-h-[58vh] w-full object-contain rounded-xl"
                />
              )}
            </div>

            {lightboxMedia.notes && (
              <div className="px-5 py-3 text-xs border-t" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                {lightboxMedia.notes}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
