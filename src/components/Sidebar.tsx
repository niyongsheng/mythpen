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
  ScrollText,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useT } from '@/hooks/useT'
import { projectsApi } from '@/lib/api'
import { NEXT_STATUS } from '@/lib/status'
import { useStats } from '@/lib/useProjectData'
import { useChapterStore } from '@/stores/useChapterStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
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
  const contextLengthKb = useSettingsStore((s) => s.settings.contextLengthKb || 1024)
  const { t } = useT()
  const [sidebarItems, setSidebarItems] = useState<SidebarItem[]>([])

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
      loadSidebarItems()
    }
  }, [projectLoading, currentProject, sidebarItems.length, loadSidebarItems])

  const allChapters = volumes.flatMap((v) => v.chapters)
  const hasChapters = allChapters.length > 0

  const handleNewChapter = async (volumeId: number) => {
    if (!currentProject) return
    await createChapter(currentProject, '新章节', '', volumeId)
    setActivePage('page-writing')
  }

  const getNextChapterNum = (vol: (typeof volumes)[0]) => {
    const nums = vol.chapters.map((c) => c.num)
    return nums.length > 0 ? Math.max(...nums) + 1 : 1
  }

  return (
    <aside className="w-[var(--sidebar-w)] bg-[var(--canvas-soft)] border-r border-[var(--hairline)] shrink-0 flex flex-col overflow-y-auto custom-scrollbar">
      {/* Outline Section */}
      <div className="py-3">
        <div className="px-4 pb-2 text-[11px] font-medium text-[var(--ink-mute)] tracking-[0.06em] uppercase flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5" />
          {t('sidebar.outline')}
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
            <span className="text-[12px] text-[var(--ink-mute)]">总计</span>
            <span className="font-mono text-[12px] text-[var(--ink-tertiary)]">
              {(stats?.totalWords || 0).toLocaleString()} {t('editor.words')}
            </span>
          </div>
          <div className="flex justify-between items-center py-[3px] text-[13px]">
            <span className="text-[12px] text-[var(--ink-mute)]">今日</span>
            <span className="font-mono text-[12px] text-[var(--ink-tertiary)]">{stats?.chapterCount || 0} 章</span>
          </div>

          {/* Context Budget */}
          <div className="mt-2.5">
            <div className="flex justify-between text-[11px] text-[var(--ink-mute)] mb-1">
              <span>上下文预算</span>
              <span className="font-mono">
                {((stats?.totalWords || 0) / 1000).toFixed(1)}k / {contextLengthKb}k
              </span>
            </div>
            <div className="h-2 bg-[var(--canvas-mid)] rounded-full overflow-hidden flex">
              <div
                className="h-full bg-[var(--accent-gold)]"
                style={{ width: `${Math.min(((stats?.totalWords || 0) / (contextLengthKb * 1000)) * 100, 100)}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-x-2.5 gap-y-[3px] mt-[7px] text-[10px] text-[var(--ink-tertiary)]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: 'var(--accent-gold)' }} />
                正文 {(stats?.totalWords || 0).toLocaleString()} 字
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: 'var(--accent-mist)' }} />
                角色 {stats?.characterCount || 0} 人
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: 'var(--info)' }} />
                伏笔 {stats?.foreshadowCount || 0} 条
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: 'var(--accent-ember)' }} />
                设定 {stats?.worldCount || 0} 条
              </div>
            </div>
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
