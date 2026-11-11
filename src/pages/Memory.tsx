import { Brain, FileText, Loader, Search, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { SimpleCreateDialog } from '@/components/SimpleCreateDialog'
import { useDataRefresh } from '@/hooks/useDataRefresh'
import { useT } from '@/hooks/useT'
import { useToast } from '@/hooks/useToast'
import { track } from '@/lib/analytics'
import { aiApi, chaptersApi, extractAIJsonArray, getAIResponseText, memoriesApi, projectsApi } from '@/lib/api'
import { buildRecentChapterDigest } from '@/lib/chapterDigest'
import { projectProps } from '@/lib/projectIdentity'
import { useMemories, useProjectName } from '@/lib/useProjectData'
import type { Memory as MemoryItem } from '@/types'

// Keep in sync with MAX_AUTHOR_NOTES in server/author-notes.js.
const MAX_AUTHOR_NOTES = 2000

const CAT_LABELS: Record<string, string> = {
  character: 'memory.categoryCharacter',
  location: 'memory.categoryLocation',
  event: 'memory.categoryEvent',
  promise: 'memory.categoryPromise',
  item: 'memory.categoryItem',
  other: 'memory.categoryOther',
}
const CAT_COLORS: Record<string, { bg: string; text: string }> = {
  character: { bg: 'rgba(201,169,110,0.18)', text: 'var(--accent-gold)' },
  location: { bg: 'rgba(122,142,168,0.18)', text: 'var(--accent-mist)' },
  event: { bg: 'var(--info-soft)', text: 'var(--info)' },
  promise: { bg: 'var(--warning-soft)', text: 'var(--warning)' },
  item: { bg: 'var(--success-soft)', text: 'var(--success)' },
}

export function Memory() {
  const { data: memories, loading, reload } = useMemories()
  const { t } = useT()
  const project = useProjectName()
  const showToast = useToast((s) => s.show)
  const [tab, setTab] = useState<'memories' | 'notes'>('memories')
  const [searchMode, setSearchMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [editing, setEditing] = useState<MemoryItem | null>(null)

  // Author notes are user-owned rules, loaded independently from narrative
  // memories. Keep a separate saved copy so unsaved edits survive re-renders
  // and are not clobbered by an AI refresh.
  const [notes, setNotes] = useState('')
  const [savedNotes, setSavedNotes] = useState('')
  const [notesLoading, setNotesLoading] = useState(false)
  const [notesSaving, setNotesSaving] = useState(false)
  const notesRequestId = useRef(0)

  const loadNotes = useCallback(async () => {
    // Bump first: a late response from the previous project must not land
    // after the switch, including a switch to "no project".
    const requestId = ++notesRequestId.current
    if (!project) {
      setNotes('')
      setSavedNotes('')
      setNotesLoading(false)
      return
    }
    setNotesLoading(true)
    try {
      const meta = await projectsApi.getMeta(project)
      if (requestId !== notesRequestId.current) return
      const value = typeof meta?.author_notes === 'string' ? meta.author_notes : ''
      setNotes(value)
      setSavedNotes(value)
    } catch {
      if (requestId === notesRequestId.current) showToast(t('memory.notesLoadFailed'), 'error')
    } finally {
      if (requestId === notesRequestId.current) setNotesLoading(false)
    }
  }, [project, showToast, t])

  useEffect(() => {
    // Project switch: never show the previous book's notes while the new
    // project is loading, or a save could write them into the wrong project.
    setNotes('')
    setSavedNotes('')
    void loadNotes()
  }, [loadNotes])

  useDataRefresh('memory', reload)
  // The AI can update notes via update_author_notes. Do not overwrite edits
  // the user has not saved yet; their explicit save wins.
  useDataRefresh('project', () => {
    if (notes === savedNotes) void loadNotes()
  })

  const notesDirty = notes !== savedNotes
  const notesTooLong = notes.length > MAX_AUTHOR_NOTES

  const handleSaveNotes = async () => {
    if (!project || !notesDirty || notesTooLong || notesSaving) return
    setNotesSaving(true)
    try {
      const res = await projectsApi.updateAuthorNotes(project, notes.trim())
      const value = typeof res?.authorNotes === 'string' ? res.authorNotes : notes.trim()
      setNotes(value)
      setSavedNotes(value)
      showToast(t('memory.notesSaved'), 'success')
    } catch (e) {
      showToast((e as Error).message || t('common.saveFailed'), 'error')
    } finally {
      setNotesSaving(false)
    }
  }

  const handleSearch = async () => {
    if (!project || !searchQuery.trim()) return
    setSearching(true)
    try {
      const results = await memoriesApi.search(project, searchQuery.trim())
      setSearchResults(results)
    } catch {
      setSearchResults([])
    }
    setSearching(false)
  }

  const handleClearSearch = () => {
    setSearchMode(false)
    setSearchQuery('')
    setSearchResults(null)
  }

  const handleExtract = async () => {
    if (!project) return
    setExtracting(true)
    try {
      // The extraction prompt needs actual prose, not just chapter metadata.
      // Pull the last few chapters' previews so the model can ground memories
      // in what was written instead of inventing them from outlines.
      const chapters = await chaptersApi.list(project, true)
      const digest = await buildRecentChapterDigest(project, chapters, { count: 5, previewChars: 3000 })
      const res = await aiApi.chat(
        [
          {
            role: 'system',
            content: t('memory.aiPrompt'),
          },
          {
            role: 'user',
            content: digest ? `${t('memory.aiUserMessage')}\n\n${digest}` : t('memory.aiUserMessage'),
          },
        ],
        project,
      )
      const text = getAIResponseText(res)
      const items = extractAIJsonArray(text)
      if (items) {
        await Promise.all(
          items.map((item: any) =>
            memoriesApi.create(project, {
              category: item.category || 'other',
              content: item.content,
            }),
          ),
        )
        track('entity_created', { entity_type: 'memory', source: 'ai', count: items.length, ...projectProps(project) })
        reload()
      }
    } catch (e) {
      console.error('AI extract memories failed:', e)
    }
    setExtracting(false)
  }

  const displayList = searchResults !== null ? searchResults : memories || []

  if (tab === 'memories' && loading)
    return <div className="flex-1 flex items-center justify-center text-[var(--ink-mute)]">{t('common.loading')}</div>

  return (
    <>
      <div className="page-header">
        <h2 className="flex items-center gap-2">
          {tab === 'notes' ? <FileText className="w-5 h-5" /> : <Brain className="w-5 h-5" />}
          {tab === 'notes' ? t('memory.tabNotes') : t('pages.narrativeMemory')}
        </h2>
        {tab === 'memories' && (
          <div className="page-header-actions">
            <button
              type="button"
              className="btn-secondary flex items-center gap-1.5"
              style={{ height: 30, padding: '0 14px' }}
              onClick={() => setSearchMode(!searchMode)}
            >
              <Search className="w-3.5 h-3.5" /> {t('pages.semanticSearch')}
            </button>
            <button
              type="button"
              className="btn-primary flex items-center gap-1.5"
              style={{ height: 30, padding: '0 14px' }}
              onClick={handleExtract}
              disabled={extracting}
            >
              {extracting ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {extracting ? t('common.extracting') : t('pages.aiExtract')}
            </button>
          </div>
        )}
      </div>

      <div
        role="tablist"
        className="flex gap-0 border-b border-[var(--hairline)] px-6 shrink-0 bg-[var(--canvas-soft)]"
      >
        {[
          { key: 'memories' as const, label: t('memory.tabMemories'), icon: <Brain className="w-3.5 h-3.5" /> },
          { key: 'notes' as const, label: t('memory.tabNotes'), icon: <FileText className="w-3.5 h-3.5" /> },
        ].map(({ key, label, icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`px-4 py-2.5 text-[13px] cursor-pointer border-b-2 transition-colors bg-transparent
              ${tab === key ? 'text-[var(--ink)] border-[var(--accent-gold)]' : 'text-[var(--ink-tertiary)] border-transparent hover:text-[var(--ink-secondary)]'}`}
            onClick={() => setTab(key)}
          >
            <span className="flex items-center gap-1">
              {icon} {label}
            </span>
          </button>
        ))}
      </div>

      {/* Search bar */}
      {tab === 'memories' && searchMode && (
        <div className="px-6 py-3 border-b border-[var(--hairline)] bg-[var(--canvas-soft)]">
          <div className="flex gap-2 max-w-[500px]">
            <input
              type="text"
              className="w-full h-8 bg-[var(--canvas-elevated)] border border-[var(--hairline)] rounded-lg px-3 font-sans text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent-gold)]"
              placeholder={t('memory.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              autoFocus
            />
            <button
              type="button"
              className="h-8 px-4 min-w-[72px] rounded-lg bg-[var(--accent-gold)] text-[var(--canvas)] text-[12px] cursor-pointer border-none font-medium whitespace-nowrap"
              onClick={handleSearch}
              disabled={searching || !searchQuery.trim()}
            >
              {searching ? t('common.searching') : t('common.search')}
            </button>
            <button
              type="button"
              className="h-8 w-8 rounded-lg flex items-center justify-center border border-[var(--hairline)] bg-[var(--canvas-elevated)] text-[var(--ink-tertiary)] cursor-pointer hover:text-[var(--ink)]"
              onClick={handleClearSearch}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {searchResults !== null && (
            <div className="text-[12px] text-[var(--ink-tertiary)] mt-1.5">
              {searchResults.length === 0
                ? t('memory.noResults')
                : t('memory.searchResultsCount', { n: searchResults.length })}
              <button
                type="button"
                className="ml-2 text-[var(--accent-gold)] underline cursor-pointer bg-transparent border-none"
                onClick={() => {
                  setSearchResults(null)
                  setSearchQuery('')
                }}
              >
                {t('memory.showAll')}
              </button>
            </div>
          )}
        </div>
      )}

      {editing && (
        <SimpleCreateDialog
          title={`${t('common.edit')}「${editing.content.slice(0, 20)}」`}
          fields={[
            {
              key: 'category',
              label: t('memory.category'),
              type: 'select',
              required: true,
              options: [
                { value: 'character', label: t('memory.categoryCharacter') },
                { value: 'location', label: t('memory.categoryLocation') },
                { value: 'item', label: t('memory.categoryItem') },
                { value: 'event', label: t('memory.categoryEvent') },
                { value: 'promise', label: t('memory.categoryPromise') },
                { value: 'other', label: t('memory.categoryOther') },
              ],
            },
            {
              key: 'content',
              label: t('memory.contentLabel'),
              type: 'textarea',
              required: true,
              placeholder: t('memory.contentPlaceholder'),
            },
          ]}
          initialValues={{
            category: editing.category || 'other',
            content: editing.content || '',
          }}
          submitLabel={t('common.save')}
          onDelete={async () => {
            await memoriesApi.remove(project, editing.id)
            setSearchResults(null)
            reload()
          }}
          deleteName={editing.content.slice(0, 20)}
          onSubmit={async (vals) => {
            await memoriesApi.update(project, editing.id, {
              category: vals.category || 'other',
              content: vals.content,
            })
            setSearchResults(null)
            reload()
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {tab === 'memories' && (
        <div className="page-body" style={{ padding: 0 }}>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 p-6">
            {displayList.map((m: any) => {
              const color = CAT_COLORS[m.category] || { bg: 'var(--canvas-mid)', text: 'var(--ink-tertiary)' }
              return (
                <button
                  key={m.id}
                  type="button"
                  className="text-left bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg p-3.5 cursor-pointer transition-colors hover:border-[var(--hairline-light)] hover:bg-[var(--canvas-elevated)]"
                  onClick={() => setEditing(m)}
                >
                  <span
                    className="text-[10px] px-[7px] py-[1px] rounded-full inline-block mb-2"
                    style={{ background: color.bg, color: color.text }}
                  >
                    {t(CAT_LABELS[m.category] || m.category)}
                  </span>
                  <div className="text-[13px] text-[var(--ink-secondary)] leading-[1.6]">{m.content}</div>
                  <div className="text-[11px] text-[var(--ink-mute)] mt-2 font-mono">
                    {m.sourceChapterId ? t('memory.sourceChapter', { n: m.sourceChapterId }) : ''}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {tab === 'notes' && (
        <div className="page-body" style={{ padding: 0 }}>
          <div className="max-w-[820px] p-6">
            <p className="text-[12px] leading-[1.7] text-[var(--ink-tertiary)] mb-3">{t('memory.notesHint')}</p>
            {notesLoading ? (
              <div className="flex items-center gap-2 py-10 text-[13px] text-[var(--ink-mute)]">
                <Loader className="w-4 h-4 animate-spin" /> {t('common.loading')}
              </div>
            ) : (
              <>
                <textarea
                  aria-label={t('memory.tabNotes')}
                  className="w-full min-h-[340px] resize-y bg-[var(--canvas-elevated)] border border-[var(--hairline)] rounded-lg px-3.5 py-3 font-sans text-[13px] leading-[1.75] text-[var(--ink)] outline-none focus:border-[var(--accent-gold)]"
                  value={notes}
                  placeholder={t('memory.notesPlaceholder')}
                  onChange={(e) => setNotes(e.target.value)}
                  spellCheck={false}
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span
                    className={`text-[12px] font-mono ${notesTooLong ? 'text-[var(--error)]' : 'text-[var(--ink-mute)]'}`}
                  >
                    {notesTooLong
                      ? t('memory.notesTooLong', { n: notes.length - MAX_AUTHOR_NOTES })
                      : t('memory.notesCount', { n: notes.length, max: MAX_AUTHOR_NOTES })}
                  </span>
                  <div className="flex items-center gap-3">
                    {notesDirty && !notesTooLong && (
                      <span className="text-[12px] text-[var(--ink-mute)]">{t('memory.notesUnsaved')}</span>
                    )}
                    <button
                      type="button"
                      className="btn-primary flex items-center gap-1.5"
                      style={{ height: 30, padding: '0 14px' }}
                      onClick={handleSaveNotes}
                      disabled={!notesDirty || notesTooLong || notesSaving}
                    >
                      {notesSaving && <Loader className="w-3.5 h-3.5 animate-spin" />}
                      {notesSaving ? t('common.saving') : t('memory.notesSave')}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
