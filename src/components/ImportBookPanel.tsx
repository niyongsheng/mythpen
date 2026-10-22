import { AlertTriangle, FileText, Loader, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useT } from '@/hooks/useT'
import type { ImportWarning, ParsedBook, TextEncoding } from '@/lib/import/types'

interface ImportBookPanelProps {
  book: ParsedBook | null
  file: File | null
  parsing: boolean
  error: string | null
  encoding: TextEncoding
  disabled?: boolean
  onFileSelected: (file: File) => void
  onEncodingChange: (encoding: TextEncoding) => void
}

function warningText(warning: ImportWarning, t: ReturnType<typeof useT>['t']): string {
  switch (warning.code) {
    case 'noChapterMarkers':
      return t('project.import.noChapterMarkers')
    case 'perVolumeSingleChapter':
      return t('project.import.perVolumeSingleChapter')
    case 'emptyChaptersSkipped':
      return t('project.import.emptyChaptersSkipped', { count: warning.count || 0 })
    case 'bigChapter':
      return t('project.import.bigChapter', { value: (warning.value || 0).toLocaleString() })
    case 'encodingFallback':
      return t('project.import.encodingFallback')
    case 'unknownEncoding':
      return t('project.import.unknownEncoding')
    case 'tocIncomplete':
      return t('project.import.tocIncomplete')
    case 'fragmentFallback':
      return t('project.import.fragmentFallback')
    default:
      return ''
  }
}

function isTxtFile(file: File | null): boolean {
  return !!file && file.name.toLowerCase().endsWith('.txt')
}

export function ImportBookPanel({
  book,
  file,
  parsing,
  error,
  encoding,
  disabled,
  onFileSelected,
  onEncodingChange,
}: ImportBookPanelProps) {
  const { t } = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)

  const pickFile = () => {
    if (!disabled) inputRef.current?.click()
  }

  const handleInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    if (selected) onFileSelected(selected)
    // Allow selecting the same file again.
    event.target.value = ''
  }

  const handleDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    setDragActive(false)
    if (disabled) return
    const dropped = event.dataTransfer.files?.[0]
    if (dropped) onFileSelected(dropped)
  }

  const previewItems: { key: string; volume?: string; title: string }[] = []
  if (book) {
    let remaining = 10
    let sequence = 0
    for (const volume of book.volumes) {
      if (remaining <= 0) break
      previewItems.push({ key: `v-${sequence++}`, volume: volume.title, title: '' })
      for (const chapter of volume.chapters) {
        if (remaining <= 0) break
        previewItems.push({ key: `c-${sequence++}`, title: chapter.title })
        remaining -= 1
      }
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.epub,text/plain,application/epub+zip"
        className="hidden"
        onChange={handleInput}
      />

      <button
        type="button"
        className={`w-full border-2 border-dashed rounded-xl px-6 py-7 text-center transition-colors ${
          disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
        } ${
          dragActive
            ? 'border-[var(--accent-gold)] bg-[var(--accent-gold-soft-bg)]'
            : 'border-[var(--hairline-light)] hover:border-[var(--accent-gold)] hover:bg-[var(--canvas-elevated)]'
        }`}
        onClick={pickFile}
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled) setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <Upload className="w-7 h-7 mx-auto mb-2 text-[var(--accent-gold)]" />
        <div className="text-[14px] text-[var(--ink)]">{t('project.import.dropHint')}</div>
        <div className="text-[12px] text-[var(--ink-tertiary)] mt-1">
          {file ? file.name : t('project.import.supported')}
        </div>
      </button>

      {isTxtFile(file) && (
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-[var(--ink-secondary)]">{t('project.import.encodingLabel')}</span>
          <select
            className="form-input h-8 text-[12px] px-2 py-0"
            value={encoding}
            disabled={disabled || parsing}
            onChange={(event) => onEncodingChange(event.target.value as TextEncoding)}
          >
            <option value="auto">{t('project.import.encodingAuto')}</option>
            <option value="utf-8">UTF-8</option>
            <option value="gb18030">GB18030 / GBK</option>
            <option value="big5">Big5</option>
            <option value="utf-16le">UTF-16 LE</option>
            <option value="utf-16be">UTF-16 BE</option>
          </select>
        </div>
      )}

      {parsing && (
        <div className="flex items-center gap-2 text-[13px] text-[var(--ink-secondary)]">
          <Loader className="w-4 h-4 animate-spin" />
          {t('project.import.parsing')}
        </div>
      )}

      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25 text-[13px] text-red-500">
          {error}
        </div>
      )}

      {book && !parsing && (
        <div className="rounded-xl border border-[var(--hairline)] bg-[var(--canvas-elevated)] p-4">
          <div className="flex items-start gap-2">
            <FileText className="w-4 h-4 mt-0.5 text-[var(--accent-gold)] shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] text-[var(--ink)] font-medium truncate">{book.title}</div>
              <div className="text-[12px] text-[var(--ink-tertiary)] mt-0.5">
                {[
                  book.author,
                  book.format.toUpperCase(),
                  t('project.import.volumesCount', { count: book.volumes.length }),
                  t('project.import.chaptersCount', { count: book.totalChapters }),
                  t('project.import.wordsCount', { count: book.totalWords.toLocaleString() }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
          </div>

          {previewItems.length > 0 && (
            <div className="mt-3 border-t border-[var(--hairline)] pt-2 max-h-[150px] overflow-y-auto custom-scrollbar">
              <div className="text-[11px] uppercase tracking-[0.04em] text-[var(--ink-mute)] mb-1">
                {t('project.import.chapterPreview')}
              </div>
              {previewItems.map((item) =>
                item.volume ? (
                  <div key={item.key} className="text-[12px] text-[var(--accent-gold)] mt-1">
                    {item.volume}
                  </div>
                ) : (
                  <div key={item.key} className="text-[12px] text-[var(--ink-secondary)] pl-2 truncate">
                    {item.title}
                  </div>
                ),
              )}
              {book.totalChapters > 10 && (
                <div className="text-[11px] text-[var(--ink-mute)] mt-1">
                  {t('project.import.moreChapters', { count: book.totalChapters - 10 })}
                </div>
              )}
            </div>
          )}

          {book.warnings.length > 0 && (
            <div className="mt-3 border-t border-[var(--hairline)] pt-2">
              <div className="flex items-center gap-1 text-[11px] uppercase tracking-[0.04em] text-[var(--ink-mute)] mb-1">
                <AlertTriangle className="w-3 h-3" />
                {t('project.import.warnings')}
              </div>
              {Array.from(new Set(book.warnings.map((warning) => warningText(warning, t))))
                .filter(Boolean)
                .map((text) => (
                  <div key={text} className="text-[12px] text-[var(--warning)] leading-[1.6]">
                    {text}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
