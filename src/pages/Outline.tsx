import { Check, Loader, Pen, Pencil, Plus, Save, ScrollText, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useT } from '@/hooks/useT'
import { aiApi, chaptersApi, extractAIJsonObject, getAIResponseText } from '@/lib/api'
import { createChapter, deleteChapter, renameVolume } from '@/lib/chapterActions'
import { formatChapterTitle } from '@/lib/chapterTitle'
import { formatVolumeTitle } from '@/lib/volumeTitle'
import { useAgentStore } from '@/stores/useAgentStore'
import { useChapterStore } from '@/stores/useChapterStore'
import { useProjectStore } from '@/stores/useProjectStore'
import type { Volume } from '@/types'

export function Outline() {
  const { t } = useT()
  const volumes = useChapterStore((s) => s.volumes)
  const updateChapter = useChapterStore((s) => s.updateChapter)
  const currentProject = useProjectStore((s) => s.currentProject)
  const projects = useProjectStore((s) => s.projects)
  // Deleting a chapter mid-generation would fight the AI over the structure.
  const aiRunning = useAgentStore((s) => {
    if (!currentProject) return false
    const projectRuns = s.runs[currentProject]
    return projectRuns ? Object.values(projectRuns).some((run) => run.status === 'running') : false
  })
  const [activeChapterId, setActiveChapterId] = useState<number | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [editingVolumeId, setEditingVolumeId] = useState<number | null>(null)
  const [volumeTitleDraft, setVolumeTitleDraft] = useState('')
  const [volumeError, setVolumeError] = useState<{ volumeId: number; message: string } | null>(null)
  const volumeInputRef = useRef<HTMLInputElement | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const [collapsedVolumes, setCollapsedVolumes] = useState<Set<number>>(new Set())
  const [outlineText, setOutlineText] = useState('')
  const [dimensions, setDimensions] = useState({
    cognitiveFrame: '',
    emotionalAnchor: '',
    worldTexture: '',
    concreteMystery: '',
    interpersonalTension: '',
    genreBeat: '',
  })
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState('')

  const activeChapter = volumes.flatMap((v) => v.chapters).find((c) => c.id === activeChapterId)
  const projectGenres = currentProject ? (projects.find((p) => p.name === currentProject)?.genres ?? []) : []
  const genreBeatPlaceholder = projectGenres.length
    ? projectGenres.map((genre) => t(`outline.genreBeatFocus.${genre}`)).join('；')
    : t('outline.genreBeatHint')

  // Select first chapter on mount or when volumes change
  useEffect(() => {
    const first = volumes[0]?.chapters[0]?.id || null
    if (!activeChapterId || !volumes.flatMap((v) => v.chapters).find((c) => c.id === activeChapterId)) {
      setActiveChapterId(first)
    }
  }, [volumes])

  // Sync local state when switching chapters or when volumes reload
  useEffect(() => {
    if (activeChapter) {
      setOutlineText(activeChapter.outline || '')
      setDimensions({
        cognitiveFrame: activeChapter.cognitiveFrame || '',
        emotionalAnchor: activeChapter.emotionalAnchor || '',
        worldTexture: activeChapter.worldTexture || '',
        concreteMystery: activeChapter.concreteMystery || '',
        interpersonalTension: activeChapter.interpersonalTension || '',
        genreBeat: activeChapter.genreBeat || '',
      })
      setAiSuggestion('')
    }
    setEditingTitle(false)
  }, [activeChapterId, activeChapter?.outline, activeChapter?.cognitiveFrame, activeChapter?.genreBeat])

  const startRenameVolume = (vol: Volume) => {
    if (aiRunning) return
    setVolumeError(null)
    setEditingVolumeId(vol.id)
    setVolumeTitleDraft(vol.title || '')
  }

  const saveVolumeTitle = async (vol: Volume) => {
    const next = volumeTitleDraft.trim()
    setEditingVolumeId(null)
    if (!currentProject || !next || next === (vol.title || '')) return
    try {
      await renameVolume(currentProject, vol.id, next)
    } catch (e) {
      setVolumeError({ volumeId: vol.id, message: e instanceof Error ? e.message : t('common.saveFailed') })
    }
  }

  // Focus/select the volume title when inline renaming starts.
  useEffect(() => {
    if (editingVolumeId != null) {
      volumeInputRef.current?.focus()
      volumeInputRef.current?.select()
    }
  }, [editingVolumeId])

  // Focus the chapter title input when inline editing starts.
  useEffect(() => {
    if (editingTitle) titleInputRef.current?.select()
  }, [editingTitle])

  // Structure edits are unsafe while the AI is writing.
  useEffect(() => {
    if (!aiRunning) return
    setEditingVolumeId(null)
    setVolumeTitleDraft('')
  }, [aiRunning])

  // Close transient edit UI when switching projects.
  useEffect(() => {
    if (currentProject) {
      setEditingVolumeId(null)
      setVolumeTitleDraft('')
      setVolumeError(null)
    }
  }, [currentProject])

  // Close the delete confirmation when switching chapters, when the AI starts,
  // or when the active chapter becomes finalized (accepted chapters have no
  // delete affordance).
  useEffect(() => {
    if (activeChapterId || aiRunning || activeChapter?.status === 'accepted') {
      setConfirmingDelete(false)
      setDeleteError('')
    }
  }, [activeChapterId, aiRunning, activeChapter?.status])

  const handleDeleteChapter = async () => {
    if (!currentProject || !activeChapter || aiRunning || activeChapter.status === 'accepted') return
    const all = volumes.flatMap((v) => v.chapters)
    const index = all.findIndex((c) => c.id === activeChapter.id)
    // Keep the user near the same spot instead of jumping back to chapter 1.
    const nextChapter = all[index + 1] ?? all[index - 1] ?? null
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteChapter(currentProject, activeChapter.num)
      setActiveChapterId(nextChapter?.id ?? null)
      setConfirmingDelete(false)
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : t('common.deleteFailed'))
    } finally {
      setDeleting(false)
    }
  }

  const handleSaveOutline = async () => {
    if (!currentProject || !activeChapter) return
    setSaving(true)
    try {
      await updateChapter(currentProject, activeChapter.num, {
        outline: outlineText,
        ...dimensions,
      })
    } catch (e) {
      console.error('Save failed:', e)
    }
    setSaving(false)
  }

  const toggleVolumeCollapse = (volumeId: number) => {
    setCollapsedVolumes((prev) => {
      const next = new Set(prev)
      if (next.has(volumeId)) {
        next.delete(volumeId)
      } else {
        next.add(volumeId)
      }
      return next
    })
  }

  const handleNewChapter = async (volumeId: number) => {
    if (!currentProject) return
    try {
      const created = await createChapter(currentProject, t('chapter.defaultTitle'), volumeId)
      if (created?.num) {
        // Find the new chapter's ID from the reloaded store (match volume + num to avoid cross-volume collisions)
        const ch = volumes.flatMap((v) => v.chapters).find((c) => c.num === created.num && c.volumeId === volumeId)
        if (ch) setActiveChapterId(ch.id)
      }
    } catch (e) {
      console.error('Create chapter failed:', e)
    }
  }

  const handleGenerateOutline = async () => {
    if (!currentProject || !activeChapter) return
    setGenerating(true)
    setAiSuggestion('')
    try {
      // Chapter bodies are loaded lazily (slim volumes endpoint), so fetch the
      // full content when the preview isn't available locally.
      let chapterContent = activeChapter.content
      if (!chapterContent) {
        try {
          const full = await chaptersApi.get(currentProject, activeChapter.num, activeChapter.volumeId, 1000)
          chapterContent = full?.content || ''
        } catch {
          /* preview falls back to the empty marker */
        }
      }
      const contentPreview = chapterContent?.slice(0, 1000) || t('outline.noContent')
      const res = await aiApi.chat(
        [
          {
            role: 'system',
            content: t('outline.generateSystemPrompt'),
          },
          {
            role: 'user',
            content: t('outline.generateUserPrompt', {
              num: activeChapter.num,
              title: activeChapter.title,
              preview: contentPreview,
            }),
          },
        ],
        currentProject,
      )
      const text = getAIResponseText(res)
      const parsed = extractAIJsonObject(text)
      if (parsed) {
        const shouldSetTitle = Boolean(
          parsed.title && [t('chapter.defaultTitle'), t('chapter.firstChapterTitle')].includes(activeChapter.title),
        )
        const nextOutline = parsed.outline || outlineText
        const nextDimensions = {
          cognitiveFrame: parsed.cognitive_frame || dimensions.cognitiveFrame,
          emotionalAnchor: parsed.emotional_anchor || dimensions.emotionalAnchor,
          worldTexture: parsed.world_texture || dimensions.worldTexture,
          concreteMystery: parsed.concrete_mystery || dimensions.concreteMystery,
          interpersonalTension: parsed.interpersonal_tension || dimensions.interpersonalTension,
          genreBeat: parsed.genre_beat || dimensions.genreBeat,
        }
        setOutlineText(nextOutline)
        setDimensions(nextDimensions)
        // Persist immediately with the generated values. Deferring to
        // handleSaveOutline() here would save the pre-generation state from
        // this render's closure.
        try {
          await updateChapter(currentProject, activeChapter.num, {
            ...(shouldSetTitle ? { title: parsed.title } : {}),
            outline: nextOutline,
            ...nextDimensions,
          })
        } catch (e) {
          console.error('Auto-save generated outline failed:', e)
        }
      } else if (text) {
        setOutlineText(text)
      }
    } catch (e) {
      console.error('Generate outline failed:', e)
    }
    setGenerating(false)
  }

  const handleSaveTitle = async (title: string) => {
    if (!currentProject || !activeChapter) return
    try {
      await updateChapter(currentProject, activeChapter.num, { title })
    } catch (e) {
      console.error('Save title failed:', e)
    }
  }

  const commitTitle = async () => {
    setEditingTitle(false)
    const next = titleDraft.trim()
    if (!activeChapter || !next || next === activeChapter.title) return
    await handleSaveTitle(next)
  }

  const handleAIOptimize = async () => {
    if (!currentProject || !activeChapter || !outlineText.trim()) return
    setOptimizing(true)
    setAiSuggestion('')
    try {
      const res = await aiApi.chat(
        [
          {
            role: 'system',
            content: t('outline.optimizeSystemPrompt'),
          },
          {
            role: 'user',
            content: t('outline.optimizeUserPrompt', {
              num: activeChapter.num,
              title: activeChapter.title,
              outline: outlineText,
            }),
          },
        ],
        currentProject,
      )
      const suggestion = res.choices?.[0]?.message?.content?.trim() || ''
      if (suggestion) {
        setAiSuggestion(suggestion)
      }
    } catch (e) {
      console.error('AI optimize failed:', e)
    }
    setOptimizing(false)
  }

  const updateDimension = (key: string, value: string) => {
    setDimensions((prev) => ({ ...prev, [key]: value }))
  }

  const statusIcon: Record<string, React.ReactNode> = {
    accepted: <Check className="w-3 h-3" />,
    review: <span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--warning)' }} />,
    writing: <span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--info)' }} />,
    pending: <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: 'var(--ink-mute)' }} />,
  }

  return (
    <>
      <div className="page-header">
        <h2 className="flex items-center gap-2">
          <ScrollText className="w-5 h-5" /> {t('pages.outlineEditor')}
        </h2>
        <div className="page-header-actions">
          <button
            className="btn-primary flex items-center gap-1.5"
            style={{ height: 30, padding: '0 14px', minWidth: 110 }}
            onClick={handleGenerateOutline}
            disabled={!activeChapter || generating}
          >
            {generating ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Pen className="w-3.5 h-3.5" />}
            {generating ? t('common.generating') : t('pages.generateOutline')}
          </button>
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        {/* Chapter list */}
        <div className="w-[260px] shrink-0 border-r border-[var(--hairline)] overflow-y-auto py-3 custom-scrollbar">
          {volumes.map((vol) => {
            const collapsed = collapsedVolumes.has(vol.id)
            return (
              <div key={vol.id}>
                <div
                  className="group/vol px-4 pb-2 pt-1 font-display text-sm font-medium text-[var(--ink)] flex items-center gap-1 cursor-pointer select-none hover:opacity-80 transition-opacity"
                  onClick={() => toggleVolumeCollapse(vol.id)}
                >
                  <span
                    className="text-[10px] text-[var(--ink-mute)] transition-transform duration-200 inline-block shrink-0"
                    style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                  >
                    ▼
                  </span>
                  {editingVolumeId === vol.id ? (
                    <input
                      ref={volumeInputRef}
                      className="flex-1 min-w-0 bg-[var(--canvas-card)] border border-[var(--accent-gold)] rounded px-1.5 py-0.5 text-[13px] font-display font-medium text-[var(--ink)] outline-none"
                      value={volumeTitleDraft}
                      onChange={(e) => setVolumeTitleDraft(e.target.value)}
                      onBlur={() => void saveVolumeTitle(vol)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          e.currentTarget.blur()
                        }
                        if (e.key === 'Escape') {
                          // Unmount without blurring so onBlur doesn't save.
                          setVolumeTitleDraft(vol.title || '')
                          setEditingVolumeId(null)
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={t('common.edit')}
                    />
                  ) : (
                    <span className="flex-1 truncate">{formatVolumeTitle(vol.title, vol.sortOrder, t)}</span>
                  )}
                  {editingVolumeId !== vol.id && (
                    <button
                      type="button"
                      className={`w-5 h-5 flex items-center justify-center rounded border-none bg-transparent text-[var(--ink-mute)] focus:opacity-100 hover:text-[var(--accent-gold)] disabled:cursor-not-allowed cursor-pointer transition-opacity shrink-0 ${
                        aiRunning ? 'opacity-30' : 'opacity-0 group-hover/vol:opacity-100'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation()
                        startRenameVolume(vol)
                      }}
                      disabled={aiRunning}
                      title={aiRunning ? t('ai.generating') : t('common.edit')}
                      aria-label={t('common.edit')}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                  <span className="text-[10px] text-[var(--ink-tertiary)] shrink-0">
                    {t('outline.chapterCount', { n: vol.chapters.length })}
                  </span>
                </div>
                {volumeError?.volumeId === vol.id && (
                  <div className="mx-4 mb-2 px-2 py-1 rounded-md bg-[var(--error-soft)] text-[11px] leading-snug text-[var(--error)]">
                    {volumeError.message}
                  </div>
                )}
                {!collapsed && (
                  <>
                    {vol.chapters.map((ch) => (
                      <div
                        key={ch.id}
                        className={`p-3 mx-3 mb-1.5 rounded-lg border cursor-pointer transition-colors
                          ${
                            activeChapterId === ch.id
                              ? 'bg-[var(--accent-gold-soft-bg)] border-[var(--accent-gold)]'
                              : 'bg-[var(--canvas-card)] border-[var(--hairline)] hover:border-[var(--hairline-light)] hover:bg-[var(--canvas-elevated)]'
                          }`}
                        onClick={() => setActiveChapterId(ch.id)}
                      >
                        <div className="text-[13px] text-[var(--ink)] flex items-center gap-2">
                          <span
                            className={`text-[10px] font-medium px-[6px] py-[1px] rounded-full
                            ${
                              ch.status === 'accepted'
                                ? 'bg-[var(--success-soft)] text-[var(--success)]'
                                : ch.status === 'review'
                                  ? 'bg-[var(--warning-soft)] text-[var(--warning)]'
                                  : ch.status === 'writing'
                                    ? 'bg-[var(--info-soft)] text-[var(--info)]'
                                    : 'bg-[var(--canvas-pop)] text-[var(--ink-mute)]'
                            }`}
                          >
                            {statusIcon[ch.status]}
                          </span>
                          {formatChapterTitle(ch.num, ch.title, t)}
                        </div>
                        <div className="text-[12px] text-[var(--ink-tertiary)] mt-1 line-clamp-2">{ch.outline}</div>
                      </div>
                    ))}
                    {/* Per-volume new chapter */}
                    <div
                      className="flex items-center gap-1 mx-3 mb-2 px-3 py-1.5 rounded-lg text-[12px] text-[var(--accent-gold)] cursor-pointer transition-colors hover:bg-[var(--canvas-card)]"
                      onClick={() => handleNewChapter(vol.id)}
                    >
                      <Plus className="w-3 h-3" />
                      {t('pages.newChapter')}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* Editor panel */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {activeChapter ? (
            <>
              {editingTitle ? (
                <input
                  ref={titleInputRef}
                  className="font-display text-lg font-medium text-[var(--ink)] mb-1 w-full bg-transparent border-none outline-none"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={() => void commitTitle()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      e.currentTarget.blur()
                    }
                    if (e.key === 'Escape') {
                      setTitleDraft(activeChapter.title || '')
                      setEditingTitle(false)
                    }
                  }}
                  aria-label={t('common.edit')}
                />
              ) : (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 font-display text-lg font-medium text-[var(--ink)] mb-1 p-0 border-none bg-transparent cursor-pointer hover:text-[var(--accent-gold)] transition-colors"
                  onClick={() => {
                    setTitleDraft(activeChapter.title || '')
                    setEditingTitle(true)
                  }}
                  title={t('editor.clickToEditTitle')}
                >
                  {formatChapterTitle(activeChapter.num, activeChapter.title, t)}
                  <Pencil className="w-3 h-3 text-[var(--ink-mute)]" />
                </button>
              )}
              <div className="text-[12px] text-[var(--ink-tertiary)] mb-4">
                <span
                  className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-[6px] py-[1px] rounded-full
                  ${
                    activeChapter.status === 'accepted'
                      ? 'bg-[var(--success-soft)] text-[var(--success)]'
                      : activeChapter.status === 'review'
                        ? 'bg-[var(--warning-soft)] text-[var(--warning)]'
                        : activeChapter.status === 'writing'
                          ? 'bg-[var(--info-soft)] text-[var(--info)]'
                          : 'bg-[var(--canvas-pop)] text-[var(--ink-mute)]'
                  }`}
                >
                  {activeChapter.status === 'accepted' && <Check className="w-2.5 h-2.5" />}
                  {activeChapter.status === 'accepted'
                    ? t('status.accepted')
                    : activeChapter.status === 'review'
                      ? t('status.review')
                      : activeChapter.status === 'writing'
                        ? t('status.writing')
                        : t('status.pending')}
                </span>{' '}
                {t('outline.outlineInfo', { count: volumes.flatMap((v) => v.chapters).length })}
              </div>

              <div className="mb-3">
                <label className="block text-[11px] font-medium text-[var(--ink-secondary)] tracking-[0.04em] uppercase mb-1">
                  {t('pages.outlineOverview')}
                </label>
                <textarea
                  rows={3}
                  className="w-full bg-[var(--canvas-elevated)] border border-[var(--hairline)] rounded-[var(--radius-sm)] p-2.5 font-sans text-[13px] text-[var(--ink)] outline-none resize-vertical focus:border-[var(--accent-gold)]"
                  value={outlineText}
                  onChange={(e) => setOutlineText(e.target.value)}
                  placeholder={t('outline.placeholderOutline')}
                />
              </div>

              <div className="text-[11px] font-medium text-[var(--ink-secondary)] tracking-[0.04em] uppercase mb-2">
                {t('outline.lockDimensions')}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <DimensionField
                  label={t('pages.dimensionFrame')}
                  value={dimensions.cognitiveFrame}
                  onChange={(v) => updateDimension('cognitiveFrame', v)}
                  placeholder={t('outline.placeholderFrame')}
                />
                <DimensionField
                  label={t('pages.dimensionAnchor')}
                  value={dimensions.emotionalAnchor}
                  onChange={(v) => updateDimension('emotionalAnchor', v)}
                  placeholder={t('outline.placeholderAnchor')}
                />
                <DimensionField
                  label={t('pages.dimensionTexture')}
                  value={dimensions.worldTexture}
                  onChange={(v) => updateDimension('worldTexture', v)}
                  placeholder={t('outline.placeholderTexture')}
                />
                <DimensionField
                  label={t('pages.dimensionMystery')}
                  value={dimensions.concreteMystery}
                  onChange={(v) => updateDimension('concreteMystery', v)}
                  placeholder={t('outline.placeholderMystery')}
                />
                <DimensionField
                  label={t('pages.dimensionTension')}
                  value={dimensions.interpersonalTension}
                  onChange={(v) => updateDimension('interpersonalTension', v)}
                  placeholder={t('outline.placeholderTension')}
                />
              </div>
              <div className="mt-3">
                <DimensionField
                  label={t('outline.genreBeat')}
                  value={dimensions.genreBeat}
                  onChange={(v) => updateDimension('genreBeat', v)}
                  placeholder={genreBeatPlaceholder}
                />
              </div>

              {aiSuggestion && (
                <div className="mt-4 p-3 rounded-lg bg-[var(--accent-gold-soft-bg)] border border-[rgba(201,169,110,0.3)] text-[13px] text-[var(--ink-secondary)] leading-[1.6]">
                  <div className="text-[11px] font-medium text-[var(--accent-gold)] mb-1 uppercase tracking-[0.04em]">
                    {t('pages.outlineAI')}
                  </div>
                  {aiSuggestion}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 mt-5">
                <button
                  className="btn-primary flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                  style={{ height: 30, padding: '0 16px', minWidth: 110 }}
                  onClick={handleSaveOutline}
                  disabled={saving}
                >
                  <Save className="w-3.5 h-3.5" /> {saving ? t('common.saving') : t('pages.outlineSave')}
                </button>
                <button
                  className="btn-secondary flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                  style={{ height: 30, padding: '0 16px', minWidth: 135 }}
                  onClick={handleAIOptimize}
                  disabled={optimizing || !outlineText.trim()}
                >
                  {optimizing ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {optimizing ? t('outline.optimizing') : t('pages.outlineAI')}
                </button>
                {activeChapter.status !== 'accepted' && (
                  <button
                    type="button"
                    className="ml-auto h-[30px] px-3 rounded-lg border border-[var(--hairline)] bg-[var(--canvas-elevated)] text-[var(--ink-tertiary)] text-[12px] cursor-pointer hover:text-[var(--error)] hover:border-[var(--error)] flex items-center gap-1.5 shrink-0 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={() => setConfirmingDelete(true)}
                    disabled={aiRunning || deleting}
                    title={aiRunning ? t('ai.generating') : t('common.delete')}
                    aria-label={t('common.delete')}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> {t('common.delete')}
                  </button>
                )}
              </div>

              {confirmingDelete && activeChapter.status !== 'accepted' && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-[var(--error-soft)] px-3 py-2 text-[12px] text-[var(--error)]">
                  <span className="flex-1 leading-snug">
                    {t('common.deleteConfirm', {
                      name: formatChapterTitle(activeChapter.num, activeChapter.title, t),
                    })}
                  </span>
                  <button
                    type="button"
                    className="h-[30px] px-3 rounded-lg border-none bg-[var(--error)] text-white text-[12px] cursor-pointer hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                    onClick={handleDeleteChapter}
                    disabled={deleting}
                  >
                    {deleting && <Loader className="w-3.5 h-3.5 animate-spin" />}
                    {t('common.delete')}
                  </button>
                  <button
                    type="button"
                    className="h-[30px] px-3 rounded-lg border border-[var(--hairline-light)] bg-[var(--canvas-elevated)] text-[var(--ink)] text-[12px] cursor-pointer hover:bg-[var(--canvas-mid)] disabled:opacity-50 shrink-0 whitespace-nowrap"
                    onClick={() => {
                      setConfirmingDelete(false)
                      setDeleteError('')
                    }}
                    disabled={deleting}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              )}

              {deleteError && (
                <div className="mt-2 px-3 py-2 rounded-lg bg-[var(--error-soft)] border border-[var(--error)] text-[12px] text-[var(--error)]">
                  {deleteError}
                </div>
              )}
            </>
          ) : (
            <div className="text-center pt-20 text-[var(--ink-tertiary)]">
              {volumes.flatMap((v) => v.chapters).length > 0
                ? t('outline.selectChapterHint')
                : t('outline.noChaptersHint')}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function DimensionField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-[var(--ink-secondary)] tracking-[0.04em] uppercase mb-1">
        {label}
      </label>
      <textarea
        rows={2}
        className="w-full bg-[var(--canvas-elevated)] border border-[var(--hairline)] rounded-[var(--radius-sm)] p-2 font-sans text-[13px] text-[var(--ink)] outline-none resize-vertical min-h-[50px] focus:border-[var(--accent-gold)]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}
