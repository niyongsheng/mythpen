import { Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { SimpleCreateDialog } from '@/components/SimpleCreateDialog'
import { useDataRefresh } from '@/hooks/useDataRefresh'
import { useT } from '@/hooks/useT'
import { charactersApi } from '@/lib/api'
import { useCharacters, useProjectName } from '@/lib/useProjectData'
import type { Character } from '@/types'

export function Characters() {
  const { t } = useT()
  const project = useProjectName()
  const { data: characters, loading, reload } = useCharacters()
  useDataRefresh('character', reload)
  const [selected, setSelected] = useState<Character | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    if (characters?.length) {
      setSelected(characters[0])
    } else {
      setSelected(null)
    }
  }, [characters])

  const rankChar = (idx: number) => {
    if (idx === 0) return 'major'
    if (idx < 3) return 'minor'
    return 'extra'
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-[var(--ink-mute)]">{t('common.loading')}</div>
  }

  return (
    <>
      <div className="page-header">
        <h2 className="flex items-center gap-2">
          <Users className="w-5 h-5" /> {t('pages.characters')}
        </h2>
        <div className="page-header-actions">
          <button className="btn-primary" style={{ height: 30, padding: '0 14px' }} onClick={() => setShowCreate(true)}>
            + {t('pages.newCharacter')}
          </button>
        </div>
      </div>

      {showCreate && (
        <SimpleCreateDialog
          title={`+ ${t('pages.newCharacter')}`}
          fields={[
            { key: 'name', label: t('pages.name'), required: true, placeholder: t('characters.namePlaceholder') },
            { key: 'age', label: t('pages.age'), placeholder: t('characters.agePlaceholder') },
            { key: 'gender', label: t('pages.gender'), placeholder: t('characters.genderPlaceholder') },
            {
              key: 'appearance',
              label: t('pages.appearance'),
              type: 'textarea',
              placeholder: t('characters.appearancePlaceholder'),
            },
            {
              key: 'personality',
              label: t('pages.personality'),
              type: 'textarea',
              placeholder: t('characters.personalityPlaceholder'),
            },
            {
              key: 'background',
              label: t('pages.background'),
              type: 'textarea',
              placeholder: t('characters.backgroundPlaceholder'),
            },
            {
              key: 'motivation',
              label: t('pages.motivation'),
              type: 'textarea',
              placeholder: t('characters.motivationPlaceholder'),
            },
            { key: 'arc', label: t('pages.arc'), type: 'textarea', placeholder: t('characters.arcPlaceholder') },
          ]}
          onSubmit={async (vals) => {
            await charactersApi.create(project, vals)
            reload()
          }}
          onClose={() => setShowCreate(false)}
        />
      )}

      <div className="flex flex-1 min-h-0">
        <div className="w-[240px] shrink-0 border-r border-[var(--hairline)] overflow-y-auto py-3 custom-scrollbar">
          {(characters || []).map((c, idx) => (
            <div
              key={c.id}
              className={`flex items-center gap-2.5 px-4 py-2 cursor-pointer transition-colors
                ${selected?.id === c.id ? 'bg-[var(--accent-gold-soft-bg)] border-l-2 border-[var(--accent-gold)]' : 'hover:bg-[var(--canvas-card)]'}`}
              onClick={() => setSelected(c)}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0
                ${
                  rankChar(idx) === 'major'
                    ? 'bg-[var(--accent-gold)] text-[var(--canvas)]'
                    : rankChar(idx) === 'minor'
                      ? 'bg-[var(--accent-mist)] text-[var(--ink)]'
                      : 'bg-[var(--canvas-mid)] text-[var(--ink-tertiary)]'
                }`}
              >
                {c.name?.[0] || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-[var(--ink)] truncate">{c.name}</div>
                <div className="text-[11px] text-[var(--ink-tertiary)]">
                  {c.age || '?'}
                  {t('characters.ageUnit')} ·{' '}
                  {rankChar(idx) === 'major'
                    ? t('pages.roleMajor')
                    : rankChar(idx) === 'minor'
                      ? t('pages.roleMinor')
                      : t('pages.roleExtra')}
                  {(c.chapterCount ?? 0) > 0 && ` · ${c.chapterCount}${t('characters.chapterAppearances')}`}
                </div>
              </div>
            </div>
          ))}
        </div>

        {selected && (
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <div>
              <div className="bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg p-4 mb-5">
                <div className="flex gap-5">
                  <div className="text-center">
                    <div className="font-mono text-lg text-[var(--accent-gold)]">{selected.chapterCount || 0}</div>
                    <div className="text-[11px] text-[var(--ink-tertiary)] mt-0.5">{t('chapters')}</div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mb-4">
                <FormField label={t('pages.name')} full>
                  <input type="text" value={selected.name} className="form-input" readOnly />
                </FormField>
                <FormField label={t('pages.age')} full>
                  <input type="text" value={selected.age || ''} className="form-input" readOnly />
                </FormField>
                <FormField label={t('pages.gender')} full>
                  <input type="text" value={selected.gender || ''} className="form-input" readOnly />
                </FormField>
              </div>
              <div className="mb-4">
                <FormField label={t('pages.appearance')}>
                  <textarea rows={2} value={selected.appearance || ''} className="form-textarea" readOnly />
                </FormField>
              </div>
              <div className="flex gap-3 mb-4">
                <FormField label={t('pages.personality')} full>
                  <textarea rows={2} value={selected.personality || ''} className="form-textarea" readOnly />
                </FormField>
                <FormField label={t('pages.background')} full>
                  <textarea rows={2} value={selected.background || ''} className="form-textarea" readOnly />
                </FormField>
              </div>
              <div className="flex gap-3 mb-4">
                <FormField label={t('pages.motivation')} full>
                  <textarea rows={2} value={selected.motivation || ''} className="form-textarea" readOnly />
                </FormField>
                <FormField label={t('pages.arc')} full>
                  <textarea rows={2} value={selected.arc || ''} className="form-textarea" readOnly />
                </FormField>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function FormField({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'flex-1' : ''}>
      <label className="block text-[11px] font-medium text-[var(--ink-secondary)] tracking-[0.04em] uppercase mb-1">
        {label}
      </label>
      {children}
    </div>
  )
}
