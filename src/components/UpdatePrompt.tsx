import { Download, RefreshCw, X } from 'lucide-react'
import { useT } from '@/hooks/useT'
import { useUpdateStore } from '@/stores/useUpdateStore'

/**
 * Global update card. It appears when a newer release is found (startup or
 * manual check in Settings), during download, and after installation when a
 * restart is required.
 */
export function UpdatePrompt() {
  const { t } = useT()
  const status = useUpdateStore((s) => s.status)
  const version = useUpdateStore((s) => s.version)
  const error = useUpdateStore((s) => s.error)
  const errorContext = useUpdateStore((s) => s.errorContext)
  const progress = useUpdateStore((s) => s.progress)
  const dismissed = useUpdateStore((s) => s.dismissed)
  const install = useUpdateStore((s) => s.install)
  const restart = useUpdateStore((s) => s.restart)
  const dismiss = useUpdateStore((s) => s.dismiss)

  // Check failures are reported in Settings only; this card is for updates
  // the user can act on.
  if (dismissed) return null
  if (status === 'error' && errorContext !== 'install') return null
  if (status !== 'available' && status !== 'downloading' && status !== 'ready' && status !== 'error') return null

  const title = status === 'error' ? t('update.failedTitle') : t('update.title', { version })
  const description =
    status === 'error'
      ? error
      : status === 'downloading'
        ? t('update.downloading', { percent: progress })
        : status === 'ready'
          ? t('update.ready')
          : t('update.availableDesc')

  return (
    <div className="fixed bottom-16 right-4 z-[260] w-[340px] max-w-[calc(100vw-2rem)] rounded-xl bg-[var(--canvas-card)] border border-[var(--hairline-light)] shadow-2xl p-4">
      <div className="flex items-start gap-2.5">
        <Download className="w-4 h-4 mt-0.5 text-[var(--accent-gold)] shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-medium text-[var(--ink)]">{title}</div>
          <div
            className={`text-[12px] mt-0.5 ${status === 'error' ? 'text-[var(--error)]' : 'text-[var(--ink-tertiary)]'}`}
          >
            {description}
          </div>
        </div>
        {status !== 'downloading' && (
          <button
            type="button"
            className="w-6 h-6 -mt-1 -mr-1 flex items-center justify-center rounded-[var(--radius-sm)] border-none bg-transparent text-[var(--ink-mute)] cursor-pointer hover:bg-[var(--canvas-mid)] transition-colors shrink-0"
            onClick={dismiss}
            aria-label={t('update.later')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {status === 'downloading' && (
        <div className="mt-3 h-1.5 rounded-full bg-[var(--canvas-mid)] overflow-hidden">
          <div
            className="h-full bg-[var(--accent-gold)] transition-[width] duration-300"
            style={{ width: `${Math.max(2, progress)}%` }}
          />
        </div>
      )}

      <div className="flex justify-end gap-2 mt-3">
        {status === 'available' && (
          <>
            <button
              type="button"
              className="h-[30px] px-3 rounded-lg border border-[var(--hairline-light)] bg-[var(--canvas-elevated)] text-[var(--ink)] text-[12px] cursor-pointer hover:bg-[var(--canvas-mid)] transition-colors"
              onClick={dismiss}
            >
              {t('update.later')}
            </button>
            <button
              type="button"
              className="h-[30px] px-3 rounded-lg border-none bg-[var(--accent-gold)] text-[var(--canvas)] font-medium text-[12px] cursor-pointer hover:bg-[var(--accent-gold-soft)] transition-colors flex items-center gap-1.5"
              onClick={() => void install()}
            >
              <Download className="w-3.5 h-3.5" />
              {t('update.download')}
            </button>
          </>
        )}
        {status === 'ready' && (
          <>
            <button
              type="button"
              className="h-[30px] px-3 rounded-lg border border-[var(--hairline-light)] bg-[var(--canvas-elevated)] text-[var(--ink)] text-[12px] cursor-pointer hover:bg-[var(--canvas-mid)] transition-colors"
              onClick={dismiss}
            >
              {t('update.later')}
            </button>
            <button
              type="button"
              className="h-[30px] px-3 rounded-lg border-none bg-[var(--accent-gold)] text-[var(--canvas)] font-medium text-[12px] cursor-pointer hover:bg-[var(--accent-gold-soft)] transition-colors flex items-center gap-1.5"
              onClick={() => void restart()}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t('update.restart')}
            </button>
          </>
        )}
        {status === 'error' && (
          <>
            <button
              type="button"
              className="h-[30px] px-3 rounded-lg border border-[var(--hairline-light)] bg-[var(--canvas-elevated)] text-[var(--ink)] text-[12px] cursor-pointer hover:bg-[var(--canvas-mid)] transition-colors"
              onClick={dismiss}
            >
              {t('update.later')}
            </button>
            <button
              type="button"
              className="h-[30px] px-3 rounded-lg border-none bg-[var(--accent-gold)] text-[var(--canvas)] font-medium text-[12px] cursor-pointer hover:bg-[var(--accent-gold-soft)] transition-colors"
              onClick={() => void install()}
            >
              {t('update.retry')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
