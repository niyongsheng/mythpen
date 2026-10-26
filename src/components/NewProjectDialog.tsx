import {
  BookOpen,
  Building,
  Fingerprint,
  Gamepad2,
  Heart,
  Landmark,
  type LucideIcon,
  Mountain,
  Rocket,
  Scroll,
  Swords,
  Wand,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ImportBookPanel } from '@/components/ImportBookPanel'
import { ToastContainer } from '@/components/ToastContainer'
import { useT } from '@/hooks/useT'
import { useToast } from '@/hooks/useToast'
import { LANGUAGES } from '@/i18n'
import { notifyDataChanged } from '@/lib/dataEvents'
import { extractImportSource } from '@/lib/import'
import type { ImportProgress, ImportSource, TextEncoding } from '@/lib/import/types'
import { useProjectStore } from '@/stores/useProjectStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useUIStore } from '@/stores/useUIStore'
import type { WritingLanguage } from '@/types'

const GENRES: { key: string; icon: LucideIcon }[] = [
  { key: 'sci-fi', icon: Rocket },
  { key: 'fantasy', icon: Wand },
  { key: 'xianxia', icon: Mountain },
  { key: 'wuxia', icon: Swords },
  { key: 'romance', icon: Heart },
  { key: 'history', icon: Landmark },
  { key: 'urban', icon: Building },
  { key: 'mystery', icon: Fingerprint },
  { key: 'game', icon: Gamepad2 },
  { key: 'biography', icon: BookOpen },
  { key: 'other', icon: Scroll },
]

const STYLES = ['dark', 'realistic', 'healing', 'poetic', 'power-fantasy', 'light'] as const

const MODES = [
  { key: 'short-story', labelKey: 'project.shortStory' },
  { key: 'medium-novel', labelKey: 'project.mediumNovel' },
  { key: 'long-novel', labelKey: 'project.longNovel' },
] as const

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
  const { toasts, show: showToast, dismiss: dismissToast } = useToast()

  const [tab, setTab] = useState<'blank' | 'import'>('blank')
  const [name, setName] = useState(() => t('project.defaultName'))
  const [nameTouched, setNameTouched] = useState(false)
  const [selectedGenres, setSelectedGenres] = useState<string[]>(['sci-fi', 'romance'])
  const [selectedStyles, setSelectedStyles] = useState<string[]>([])
  const [mode, setMode] = useState('medium-novel')
  const [language, setLanguage] = useState<WritingLanguage>('zh')

  const [file, setFile] = useState<File | null>(null)
  const [source, setSource] = useState<ImportSource | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [encoding, setEncoding] = useState<TextEncoding>('auto')
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const parseTokenRef = useRef(0)
  const importTokenRef = useRef(0)
  const importControllerRef = useRef<AbortController | null>(null)
  const hasApiKey = useSettingsStore((state) => Boolean(state.settings.apiKey))

  // Clear stale error when the dialog opens; reset import state when it closes.
  useEffect(() => {
    if (projectDialogOpen) {
      useProjectStore.setState({ error: null })
      return
    }
    parseTokenRef.current += 1
    importTokenRef.current += 1
    importControllerRef.current = null
    setTab('blank')
    setName(t('project.defaultName'))
    setNameTouched(false)
    setSelectedGenres(['sci-fi', 'romance'])
    setSelectedStyles([])
    setMode('medium-novel')
    setLanguage('zh')
    setFile(null)
    setSource(null)
    setExtracting(false)
    setParseError(null)
    setEncoding('auto')
    setProgress(null)
  }, [projectDialogOpen])

  if (!projectDialogOpen) return <ToastContainer toasts={toasts} onDismiss={dismissToast} />

  const toggleGenre = (key: string) => {
    setSelectedGenres((prev) => (prev.includes(key) ? prev.filter((g) => g !== key) : [...prev, key]))
  }

  const extractFile = async (selected: File, nextEncoding: TextEncoding) => {
    const token = ++parseTokenRef.current
    setFile(selected)
    setSource(null)
    setParseError(null)
    setProgress(null)
    setExtracting(true)
    try {
      const extracted = await extractImportSource(selected, { encoding: nextEncoding })
      if (token !== parseTokenRef.current) return
      setSource(extracted)
      if (!nameTouched) setName(sanitizeProjectName(extracted.title || extracted.fileName))
    } catch (err: any) {
      if (token !== parseTokenRef.current) return
      const key = err?.code ? IMPORT_ERROR_KEYS[err.code] : undefined
      setParseError(key ? t(key) : err?.message || t('project.import.parseFailed'))
    } finally {
      if (token === parseTokenRef.current) setExtracting(false)
    }
  }

  const handleFileSelected = (selected: File) => {
    void extractFile(selected, encoding)
  }

  const handleEncodingChange = (next: TextEncoding) => {
    setEncoding(next)
    if (file) void extractFile(file, next)
  }

  const busy = loading || extracting
  const importing = progress !== null
  const canSubmit = !!name.trim() && (tab === 'blank' || (!!source && !extracting && !loading))

  const handleSubmit = async () => {
    if (!canSubmit || busy) return

    if (tab === 'blank') {
      try {
        await createProject(name.trim(), { mode, language, genres: selectedGenres, styles: selectedStyles })
        setProjectDialogOpen(false)
      } catch {
        // The store has already set a user-facing error.
      }
      return
    }

    if (!source) return
    const projectName = name.trim()
    const token = ++importTokenRef.current
    const controller = new AbortController()
    importControllerRef.current = controller
    setProgress({ stage: 'connecting' })

    try {
      const result = await importProject(
        projectName,
        { mode, language, genres: selectedGenres, styles: selectedStyles },
        source,
        {
          onStage: (payload) => setProgress(payload),
          onProgress: (payload) => setProgress(payload),
          onWarning: (payload) => {
            if (payload?.message) showToast(payload.message, 'info', 5000)
          },
        },
        controller.signal,
      )
      if (!result) return
      setProjectDialogOpen(false)
      notifyDataChanged('all')
      showToast(
        t('project.import.importDone', {
          chapters: result.chapters,
          characters: result.characters,
        }),
        'success',
        5000,
      )
    } catch {
      // The store has already set a user-facing error.
    } finally {
      // A newer import may have started after a cancel; don't clear its state.
      if (importTokenRef.current === token) {
        importControllerRef.current = null
        setProgress(null)
      }
    }
  }

  const handleCancelImport = () => {
    importControllerRef.current?.abort()
    showToast(t('project.import.cancelled'), 'info', 3000)
  }

  const handleClose = () => {
    if (!busy) setProjectDialogOpen(false)
  }

  const activeBtn =
    'px-[14px] h-[30px] rounded-full border-none font-sans text-[13px] cursor-pointer bg-[var(--accent-gold)] text-[var(--canvas)] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed'
  const inactiveBtn =
    'px-[14px] h-[30px] rounded-full border-none font-sans text-[13px] cursor-pointer bg-[var(--canvas-mid)] text-[var(--ink-secondary)] hover:bg-[var(--canvas-pop)] transition-all disabled:opacity-40 disabled:cursor-not-allowed'

  const displayError = error || parseError
  const primaryLabel =
    tab === 'import'
      ? loading
        ? t('project.import.aiImporting')
        : t('project.import.aiImportStart')
      : loading
        ? t('project.creating')
        : t('project.start')

  return (
    <>
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]" onClick={handleClose}>
        <div
          className="bg-[var(--canvas-card)] border border-[var(--hairline-light)] rounded-xl p-5 sm:p-8 w-[700px] max-w-[92vw] max-h-[88vh] overflow-y-auto custom-scrollbar shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="font-display text-[28px] font-semibold leading-[1.3] mb-1">{t('project.new')}</h2>
          <p className="text-[var(--ink-tertiary)] text-[13px] mb-5">{t('project.subtitle')}</p>

          <div className="flex gap-2 mb-5">
            <button
              type="button"
              className={tab === 'blank' ? activeBtn : inactiveBtn}
              onClick={() => setTab('blank')}
              disabled={busy}
            >
              {t('project.import.tabBlank')}
            </button>
            <button
              type="button"
              className={tab === 'import' ? activeBtn : inactiveBtn}
              onClick={() => setTab('import')}
              disabled={busy}
            >
              {t('project.import.tabImport')}
            </button>
          </div>

          {tab === 'import' && (
            <div className="mb-5">
              <ImportBookPanel
                source={source}
                file={file}
                extracting={extracting}
                encoding={encoding}
                progress={progress}
                disabled={loading}
                onFileSelected={handleFileSelected}
                onEncodingChange={handleEncodingChange}
              />
            </div>
          )}

          {tab === 'import' && !hasApiKey && (
            <div className="mb-4 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/25 text-[12px] text-[var(--warning)]">
              {t('project.import.aiNotConfigured')}
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
              disabled={busy}
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
                  type="button"
                  className={`${selectedGenres.includes(key) ? activeBtn : inactiveBtn} inline-flex items-center gap-1.5`}
                  onClick={() => toggleGenre(key)}
                  disabled={busy}
                >
                  <Icon size={14} strokeWidth={2.25} className="shrink-0" />
                  {t(`project.genre.${key}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-5">
            <label className="block text-[11px] font-medium text-[var(--ink-secondary)] tracking-[0.04em] uppercase mb-1.5">
              {t('project.styleLabel')}
            </label>
            <div className="flex flex-wrap gap-2">
              {STYLES.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={selectedStyles.includes(key)}
                  className={selectedStyles.includes(key) ? activeBtn : inactiveBtn}
                  onClick={() =>
                    setSelectedStyles((prev) =>
                      prev.includes(key) ? prev.filter((style) => style !== key) : [...prev, key],
                    )
                  }
                  disabled={busy}
                >
                  {t(`project.style.${key}`)}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--ink-tertiary)]">
              {t('project.styleHint')}
            </p>
          </div>

          <div className="mb-5">
            <label className="block text-[11px] font-medium text-[var(--ink-secondary)] tracking-[0.04em] uppercase mb-1.5">
              {t('project.modeLabel')}
            </label>
            <div className="flex gap-2">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className={mode === m.key ? activeBtn : inactiveBtn}
                  onClick={() => setMode(m.key)}
                  disabled={busy}
                >
                  {t(m.labelKey)}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-5">
            <label className="block text-[11px] font-medium text-[var(--ink-secondary)] tracking-[0.04em] uppercase mb-1.5">
              {t('project.languageLabel')}
            </label>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  className={language === l.code ? activeBtn : inactiveBtn}
                  onClick={() => setLanguage(l.code)}
                  disabled={busy}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 justify-end mt-6 pt-4 border-t border-[var(--hairline)]">
            <button
              type="button"
              className="h-[34px] px-5 rounded-lg border border-[var(--hairline-light)] bg-[var(--canvas-elevated)] text-[var(--ink)] text-[13px] cursor-pointer transition-colors hover:bg-[var(--canvas-mid)] disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={importing ? handleCancelImport : handleClose}
              disabled={extracting || (loading && !importing)}
            >
              {importing ? t('project.import.cancelImport') : t('project.cancel')}
            </button>
            <button
              type="button"
              className="h-[34px] px-5 rounded-lg border-none bg-[var(--accent-gold)] text-[var(--canvas)] font-medium text-[13px] cursor-pointer transition-colors hover:bg-[var(--accent-gold-soft)] disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={handleSubmit}
              disabled={busy || !canSubmit}
            >
              {primaryLabel}
            </button>
          </div>
        </div>
      </div>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  )
}
