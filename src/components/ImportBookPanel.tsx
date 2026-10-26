import { AlertTriangle, FileText, Loader, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Select } from '@/components/Select'
import { useT } from '@/hooks/useT'
import type { ImportProgress, ImportSource, ImportWarning, TextEncoding } from '@/lib/import/types'

interface ImportBookPanelProps {
  source: ImportSource | null
  file: File | null
  extracting: boolean
  encoding: TextEncoding
  progress: ImportProgress | null
  disabled?: boolean
  onFileSelected: (file: File) => void
  onEncodingChange: (encoding: TextEncoding) => void
}

// Only these warnings come from file extraction; legacy rule-parser warnings
// are no longer produced by the import flow.
const EXTRACTION_WARNINGS = new Set(['encodingFallback', 'unknownEncoding', 'tocIncomplete', 'fragmentFallback'])

function warningText(warning: ImportWarning, t: ReturnType<typeof useT>['t']): string {
  return t(`project.import.${warning.code}`, {
    count: warning.count ?? 0,
    value: (warning.value ?? 0).toLocaleString(),
  })
}

function isTxtFile(file: File | null): boolean {
  return !!file && file.name.toLowerCase().endsWith('.txt')
}

export function ImportBookPanel({
  source,
  file,
  extracting,
  encoding,
  progress,
  disabled,
  onFileSelected,
  onEncodingChange,
}: ImportBookPanelProps) {
  const { t } = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)

  const pickFile = () => {
    if (!disabled && !extracting) inputRef.current?.click()
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
    if (disabled || extracting) return
    const dropped = event.dataTransfer.files?.[0]
    if (dropped) onFileSelected(dropped)
  }

  const stageKey = progress ? `project.import.stage.${progress.stage}` : ''
  const translatedStage = stageKey ? t(stageKey) : ''
  const stageText = progress
    ? translatedStage === stageKey
      ? progress.message || progress.stage
      : translatedStage
    : ''
  const percent = progress?.total
    ? Math.max(4, Math.min(100, Math.round(((progress.current || 0) / progress.total) * 100)))
    : 30

  const warnings = source
    ? Array.from(
        new Set(
          source.warnings
            .filter((warning) => EXTRACTION_WARNINGS.has(warning.code))
            .map((warning) => warningText(warning, t)),
        ),
      ).filter(Boolean)
    : []

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
          disabled || extracting ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
        } ${
          dragActive
            ? 'border-[var(--accent-gold)] bg-[var(--accent-gold-soft-bg)]'
            : 'border-[var(--hairline-light)] hover:border-[var(--accent-gold)] hover:bg-[var(--canvas-elevated)]'
        }`}
        onClick={pickFile}
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled && !extracting) setDragActive(true)
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-[var(--ink-secondary)] shrink-0">{t('project.import.encodingLabel')}</span>
          <Select<TextEncoding>
            ariaLabel={t('project.import.encodingLabel')}
            className="w-full min-w-0 sm:w-auto sm:flex-1"
            value={encoding}
            disabled={disabled || extracting}
            options={[
              { value: 'auto', label: t('project.import.encodingAuto') },
              { value: 'utf-8', label: 'UTF-8' },
              { value: 'gb18030', label: 'GB18030 / GBK' },
              { value: 'big5', label: 'Big5' },
              { value: 'utf-16le', label: 'UTF-16 LE' },
              { value: 'utf-16be', label: 'UTF-16 BE' },
            ]}
            onChange={onEncodingChange}
          />
        </div>
      )}

      {extracting && (
        <div className="flex items-center gap-2 text-[13px] text-[var(--ink-secondary)]">
          <Loader className="w-4 h-4 animate-spin" />
          {t('project.import.readingFile')}
        </div>
      )}

      {source && !extracting && (
        <div className="rounded-xl border border-[var(--hairline)] bg-[var(--canvas-elevated)] p-4">
          <div className="flex items-start gap-2">
            <FileText className="w-4 h-4 mt-0.5 text-[var(--accent-gold)] shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] text-[var(--ink)] font-medium truncate">
                {source.title || source.fileName}
              </div>
              <div className="text-[12px] text-[var(--ink-tertiary)] mt-0.5">
                {[
                  source.author,
                  source.format.toUpperCase(),
                  t('project.import.sourceChars', { count: source.text.length.toLocaleString() }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
              <div className="text-[12px] text-[var(--accent-gold)] mt-2 leading-[1.6]">
                {t('project.import.aiHint')}
              </div>
            </div>
          </div>

          {warnings.length > 0 && (
            <div className="mt-3 border-t border-[var(--hairline)] pt-2">
              <div className="flex items-center gap-1 text-[11px] uppercase tracking-[0.04em] text-[var(--ink-mute)] mb-1">
                <AlertTriangle className="w-3 h-3" />
                {t('project.import.warnings')}
              </div>
              {warnings.map((text) => (
                <div key={text} className="text-[12px] text-[var(--warning)] leading-[1.6]">
                  {text}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {progress && (
        <div className="rounded-xl border border-[var(--hairline)] bg-[var(--canvas-elevated)] p-4">
          <div className="flex items-center justify-between gap-3 text-[12px] text-[var(--ink-secondary)]">
            <span className="flex items-center gap-2 min-w-0">
              <Loader className="w-3.5 h-3.5 animate-spin shrink-0 text-[var(--accent-gold)]" />
              <span className="truncate">{stageText}</span>
            </span>
            {progress.total ? (
              <span className="shrink-0 text-[var(--ink-tertiary)]">
                {t('project.import.progressCount', {
                  current: progress.current || 0,
                  total: progress.total,
                })}
              </span>
            ) : null}
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-[var(--canvas-mid)] overflow-hidden">
            <div
              className={`h-full bg-[var(--accent-gold)] transition-all duration-300 ${
                progress.total ? '' : 'animate-pulse'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
