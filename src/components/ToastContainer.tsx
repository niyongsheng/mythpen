import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { useT } from '@/hooks/useT'
import type { Toast } from '@/hooks/useToast'

const TOAST_META = {
  success: { Icon: CircleCheck, accent: 'var(--success)', soft: 'var(--success-soft)' },
  error: { Icon: CircleAlert, accent: 'var(--error)', soft: 'var(--error-soft)' },
  info: { Icon: Info, accent: 'var(--info)', soft: 'var(--info-soft)' },
} as const

interface ToastContainerProps {
  toasts: Toast[]
  onDismiss?: (id: number) => void
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  const { t } = useT()
  if (toasts.length === 0) return null

  return (
    <div className="fixed top-[calc(var(--titlebar-h)_+_8px)] right-4 z-[300] flex w-[340px] max-w-[calc(100vw-2rem)] flex-col-reverse gap-2.5 pointer-events-none">
      {toasts.map((toast) => {
        const { Icon, accent, soft } = TOAST_META[toast.type]
        return (
          <div
            key={toast.id}
            role={toast.type === 'error' ? 'alert' : 'status'}
            aria-atomic="true"
            className={`pointer-events-auto relative flex items-start gap-2.5 overflow-hidden rounded-xl border border-[var(--hairline-light)] bg-[var(--canvas-elevated)] px-3 py-2.5 shadow-[var(--shadow-pop)] ${
              toast.leaving ? 'toast-leave' : 'toast-enter'
            }`}
          >
            <span
              className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
              style={{ background: soft, color: accent }}
              aria-hidden="true"
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
            </span>
            <p className="min-w-0 flex-1 break-words text-[13px] leading-5 text-[var(--ink)]">{toast.message}</p>
            {onDismiss && (
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="-mr-1 -mt-0.5 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded border-none bg-transparent text-[var(--ink-mute)] transition-colors hover:bg-[var(--canvas-mid)] hover:text-[var(--ink)]"
                aria-label={t('common.dismiss')}
                title={t('common.dismiss')}
              >
                <X className="h-3 w-3" />
              </button>
            )}
            <span
              className="toast-progress-bar absolute bottom-0 left-0 h-[2px] w-full origin-left"
              style={{
                background: accent,
                opacity: 0.7,
                animation: `toast-progress ${toast.duration}ms linear forwards`,
              }}
              aria-hidden="true"
            />
          </div>
        )
      })}
    </div>
  )
}
