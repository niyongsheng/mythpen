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
  LayoutDashboard,
  Link2,
  PenSquare,
  Plus,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useT } from '@/hooks/useT'
import { projectsApi } from '@/lib/api'
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
}

export function Sidebar() {
  const { volumes, currentChapter, setCurrentChapter, loadChapterContent, createChapter } = useChapterStore()
  const { activePage, setActivePage } = useSidebarStore()
  const currentProject = useProjectStore((s) => s.currentProject)
  const projectLoading = useProjectStore((s) => s.loading)
  const { data: stats } = useStats()
  const { t } = useT()
  const [sidebarItems, setSidebarItems] = useState<SidebarItem[]>([])
  const [spinKey, setSpinKey] = useState(0)

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
    await createChapter(currentProject, '新章节', '', volumeId)
    setActivePage('page-writing')
  }

  const handleRefresh = () => {
    setSpinKey((k) => k + 1)
    refreshAllData(currentProject || undefined).catch(() => {})
  }

  return (
    <aside className="w-[var(--sidebar-w)] bg-[var(--canvas-soft)] border-r border-[var(--hairline)] shrink-0 flex flex-col overflow-y-auto custom-scrollbar">
      {/* Outline Section */}
      <div className="py-3">
        <div className="px-4 pb-2 text-[11px] font-medium text-[var(--ink-mute)] tracking-[0.06em] uppercase flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5" />
          {t('sidebar.outline')}
          <button
            className="ml-auto flex items-center gap-1 px-1.5 py-[2px] rounded text-[var(--ink-mute)] cursor-pointer border-none bg-transparent hover:text-[var(--accent-gold)] hover:bg-[var(--accent-gold-soft-bg)] transition-colors"
            onClick={handleRefresh}
            title="手动刷新所有数据（快捷键 ⌘⇧R）"
          >
            <RefreshCw key={spinKey} className="w-3 h-3 animate-spin-once" />
          </button>
        </div>

        {volumes.map((vol) => (
          <div key={vol.id}>
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 text-[var(--ink)] text-lg font-display font-medium cursor-pointer"
              onClick={() => setActivePage('page-writing')}
            >
              <span className="text-[10px] text-[var(--ink-mute)]">▼</span>
              {vol.title.startsWith('第') && vol.title.endsWith('卷')
                ? vol.title
                : `第${vol.sortOrder}卷 · ${vol.title}`}
            </div>
            {vol.chapters.map((ch) => (
              <div
                key={ch.id}
                className={`flex items-center gap-1.5 px-4 pl-5 py-1 text-[13px] cursor-pointer relative transition-colors
                  ${currentChapter?.id === ch.id && activePage === 'page-writing' ? 'text-[var(--ink)] bg-[var(--canvas-elevated)]' : 'text-[var(--ink-secondary)]'}
                  hover:bg-[var(--canvas-card)]`}
                onClick={() => {
                  setActivePage('page-writing')
                  setCurrentChapter(ch)
                  if (currentProject) loadChapterContent(currentProject, ch.num).catch(() => {})
                }}
              >
                {currentChapter?.id === ch.id && activePage === 'page-writing' && (
                  <span className="absolute left-0 top-0.5 bottom-0.5 w-[2px] bg-[var(--accent-gold)] rounded-r" />
                )}
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 truncate">
                  {ch.title.startsWith('第') ? ch.title : `第${ch.num}章 ${ch.title}`}
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

      <div className="h-px bg-[var(--hairline)] mx-3" />

      {/* Writing Stats */}
      <div className="py-3">
        <div className="px-4 pb-2 text-[11px] font-medium text-[var(--ink-mute)] tracking-[0.06em] uppercase flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5" />
          {t('sidebar.stats')}
        </div>
        <div className="px-4">
          {/* Completion progress */}
          {stats?.targetWords &&
            stats.targetWords > 0 &&
            (() => {
              const pct = Math.min((stats.totalWords / stats.targetWords) * 100, 100)
              const remaining = Math.max(stats.targetWords - stats.totalWords, 0)
              const color = pct >= 75 ? 'var(--success)' : pct >= 40 ? 'var(--accent-gold)' : 'var(--ink-mute)'
              return (
                <div className="mb-3 pb-3 border-b border-[var(--hairline-light)]">
                  <div className="flex items-center gap-2.5">
                    <svg width="36" height="36" viewBox="0 0 36 36" className="shrink-0">
                      <circle cx="18" cy="18" r="14" fill="none" stroke="var(--canvas-mid)" strokeWidth="3" />
                      <circle
                        cx="18"
                        cy="18"
                        r="14"
                        fill="none"
                        stroke={color}
                        strokeWidth="3"
                        strokeDasharray={2 * Math.PI * 14}
                        strokeDashoffset={2 * Math.PI * 14 * (1 - pct / 100)}
                        strokeLinecap="round"
                        transform="rotate(-90 18 18)"
                        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                      />
                      <text
                        x="18"
                        y="18"
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="var(--ink)"
                        fontSize="9"
                        fontWeight="600"
                        fontFamily="monospace"
                      >
                        {Math.round(pct)}%
                      </text>
                    </svg>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between text-[11px] text-[var(--ink-tertiary)]">
                        <span>{t('sidebar.completion')}</span>
                        <span className="font-mono">
                          {stats.totalWords.toLocaleString()} / {stats.targetWords.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-1 bg-[var(--canvas-mid)] rounded-full mt-1 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                      </div>
                      {remaining > 0 && (
                        <div className="text-[10px] text-[var(--ink-mute)] mt-[2px]">
                          {t('sidebar.remaining', { n: remaining.toLocaleString() })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()}

          {/* Sparkline — last 7 days */}
          <div className="flex items-end gap-[2px] h-7 my-1 mb-2.5">
            {(() => {
              const dw = stats?.dailyWords || []
              const mx = Math.max(...dw, 1)
              return dw.map((v: number, i: number) => (
                <div
                  key={i}
                  className="flex-1 rounded-[1px] transition-opacity relative group"
                  style={{
                    height: `${Math.max((v / mx) * 28, v > 0 ? 3 : 0)}px`,
                    background: v > 0 ? 'var(--accent-gold)' : 'var(--canvas-mid)',
                    opacity: v > 0 ? 0.5 : 0.3,
                  }}
                >
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-mono text-[var(--ink-mute)] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                    {v.toLocaleString()}
                  </span>
                </div>
              ))
            })()}
          </div>
          <div className="flex justify-between items-center py-[3px] text-[13px]">
            <span className="text-[12px] text-[var(--ink-mute)]">{t('editor.characters_zh')}</span>
            <span className="font-mono text-[12px] text-[var(--ink-tertiary)]">
              {currentChapter?.wordCount.toLocaleString()} {t('editor.words')}
            </span>
          </div>
          <div className="flex justify-between items-center py-[3px] text-[13px]">
            <span className="text-[12px] text-[var(--ink-mute)]">{t('sidebar.totalWords')}</span>
            <span className="font-mono text-[12px] text-[var(--ink-tertiary)]">
              {(stats?.totalWords || 0).toLocaleString()} {t('editor.words')}
            </span>
          </div>
          <div className="flex justify-between items-center py-[3px] text-[13px]">
            <span className="text-[12px] text-[var(--ink-mute)]">{t('sidebar.today')}</span>
            <span className="font-mono text-[12px] text-[var(--ink-tertiary)]">
              {(stats?.dailyWords?.[stats.dailyWords.length - 1] || 0).toLocaleString()} {t('editor.words')}
            </span>
          </div>
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
  t: (path: string) => string
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
      title={onCycle ? `切换为 ${translate('status.' + NEXT_STATUS[status] || 'writing')}` : undefined}
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
