import { Pencil, Save, Trash2, Users, X } from 'lucide-react'
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
  const [draft, setDraft] = useState<Character | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  // Keep the current selection across reloads; fall back to the first item
  // only when the selected character was deleted.
  useEffect(() => {
    if (characters?.length) {
      setSelected((prev) => characters.find((c) => c.id === prev?.id) ?? characters[0])
    } else {
      setSelected(null)
      setEditing(false)
    }
  }, [characters])

  const roleLabel = (role?: Character['role']) => {
    if (role === 'major') return t('pages.roleMajor')
    if (role === 'minor') return t('pages.roleMinor')
    if (role === 'extra') return t('pages.roleExtra')
    return t('characters.roleUnset')
  }

  const roleAvatarClass = (role?: Character['role']) => {
    if (role === 'major') return 'bg-[var(--accent-gold)] text-[var(--canvas)]'
    if (role === 'minor') return 'bg-[var(--accent-mist)] text-[var(--ink)]'
    return 'bg-[var(--canvas-mid)] text-[var(--ink-tertiary)]'
  }

  const startEdit = () => {
    if (!selected) return
    setDraft({ ...selected })
    setEditing(true)
    setConfirmingDelete(false)
    setError('')
  }

  const cancelEdit = () => {
    setEditing(false)
    setDraft(null)
    setError('')
  }

  const updateDraft = (key: keyof Character, value: string) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current))
  }

  const selectCharacter = (character: Character) => {
    if (editing) cancelEdit()
    setConfirmingDelete(false)
    setSelected(character)
  }

  const handleSave = async () => {
    if (!draft || !project) return
    if (!draft.name.trim()) {
      setError(t('common.requiredField', { label: t('pages.name') }))
      return
    }
    setSaving(true)
    setError('')
    try {
      await charactersApi.update(project, draft.id, {
        name: draft.name.trim(),
        age: draft.age,
        gender: draft.gender,
        appearance: draft.appearance,
        personality: draft.personality,
        background: draft.background,
        motivation: draft.motivation,
        arc: draft.arc,
        notes: draft.notes,
        role: draft.role || '',
      })
      setEditing(false)
      setDraft(null)
      reload()
    } catch (e: any) {
      setError(e.message || t('characters.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selected || !project) return
    setSaving(true)
    setError('')
    try {
      await charactersApi.remove(project, selected.id)
      setConfirmingDelete(false)
      setEditing(false)
      setDraft(null)
      reload()
    } catch (e: any) {
      setError(e.message || t('characters.deleteFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-[var(--ink-mute)]">{t('common.loading')}</div>
  }

  const view = editing && draft ? draft : selected

  return (
    <>
      <div className="page-header">
        <h2 className="flex items-center gap-2">
          <Users className="w-5 h-5" /> {t('pages.characters')}
        </h2>
        <div className="page-header-actions">
          <button
            type="button"
            className="btn-primary"
            style={{ height: 30, padding: '0 14px' }}
            onClick={() => setShowCreate(true)}
          >
            + {t('pages.newCharacter')}
          </button>
        </div>
      </div>

      {showCreate && (
        <SimpleCreateDialog
          title={`+ ${t('pages.newCharacter')}`}
          fields={[
            { key: 'name', label: t('pages.name'), required: true, placeholder: t('characters.namePlaceholder') },
            {
              key: 'role',
              label: t('characters.roleLabel'),
              type: 'select',
              options: [
                { value: 'major', label: t('pages.roleMajor') },
                { value: 'minor', label: t('pages.roleMinor') },
                { value: 'extra', label: t('pages.roleExtra') },
              ],
            },
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
            {
              key: 'notes',
              label: t('characters.notesLabel'),
              type: 'textarea',
              placeholder: t('characters.notesPlaceholder'),
            },
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
          {(characters || []).map((c) => (
            <button
              key={c.id}
              type="button"
              className={`flex w-full items-center gap-2.5 px-4 py-2 text-left cursor-pointer transition-colors
                ${selected?.id === c.id ? 'bg-[var(--accent-gold-soft-bg)] border-l-2 border-[var(--accent-gold)]' : 'bg-transparent hover:bg-[var(--canvas-card)]'}`}
              onClick={() => selectCharacter(c)}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${roleAvatarClass(c.role)}`}
              >
                {c.name?.[0] || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-[var(--ink)] truncate">{c.name}</div>
                <div className="text-[11px] text-[var(--ink-tertiary)]">
                  {c.age || '?'}
                  {t('characters.ageUnit')} · {roleLabel(c.role)}
                  {(c.chapterCount ?? 0) > 0 && ` · ${c.chapterCount}${t('characters.chapterAppearances')}`}
                </div>
              </div>
            </button>
          ))}
        </div>

        {view && (
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg px-4 py-2 flex items-center gap-3">
                <div className="text-center">
                  <div className="font-mono text-lg text-[var(--accent-gold)]">{view.chapterCount || 0}</div>
                  <div className="text-[11px] text-[var(--ink-tertiary)] mt-0.5">{t('project.chapterUnit')}</div>
                </div>
                <div className="w-px h-8 bg-[var(--hairline)]" />
                <div className="text-[12px] text-[var(--ink-secondary)]">{roleLabel(view.role)}</div>
              </div>

              <div className="ml-auto flex items-center gap-2">
                {editing ? (
                  <>
                    <button
                      type="button"
                      className="h-[30px] px-3 rounded-lg border border-[var(--hairline-light)] bg-[var(--canvas-elevated)] text-[var(--ink)] text-[12px] cursor-pointer hover:bg-[var(--canvas-mid)] disabled:opacity-50 flex items-center gap-1.5"
                      onClick={cancelEdit}
                      disabled={saving}
                    >
                      <X className="w-3.5 h-3.5" /> {t('common.cancel')}
                    </button>
                    <button
                      type="button"
                      className="h-[30px] px-3 rounded-lg border-none bg-[var(--accent-gold)] text-[var(--canvas)] text-[12px] font-medium cursor-pointer hover:bg-[var(--accent-gold-soft)] disabled:opacity-50 flex items-center gap-1.5"
                      onClick={handleSave}
                      disabled={saving}
                    >
                      <Save className="w-3.5 h-3.5" /> {saving ? t('common.saving') : t('common.save')}
                    </button>
                  </>
                ) : confirmingDelete ? (
                  <>
                    <span className="text-[11px] text-[var(--error)]">
                      {t('common.deleteConfirm', { name: view.name })}
                    </span>
                    <button
                      type="button"
                      className="h-[30px] px-3 rounded-lg border-none bg-[var(--error)] text-white text-[12px] cursor-pointer hover:opacity-90 disabled:opacity-50"
                      onClick={handleDelete}
                      disabled={saving}
                    >
                      {t('common.delete')}
                    </button>
                    <button
                      type="button"
                      className="h-[30px] px-3 rounded-lg border border-[var(--hairline-light)] bg-[var(--canvas-elevated)] text-[var(--ink)] text-[12px] cursor-pointer hover:bg-[var(--canvas-mid)]"
                      onClick={() => setConfirmingDelete(false)}
                    >
                      {t('common.cancel')}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="h-[30px] px-3 rounded-lg border border-[var(--hairline-light)] bg-[var(--canvas-elevated)] text-[var(--ink)] text-[12px] cursor-pointer hover:bg-[var(--canvas-mid)] flex items-center gap-1.5"
                      onClick={startEdit}
                    >
                      <Pencil className="w-3.5 h-3.5" /> {t('common.edit')}
                    </button>
                    <button
                      type="button"
                      className="h-[30px] px-3 rounded-lg border border-[var(--hairline)] bg-[var(--canvas-elevated)] text-[var(--ink-tertiary)] text-[12px] cursor-pointer hover:text-[var(--error)] hover:border-[var(--error)] flex items-center gap-1.5"
                      onClick={() => {
                        setConfirmingDelete(true)
                        setError('')
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> {t('common.delete')}
                    </button>
                  </>
                )}
              </div>
            </div>

            {error && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-[var(--error-soft)] border border-[var(--error)] text-[12px] text-[var(--error)]">
                {error}
              </div>
            )}

            <div className="flex gap-3 mb-4">
              <FormField label={t('pages.name')} full>
                <input
                  type="text"
                  value={view.name}
                  className="form-input"
                  readOnly={!editing}
                  onChange={(e) => updateDraft('name', e.target.value)}
                />
              </FormField>
              <FormField label={t('characters.roleLabel')} full>
                {editing ? (
                  <select
                    className="form-input"
                    value={view.role || ''}
                    onChange={(e) => updateDraft('role', e.target.value)}
                  >
                    <option value="">{t('characters.roleUnset')}</option>
                    <option value="major">{t('pages.roleMajor')}</option>
                    <option value="minor">{t('pages.roleMinor')}</option>
                    <option value="extra">{t('pages.roleExtra')}</option>
                  </select>
                ) : (
                  <input type="text" value={roleLabel(view.role)} className="form-input" readOnly />
                )}
              </FormField>
              <FormField label={t('pages.age')} full>
                <input
                  type="text"
                  value={view.age || ''}
                  className="form-input"
                  readOnly={!editing}
                  onChange={(e) => updateDraft('age', e.target.value)}
                />
              </FormField>
              <FormField label={t('pages.gender')} full>
                <input
                  type="text"
                  value={view.gender || ''}
                  className="form-input"
                  readOnly={!editing}
                  onChange={(e) => updateDraft('gender', e.target.value)}
                />
              </FormField>
            </div>
            <div className="mb-4">
              <FormField label={t('pages.appearance')}>
                <textarea
                  rows={2}
                  value={view.appearance || ''}
                  className="form-textarea"
                  readOnly={!editing}
                  onChange={(e) => updateDraft('appearance', e.target.value)}
                />
              </FormField>
            </div>
            <div className="flex gap-3 mb-4">
              <FormField label={t('pages.personality')} full>
                <textarea
                  rows={2}
                  value={view.personality || ''}
                  className="form-textarea"
                  readOnly={!editing}
                  onChange={(e) => updateDraft('personality', e.target.value)}
                />
              </FormField>
              <FormField label={t('pages.background')} full>
                <textarea
                  rows={2}
                  value={view.background || ''}
                  className="form-textarea"
                  readOnly={!editing}
                  onChange={(e) => updateDraft('background', e.target.value)}
                />
              </FormField>
            </div>
            <div className="flex gap-3 mb-4">
              <FormField label={t('pages.motivation')} full>
                <textarea
                  rows={2}
                  value={view.motivation || ''}
                  className="form-textarea"
                  readOnly={!editing}
                  onChange={(e) => updateDraft('motivation', e.target.value)}
                />
              </FormField>
              <FormField label={t('pages.arc')} full>
                <textarea
                  rows={2}
                  value={view.arc || ''}
                  className="form-textarea"
                  readOnly={!editing}
                  onChange={(e) => updateDraft('arc', e.target.value)}
                />
              </FormField>
            </div>
            <div className="mb-4">
              <FormField label={t('characters.notesLabel')}>
                <textarea
                  rows={3}
                  value={view.notes || ''}
                  className="form-textarea"
                  readOnly={!editing}
                  placeholder={editing ? t('characters.notesPlaceholder') : undefined}
                  onChange={(e) => updateDraft('notes', e.target.value)}
                />
              </FormField>
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
      <div className="block text-[11px] font-medium text-[var(--ink-secondary)] tracking-[0.04em] uppercase mb-1">
        {label}
      </div>
      {children}
    </div>
  )
}
