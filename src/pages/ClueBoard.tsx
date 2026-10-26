import { CheckCircle2, Circle, Search } from 'lucide-react'
import { useState } from 'react'
import { type Field, SimpleCreateDialog } from '@/components/SimpleCreateDialog'
import { useDataRefresh } from '@/hooks/useDataRefresh'
import { useT } from '@/hooks/useT'
import { cluesApi } from '@/lib/api'
import { useClues, useProjectName } from '@/lib/useProjectData'
import type { Clue, ClueKind } from '@/types'

const KIND_COLORS: Record<ClueKind, { color: string; bg: string }> = {
  clue: { color: 'var(--info)', bg: 'var(--info-soft)' },
  'red-herring': { color: 'var(--error)', bg: 'var(--error-soft)' },
  deduction: { color: 'var(--success)', bg: 'var(--success-soft)' },
  question: { color: 'var(--warning)', bg: 'var(--warning-soft)' },
}

const KINDS: ClueKind[] = ['clue', 'red-herring', 'deduction', 'question']

export function ClueBoard() {
  const { data: clues, loading, reload } = useClues()
  useDataRefresh('clue', reload)
  const { t } = useT()
  const project = useProjectName()
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<Clue | null>(null)

  if (loading)
    return <div className="flex-1 flex items-center justify-center text-[var(--ink-mute)]">{t('common.loading')}</div>

  const list = clues || []
  const unresolved = list.filter((clue) => !clue.resolved)
  const resolved = list.filter((clue) => clue.resolved)
  const stats = [
    { label: t('clue.statTotal'), value: list.length, color: 'var(--accent-gold)' },
    { label: t('clue.statUnresolved'), value: unresolved.length, color: 'var(--warning)' },
    { label: t('clue.statResolved'), value: resolved.length, color: 'var(--success)' },
    {
      label: t('clue.statRedHerring'),
      value: list.filter((clue) => clue.kind === 'red-herring').length,
      color: 'var(--error)',
    },
  ]

  const kindOptions = KINDS.map((kind) => ({ value: kind, label: t(`clue.kind.${kind}`) }))

  const fields = (includeResolved: boolean): Field[] => [
    {
      key: 'title',
      label: t('clue.titleField'),
      required: true,
      placeholder: t('clue.titlePlaceholder'),
    },
    {
      key: 'description',
      label: t('clue.descriptionField'),
      type: 'textarea',
      placeholder: t('clue.descriptionPlaceholder'),
    },
    { key: 'kind', label: t('clue.kindField'), type: 'select', options: kindOptions },
    {
      key: 'related_chapter_num',
      label: t('clue.relatedChapterField'),
      type: 'number',
      placeholder: t('clue.relatedChapterPlaceholder'),
    },
    ...(includeResolved
      ? [
          {
            key: 'resolved',
            label: t('clue.statusField'),
            type: 'select' as const,
            options: [
              { value: '0', label: t('clue.unresolved') },
              { value: '1', label: t('clue.resolved') },
            ],
          },
        ]
      : []),
  ]

  const renderCard = (clue: Clue) => {
    const kind = KIND_COLORS[clue.kind] || KIND_COLORS.clue
    return (
      <button
        key={clue.id}
        type="button"
        className="w-full text-left bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg p-4 cursor-pointer transition-colors hover:border-[var(--hairline-light)] hover:bg-[var(--canvas-elevated)]"
        onClick={() => setEditing(clue)}
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          <span
            className="text-[10px] px-[6px] py-[1px] rounded-full inline-flex items-center gap-1"
            style={{ background: kind.bg, color: kind.color }}
          >
            {clue.resolved ? <CheckCircle2 className="w-2.5 h-2.5" /> : <Circle className="w-2.5 h-2.5" />}
            {t(`clue.kind.${clue.kind}`)}
          </span>
          {clue.relatedChapterNum ? (
            <span className="text-[10px] text-[var(--ink-tertiary)]">
              {t('clue.chapterRef', { n: clue.relatedChapterNum })}
            </span>
          ) : null}
        </div>
        <div
          className={`text-[15px] mb-1 ${clue.resolved ? 'text-[var(--ink-tertiary)] line-through' : 'text-[var(--ink)]'}`}
        >
          {clue.title}
        </div>
        {clue.description ? <div className="text-[13px] text-[var(--ink-tertiary)]">{clue.description}</div> : null}
      </button>
    )
  }

  return (
    <>
      <div className="page-header">
        <h2 className="flex items-center gap-2">
          <Search className="w-5 h-5" /> {t('pages.clueBoard')}
        </h2>
        <div className="page-header-actions">
          <button
            type="button"
            className="btn-secondary flex items-center gap-1"
            style={{ height: 30, padding: '0 14px' }}
            onClick={() => setShowCreate(true)}
          >
            + {t('pages.manualAdd')}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-5 px-6 pt-4 text-[12px] text-[var(--ink-tertiary)]">
        {stats.map((stat) => (
          <span key={stat.label}>
            {stat.label}
            <span className="ml-1.5 font-mono text-[14px]" style={{ color: stat.color }}>
              {stat.value}
            </span>
          </span>
        ))}
      </div>

      {showCreate && (
        <SimpleCreateDialog
          title={`+ ${t('pages.manualAdd')}`}
          fields={fields(false)}
          onSubmit={async (vals) => {
            await cluesApi.create(project, vals)
            reload()
          }}
          onClose={() => setShowCreate(false)}
        />
      )}

      {editing && (
        <SimpleCreateDialog
          title={`${t('common.edit')}「${editing.title}」`}
          fields={fields(true)}
          initialValues={{
            title: editing.title || '',
            description: editing.description || '',
            kind: editing.kind || 'clue',
            related_chapter_num: editing.relatedChapterNum ? String(editing.relatedChapterNum) : '',
            resolved: editing.resolved ? '1' : '0',
          }}
          submitLabel={t('common.save')}
          onDelete={async () => {
            await cluesApi.remove(project, editing.id)
            reload()
          }}
          deleteName={editing.title}
          onSubmit={async (vals) => {
            await cluesApi.update(project, editing.id, {
              title: vals.title,
              description: vals.description,
              kind: vals.kind,
              related_chapter_num: vals.related_chapter_num,
              resolved: vals.resolved === '1',
            })
            reload()
          }}
          onClose={() => setEditing(null)}
        />
      )}

      <div className="page-body" style={{ padding: 0 }}>
        <div className="grid gap-5 p-6 md:grid-cols-2">
          {[
            { key: 'unresolved', items: unresolved },
            { key: 'resolved', items: resolved },
          ].map((column) => (
            <section key={column.key}>
              <h3 className="text-[12px] font-medium text-[var(--ink-secondary)] tracking-[0.04em] uppercase mb-2">
                {t(`clue.${column.key}`)} ({column.items.length})
              </h3>
              <div className="space-y-2">
                {column.items.length > 0 ? (
                  column.items.map(renderCard)
                ) : (
                  <div className="text-[13px] text-[var(--ink-tertiary)] py-4">{t('clue.empty')}</div>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  )
}
