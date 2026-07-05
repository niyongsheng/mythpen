import type { Toast } from '@/hooks/useToast'

export function ToastContainer({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-16 right-4 z-[300] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="px-4 py-2.5 rounded-lg shadow-lg text-[13px] font-medium animate-[slideIn_0.2s_ease-out]"
          style={{
            background:
              t.type === 'success' ? 'var(--success)' : t.type === 'error' ? 'var(--error)' : 'var(--accent-gold)',
            color: 'var(--canvas)',
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
