import { Check, Loader, Pen, Plus, Save, ScrollText, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useT } from '@/hooks/useT'
import { aiApi, extractAIJsonObject, getAIResponseText } from '@/lib/api'
import { useChapterStore } from '@/stores/useChapterStore'
import { useProjectStore } from '@/stores/useProjectStore'

export function Outline() {
  const { t } = useT()
  const { volumes, updateChapter, createChapter, loadChapters } = useChapterStore()
  const currentProject = useProjectStore((s) => s.currentProject)
  const [activeChapterId, setActiveChapterId] = useState<number | null>(null)
  const [collapsedVolumes, setCollapsedVolumes] = useState<Set<number>>(new Set())
  const [outlineText, setOutlineText] = useState('')
  const [dimensions, setDimensions] = useState({
    cognitiveFrame: '',
    emotionalAnchor: '',
    worldTexture: '',
    concreteMystery: '',
    interpersonalTension: '',
  })
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState('')

  const activeChapter = volumes.flatMap((v) => v.chapters).find((c) => c.id === activeChapterId)

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
      })
      setAiSuggestion('')
    }
  }, [activeChapterId, activeChapter?.outline, activeChapter?.cognitiveFrame])

  const handleSaveOutline = async () => {
    if (!currentProject || !activeChapter) return
    setSaving(true)
    try {
      await updateChapter(currentProject, activeChapter.num, {
        outline: outlineText,
        ...dimensions,
      })
      await loadChapters(currentProject)
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
      const created = await createChapter(currentProject, '新章节', '', volumeId)
      if (created?.num) {
        // Find the new chapter's ID from the reloaded store
        const ch = volumes.flatMap((v) => v.chapters).find((c) => c.num === created.num)
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
      const contentPreview = activeChapter.content?.slice(0, 1000) || '（暂无正文）'
      const res = await aiApi.chat(
        [
          {
            role: 'system',
            content:
              '你是一个小说大纲生成器。根据用户提供的章节信息，生成JSON格式的输出，包含：\n' +
              '1. title: 章节标题建议（若当前标题为"新章节"或"第一章"之类的占位名则给出有吸引力的标题，否则保留原标题）\n' +
              '2. outline: 章节大纲（150字以内），包含核心事件、角色发展、关键冲突\n' +
              '3. cognitive_frame: 角色认知框架的变化（30字以内）\n' +
              '4. emotional_anchor: 本章的情感锚点（30字以内）\n' +
              '5. world_texture: 世界质感/场景氛围（30字以内）\n' +
              '6. concrete_mystery: 具体悬念（30字以内）\n' +
              '7. interpersonal_tension: 人际张力（30字以内）\n' +
              '直接返回JSON，不要前缀说明。',
          },
          {
            role: 'user',
            content: `第${activeChapter.num}章「${activeChapter.title}」\n当前正文预览：${contentPreview}\n\n请为这一章生成完整的大纲和五维信息。`,
          },
        ],
        currentProject,
      )
      const text = getAIResponseText(res)
      const parsed = extractAIJsonObject(text)
      if (parsed) {
        if (parsed.title && activeChapter.title === '新章节') {
          handleSaveTitle(parsed.title)
        }
        if (parsed.outline) setOutlineText(parsed.outline)
        setDimensions({
          cognitiveFrame: parsed.cognitive_frame || dimensions.cognitiveFrame,
          emotionalAnchor: parsed.emotional_anchor || dimensions.emotionalAnchor,
          worldTexture: parsed.world_texture || dimensions.worldTexture,
          concreteMystery: parsed.concrete_mystery || dimensions.concreteMystery,
          interpersonalTension: parsed.interpersonal_tension || dimensions.interpersonalTension,
        })
        // Auto-save after generation
        setTimeout(() => handleSaveOutline(), 100)
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
      await loadChapters(currentProject)
    } catch (e) {
      console.error('Save title failed:', e)
    }
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
            content: '你是一个小说大纲优化助手。分析用户提供的大纲，给出改进建议。直接返回建议，200字以内。',
          },
          {
            role: 'user',
            content: `第${activeChapter.num}章「${activeChapter.title}」当前大纲：\n${outlineText}\n\n请给出优化建议。`,
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
            {generating ? '生成中...' : t('pages.generateOutline')}
          </button>
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        {/* Chapter list */}
        <div className="w-[320px] shrink-0 border-r border-[var(--hairline)] overflow-y-auto py-3 custom-scrollbar">
          {volumes.map((vol) => {
            const collapsed = collapsedVolumes.has(vol.id)
            return (
              <div key={vol.id}>
                <div
                  className="px-4 pb-2 pt-1 font-display text-sm font-medium text-[var(--ink)] flex items-center gap-1 cursor-pointer select-none hover:opacity-80 transition-opacity"
                  onClick={() => toggleVolumeCollapse(vol.id)}
                >
                  <span
                    className="text-[10px] text-[var(--ink-mute)] transition-transform duration-200 inline-block"
                    style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
                  >
                    ▼
                  </span>
                  {vol.title.startsWith('第') && vol.title.endsWith('卷')
                    ? vol.title
                    : `第${vol.sortOrder}卷 · ${vol.title}`}
                  <span className="text-[10px] text-[var(--ink-tertiary)] ml-auto">{vol.chapters.length}章</span>
                </div>
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
                          {ch.title.startsWith('第') ? ch.title : `第${ch.num}章 ${ch.title}`}
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
              <div className="font-display text-lg font-medium text-[var(--ink)] mb-1">
                {activeChapter.title.startsWith('第')
                  ? activeChapter.title
                  : `第${activeChapter.num}章 ${activeChapter.title}`}
              </div>
              <div className="text-[12px] text-[var(--ink-tertiary)] mb-4">
                <span
                  className={`text-[10px] font-medium px-[6px] py-[1px] rounded-full
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
                  <span className="inline-flex items-center gap-0.5">
                    {activeChapter.status === 'accepted' && <Check className="w-2.5 h-2.5" />}
                    {activeChapter.status === 'accepted'
                      ? t('status.accepted')
                      : activeChapter.status === 'review'
                        ? t('status.review')
                        : activeChapter.status === 'writing'
                          ? t('status.writing')
                          : t('status.pending')}
                  </span>
                </span>{' '}
                大纲 · 共 {volumes.flatMap((v) => v.chapters).length} 章
              </div>

              <div className="mb-3">
                <label className="block text-[11px] font-medium text-[var(--ink-secondary)] tracking-[0.04em] uppercase mb-1">
                  章节概要
                </label>
                <textarea
                  rows={3}
                  className="w-full bg-[var(--canvas-elevated)] border border-[var(--hairline)] rounded-[var(--radius-sm)] p-2.5 font-sans text-[13px] text-[var(--ink)] outline-none resize-vertical focus:border-[var(--accent-gold)]"
                  value={outlineText}
                  onChange={(e) => setOutlineText(e.target.value)}
                  placeholder="输入章节大纲..."
                />
              </div>

              <div className="text-[11px] font-medium text-[var(--ink-secondary)] tracking-[0.04em] uppercase mb-2">
                五维大纲锁定
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FiveDimField
                  label={t('pages.dimensionFrame')}
                  value={dimensions.cognitiveFrame}
                  onChange={(v) => updateDimension('cognitiveFrame', v)}
                  placeholder="角色的认知框架变化"
                />
                <FiveDimField
                  label={t('pages.dimensionAnchor')}
                  value={dimensions.emotionalAnchor}
                  onChange={(v) => updateDimension('emotionalAnchor', v)}
                  placeholder="情感锚点"
                />
                <FiveDimField
                  label={t('pages.dimensionTexture')}
                  value={dimensions.worldTexture}
                  onChange={(v) => updateDimension('worldTexture', v)}
                  placeholder="世界质感"
                />
                <FiveDimField
                  label={t('pages.dimensionMystery')}
                  value={dimensions.concreteMystery}
                  onChange={(v) => updateDimension('concreteMystery', v)}
                  placeholder="具体悬念"
                />
                <FiveDimField
                  label={t('pages.dimensionTension')}
                  value={dimensions.interpersonalTension}
                  onChange={(v) => updateDimension('interpersonalTension', v)}
                  placeholder="人际张力"
                />
              </div>

              {aiSuggestion && (
                <div className="mt-4 p-3 rounded-lg bg-[var(--accent-gold-soft-bg)] border border-[rgba(201,169,110,0.3)] text-[13px] text-[var(--ink-secondary)] leading-[1.6]">
                  <div className="text-[11px] font-medium text-[var(--accent-gold)] mb-1 uppercase tracking-[0.04em]">
                    AI 优化建议
                  </div>
                  {aiSuggestion}
                </div>
              )}

              <div className="flex gap-2 mt-5">
                <button
                  className="btn-primary flex items-center gap-1.5"
                  style={{ height: 30, padding: '0 16px', minWidth: 110 }}
                  onClick={handleSaveOutline}
                  disabled={saving}
                >
                  <Save className="w-3.5 h-3.5" /> {saving ? '保存中...' : t('pages.outlineSave')}
                </button>
                <button
                  className="btn-secondary flex items-center gap-1.5"
                  style={{ height: 30, padding: '0 16px', minWidth: 135 }}
                  onClick={handleAIOptimize}
                  disabled={optimizing || !outlineText.trim()}
                >
                  {optimizing ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {optimizing ? '优化中...' : t('pages.outlineAI')}
                </button>
              </div>
            </>
          ) : (
            <div className="text-center pt-20 text-[var(--ink-tertiary)]">
              {volumes.flatMap((v) => v.chapters).length > 0 ? '选择左侧章节开始编辑大纲' : '暂无章节，请先创建章节'}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function FiveDimField({
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
