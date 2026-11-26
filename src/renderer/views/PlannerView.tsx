import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckSquare,
  Clapperboard,
  Columns,
  Edit3,
  Eye,
  Film,
  List,
  Plus,
  Save,
  Search,
  Sparkles,
  Square,
} from 'lucide-react';
import { useStudioStore } from '../store/studioStore';
import { InlineMarkdown, MarkdownRenderer } from '../components/MarkdownRenderer';

const STATUS_COLUMNS = ['Idea', 'Outlined', 'Scripted', 'Ready to Film', 'Filmed', 'Published'];

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
  } = useStudioStore();

  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
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
  const [saving, setSaving] = useState(false);
  const [promoting, setPromoting] = useState(false);

  useEffect(() => {
    if (!selectedIdea) return;
    setDraftTitle(selectedIdea.frontmatter.title);
    setDraftStatus(selectedIdea.frontmatter.status);
    setDraftPillar(selectedIdea.frontmatter.pillar);
    setDraftFormat(selectedIdea.frontmatter.format);
    setDraftBody(selectedIdea.body);
  }, [selectedIdea?.slug, selectedIdea?.body, selectedIdea?.frontmatter.status]);

  const isDirty = useMemo(() => {
    if (!selectedIdea) return false;
    return (
      draftTitle !== selectedIdea.frontmatter.title ||
      draftStatus !== selectedIdea.frontmatter.status ||
      draftPillar !== selectedIdea.frontmatter.pillar ||
      draftFormat !== selectedIdea.frontmatter.format ||
      draftBody !== selectedIdea.body
    );
  }, [selectedIdea, draftTitle, draftStatus, draftPillar, draftFormat, draftBody]);

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
        },
        body: draftBody,
      });
      await refreshVaultData();
    } finally {
      setSaving(false);
    }
  };

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
          {projects.map((p) => (
            <button
              key={p.slug}
              onClick={() => {
                void selectProject(p.slug);
                setActiveTab('editor');
              }}
              className="btn-secondary flex items-center gap-1.5 px-3 py-1 text-xs shrink-0"
            >
              <Film size={12} />
              <span className="max-w-[180px] truncate">{p.title}</span>
              <span className="caption-label opacity-70">{p.status}</span>
            </button>
          ))}
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
          {/* Left Idea List */}
          <div
            className="w-80 shrink-0 border-r overflow-y-auto p-3 space-y-2"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            {filtered.map((idea) => {
              const active = selectedIdea?.slug === idea.slug;
              return (
                <button
                  key={idea.slug}
                  onClick={() => setSelectedIdeaSlug(idea.slug)}
                  className="w-full text-left p-3.5 rounded-2xl border cursor-pointer transition"
                  style={{
                    backgroundColor: active ? 'var(--bg-surface-alt)' : 'transparent',
                    borderColor: active ? 'var(--accent-primary)' : 'var(--border-subtle)',
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
                    <span className="caption-label">{idea.frontmatter.pillar}</span>
                  </div>
                  <div className="text-xs font-semibold leading-snug">{idea.frontmatter.title}</div>
                  <div className="caption-label mt-2 flex items-center gap-2">
                    <span>{idea.frontmatter.format}</span>
                    {idea.checklistItems.length > 0 && (
                      <span className="t-num">
                        · {idea.checklistItems.filter((c) => c.checked).length}/{idea.checklistItems.length} SHOTS
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
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

                {/* Script Content Area */}
                <div className="flex-1 flex gap-4 min-h-0">
                  {(scriptMode === 'edit' || scriptMode === 'split') && (
                    <textarea
                      value={draftBody}
                      onChange={(e) => setDraftBody(e.target.value)}
                      className="flex-1 h-full p-5 rounded-2xl border text-sm leading-relaxed resize-none outline-none"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    />
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
                            <InlineMarkdown text={item.text} />
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
                          <InlineMarkdown text={cue.text} />
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
    </div>
  );
};
