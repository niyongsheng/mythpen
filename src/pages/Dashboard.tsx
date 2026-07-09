import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  BarChartHorizontal,
  BookOpenText,
  Brain,
  Check,
  Clover,
  FolderOpen,
  LayoutDashboard,
  Library,
  List,
  PenLine,
  ScrollText,
  Swords,
  Users,
  Waypoints,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useDataRefresh } from '@/hooks/useDataRefresh'
import { useT } from '@/hooks/useT'
import { useProjectName, useStats } from '@/lib/useProjectData'
import { useProjectStore } from '@/stores/useProjectStore'
import { useSidebarStore } from '@/stores/useSidebarStore'
import type { ProjectStats, WorkflowPhase } from '@/types'

const PHASE_ORDER: WorkflowPhase[] = ['idea', 'setting', 'outline', 'writing', 'review', 'consistency', 'export']

const PHASE_LABELS: Record<WorkflowPhase, { key: string; num: string }> = {
  idea: { key: 'phaseIdea', num: '1' },
  setting: { key: 'phaseSetting', num: '2' },
  outline: { key: 'phaseOutline', num: '3' },
  writing: { key: 'phaseWriting', num: '4' },
  review: { key: 'phaseReview', num: '5' },
  consistency: { key: 'phaseConsistency', num: '6' },
  export: { key: 'phaseExport', num: '7' },
}

const GENRE_LABELS: Record<string, { label: string; color: string }> = {
  'sci-fi': { label: '科幻', color: '#5b8af0' },
  fantasy: { label: '玄幻', color: '#a855f7' },
  romance: { label: '言情', color: '#ec4899' },
  history: { label: '历史', color: '#d97706' },
  urban: { label: '都市', color: '#14b8a6' },
  'power-fantasy': { label: '爽文', color: '#f97316' },
  biography: { label: '传记', color: '#6b7280' },
  other: { label: '其他', color: '#8b8b8b' },
}

const statusColors: Record<string, string> = {
  accepted: 'var(--success)',
  review: 'var(--warning)',
  writing: 'var(--info)',
}

const statusBg: Record<string, string> = {
  accepted: 'var(--success-soft)',
  review: 'var(--warning-soft)',
  writing: 'var(--info-soft)',
}

export function Dashboard() {
  const { setActivePage } = useSidebarStore()
  const { data: stats, loading, reload: reloadStats } = useStats()
  useDataRefresh('stats', reloadStats)
  const { t } = useT()
  const project = useProjectName()
  const workflowPhase = useProjectStore((s) => s.workflowPhase)
  const setPhase = useProjectStore((s) => s.setPhase)
  const loadPhase = useProjectStore((s) => s.loadPhase)
  const [advancing, setAdvancing] = useState(false)
  const [confirmPhase, setConfirmPhase] = useState<string | null>(null)

  useEffect(() => {
    if (project) loadPhase(project)
  }, [project])

  const currentIdx = PHASE_ORDER.indexOf(workflowPhase)

  const canAdvance = useCallback((): WorkflowPhase | null => {
    const idx = PHASE_ORDER.indexOf(workflowPhase)
    return PHASE_ORDER[idx + 1] || null
  }, [workflowPhase])

  const handleAdvance = async () => {
    if (!project || advancing) return
    setAdvancing(true)
    try {
      const next = canAdvance()
      if (next) await setPhase(project, next)
    } finally {
      setAdvancing(false)
    }
  }

  const handlePhaseSelect = (phase: string) => {
    if (!project || phase === workflowPhase) return
    setConfirmPhase(phase)
  }

  const handleConfirmPhase = async () => {
    if (!project || !confirmPhase) return
    await setPhase(project, confirmPhase as any)
    setConfirmPhase(null)
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-[var(--ink-mute)]">加载中...</div>
  }

  const s: ProjectStats = stats || {
    totalWords: 0,
    chapterCount: 0,
    acceptedCount: 0,
    characterCount: 0,
    relationCount: 0,
    foreshadowCount: 0,
    resolvedForeshadow: 0,
    overdueForeshadow: 0,
    worldCount: 0,
    sciCount: 0,
    memoryCount: 0,
    timelineCount: 0,
    volumeCount: 0,
    volumes: [],
    clueUnresolved: 0,
    clueResolved: 0,
    genres: [],
    tokenInput: 0,
    tokenOutput: 0,
    chapters: [],
    dailyWords: [],
    targetWords: 0,
  }

  const progressPct = s.chapterCount > 0 ? Math.round((s.acceptedCount / s.chapterCount) * 100) : 0
  const wordProgressPct = s.targetWords > 0 ? Math.min((s.totalWords / s.targetWords) * 100, 100) : 0
  const totalClues = (s.clueUnresolved || 0) + (s.clueResolved || 0)
  const totalTokens = (s.tokenInput || 0) + (s.tokenOutput || 0)

  return (
    <>
      <div className="page-header">
        <h2 className="flex items-center gap-2">
          <LayoutDashboard className="w-5 h-5" /> {t('pages.dashboard')}
        </h2>
        <div className="page-header-actions">
          <button
            className="btn-primary flex items-center gap-1.5"
            style={{ height: 30, padding: '0 14px' }}
            onClick={() => setActivePage('page-writing')}
          >
            <PenLine className="w-3.5 h-3.5" /> {t('pages.continueWriting')}
          </button>
        </div>
      </div>

      {/* ── Phase Bar ── */}
      <div className="flex items-center gap-1 px-6 h-[54px] bg-[var(--canvas-soft)] border-b border-[var(--hairline)] shrink-0 overflow-x-auto custom-scrollbar">
        {PHASE_ORDER.map((phase, i) => (
          <span key={phase} className="inline-flex items-center">
            <PhaseStep
              state={i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'pending'}
              label={t(`pages.${PHASE_LABELS[phase].key}`)}
              num={PHASE_LABELS[phase].num}
              active={i === currentIdx}
              onAdvance={i === currentIdx && currentIdx < PHASE_ORDER.length - 1 ? handleAdvance : undefined}
              onSelect={i !== currentIdx ? () => handlePhaseSelect(phase) : undefined}
              advancing={advancing}
            />
            {i < PHASE_ORDER.length - 1 && <PhaseConnector done={i < currentIdx} />}
          </span>
        ))}
        <div className="ml-auto text-[11px] text-[var(--ink-mute)] font-mono min-w-[140px] text-right">
          共 {s.chapterCount} 章 · {s.acceptedCount} 章已完成
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="grid grid-cols-3 gap-3 p-6 overflow-y-auto flex-1 auto-rows-min custom-scrollbar">
        {/* ── 写作进度 ── */}
        <DashCard icon={BarChartHorizontal} title={t('pages.cardProgress')}>
          <div className="font-mono text-[28px] text-[var(--accent-gold)]">
            {s.acceptedCount} / {s.chapterCount}
          </div>
          <div className="h-1.5 bg-[var(--canvas-mid)] rounded-full my-3 overflow-hidden">
            <div className="h-full bg-[var(--accent-gold)] rounded-full" style={{ width: `${progressPct}%` }} />
          </div>
          <div className="flex justify-between text-[12px] text-[var(--ink-tertiary)]">
            <span>已完成 {s.acceptedCount} 章</span>
            <span>{progressPct}%</span>
          </div>
        </DashCard>

        {/* ── 总字数 ── */}
        <DashCard icon={BookOpenText} title={t('pages.cardTotalWords')}>
          <div className="font-mono text-[28px] text-[var(--accent-gold)]">{s.totalWords?.toLocaleString() || '0'}</div>
          <div className="h-1.5 bg-[var(--canvas-mid)] rounded-full my-3 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${wordProgressPct}%`, background: 'var(--info)' }}
            />
          </div>
          <div className="flex justify-between text-[12px] text-[var(--ink-tertiary)]">
            <span>目标 {s.targetWords?.toLocaleString() || '0'} 字</span>
            <span>{wordProgressPct.toFixed(1)}%</span>
          </div>
        </DashCard>

        {/* ── 创作类型 ── */}
        <DashCard icon={Library} title={t('pages.cardGenre')}>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {(s.genres || []).length > 0 ? (
              s.genres!.map((g) => {
                const info = GENRE_LABELS[g] || { label: g, color: '#8b8b8b' }
                return (
                  <span
                    key={g}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-medium"
                    style={{ background: `${info.color}18`, color: info.color, border: `1px solid ${info.color}40` }}
                  >
                    {info.label}
                  </span>
                )
              })
            ) : (
              <span className="text-[13px] text-[var(--ink-tertiary)]">未设定</span>
            )}
          </div>
          <div className="text-[12px] text-[var(--ink-tertiary)] mt-2.5">
            共 {s.volumeCount || 0} 卷 · {s.chapterCount} 章
          </div>
        </DashCard>

        {/* ── 角色与关系 ── */}
        <DashCard icon={Users} title={t('pages.cardCharRelation')}>
          <div className="flex items-baseline gap-4 mt-1">
            <div>
              <div className="font-mono text-[22px] text-[var(--ink)]">{s.characterCount || 0}</div>
              <div className="text-[11px] text-[var(--ink-tertiary)]">角色</div>
            </div>
            {(s.relationCount || 0) > 0 && (
              <>
                <div className="text-[var(--ink-mute)] text-[20px]">+</div>
                <div>
                  <div className="font-mono text-[22px] text-[var(--ink)]">{s.relationCount}</div>
                  <div className="text-[11px] text-[var(--ink-tertiary)]">关系</div>
                </div>
              </>
            )}
          </div>
        </DashCard>

        {/* ── 世界观与设定 ── */}
        <DashCard icon={FolderOpen} title={t('pages.cardWorldSetting')}>
          <div className="flex items-baseline gap-4 mt-1">
            <div>
              <div className="font-mono text-[22px] text-[var(--ink)]">{s.worldCount || 0}</div>
              <div className="text-[11px] text-[var(--ink-tertiary)]">世界观</div>
            </div>
            <div>
              <div className="font-mono text-[22px] text-[var(--ink)]">{s.sciCount || 0}</div>
              <div className="text-[11px] text-[var(--ink-tertiary)]">科学设定</div>
            </div>
          </div>
        </DashCard>

        {/* ── 伏笔管理 ── */}
        <DashCard icon={Swords} title={t('pages.cardForeshadowManage')}>
          <div className="flex items-baseline gap-4 mt-1">
            <div>
              <div className="font-mono text-[22px] text-[var(--ink)]">{s.foreshadowCount || 0}</div>
              <div className="text-[11px] text-[var(--ink-tertiary)]">总伏笔</div>
            </div>
            <div>
              <div className="font-mono text-[22px] text-[var(--success)]">{s.resolvedForeshadow || 0}</div>
              <div className="text-[11px] text-[var(--ink-tertiary)]">已回收</div>
            </div>
            {(s.overdueForeshadow || 0) > 0 && (
              <div>
                <div className="font-mono text-[22px] text-[var(--error)]">{s.overdueForeshadow}</div>
                <div className="text-[11px] text-[var(--ink-tertiary)]">逾期</div>
              </div>
            )}
          </div>
        </DashCard>

        {/* ── 卷结构 ── */}
        {(s.volumes || []).length > 0 && (
          <DashCard icon={ScrollText} title={t('pages.cardVolumes')}>
            <div className="space-y-1.5 mt-1">
              {s.volumes!.map((v) => (
                <div key={v.id} className="flex items-center justify-between text-[12px]">
                  <span className="text-[var(--ink)] truncate mr-2">{v.title}</span>
                  <span className="text-[var(--ink-tertiary)] shrink-0 font-mono">
                    {v.chapter_count} 章 · {(v.word_count || 0).toLocaleString()} 字
                  </span>
                </div>
              ))}
            </div>
          </DashCard>
        )}

        {/* ── 线索板 ── */}
        {totalClues > 0 && (
          <DashCard icon={Clover} title={t('pages.cardClueBoard')}>
            <div className="flex items-baseline gap-4 mt-1">
              <div>
                <div className="font-mono text-[22px] text-[var(--warning)]">{s.clueUnresolved || 0}</div>
                <div className="text-[11px] text-[var(--ink-tertiary)]">待解</div>
              </div>
              <div>
                <div className="font-mono text-[22px] text-[var(--success)]">{s.clueResolved || 0}</div>
                <div className="text-[11px] text-[var(--ink-tertiary)]">已解</div>
              </div>
            </div>
          </DashCard>
        )}

        {/* ── 创作记忆与时间线 ── */}
        <DashCard icon={Waypoints} title={t('pages.cardNarrative')}>
          <div className="flex items-baseline gap-4 mt-1">
            {(s.memoryCount || 0) > 0 && (
              <div>
                <div className="font-mono text-[22px] text-[var(--ink)]">{s.memoryCount}</div>
                <div className="text-[11px] text-[var(--ink-tertiary)]">创作记忆</div>
              </div>
            )}
            {(s.timelineCount || 0) > 0 && (
              <div>
                <div className="font-mono text-[22px] text-[var(--ink)]">{s.timelineCount}</div>
                <div className="text-[11px] text-[var(--ink-tertiary)]">时间线事件</div>
              </div>
            )}
            {!s.memoryCount && !s.timelineCount && (
              <span className="text-[13px] text-[var(--ink-tertiary)]">暂无记录</span>
            )}
          </div>
        </DashCard>

        {/* ── Token 消耗 ── */}
        {totalTokens > 0 && (
          <DashCard icon={Brain} title={t('pages.cardAiUsage')}>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
              <div className="min-w-0">
                <div className="font-mono text-[16px] text-[var(--ink)]">{fmtTokens(s.tokenInput || 0)}</div>
                <div className="text-[11px] text-[var(--ink-tertiary)]">输入</div>
              </div>
              <div className="min-w-0">
                <div className="font-mono text-[16px] text-[var(--ink)]">{fmtTokens(s.tokenOutput || 0)}</div>
                <div className="text-[11px] text-[var(--ink-tertiary)]">输出</div>
              </div>
              <div className="min-w-0">
                <div className="font-mono text-[16px] text-[var(--ink)]">{fmtTokens(totalTokens)}</div>
                <div className="text-[11px] text-[var(--ink-tertiary)]">总计</div>
              </div>
            </div>
          </DashCard>
        )}

        {/* ── 章节列表 (全宽) ── */}
        <div className="col-span-3 bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg p-5">
          <div className="dash-card-title flex items-center gap-1.5">
            <List className="w-4 h-4" /> {t('pages.cardChapterList')}
          </div>
          <div>
            {(s.chapters || []).map((ch: any) => (
              <ChapterListItem
                key={ch.num}
                num={ch.num}
                title={ch.title}
                status={ch.status}
                words={`${(ch.word_count || 0).toLocaleString()}字`}
              />
            ))}
          </div>
        </div>
      </div>

      {confirmPhase && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]"
          onClick={() => setConfirmPhase(null)}
        >
          <div
            className="bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-xl p-6 w-[360px] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[16px] font-medium text-[var(--ink)] mb-2">切换项目阶段</h3>
            <p className="text-[13px] text-[var(--ink-tertiary)] mb-5">
              将阶段切换到「{t(`pages.${PHASE_LABELS[confirmPhase as keyof typeof PHASE_LABELS]?.key}`)}」？
            </p>
            <div className="flex justify-end gap-2">
              <button
                className="h-[32px] px-4 rounded-lg border border-[var(--hairline-light)] bg-[var(--canvas-elevated)] text-[var(--ink)] text-[13px] cursor-pointer hover:bg-[var(--canvas-mid)]"
                onClick={() => setConfirmPhase(null)}
              >
                取消
              </button>
              <button
                className="h-[32px] px-4 rounded-lg bg-[var(--accent-gold)] text-[var(--canvas)] text-[13px] font-medium cursor-pointer border-none hover:brightness-110"
                onClick={handleConfirmPhase}
              >
                确认切换
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function fmtTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function PhaseStep({
  state,
  label,
  num,
  active,
  onAdvance,
  onSelect,
  advancing,
}: {
  state: string
  label: string
  num: string
  active?: boolean
  onAdvance?: () => void
  onSelect?: () => void
  advancing?: boolean
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[12px] whitespace-nowrap px-2 py-1 rounded-[var(--radius-sm)]
      ${onSelect ? 'cursor-pointer' : ''}
      ${state === 'active' ? 'text-[var(--ink)] font-medium' : state === 'done' ? 'text-[var(--ink-tertiary)]' : 'text-[var(--ink-mute)]'}
      hover:bg-[var(--canvas-card)]`}
      onClick={() => onSelect?.()}
    >
      <span
        className={`w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] shrink-0
        ${
          state === 'active'
            ? 'bg-[var(--accent-gold)] text-[var(--canvas)] shadow-[0_0_0_3px_var(--accent-gold-soft-bg)]'
            : state === 'done'
              ? 'bg-[var(--success-soft)] text-[var(--success)]'
              : 'bg-[var(--canvas-mid)] text-[var(--ink-mute)]'
        }`}
      >
        {state === 'done' ? <Check className="w-3 h-3" /> : num}
      </span>
      {label}
      {active && onAdvance && (
        <button
          className="ml-1 w-[18px] h-[18px] flex items-center justify-center rounded-full bg-[var(--accent-gold)] text-[var(--canvas)] hover:brightness-110 transition-all cursor-pointer border-none"
          onClick={(e) => {
            e.stopPropagation()
            onAdvance()
          }}
          disabled={advancing}
          title="进入下一阶段"
        >
          <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </span>
  )
}

function PhaseConnector({ done }: { done?: boolean }) {
  return (
    <span
      className={`w-[18px] h-px shrink-0 ${done ? 'bg-[var(--success)] opacity-50' : 'bg-[var(--hairline-light)]'}`}
    />
  )
}

function DashCard({ icon: Icon, title, children }: { icon?: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg p-5">
      <div className="dash-card-title flex items-center gap-1.5">
        {Icon && <Icon className="w-4 h-4" />}
        {title}
      </div>
      {children}
    </div>
  )
}

function ChapterListItem({ num, title, status, words }: { num: number; title: string; status: string; words: string }) {
  const badgeColor = statusColors[status] || 'var(--ink-mute)'
  const bgColor = statusBg[status] || 'var(--canvas-pop)'
  const statusIcon: Record<string, React.ReactNode> = {
    accepted: <Check className="w-2.5 h-2.5" />,
    review: (
      <span
        style={{ width: 8, height: 8, display: 'inline-block', borderRadius: '50%', background: 'var(--warning)' }}
      />
    ),
    writing: (
      <span style={{ width: 8, height: 8, display: 'inline-block', borderRadius: '50%', background: 'var(--info)' }} />
    ),
  }
  return (
    <div className="flex items-center gap-2.5 py-1.5 border-b border-[var(--hairline)] last:border-none text-[13px]">
      <span
        className="text-[10px] font-medium px-[6px] py-[1px] rounded-full flex items-center gap-0.5"
        style={{ background: bgColor, color: badgeColor }}
      >
        {statusIcon[status] || (
          <span
            style={{ width: 6, height: 6, display: 'inline-block', borderRadius: '50%', background: 'var(--ink-mute)' }}
          />
        )}
      </span>
      <span style={{ flex: 1 }}>
        第{num}章 {title}
      </span>
      <span style={{ color: 'var(--ink-tertiary)', fontSize: 12 }}>{words}</span>
    </div>
  )
}
