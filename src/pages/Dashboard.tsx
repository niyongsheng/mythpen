import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  BarChartHorizontal,
  BookOpenText,
  Check,
  Clock,
  CreditCard,
  FolderOpen,
  LayoutDashboard,
  Link2,
  List,
  PenLine,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useT } from '@/hooks/useT'
import { useProjectName, useStats } from '@/lib/useProjectData'
import { useProjectStore } from '@/stores/useProjectStore'
import { useSidebarStore } from '@/stores/useSidebarStore'
import type { WorkflowPhase } from '@/types'

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

export function Dashboard() {
  const { setActivePage } = useSidebarStore()
  const { data: stats, loading } = useStats()
  const { t } = useT()
  const project = useProjectName()
  const workflowPhase = useProjectStore((s) => s.workflowPhase)
  const setPhase = useProjectStore((s) => s.setPhase)
  const loadPhase = useProjectStore((s) => s.loadPhase)
  const [advancing, setAdvancing] = useState(false)
  const [confirmPhase, setConfirmPhase] = useState<string | null>(null)

  // Load phase on mount
  useEffect(() => {
    if (project) loadPhase(project)
  }, [project])

  const currentIdx = PHASE_ORDER.indexOf(workflowPhase)

  const canAdvance = useCallback((): WorkflowPhase | null => {
    const idx = PHASE_ORDER.indexOf(workflowPhase)
    const next = PHASE_ORDER[idx + 1]
    return next || null
  }, [workflowPhase])

  const handleAdvance = async () => {
    if (!project || advancing) return
    setAdvancing(true)
    try {
      const next = canAdvance()
      if (next) {
        await setPhase(project, next)
      }
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

  const s = stats || {
    totalWords: 0,
    chapterCount: 0,
    acceptedCount: 0,
    characterCount: 0,
    foreshadowCount: 0,
    resolvedForeshadow: 0,
    overdueForeshadow: 0,
    worldCount: 0,
    sciCount: 0,
    tokenInput: 0,
    tokenOutput: 0,
    chapters: [],
  }

  const progressPct = s.chapterCount > 0 ? Math.round((s.acceptedCount / s.chapterCount) * 100) : 0
  const totalTokens = (s.tokenInput || 0) + (s.tokenOutput || 0)
  const inputRatio = totalTokens > 0 ? (s.tokenInput / totalTokens) * 100 : 86

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

      <div className="flex items-center gap-1 px-6 h-[54px] bg-[var(--canvas-soft)] border-b border-[var(--hairline)] shrink-0 overflow-x-auto">
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

      <div className="grid grid-cols-3 gap-3 p-6 overflow-y-auto flex-1">
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

        <DashCard icon={BookOpenText} title={t('pages.cardTotalWords')}>
          <div className="font-mono text-[28px] text-[var(--accent-gold)]">{s.totalWords?.toLocaleString() || '0'}</div>
          <div className="text-[12px] text-[var(--ink-tertiary)] mt-1">共 {s.chapterCount} 章</div>
        </DashCard>

        <DashCard icon={Clock} title={t('pages.cardDuration')}>
          <div className="font-mono text-[28px] text-[var(--accent-gold)]">
            {Math.round((s.totalWords || 0) / 500)}h
          </div>
          <div className="text-[12px] text-[var(--ink-tertiary)] mt-1">
            角色 {s.characterCount} · 伏笔 {s.foreshadowCount}
          </div>
        </DashCard>

        <DashCard icon={Users} title={t('pages.cardCharacters')}>
          <div className="text-lg text-[var(--ink)] mb-1">{s.characterCount || 0} 个角色</div>
          <div className="text-[12px] text-[var(--ink-tertiary)]">世界观 {s.worldCount || 0} 条</div>
        </DashCard>

        <DashCard icon={Link2} title={t('pages.cardForeshadows')}>
          <div className="text-lg text-[var(--ink)] mb-1">
            {s.foreshadowCount || 0} 个{s.overdueForeshadow > 0 ? ` · ${s.overdueForeshadow} 个逾期` : ''}
          </div>
          <div className="text-[12px] text-[var(--ink-tertiary)]">已回收 {s.resolvedForeshadow || 0} 个</div>
        </DashCard>

        <DashCard icon={FolderOpen} title={t('pages.cardSettings')}>
          <div className="text-lg text-[var(--ink)] mb-1">{s.worldCount || 0} 条世界观</div>
          <div className="text-[12px] text-[var(--ink-tertiary)]">{s.sciCount || 0} 条科学设定</div>
        </DashCard>

        <DashCard icon={CreditCard} title={t('pages.cardTokens')}>
          <TuRow label="累计输入" value={formatTokens(s.tokenInput)} />
          <TuRow label="累计输出" value={formatTokens(s.tokenOutput)} />
          <TuRow label="总计" value={formatTokens(totalTokens)} />
          {totalTokens > 0 && (
            <>
              <div className="h-1 bg-[var(--canvas-mid)] rounded-full mt-2 overflow-hidden flex">
                <div className="h-full bg-[var(--accent-mist)]" style={{ width: `${inputRatio}%` }} />
                <div className="h-full bg-[var(--accent-gold)]" style={{ width: `${100 - inputRatio}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-[var(--ink-mute)] mt-1">
                <span>输入 {formatTokens(s.tokenInput)}</span>
                <span>输出 {formatTokens(s.tokenOutput)}</span>
              </div>
            </>
          )}
        </DashCard>

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

      {/* Phase confirm dialog */}
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

function TuRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1 text-[12px]">
      <span className="text-[var(--ink-tertiary)]">{label}</span>
      <span className="font-mono text-[var(--ink)]">{value}</span>
    </div>
  )
}

function ChapterListItem({ num, title, status, words }: { num: number; title: string; status: string; words: string }) {
  const badgeColors: Record<string, string> = {
    accepted: 'var(--success)',
    review: 'var(--warning)',
    writing: 'var(--info)',
  }
  const badgeBg: Record<string, string> = {
    accepted: 'var(--success-soft)',
    review: 'var(--warning-soft)',
    writing: 'var(--info-soft)',
  }
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
        style={{ background: badgeBg[status] || 'var(--canvas-pop)', color: badgeColors[status] || 'var(--ink-mute)' }}
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

function formatTokens(n: number): string {
  if (!n) return '0'
  if (n < 1000) return `${n}`
  return `${(n / 1000).toFixed(1)}k`
}
