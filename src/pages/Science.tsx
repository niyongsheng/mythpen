import { FlaskConical } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Select } from '@/components/Select'
import { type Field, SimpleCreateDialog } from '@/components/SimpleCreateDialog'
import { useDataRefresh } from '@/hooks/useDataRefresh'
import { useT } from '@/hooks/useT'
import { scienceApi } from '@/lib/api'
import { useProjectName, useScienceEntries, useStats } from '@/lib/useProjectData'
import type { ScienceEntry } from '@/types'

type SettingMode = 'label' | 'category'

const CATEGORY_PRESETS: Record<string, string[]> = {
  fantasy: ['realm', 'technique', 'artifact', 'sect', 'other'],
  xianxia: ['realm', 'technique', 'artifact', 'sect', 'other'],
  wuxia: ['martial-art', 'school', 'weapon', 'other'],
  game: ['system', 'skill', 'equipment', 'dungeon', 'other'],
}

const LABELS: ScienceEntry['label'][] = ['known', 'extrapolation', 'hypothesis']

export function Science() {
  const { data: entries, loading, reload } = useScienceEntries()
  useDataRefresh('science', reload)
  const { data: stats } = useStats()
  const [filter, setFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<ScienceEntry | null>(null)
  const { t } = useT()
  const project = useProjectName()

  // Sci-fi keeps its hardness labels; 仙侠/武侠/游戏 use ordered categories
  // (境界/功法/门派/系统…), so the same element serves every setting-heavy genre.
  const genres = stats?.genres ?? []
  const settingGenre = ['fantasy', 'xianxia', 'wuxia', 'game'].find((genre) => genres.includes(genre))
  const mode: SettingMode = settingGenre ? 'category' : 'label'
  const categories = settingGenre ? CATEGORY_PRESETS[settingGenre] : []

  // The filter options differ per mode; reset when the project switches genre.
  useEffect(() => {
    setFilter('all')
  }, [mode])

  const labelMap: Record<string, { text: string; color: string; bg: string }> = {
    known: { text: t('science.known'), color: 'var(--success)', bg: 'var(--success-soft)' },
    extrapolation: { text: t('science.extrapolation'), color: 'var(--warning)', bg: 'var(--warning-soft)' },
    hypothesis: { text: t('science.hypothesis'), color: 'var(--error)', bg: 'var(--error-soft)' },
  }

  const categoryLabel = (key: string) => (key ? t(`setting.category.${key}`) : t('setting.uncategorized'))
  const entryCategory = (entry: ScienceEntry) => entry.category || 'other'
  const entryLabel = (entry: ScienceEntry) => entry.label || 'known'

  const filterOptions =
    mode === 'category'
      ? [
          { value: 'all', label: t('science.filterAll') },
          ...categories.map((key) => ({ value: key, label: categoryLabel(key) })),
        ]
      : [
          { value: 'all', label: t('science.filterAll') },
          ...LABELS.map((key) => ({ value: key, label: t(`science.${key}Label`) })),
        ]

  const list = entries || []
  const filtered =
    filter === 'all'
      ? list
      : mode === 'category'
        ? list.filter((entry) => entryCategory(entry) === filter)
        : list.filter((entry) => entryLabel(entry) === filter)

  const formFields = (): Field[] => {
    const base: Field[] = [
      mode === 'category'
        ? {
            key: 'category',
            label: t('setting.categoryLabel'),
            type: 'select',
            required: true,
            options: categories.map((key) => ({ value: key, label: categoryLabel(key) })),
          }
        : {
            key: 'label',
            label: t('science.category'),
            type: 'select',
            required: true,
            options: LABELS.map((key) => ({ value: key, label: t(`science.${key}Label`) })),
          },
      { key: 'name', label: t('science.name'), required: true, placeholder: t('science.namePlaceholder') },
      {
        key: 'description',
        label: t('science.description'),
        type: 'textarea',
        placeholder: t('science.descriptionPlaceholder'),
      },
    ]
    if (mode === 'category') {
      base.push({
        key: 'sort_order',
        label: t('setting.sortOrder'),
        type: 'number',
        placeholder: t('setting.sortOrderHint'),
      })
    }
    return base
  }

  if (loading)
    return <div className="flex-1 flex items-center justify-center text-[var(--ink-mute)]">{t('common.loading')}</div>

  const renderCard = (entry: ScienceEntry) => {
    const lm = labelMap[entryLabel(entry)] || labelMap.hypothesis
    return (
      <button
        key={entry.id}
        type="button"
        className="bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg p-4 text-left cursor-pointer transition-colors hover:border-[var(--hairline-light)] hover:bg-[var(--canvas-elevated)]"
        onClick={() => setEditing(entry)}
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-[10px] px-[6px] py-[1px] rounded-full bg-[var(--canvas-mid)] text-[var(--ink-tertiary)] inline-block">
            {mode === 'category' ? categoryLabel(entryCategory(entry)) : t(`science.${entryLabel(entry)}Label`)}
          </span>
          {mode === 'category' && entry.sortOrder ? (
            <span className="text-[10px] text-[var(--ink-tertiary)]">#{entry.sortOrder}</span>
          ) : null}
        </div>
        <div className="text-[15px] text-[var(--ink)] mb-1">{entry.name}</div>
        {mode === 'label' ? (
          <span
            className="text-[10px] px-[6px] py-[1px] rounded-full mr-1 inline-block"
            style={{ background: lm.bg, color: lm.color }}
          >
            {lm.text}
          </span>
        ) : null}
        <div className="text-[13px] text-[var(--ink-tertiary)] mt-1">{entry.description}</div>
      </button>
    )
  }

  const grouped =
    mode === 'category' && filter === 'all'
      ? categories.map((key) => ({ key, items: filtered.filter((entry) => entryCategory(entry) === key) }))
      : null

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
          <Select
            ariaLabel={t('science.category')}
            className="w-[150px]"
            value={filter}
            options={filterOptions}
            onChange={setFilter}
          />
        </div>
      </div>

      {showCreate && (
        <SimpleCreateDialog
          title={`+ ${t('pages.newSetting')}`}
          fields={formFields()}
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
          fields={formFields()}
          initialValues={{
            label: editing.label || 'known',
            category: editing.category || 'other',
            sort_order: String(editing.sortOrder || 0),
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
        {grouped ? (
          <div className="space-y-6 p-6">
            {grouped.map((group) => (
              <section key={group.key}>
                <h3 className="text-[12px] font-medium text-[var(--ink-secondary)] tracking-[0.04em] uppercase mb-2">
                  {categoryLabel(group.key)} ({group.items.length})
                </h3>
                {group.items.length > 0 ? (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
                    {group.items.map(renderCard)}
                  </div>
                ) : (
                  <div className="text-[13px] text-[var(--ink-tertiary)]">{t('setting.empty')}</div>
                )}
              </section>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 p-6">
            {filtered.map(renderCard)}
          </div>
        )}
      </div>
    </>
  )
}
