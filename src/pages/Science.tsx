import { FlaskConical } from 'lucide-react'
import { useState } from 'react'
import { SimpleCreateDialog } from '@/components/SimpleCreateDialog'
import { useDataRefresh } from '@/hooks/useDataRefresh'
import { useT } from '@/hooks/useT'
import { scienceApi } from '@/lib/api'
import { useProjectName, useScienceEntries } from '@/lib/useProjectData'
import type { ScienceEntry } from '@/types'

export function Science() {
  const { data: entries, loading, reload } = useScienceEntries()
  useDataRefresh('science', reload)
  const [filter, setFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<ScienceEntry | null>(null)
  const { t } = useT()
  const project = useProjectName()
  const labelMap: Record<string, { text: string; color: string; bg: string }> = {
    known: { text: t('science.known'), color: 'var(--success)', bg: 'var(--success-soft)' },
    extrapolation: { text: t('science.extrapolation'), color: 'var(--warning)', bg: 'var(--warning-soft)' },
    hypothesis: { text: t('science.hypothesis'), color: 'var(--error)', bg: 'var(--error-soft)' },
  }

  if (loading)
    return <div className="flex-1 flex items-center justify-center text-[var(--ink-mute)]">{t('common.loading')}</div>

  const filtered = filter === 'all' ? entries || [] : (entries || []).filter((e) => e.label === filter)

  return (
    <>
      <div className="page-header">
        <h2 className="flex items-center gap-2">
          <FlaskConical className="w-5 h-5" /> {t('pages.scienceSettings')}
        </h2>
        <div className="page-header-actions">
          <button
            type="button"
            className="btn-primary"
            style={{ height: 30, padding: '0 14px' }}
            onClick={() => setShowCreate(true)}
          >
            + {t('pages.newSetting')}
          </button>
          <select
            id="science-filter"
            name="science-filter"
            className="setting-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">{t('science.filterAll')}</option>
            <option value="known">{t('science.knownLabel')}</option>
            <option value="extrapolation">{t('science.extrapolationLabel')}</option>
            <option value="hypothesis">{t('science.hypothesisLabel')}</option>
          </select>
        </div>
      </div>

      {showCreate && (
        <SimpleCreateDialog
          title={`+ ${t('pages.newSetting')}`}
          fields={[
            {
              key: 'label',
              label: t('science.category'),
              type: 'select',
              required: true,
              options: [
                { value: 'known', label: t('science.knownLabel') },
                { value: 'extrapolation', label: t('science.extrapolationLabel') },
                { value: 'hypothesis', label: t('science.hypothesisLabel') },
              ],
            },
            { key: 'name', label: t('science.name'), required: true, placeholder: t('science.namePlaceholder') },
            {
              key: 'description',
              label: t('science.description'),
              type: 'textarea',
              placeholder: t('science.descriptionPlaceholder'),
            },
          ]}
          onSubmit={async (vals) => {
            await scienceApi.create(project, vals)
            reload()
          }}
          onClose={() => setShowCreate(false)}
        />
      )}

      {editing && (
        <SimpleCreateDialog
          title={`${t('common.edit')}「${editing.name}」`}
          fields={[
            {
              key: 'label',
              label: t('science.category'),
              type: 'select',
              required: true,
              options: [
                { value: 'known', label: t('science.knownLabel') },
                { value: 'extrapolation', label: t('science.extrapolationLabel') },
                { value: 'hypothesis', label: t('science.hypothesisLabel') },
              ],
            },
            { key: 'name', label: t('science.name'), required: true, placeholder: t('science.namePlaceholder') },
            {
              key: 'description',
              label: t('science.description'),
              type: 'textarea',
              placeholder: t('science.descriptionPlaceholder'),
            },
          ]}
          initialValues={{
            label: editing.label || '',
            name: editing.name || '',
            description: editing.description || '',
          }}
          submitLabel={t('common.save')}
          onDelete={async () => {
            await scienceApi.remove(project, editing.id)
            reload()
          }}
          deleteName={editing.name}
          onSubmit={async (vals) => {
            await scienceApi.update(project, editing.id, vals)
            reload()
          }}
          onClose={() => setEditing(null)}
        />
      )}

      <div className="page-body" style={{ padding: 0 }}>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 p-6">
          {filtered.map((entry: any) => {
            const lm = labelMap[entry.label] || labelMap.hypothesis
            return (
              <button
                key={entry.id}
                type="button"
                className="bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg p-4 text-left cursor-pointer transition-colors hover:border-[var(--hairline-light)] hover:bg-[var(--canvas-elevated)]"
                onClick={() => setEditing(entry)}
              >
                <span className="text-[10px] px-[6px] py-[1px] rounded-full bg-[var(--canvas-mid)] text-[var(--ink-tertiary)] inline-block mb-1.5">
                  {entry.label === 'known'
                    ? t('science.knownLabel')
                    : entry.label === 'extrapolation'
                      ? t('science.extrapolationLabel')
                      : t('science.coreHypothesis')}
                </span>
                <div className="text-[15px] text-[var(--ink)] mb-1">{entry.name}</div>
                <span
                  className="text-[10px] px-[6px] py-[1px] rounded-full mr-1 inline-block"
                  style={{ background: lm.bg, color: lm.color }}
                >
                  {lm.text}
                </span>
                <div className="text-[13px] text-[var(--ink-tertiary)] mt-1">{entry.description}</div>
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
