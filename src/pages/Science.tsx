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
  'sci-fi': [
    'tech',
    'biology',
    'physics',
    'society',
    'politics',
    'military',
    'ai',
    'alien',
    'planet',
    'history',
    'other',
  ],
  fantasy: ['realm', 'technique', 'artifact', 'sect', 'other'],
  xianxia: ['realm', 'technique', 'artifact', 'sect', 'other'],
  wuxia: ['martial-art', 'school', 'weapon', 'other'],
  game: ['system', 'skill', 'equipment', 'dungeon', 'other'],
}

// Every built-in key gets a localized label; anything else is a user-defined
// category and is displayed as-is.
const ALL_PRESET_KEYS = new Set(Object.values(CATEGORY_PRESETS).flat())

// Sentinel select value that reveals the free-text category input.
const CUSTOM_CATEGORY = '__custom__'

const LABELS: ScienceEntry['label'][] = ['known', 'extrapolation', 'hypothesis']

export function Science() {
  const { data: entries, loading, reload } = useScienceEntries()
  useDataRefresh('science', reload)
  const { data: stats } = useStats()
  const [filter, setFilter] = useState('all')
  const [labelFilter, setLabelFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<ScienceEntry | null>(null)
  const { t } = useT()
  const project = useProjectName()

  // Every setting-heavy genre groups entries by category; multi-genre projects
  // see the union of their presets. Sci-fi also keeps its hardness label
  // (known / extrapolation / hypothesis) as a second axis.
  const genres = stats?.genres ?? []
  const settingGenres = Object.keys(CATEGORY_PRESETS).filter((genre) => genres.includes(genre))
  const mode: SettingMode = settingGenres.length > 0 ? 'category' : 'label'
  const showLabels = genres.includes('sci-fi')

  const presetCategories = [...new Set(settingGenres.flatMap((genre) => CATEGORY_PRESETS[genre]))]

  // Categories typed by the user (or keys left over from another genre) are
  // discovered from existing entries, so they survive re-renders and can be
  // reused by later entries.
  const list = entries || []
  const knownCategories = new Set(presetCategories)
  const customCategories = [
    ...new Set(
      list.map((entry) => entry.category || '').filter((category) => category && !knownCategories.has(category)),
    ),
  ]
  const allCategories = [...presetCategories, ...customCategories]

  // The filter options differ per mode; reset when the project switches genre.
  useEffect(() => {
    setFilter('all')
    setLabelFilter('all')
  }, [mode])

  const labelMap: Record<string, { text: string; color: string; bg: string }> = {
    known: { text: t('science.known'), color: 'var(--success)', bg: 'var(--success-soft)' },
    extrapolation: { text: t('science.extrapolation'), color: 'var(--warning)', bg: 'var(--warning-soft)' },
    hypothesis: { text: t('science.hypothesis'), color: 'var(--error)', bg: 'var(--error-soft)' },
  }

  const categoryLabel = (key: string) =>
    !key ? t('setting.uncategorized') : ALL_PRESET_KEYS.has(key) ? t(`setting.category.${key}`) : key
  const entryCategory = (entry: ScienceEntry) => entry.category || 'other'
  const entryLabel = (entry: ScienceEntry) => entry.label || 'known'

  const categoryOptions = allCategories.map((key) => ({ value: key, label: categoryLabel(key) }))
  const categoryFilterOptions = [{ value: 'all', label: t('science.filterAllCategories') }, ...categoryOptions]
  const labelFilterOptions = [
    { value: 'all', label: t('science.filterAll') },
    ...LABELS.map((key) => ({ value: key, label: t(`science.${key}Label`) })),
  ]

  const filtered = list.filter((entry) => {
    if (mode === 'category' && filter !== 'all' && entryCategory(entry) !== filter) return false
    if ((showLabels || mode === 'label') && labelFilter !== 'all' && entryLabel(entry) !== labelFilter) return false
    return true
  })

  const formFields = (): Field[] => {
    const base: Field[] = []
    if (mode === 'category') {
      base.push(
        {
          key: 'category',
          label: t('setting.categoryLabel'),
          type: 'select',
          required: true,
          options: [...categoryOptions, { value: CUSTOM_CATEGORY, label: t('setting.customCategory') }],
        },
        {
          key: 'custom_category',
          label: t('setting.customCategoryName'),
          required: true,
          placeholder: t('setting.customCategoryPlaceholder'),
          showWhen: (vals) => vals.category === CUSTOM_CATEGORY,
        },
      )
    }
    if (mode === 'label' || showLabels) {
      base.push({
        key: 'label',
        label: t('science.hardness'),
        type: 'select',
        required: true,
        options: LABELS.map((key) => ({ value: key, label: t(`science.${key}Label`) })),
      })
    }
    base.push(
      { key: 'name', label: t('science.name'), required: true, placeholder: t('science.namePlaceholder') },
      {
        key: 'description',
        label: t('science.description'),
        type: 'textarea',
        placeholder: t('science.descriptionPlaceholder'),
      },
    )
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

  const submitCategory = (vals: Record<string, string>) =>
    vals.category === CUSTOM_CATEGORY ? (vals.custom_category || '').trim() : vals.category || ''

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
        {mode === 'label' || showLabels ? (
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

  // Hide empty preset groups so real (including custom) categories stay visible.
  const grouped =
    mode === 'category' && filter === 'all'
      ? allCategories
          .map((key) => ({ key, items: filtered.filter((entry) => entryCategory(entry) === key) }))
          .filter((group) => group.items.length > 0)
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
          {mode === 'category' && (
            <Select
              ariaLabel={t('setting.categoryLabel')}
              className="w-[150px]"
              value={filter}
              options={categoryFilterOptions}
              onChange={setFilter}
            />
          )}
          {(showLabels || mode === 'label') && (
            <Select
              ariaLabel={t('science.hardness')}
              className="w-[150px]"
              value={labelFilter}
              options={labelFilterOptions}
              onChange={setLabelFilter}
            />
          )}
        </div>
      </div>

      {showCreate && (
        <SimpleCreateDialog
          title={`+ ${t('pages.newSetting')}`}
          fields={formFields()}
          onSubmit={async (vals) => {
            await scienceApi.create(project, {
              label: vals.label,
              category: submitCategory(vals),
              name: vals.name,
              description: vals.description,
              sort_order: vals.sort_order,
            })
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
            category:
              editing.category && !ALL_PRESET_KEYS.has(editing.category)
                ? CUSTOM_CATEGORY
                : editing.category || 'other',
            custom_category: editing.category && !ALL_PRESET_KEYS.has(editing.category) ? editing.category : '',
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
            await scienceApi.update(project, editing.id, {
              label: vals.label,
              category: submitCategory(vals),
              name: vals.name,
              description: vals.description,
              sort_order: vals.sort_order,
            })
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
                <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
                  {group.items.map(renderCard)}
                </div>
              </section>
            ))}
            {grouped.length === 0 && <div className="text-[13px] text-[var(--ink-tertiary)]">{t('setting.empty')}</div>}
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
