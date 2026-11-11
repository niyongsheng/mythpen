import * as Sentry from '@sentry/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { ServerStatusGate } from '@/components/ServerStatusGate'
import { useT } from '@/hooks/useT'
import { isAnonymousStatsEnabled, syncAnonymousStatsToShell } from '@/lib/anonymousStats'
import { registerExitFlush } from '@/lib/exitFlush'
import { initSentry } from '@/lib/sentry'
import App from './App'

initSentry()
syncAnonymousStatsToShell(isAnonymousStatsEnabled())
registerExitFlush()

function CrashFallback() {
  const { t } = useT()
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--canvas)] px-6 text-center">
      <div className="max-w-[420px]">
        <h1 className="font-display text-[24px] font-semibold text-[var(--ink)]">{t('common.crashTitle')}</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-tertiary)]">{t('common.crashDesc')}</p>
        <button
          type="button"
          className="mt-5 h-[34px] px-5 rounded-lg border-none bg-[var(--accent-gold)] text-[var(--canvas)] text-[13px] font-medium cursor-pointer hover:bg-[var(--accent-gold-soft)]"
          onClick={() => window.location.reload()}
        >
          {t('common.retry')}
        </button>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<CrashFallback />} showDialog={false}>
      <ServerStatusGate>
        <App />
      </ServerStatusGate>
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
