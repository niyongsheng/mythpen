import { useState, useEffect, type ReactNode } from 'react'

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
const API_BASE = isTauri ? 'http://127.0.0.1:3001/api' : '/api'
const HEALTH_URL = `${API_BASE}/health`

type Status = 'checking' | 'ready' | 'error'

interface Props {
  children: ReactNode
}

export function ServerStatusGate({ children }: Props) {
  const [status, setStatus] = useState<Status>('checking')
  const [retryCount, setRetryCount] = useState(0)
  const [detail, setDetail] = useState('')

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
        // Server responded but not ok — unusual
        setDetail(`HTTP ${res.status}`)
      } catch (err: any) {
        if (cancelled) return
        if (err.name === 'AbortError') {
          setDetail('连接超时')
        } else {
          setDetail(err.message || String(err))
        }
      }

      if (cancelled) return
      if (retryCount >= 30) {
        setStatus('error')
        return
      }
      // Exponential backoff: 1s → 2s → 4s … capped at 5s
      const delay = Math.min(1000 * Math.pow(1.15, retryCount), 5000)
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
      {/* Logo / brand mark */}
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style={{ marginBottom: 24 }}>
        <rect width="56" height="56" rx="12" fill="var(--accent-gold, #c9a96e)" />
        <path d="M18 40V18h4l6 14 6-14h4v22h-4V26l-6 14-6-14v14h-4Z" fill="var(--canvas, #0e0e10)" />
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
            Service Loading{retryCount > 5 ? `（${Math.round(retryCount * 1.5)}s）` : ''}
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
          <p style={{ fontSize: 14, color: 'var(--ink-secondary, #c8c6be)', margin: 0 }}>服务器启动失败</p>
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
              重试
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
              退出
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
