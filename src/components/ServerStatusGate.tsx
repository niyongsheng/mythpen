import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useT } from '@/hooks/useT'
import { apiUrl } from '@/lib/api'

const HEALTH_URL = apiUrl('/health')

const MAX_RETRIES = 20

type Status = 'checking' | 'ready' | 'error'

interface Props {
  children: ReactNode
}

export function ServerStatusGate({ children }: Props) {
  const [status, setStatus] = useState<Status>('checking')
  const [retryCount, setRetryCount] = useState(0)
  const { t } = useT()
  const [detail, setDetail] = useState('')
  const startTime = useRef(Date.now())

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    const check = async () => {
      try {
        const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(3000) })
        if (cancelled) return
        if (res.ok) {
          setStatus('ready')
          return
        }
        setDetail(`HTTP ${res.status}`)
      } catch (err: any) {
        if (cancelled) return
        if (err.name === 'AbortError') {
          setDetail(t('serverStatus.timeout'))
        } else {
          setDetail(err.message || String(err))
        }
      }

      if (cancelled) return
      if (retryCount >= MAX_RETRIES) {
        setStatus('error')
        return
      }
      // Exponential backoff: 1s → 1.5s → 2.25s (capped at 3s)
      const delay = Math.min(1000 * 1.5 ** retryCount, 3000)
      timer = setTimeout(() => setRetryCount((c) => c + 1), delay)
    }

    check()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [retryCount])

  if (status === 'ready') return <>{children}</>

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--canvas, #0e0e10)',
        color: 'var(--ink, #f0eee6)',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
        zIndex: 9999,
      }}
    >
      {/* Logo / brand mark — quill pen (same mark as the app icon) */}
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style={{ marginBottom: 24 }}>
        <rect width="56" height="56" rx="12" fill="var(--accent-gold, #c9a96e)" />
        <svg x="9" y="12" width="38" height="32" viewBox="0 0 1217 1024">
          <path
            d="M1176.72159 613.147613c-109.293924 88.014948-267.639658 224.03805-408.35921 243.635582-90.508125-4.348565-176.841628-47.312383-268.799275-39.948814-161.418719-1.33356-285.207859 207.281581-448.77187 133.87781 161.998528-265.958213 542.874809-62.909235 728.529528-382.673688 22.090708-44.123436-22.090708-44.123436-29.396297-44.123436 100.422853-34.034766 435.262329-279.003907 294.368836-331.128702 0 0 191.336844-125.1227 88.304852-176.609705-88.304852-51.487005-331.128702 36.817847-331.128702 36.817848-28.990431-125.238661-394.153898 104.249589-390.037257 117.75913 0 0 0-44.123436-29.454278-29.454278-419.549516 264.856577-257.66695 559.167431-257.666949 559.167431S543.744522 178.001246 904.327501 111.787102C530.640847 259.986184 13.393579 942.942755 13.393579 942.942755s-9.624823 12.871751-11.828096 16.292622-1.391541 11.42223-1.39154 11.42223 4.05866 15.422909 12.002038 21.047053c161.244777 104.713436 304.167601-75.317139 452.540626-115.03403 241.316347-19.53955 289.034596 120.774135 537.192685-64.242795 80.651379-50.733254 155.330729-110.801427 209.078987-190.351169 19.945416-29.512259-7.885397-32.469283-34.266689-8.987033z"
            fill="var(--canvas, #0e0e10)"
          />
        </svg>
      </svg>

      {/* App name */}
      <h1
        style={{
          fontFamily: 'var(--font-display, serif)',
          fontSize: 28,
          fontWeight: 500,
          letterSpacing: '0.04em',
          margin: 0,
        }}
      >
        Mythpen
      </h1>

      {/* Status indicator */}
      {status === 'checking' ? (
        <div style={{ marginTop: 24, textAlign: 'center' }}>
          {/* Animated dots */}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--accent-gold, #c9a96e)',
                  animation: 'mythpen-bounce 1.4s ease-in-out infinite',
                  animationDelay: `${i * 0.16}s`,
                }}
              />
            ))}
          </div>
          <p style={{ fontSize: 14, color: 'var(--ink-tertiary, #8a8880)', margin: 0 }}>
            {t('serverStatus.startingWithTime', { seconds: Math.round((Date.now() - startTime.current) / 1000) })}
          </p>
          {detail && <p style={{ fontSize: 12, color: 'var(--ink-mute, #5e5c56)', marginTop: 6 }}>{detail}</p>}
        </div>
      ) : (
        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'var(--error-soft, #3a1a1a)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
              fontSize: 24,
            }}
          >
            ✕
          </div>
          <p style={{ fontSize: 14, color: 'var(--ink-secondary, #c8c6be)', margin: 0 }}>
            {t('serverStatus.startFailed')}
          </p>
          {detail && <p style={{ fontSize: 12, color: 'var(--ink-mute, #5e5c56)', marginTop: 4 }}>{detail}</p>}
          <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
            <button
              onClick={() => {
                setStatus('checking')
                setRetryCount(0)
                setDetail('')
              }}
              style={{
                padding: '8px 22px',
                borderRadius: 8,
                border: '1px solid var(--hairline-light, #2e2e35)',
                background: 'var(--canvas-elevated, #202024)',
                color: 'var(--ink, #f0eee6)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {t('serverStatus.retry')}
            </button>
            <button
              onClick={() => window.close()}
              style={{
                padding: '8px 22px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--accent-gold, #c9a96e)',
                color: 'var(--canvas, #0e0e10)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {t('serverStatus.quit')}
            </button>
          </div>
        </div>
      )}

      {/* Keyframes injected once */}
      <style>{`
        @keyframes mythpen-bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
