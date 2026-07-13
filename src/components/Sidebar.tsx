import type { LucideIcon } from 'lucide-react'
import {
  BarChart3,
  BookOpen,
  Brain,
  CalendarDays,
  Check,
  Download,
  FileText,
  FlaskConical,
  Globe,
  HeartHandshake,
  Info,
  LayoutDashboard,
  Link2,
  PenSquare,
  Plus,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDataRefresh } from '@/hooks/useDataRefresh'
import { useT } from '@/hooks/useT'
import { projectsApi, statsApi } from '@/lib/api'
import { refreshAllData } from '@/lib/dataEvents'
import { NEXT_STATUS } from '@/lib/status'
import { useStats } from '@/lib/useProjectData'
import { useChapterStore } from '@/stores/useChapterStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { useSidebarStore } from '@/stores/useSidebarStore'
import type { SidebarItem } from '@/types'

// Map icon string names from backend to Lucide components
const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  Users,
  Globe,
  FlaskConical,
  ScrollText,
  Link2,
  Brain,
  HeartHandshake,
  CalendarDays,
  ShieldCheck,
  Download,
  Info,
}

export function Sidebar() {
  const { volumes, currentChapter, setCurrentChapter, loadChapterContent, createChapter } = useChapterStore()
  const { activePage, setActivePage } = useSidebarStore()
  const currentProject = useProjectStore((s) => s.currentProject)
  const projectLoading = useProjectStore((s) => s.loading)
  const { data: stats, reload: reloadStats } = useStats()
  useDataRefresh('stats', reloadStats)
  const { t } = useT()
  const [sidebarItems, setSidebarItems] = useState<SidebarItem[]>([])
  const [spinKey, setSpinKey] = useState(0)
  const [collapsedVols, setCollapsedVols] = useState<Set<number>>(new Set())
  const [editingTarget, setEditingTarget] = useState(false)
  const [targetInput, setTargetInput] = useState('')
  const targetInputRef = useRef<HTMLInputElement>(null)

  const handleSaveTargetWords = useCallback(async () => {
    const val = parseInt(targetInput)
    if (!isNaN(val) && val >= 1000 && currentProject) {
      try {
        await statsApi.updateTargetWords(currentProject, val)
        reloadStats()
      } catch {
        /* ignore */
      }
    }
    setEditingTarget(false)
    setTargetInput('')
  }, [targetInput, currentProject, reloadStats])

  const handleResetTargetWords = useCallback(async () => {
    if (!currentProject) return
    try {
      await statsApi.resetTargetWords(currentProject)
      reloadStats()
    } catch {
      /* ignore */
    }
    setEditingTarget(false)
    setTargetInput('')
  }, [currentProject, reloadStats])

  useEffect(() => {
    if (editingTarget && targetInputRef.current) {
      targetInputRef.current.focus()
      targetInputRef.current.select()
    }
  }, [editingTarget])

  const toggleVolume = (volId: number) => {
    setCollapsedVols((prev) => {
      const next = new Set(prev)
      if (next.has(volId)) next.delete(volId)
      else next.add(volId)
      return next
    })
  }

  // Load sidebar items filtered by project genre
  const loadSidebarItems = useCallback(async () => {
    if (!currentProject) {
      setSidebarItems([])
      return
    }
    try {
      const items = await projectsApi.getSidebarItems(currentProject)
      setSidebarItems(items)
    } catch {
      setSidebarItems([])
    }
  }, [currentProject])

  // Load sidebar items when project is ready; retry once loaded (race guard)
  useEffect(() => {
    if (!projectLoading && currentProject && sidebarItems.length === 0) {
      void loadSidebarItems()
    }
  }, [projectLoading, currentProject, sidebarItems.length, loadSidebarItems])

  const handleNewChapter = async (volumeId: number) => {
    if (!currentProject) return
    await createChapter(currentProject, t('chapter.defaultTitle'), '', volumeId)
    setActivePage('page-writing')
  }

  const handleRefresh = () => {
    setSpinKey((k) => k + 1)
    refreshAllData(currentProject || undefined).catch(() => {})
  }

  return (
    <aside className="w-[var(--sidebar-w)] bg-[var(--canvas-soft)] border-r border-[var(--hairline)] shrink-0 flex flex-col">
      {/* Scrollable top section */}
      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
        {/* Outline Section */}
        <div className="py-3">
          <div className="px-4 pb-2 text-[11px] font-medium text-[var(--ink-mute)] tracking-[0.06em] uppercase flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" />
            {t('sidebar.outline')}
            <button
              className="ml-auto flex items-center gap-1 px-1.5 py-[2px] rounded text-[var(--ink-mute)] cursor-pointer border-none bg-transparent hover:text-[var(--accent-gold)] hover:bg-[var(--accent-gold-soft-bg)] transition-colors"
              onClick={handleRefresh}
              title={t('sidebar.refreshTooltip')}
            >
              <RefreshCw key={spinKey} className="w-3 h-3 animate-spin-once" />
            </button>
          </div>

          {volumes.map((vol) => (
            <div key={vol.id}>
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 text-[var(--ink)] text-lg font-display font-medium cursor-pointer select-none"
                onClick={() => toggleVolume(vol.id)}
              >
                <span
                  className={`text-[10px] text-[var(--ink-mute)] transition-transform duration-200 ${collapsedVols.has(vol.id) ? '-rotate-90' : ''}`}
                >
                  ▼
                </span>
                <span
                  className="flex-1"
                  onClick={(e) => {
                    e.stopPropagation()
                    setActivePage('page-writing')
                  }}
                >
                  {vol.title.startsWith('第') && vol.title.endsWith('卷')
                    ? vol.title
                    : t('sidebar.volumeTitle', { order: vol.sortOrder, title: vol.title })}
                </span>
              </div>
              {!collapsedVols.has(vol.id) &&
                vol.chapters.map((ch) => (
                  <div
                    key={ch.id}
                    className={`flex items-center gap-1.5 px-4 pl-5 py-1 text-[13px] cursor-pointer relative transition-colors
                  ${currentChapter?.id === ch.id && activePage === 'page-writing' ? 'text-[var(--ink)] bg-[var(--canvas-elevated)]' : 'text-[var(--ink-secondary)]'}
                  hover:bg-[var(--canvas-card)]`}
                    onClick={() => {
                      setActivePage('page-writing')
                      setCurrentChapter(ch)
                      if (currentProject) loadChapterContent(currentProject, ch.num, ch.volumeId).catch(() => {})
                    }}
                  >
                    {currentChapter?.id === ch.id && activePage === 'page-writing' && (
                      <span className="absolute left-0 top-0.5 bottom-0.5 w-[2px] bg-[var(--accent-gold)] rounded-r" />
                    )}
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    <span className="flex-1 truncate">
                      {ch.title.startsWith('第')
                        ? ch.title
                        : t('sidebar.chapterTitle', { num: ch.num, title: ch.title })}
                    </span>
                    <StatusBadge
                      status={ch.status}
                      t={t}
                      onCycle={() => {
                        const next = NEXT_STATUS[ch.status] || 'writing'
                        useChapterStore
                          .getState()
                          .updateChapter(currentProject!, ch.num, { status: next })
                          .catch(() => {})
                        // Update local state immediately for UI responsiveness
                        ch.status = next
                        useChapterStore
                          .getState()
                          .loadChapters(currentProject!)
                          .catch(() => {})
                      }}
                    />
                  </div>
                ))}
              {/* Per-volume new chapter button */}
              <div
                className="flex items-center gap-1.5 px-4 pl-5 py-1 text-[13px] text-[var(--accent-gold)] cursor-pointer transition-colors hover:bg-[var(--canvas-card)]"
                onClick={() => handleNewChapter(vol.id)}
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1">{t('editor.newChapter')}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="h-px bg-[var(--hairline)] mx-3" />

        {/* Creative Section — dynamically loaded by project genre */}
        {sidebarItems.length > 0 && (
          <div className="py-3">
            <div className="px-4 pb-2 text-[11px] font-medium text-[var(--ink-mute)] tracking-[0.06em] uppercase flex items-center gap-1.5">
              <PenSquare className="w-3.5 h-3.5" />
              {t('sidebar.creative')}
            </div>
            {sidebarItems.map((item) => {
              const Icon = ICON_MAP[item.icon]
              if (!Icon || !item.labelKey) return null
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-2 px-4 pl-5 py-1 text-[13px] cursor-pointer transition-colors relative
                  ${activePage === item.route ? 'text-[var(--ink)] bg-[var(--canvas-card)]' : 'text-[var(--ink-secondary)]'}
                  hover:bg-[var(--canvas-mid)] hover:text-[var(--ink)]`}
                  onClick={() => setActivePage(item.route)}
                >
                  {activePage === item.route && (
                    <span className="absolute left-0 top-0.5 bottom-0.5 w-[2px] bg-[var(--accent-gold)] rounded-r" />
                  )}
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1">{t(item.labelKey)}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* About Section */}
        <div className="h-px bg-[var(--hairline)] mx-3" />
        <div className="py-3">
          <div
            className="px-4 pb-2 flex items-center gap-2 cursor-pointer transition-colors
            text-[var(--ink-secondary)] hover:text-[var(--ink)] hover:bg-[var(--canvas-mid)]"
            onClick={() => setActivePage('page-about')}
          >
            <div className={`flex items-center gap-2 flex-1 ${activePage === 'page-about' ? 'text-[var(--ink)]' : ''}`}>
              <Info className="w-4 h-4 shrink-0" />
              <span className="text-[13px]">{t('sidebar.about')}</span>
            </div>
          </div>
        </div>
      </div>
      {/* end scrollable top */}

      {/* Writing Stats — fixed at bottom, compact */}
      <div className="py-2 px-4 border-t border-[var(--hairline)] bg-[var(--canvas-soft)] shrink-0 text-[12px]">
        <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-medium text-[var(--ink-mute)] tracking-[0.06em] uppercase">
          <BarChart3 className="w-3 h-3" />
          {t('sidebar.stats')}
        </div>

        {/* Compact completion bar */}
        {stats?.targetWords &&
          stats.targetWords > 0 &&
          (() => {
            const pct = Math.min((stats.totalWords / stats.targetWords) * 100, 100)
            const remaining = Math.max(stats.targetWords - stats.totalWords, 0)
            return (
              <div className="mb-2">
                <div className="flex justify-between text-[11px] leading-none mb-1">
                  <span className="text-[var(--ink-tertiary)]">{t('sidebar.completion')}</span>
                  <span className="font-mono text-[var(--ink-mute)]">
                    {stats.totalWords.toLocaleString()} /{' '}
                    {editingTarget ? (
                      <input
                        ref={targetInputRef}
                        type="number"
                        min={1000}
                        className="inline w-[80px] bg-[var(--canvas-card)] border border-[var(--accent-gold)] rounded px-1 py-[1px] text-[11px] font-mono text-[var(--accent-gold)] outline-none"
                        value={targetInput}
                        onChange={(e) => setTargetInput(e.target.value)}
                        onBlur={handleSaveTargetWords}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveTargetWords()
                          if (e.key === 'Escape') {
                            setEditingTarget(false)
                            setTargetInput('')
                          }
                        }}
                      />
                    ) : (
                      <span
                        className="cursor-pointer hover:text-[var(--accent-gold)] transition-colors"
                        onClick={() => {
                          setTargetInput(String(stats.targetWords))
                          setEditingTarget(true)
                        }}
                        title={t('sidebar.clickToEditTarget')}
                      >
                        {stats.targetWords.toLocaleString()}
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-[5px] bg-[var(--canvas-mid)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      background: pct >= 75 ? 'var(--success)' : pct >= 40 ? 'var(--accent-gold)' : 'var(--ink-mute)',
                    }}
                  />
                </div>
                {remaining > 0 && (
                  <div className="text-[10px] text-[var(--ink-mute)] mt-[1px]">
                    {t('sidebar.remaining', { n: remaining.toLocaleString() })}
                  </div>
                )}
              </div>
            )
          })()}

        {/* Sparkline — last 7 days */}
        <div className="mb-1.5">
          <div className="flex items-end gap-[1.5px] h-[24px]">
            {(() => {
              const dw = stats?.dailyWords || []
              const mx = Math.max(...dw, 1)
              return dw.map((v: number, i: number) => (
                <div
                  key={i}
                  className="flex-1 rounded-[1px] relative group"
                  style={{
                    height: `${Math.max((v / mx) * 22, v > 0 ? 2 : 0)}px`,
                    background: v > 0 ? 'var(--accent-gold)' : 'var(--canvas-mid)',
                    opacity: v > 0 ? 0.55 : 0.25,
                  }}
                >
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-[8px] font-mono text-[var(--ink-mute)] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    {v.toLocaleString()}
                  </span>
                </div>
              ))
            })()}
          </div>
          <div className="flex gap-[1.5px] mt-[2px]">
            {(() => {
              const dw = stats?.dailyWords || []
              const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
              const today = new Date()
              return dw.map((_, i) => {
                const d = new Date(today)
                d.setDate(d.getDate() - (6 - i))
                return (
                  <div key={i} className="flex-1 text-center text-[7px] text-[var(--ink-mute)] leading-none">
                    {days[d.getDay()].slice(0, 2)}
                  </div>
                )
              })
            })()}
          </div>
        </div>

        {/* Stats rows — compact */}
        <div className="flex justify-between py-[2px]">
          <span className="text-[var(--ink-mute)]">{t('sidebar.currentChapter')}</span>
          <span className="font-mono text-[var(--ink-tertiary)]">
            {currentChapter?.wordCount?.toLocaleString() || '0'} {t('editor.words')}
          </span>
        </div>
        <div className="flex justify-between py-[2px]">
          <span className="text-[var(--ink-mute)]">{t('sidebar.totalWords')}</span>
          <span className="font-mono text-[var(--ink-tertiary)]">
            {(stats?.totalWords || 0).toLocaleString()} {t('editor.words')}
          </span>
        </div>
        <div className="flex justify-between py-[2px]">
          <span className="text-[var(--ink-mute)]">{t('sidebar.today')}</span>
          <span className="font-mono text-[var(--ink-tertiary)]">
            {(stats?.dailyWords?.[stats.dailyWords.length - 1] || 0).toLocaleString()} {t('editor.words')}
          </span>
        </div>
      </div>
    </aside>
  )
}

function StatusBadge({
  status,
  t: translate,
  onCycle,
}: {
  status: string
  t: (path: string, params?: Record<string, string | number>) => string
  onCycle?: () => void
}) {
  const colorMap: Record<string, { bg: string; text: string; label: string; dot?: boolean }> = {
    accepted: { bg: 'var(--success-soft)', text: 'var(--success)', label: translate('status.accepted') },
    review: { bg: 'var(--warning-soft)', text: 'var(--warning)', label: translate('status.review'), dot: true },
    writing: { bg: 'var(--info-soft)', text: 'var(--info)', label: translate('status.writing'), dot: true },
    pending: { bg: 'var(--pending-soft)', text: 'var(--pending)', label: translate('status.pending') },
  }
  const c = colorMap[status] || colorMap.pending
  return (
    <span
      className={`text-[10px] font-medium px-[7px] py-[1px] rounded-full font-sans shrink-0 inline-flex items-center gap-1 ${onCycle ? 'cursor-pointer hover:brightness-110' : ''}`}
      style={{ background: c.bg, color: c.text }}
      onClick={(e) => {
        if (onCycle) {
          e.stopPropagation()
          onCycle()
        }
      }}
      title={
        onCycle
          ? translate('sidebar.switchToStatus', { status: translate('status.' + (NEXT_STATUS[status] || 'writing')) })
          : undefined
      }
    >
      {status === 'accepted' && <Check className="w-2.5 h-2.5" />}
      {c.dot && (
        <span
          className={`w-[6px] h-[6px] rounded-full ${status === 'writing' ? 'animate-pulse' : ''}`}
          style={{ background: c.text }}
        />
      )}
      {c.label}
    </span>
  )
}
