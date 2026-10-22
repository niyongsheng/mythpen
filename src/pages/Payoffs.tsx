import type { LucideIcon } from 'lucide-react'
import { CheckCircle2, Flame, Lightbulb, Loader, Plus, Sparkles, WandSparkles } from 'lucide-react'
import { useState } from 'react'
import { SimpleCreateDialog } from '@/components/SimpleCreateDialog'
import { useDataRefresh } from '@/hooks/useDataRefresh'
import { useT } from '@/hooks/useT'
import { aiApi, extractAIJsonArray, getAIResponseText, payoffsApi } from '@/lib/api'
import { usePayoffs, useProjectName } from '@/lib/useProjectData'
import { useChapterStore } from '@/stores/useChapterStore'
import type { PayoffPoint, PayoffStatus, PayoffType } from '@/types'

interface Column {
  key: PayoffStatus
  icon: LucideIcon
  label: string
}

const COLUMNS: Column[] = [
  { key: 'planned', icon: Lightbulb, label: 'payoff.planned' },
  { key: 'building', icon: Flame, label: 'payoff.building' },
  { key: 'released', icon: CheckCircle2, label: 'payoff.released' },
]

const TYPES: PayoffType[] = ['face-slap', 'flex', 'comeback', 'reveal', 'reward', 'revenge', 'breakthrough', 'other']

const TYPE_KEYS: Record<PayoffType, string> = {
  'face-slap': 'payoff.typeFaceSlap',
  flex: 'payoff.typeFlex',
  comeback: 'payoff.typeComeback',
  reveal: 'payoff.typeReveal',
  reward: 'payoff.typeReward',
  revenge: 'payoff.typeRevenge',
  breakthrough: 'payoff.typeBreakthrough',
  other: 'payoff.typeOther',
}

function IntensityDots({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-[3px]">
      {[1, 2, 3, 4, 5].map((level) => (
        <span
          key={level}
          className={`w-[4px] h-[4px] rounded-full ${
            level <= value ? 'bg-[var(--accent-gold)]' : 'bg-[var(--canvas-pop)]'
          }`}
        />
      ))}
    </span>
  )
}

export function Payoffs() {
  const { data: payoffs, loading, reload } = usePayoffs()
  useDataRefresh('payoff', reload)
  const chapters = useChapterStore((s) => s.volumes).flatMap((volume) => volume.chapters)
  const { t } = useT()
  const project = useProjectName()
  const [showCreate, setShowCreate] = useState(false)
  const [generating, setGenerating] = useState(false)

  const handleAIDesign = async () => {
    if (!project) return
    setGenerating(true)
    try {
      const res = await aiApi.chat(
        [
          { role: 'system', content: t('payoff.aiPrompt') },
          { role: 'user', content: t('payoff.aiUserMessage') },
        ],
        project,
      )
      const text = getAIResponseText(res)
      const suggestions = extractAIJsonArray(text)
      if (suggestions) {
        await Promise.all(
          suggestions.map((s: any) => {
            const type: PayoffType = TYPES.includes(s.type) ? s.type : 'other'
            return payoffsApi.create(project, {
              title: s.title,
              type,
              description: s.description || '',
              status: 'planned',
              intensity: Math.max(1, Math.min(5, parseInt(s.intensity, 10) || 3)),
              setup_chapter: parseInt(s.setup_chapter, 10) || 0,
              payoff_chapter: parseInt(s.payoff_chapter, 10) || 0,
            })
          }),
        )
        reload()
      }
    } catch (e) {
      console.error('AI design payoffs failed:', e)
    }
    setGenerating(false)
  }

  if (loading)
    return <div className="flex-1 flex items-center justify-center text-[var(--ink-mute)]">{t('common.loading')}</div>

  const list = payoffs || []
  const maxChapterNum = Math.max(0, ...(chapters || []).map((c: any) => c.num))
  const isBehind = (p: PayoffPoint) =>
    p.status !== 'released' && p.status !== 'abandoned' && p.payoffChapter > 0 && p.payoffChapter < maxChapterNum
  const stats = [
    { label: t('payoff.statTotal'), value: String(list.length), color: 'var(--accent-gold)' },
    { label: t('payoff.planned'), value: String(list.filter((p) => p.status === 'planned').length) },
    { label: t('payoff.building'), value: String(list.filter((p) => p.status === 'building').length) },
    { label: t('payoff.released'), value: String(list.filter((p) => p.status === 'released').length) },
    { label: t('payoff.behind'), value: String(list.filter(isBehind).length), color: 'var(--error)' },
  ]

  return (
    <>
      <div className="page-header">
        <h2 className="flex items-center gap-2">
          <Sparkles className="w-5 h-5" /> {t('pages.payoffBoard')}
        </h2>
        <div className="page-header-actions">
          <button
            className="btn-primary flex items-center gap-1.5"
            style={{ height: 30, padding: '0 14px' }}
            onClick={handleAIDesign}
            disabled={generating}
          >
            {generating ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <WandSparkles className="w-3.5 h-3.5" />}
            {generating ? t('common.generating') : t('pages.aiDesignPayoff')}
          </button>
          <button
            className="btn-secondary flex items-center gap-1"
            style={{ height: 30, padding: '0 14px' }}
            onClick={() => setShowCreate(true)}
          >
            <Plus className="w-3.5 h-3.5" /> {t('pages.manualAdd')}
          </button>
        </div>
      </div>

      {showCreate && (
        <SimpleCreateDialog
          title={`+ ${t('pages.manualAdd')}`}
          fields={[
            {
              key: 'title',
              label: t('payoff.titleField'),
              required: true,
              placeholder: t('payoff.titlePlaceholder'),
            },
            {
              key: 'type',
              label: t('payoff.typeField'),
              type: 'select',
              options: TYPES.map((type) => ({ value: type, label: t(TYPE_KEYS[type]) })),
            },
            {
              key: 'description',
              label: t('payoff.descriptionField'),
              type: 'textarea',
              placeholder: t('payoff.descriptionPlaceholder'),
            },
            {
              key: 'intensity',
              label: t('payoff.intensityField'),
              type: 'select',
              options: [1, 2, 3, 4, 5].map((n) => ({
                value: String(n),
                label: t('payoff.intensityValue', { n }),
              })),
            },
            {
              key: 'setup_chapter',
              label: t('payoff.setupChapterField'),
              type: 'number',
              placeholder: t('payoff.setupChapterPlaceholder'),
            },
            {
              key: 'payoff_chapter',
              label: t('payoff.payoffChapterField'),
              type: 'number',
              placeholder: t('payoff.payoffChapterPlaceholder'),
            },
            {
              key: 'status',
              label: t('payoff.statusField'),
              type: 'select',
              options: [
                { value: 'planned', label: t('payoff.planned') },
                { value: 'building', label: t('payoff.building') },
              ],
            },
          ]}
          onSubmit={async (vals) => {
            await payoffsApi.create(project, {
              title: vals.title,
              type: vals.type || 'other',
              description: vals.description,
              status: vals.status || 'planned',
              intensity: parseInt(vals.intensity, 10) || 3,
              setup_chapter: parseInt(vals.setup_chapter, 10) || 0,
              payoff_chapter: parseInt(vals.payoff_chapter, 10) || 0,
            })
            reload()
          }}
          onClose={() => setShowCreate(false)}
        />
      )}

      <div className="flex gap-3 px-6 py-4 shrink-0 bg-[var(--canvas-soft)] border-b border-[var(--hairline)]">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg px-5 py-3 min-w-[100px] text-center"
          >
            <div className="font-mono text-lg" style={{ color: s.color || 'var(--accent-gold)' }}>
              {s.value}
            </div>
            <div className="text-[11px] text-[var(--ink-tertiary)] mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-4 flex-1 px-6 py-4 overflow-x-auto min-h-0 custom-scrollbar">
        {COLUMNS.map((col) => {
          const ColIcon = col.icon
          return (
            <div key={col.key} className="flex-1 min-w-[240px] bg-[var(--canvas-soft)] rounded-lg flex flex-col">
              <div className="px-3.5 py-2.5 text-[13px] font-medium text-[var(--ink-secondary)] border-b border-[var(--hairline)] flex items-center justify-between gap-1.5">
                <span className="flex items-center gap-1">
                  <ColIcon className="w-3.5 h-3.5" /> {t(col.label)}
                </span>
                <span>{list.filter((p) => p.status === col.key).length}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                {list
                  .filter((p) => p.status === col.key)
                  .map((p) => (
                    <div
                      key={p.id}
                      className="bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-[var(--radius-sm)] p-2.5 mb-1.5 transition-colors hover:border-[var(--hairline-light)]"
                    >
                      <div className="flex items-center gap-1.5">
                        <div className="text-[13px] text-[var(--ink)] flex-1 min-w-0 truncate">{p.title}</div>
                        <IntensityDots value={p.intensity} />
                      </div>
                      <div className="mt-1">
                        <span className="inline-block text-[10px] px-[6px] py-[1px] rounded-full bg-[var(--canvas-mid)] text-[var(--ink-tertiary)]">
                          {TYPE_KEYS[p.type] ? t(TYPE_KEYS[p.type]) : t('payoff.typeOther')}
                        </span>
                      </div>
                      {p.description && (
                        <div className="text-[12px] text-[var(--ink-tertiary)] mt-1 line-clamp-2">{p.description}</div>
                      )}
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-[var(--ink-mute)] font-mono">
                        {p.setupChapter > 0 && <span>{t('payoff.setupAt', { n: p.setupChapter })}</span>}
                        {p.payoffChapter > 0 && <span>{t('payoff.payoffAt', { n: p.payoffChapter })}</span>}
                        {isBehind(p) && <span className="text-[var(--error)]">{t('payoff.behind')}</span>}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
