import { BookOpen, Building, Heart, Landmark, type LucideIcon, Rocket, Scroll, Wand, Zap } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ImportBookPanel } from '@/components/ImportBookPanel'
import { ToastContainer } from '@/components/ToastContainer'
import { useT } from '@/hooks/useT'
import { useToast } from '@/hooks/useToast'
import { aiApi } from '@/lib/api'
import { notifyDataChanged } from '@/lib/dataEvents'
import { parseImportFile } from '@/lib/import'
import type { ParsedBook, TextEncoding } from '@/lib/import/types'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUIStore } from '@/stores/useUIStore'

const GENRES: { key: string; icon: LucideIcon }[] = [
  { key: 'sci-fi', icon: Rocket },
  { key: 'fantasy', icon: Wand },
  { key: 'romance', icon: Heart },
  { key: 'history', icon: Landmark },
  { key: 'urban', icon: Building },
  { key: 'power-fantasy', icon: Zap },
  { key: 'biography', icon: BookOpen },
  { key: 'other', icon: Scroll },
]

const MODES = [
  { key: 'short-story', labelKey: 'project.shortStory' },
  { key: 'medium-novel', labelKey: 'project.mediumNovel' },
  { key: 'long-novel', labelKey: 'project.longNovel' },
] as const

const LANGUAGES = [
  { key: 'zh', labelKey: 'project.chinese' },
  { key: 'en', labelKey: 'project.english' },
] as const

const DEFAULT_NAME = '未曾设想的道路'

const IMPORT_ERROR_KEYS: Record<string, string> = {
  UNSUPPORTED_FORMAT: 'project.import.unsupportedFormat',
  FILE_TOO_LARGE: 'project.import.fileTooLarge',
  EPUB_TOO_LARGE: 'project.import.fileTooLarge',
  EMPTY_BOOK: 'project.import.emptyBook',
  DRM_PROTECTED: 'project.import.drmProtected',
  INVALID_EPUB: 'project.import.invalidEpub',
  TOO_MANY_CHAPTERS: 'project.import.tooManyChapters',
}

function stripControlCharacters(value: string): string {
  let result = ''
  for (const char of value) {
    result += char.charCodeAt(0) < 32 ? ' ' : char
  }
  return result
}

function sanitizeProjectName(value: string): string {
  return stripControlCharacters(value)
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/^\.+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

export function NewProjectDialog() {
  const { projectDialogOpen, setProjectDialogOpen } = useUIStore()
  const { createProject, importProject, loading, error } = useProjectStore()
  const { t } = useT()
  const { toasts, show: showToast } = useToast()

  const [tab, setTab] = useState<'blank' | 'import'>('blank')
  const [name, setName] = useState(DEFAULT_NAME)
  const [nameTouched, setNameTouched] = useState(false)
  const [selectedGenres, setSelectedGenres] = useState<string[]>(['sci-fi', 'romance'])
  const [mode, setMode] = useState('medium-novel')
  const [language, setLanguage] = useState('zh')

  const [file, setFile] = useState<File | null>(null)
  const [book, setBook] = useState<ParsedBook | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [encoding, setEncoding] = useState<TextEncoding>('auto')
  const [analyze, setAnalyze] = useState(false)
  const parseTokenRef = useRef(0)

  // Clear stale error when the dialog opens; reset import state when it closes.
  useEffect(() => {
    if (projectDialogOpen) {
      useProjectStore.setState({ error: null })
      return
    }
    parseTokenRef.current += 1
    setTab('blank')
    setName(DEFAULT_NAME)
    setNameTouched(false)
    setSelectedGenres(['sci-fi', 'romance'])
    setMode('medium-novel')
    setLanguage('zh')
    setFile(null)
    setBook(null)
    setParsing(false)
    setParseError(null)
    setEncoding('auto')
    setAnalyze(false)
  }, [projectDialogOpen])

  if (!projectDialogOpen) return <ToastContainer toasts={toasts} />

  const toggleGenre = (key: string) => {
    setSelectedGenres((prev) => (prev.includes(key) ? prev.filter((g) => g !== key) : [...prev, key]))
  }

  const parseFile = async (selected: File, nextEncoding: TextEncoding) => {
    const token = ++parseTokenRef.current
    setFile(selected)
    setBook(null)
    setParseError(null)
    setParsing(true)
    try {
      const parsed = await parseImportFile(selected, { encoding: nextEncoding })
      if (token !== parseTokenRef.current) return
      setBook(parsed)
      if (!nameTouched) setName(sanitizeProjectName(parsed.title))
    } catch (err: any) {
      if (token !== parseTokenRef.current) return
      const key = err?.code ? IMPORT_ERROR_KEYS[err.code] : undefined
      setParseError(key ? t(key) : err?.message || t('project.import.parseFailed'))
    } finally {
      if (token === parseTokenRef.current) setParsing(false)
    }
  }

  const handleFileSelected = (selected: File) => {
    void parseFile(selected, encoding)
  }

  const handleEncodingChange = (next: TextEncoding) => {
    setEncoding(next)
    if (file) void parseFile(file, next)
  }

  const busy = loading || parsing
  const canSubmit = !!name.trim() && (tab === 'blank' || (!!book && !parsing))

  const handleSubmit = async () => {
    if (!canSubmit || busy) return
    try {
      if (tab === 'blank') {
        await createProject(name.trim(), { mode, language, genres: selectedGenres })
        setProjectDialogOpen(false)
        return
      }
      if (!book) return
      const projectName = name.trim()
      await importProject(projectName, { mode, language, genres: selectedGenres }, book)
      setProjectDialogOpen(false)

      if (analyze) {
        showToast(t('project.import.analyzeRunning'), 'info', 4000)
        aiApi
          .analyzeImport(projectName)
          .then((result: any) => {
            showToast(
              t('project.import.analyzeDone', {
                characters: result?.characters || 0,
                world: result?.world || 0,
              }),
              'success',
              5000,
            )
            notifyDataChanged('character')
            notifyDataChanged('world')
            notifyDataChanged('memory')
            notifyDataChanged('project')
          })
          .catch((err: any) => {
            showToast(t('project.import.analyzeFailed', { message: err?.message || '' }), 'error', 6000)
          })
      }
    } catch {
      // The store has already set a user-facing error.
    }
  }

  const handleClose = () => {
    if (!busy) setProjectDialogOpen(false)
  }

  const activeBtn =
    'px-[14px] h-[30px] rounded-full border-none font-sans text-[13px] cursor-pointer bg-[var(--accent-gold)] text-[var(--canvas)] font-medium transition-all'
  const inactiveBtn =
    'px-[14px] h-[30px] rounded-full border-none font-sans text-[13px] cursor-pointer bg-[var(--canvas-mid)] text-[var(--ink-secondary)] hover:bg-[var(--canvas-pop)] transition-all'

  const displayError = error || parseError
  const primaryLabel =
    tab === 'import'
      ? loading
        ? t('project.import.importing')
        : t('project.import.importStart')
      : loading
        ? t('project.creating')
        : t('project.start')

  return (
    <>
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]" onClick={handleClose}>
        <div
          className="bg-[var(--canvas-card)] border border-[var(--hairline-light)] rounded-xl p-8 w-[700px] max-w-[92vw] max-h-[88vh] overflow-y-auto custom-scrollbar shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="font-display text-[28px] font-semibold leading-[1.3] mb-1">{t('project.new')}</h2>
          <p className="text-[var(--ink-tertiary)] text-[13px] mb-5">{t('project.subtitle')}</p>

          <div className="flex gap-2 mb-5">
            <button className={tab === 'blank' ? activeBtn : inactiveBtn} onClick={() => setTab('blank')}>
              {t('project.import.tabBlank')}
            </button>
            <button className={tab === 'import' ? activeBtn : inactiveBtn} onClick={() => setTab('import')}>
              {t('project.import.tabImport')}
            </button>
          </div>

          {tab === 'import' && (
            <div className="mb-5">
              <ImportBookPanel
                book={book}
                file={file}
                parsing={parsing}
                encoding={encoding}
                disabled={loading}
                onFileSelected={handleFileSelected}
                onEncodingChange={handleEncodingChange}
              />
            </div>
          )}

          {displayError && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25 text-[13px] text-red-500">
              {displayError}
            </div>
          )}

          <div className="mb-5">
            <label className="block text-[11px] font-medium text-[var(--ink-secondary)] tracking-[0.04em] uppercase mb-1.5">
              {t('project.nameLabel')}
            </label>
            <input
              type="text"
              className="w-full h-9 bg-[var(--canvas-elevated)] border border-[var(--hairline)] rounded-lg px-3 font-sans text-[15px] text-[var(--ink)] outline-none transition-colors focus:border-[var(--accent-gold)] focus:shadow-[0_0_0_2px_rgba(201,169,110,0.2)]"
              placeholder={t('project.namePlaceholder')}
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setNameTouched(true)
              }}
            />
          </div>

          <div className="mb-5">
            <label className="block text-[11px] font-medium text-[var(--ink-secondary)] tracking-[0.04em] uppercase mb-1.5">
              {t('project.genresLabel')}
            </label>
            <div className="flex flex-wrap gap-2">
              {GENRES.map(({ key, icon: Icon }) => (
                <button
                  key={key}
                  className={`${selectedGenres.includes(key) ? activeBtn : inactiveBtn} inline-flex items-center gap-1.5`}
                  onClick={() => toggleGenre(key)}
                >
                  <Icon size={14} strokeWidth={2.25} className="shrink-0" />
                  {t(`project.genre.${key}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-5">
            <label className="block text-[11px] font-medium text-[var(--ink-secondary)] tracking-[0.04em] uppercase mb-1.5">
              {t('project.modeLabel')}
            </label>
            <div className="flex gap-2">
              {MODES.map((m) => (
                <button key={m.key} className={mode === m.key ? activeBtn : inactiveBtn} onClick={() => setMode(m.key)}>
                  {t(m.labelKey)}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-5">
            <label className="block text-[11px] font-medium text-[var(--ink-secondary)] tracking-[0.04em] uppercase mb-1.5">
              {t('project.languageLabel')}
            </label>
            <div className="flex gap-2">
              {LANGUAGES.map((l) => (
                <button
                  key={l.key}
                  className={language === l.key ? activeBtn : inactiveBtn}
                  onClick={() => setLanguage(l.key)}
                >
                  {t(l.labelKey)}
                </button>
              ))}
            </div>
          </div>

          {tab === 'import' && book && (
            <label className="mb-5 flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-0.5 accent-[var(--accent-gold)]"
                checked={analyze}
                onChange={(e) => setAnalyze(e.target.checked)}
                disabled={busy}
              />
              <span>
                <span className="block text-[13px] text-[var(--ink)]">{t('project.import.analyzeLabel')}</span>
                <span className="block text-[12px] text-[var(--ink-tertiary)] mt-0.5">
                  {t('project.import.analyzeHint')}
                </span>
              </span>
            </label>
          )}

          <div className="flex gap-2 justify-end mt-6 pt-4 border-t border-[var(--hairline)]">
            <button
              className="h-[34px] px-5 rounded-lg border border-[var(--hairline-light)] bg-[var(--canvas-elevated)] text-[var(--ink)] text-[13px] cursor-pointer transition-colors hover:bg-[var(--canvas-mid)] disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={handleClose}
              disabled={busy}
            >
              {t('project.cancel')}
            </button>
            <button
              className="h-[34px] px-5 rounded-lg border-none bg-[var(--accent-gold)] text-[var(--canvas)] font-medium text-[13px] cursor-pointer transition-colors hover:bg-[var(--accent-gold-soft)] disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={handleSubmit}
              disabled={busy || !canSubmit}
            >
              {primaryLabel}
            </button>
          </div>
        </div>
      </div>
      <ToastContainer toasts={toasts} />
    </>
  )
}
