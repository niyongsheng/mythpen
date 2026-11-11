import { open } from '@tauri-apps/plugin-shell'
import { Coffee, Globe, Info, Users, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '@/hooks/useT'

declare const __APP_VERSION__: string

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

const WEBSITE_URL = 'https://mythpen.looplooptech.com'
const GITHUB_URL = 'https://github.com/niyongsheng/mythpen'
const SPONSOR_URL = 'https://ifdian.net/a/nico2026'
const QQ_GROUP_URL = 'https://qm.qq.com/q/eQ0DouN9t0'

// Hidden version-cell easter egg: seven quick clicks celebrate with confetti.
const EASTER_EGG_CLICKS = 7
const CLICK_STREAK_MS = 1500
const EASTER_EGG_DURATION_MS = 6000
const CONFETTI_COLORS = ['var(--accent-gold)', '#e8c98a', 'var(--success)', 'var(--info)', 'var(--warning)']

function openExternal(url: string) {
  open(url).catch(() => {
    window.open(url, '_blank')
  })
}

interface LinkCardProps {
  icon: React.ReactNode
  title: string
  subtitle: string
  onOpen: () => void
}

function LinkCard({ icon, title, subtitle, onOpen }: LinkCardProps) {
  const { t } = useT()
  return (
    <button
      type="button"
      className="w-full bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg p-4 flex items-center gap-3 text-left hover:bg-[var(--canvas-mid)] transition-colors cursor-pointer"
      onClick={onOpen}
    >
      {icon}
      <span className="flex-1 min-w-0">
        <span className="block text-[14px] text-[var(--ink)]">{title}</span>
        <span className="block text-[12px] text-[var(--ink-tertiary)] truncate">{subtitle}</span>
      </span>
      <span className="text-[12px] text-[var(--accent-gold)]">{t('about.openLink')} →</span>
    </button>
  )
}

function EasterEgg({ onClose }: { onClose: () => void }) {
  const { t } = useT()

  useEffect(() => {
    const timer = window.setTimeout(onClose, EASTER_EGG_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [onClose])

  const pieces = useMemo(
    () =>
      Array.from({ length: 44 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        size: 4 + Math.random() * 6,
        delay: Math.random() * 0.6,
        duration: 2.2 + Math.random() * 1.8,
        drift: (Math.random() - 0.5) * 32,
        spin: (Math.random() - 0.5) * 1080,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        round: i % 3 === 0,
      })),
    [],
  )

  return (
    <div className="fixed inset-0 z-[400] pointer-events-none overflow-hidden">
      <button
        type="button"
        tabIndex={-1}
        aria-label={t('common.dismiss')}
        className="egg-backdrop pointer-events-auto"
        onClick={onClose}
      />
      <div className="absolute inset-0" aria-hidden="true">
        {pieces.map((p) => (
          <span
            key={p.id}
            className="egg-confetti"
            style={
              {
                left: `${p.left}%`,
                width: p.size,
                height: p.round ? p.size : p.size * 1.8,
                background: p.color,
                borderRadius: p.round ? '9999px' : '1px',
                '--dur': `${p.duration}s`,
                '--delay': `${p.delay}s`,
                '--drift': `${p.drift}vw`,
                '--spin': `${p.spin}deg`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <div className="absolute inset-0 flex items-center justify-center px-4 pb-24">
        <div className="egg-card pointer-events-auto relative w-full max-w-[380px] overflow-hidden rounded-2xl border border-[var(--accent-gold)] bg-[var(--canvas-elevated)] px-6 pb-5 pt-7 text-center shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -top-20 h-40 bg-[radial-gradient(closest-side,rgba(201,169,110,0.35),transparent)]"
          />
          <button
            type="button"
            className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-[var(--ink-mute)] transition-colors hover:bg-[var(--canvas-mid)] hover:text-[var(--ink)]"
            onClick={onClose}
            title={t('common.dismiss')}
            aria-label={t('common.dismiss')}
          >
            <svg
              className="pointer-events-none absolute inset-0 -rotate-90"
              viewBox="0 0 28 28"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="14" cy="14" r="12.5" stroke="var(--hairline)" strokeWidth="1.5" />
              <circle
                className="egg-countdown-ring"
                cx="14"
                cy="14"
                r="12.5"
                stroke="var(--accent-gold)"
                strokeWidth="1.5"
                strokeLinecap="round"
                style={{ '--egg-duration': `${EASTER_EGG_DURATION_MS}ms` } as React.CSSProperties}
              />
            </svg>
            <X className="relative w-3.5 h-3.5" />
          </button>
          <div
            aria-hidden="true"
            className="egg-emoji relative mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-[rgba(201,169,110,0.35)] bg-[var(--accent-gold-soft-bg)] text-[30px]"
          >
            🎉
          </div>
          <h3 className="relative font-display text-[20px] font-semibold text-[var(--ink)]">
            {t('about.easterEggTitle')}
          </h3>
          <p className="relative mx-auto mt-1.5 max-w-[300px] text-[13px] leading-6 text-[var(--ink-secondary)]">
            {t('about.easterEgg')}
          </p>
          <div className="relative mt-4 rounded-xl border border-[var(--hairline)] bg-[var(--canvas-card)] px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-[0.08em] text-[var(--ink-mute)]">{t('about.contact')}</div>
            <button
              type="button"
              className="mt-1 border-none bg-transparent p-0 font-mono text-[12px] text-[var(--accent-gold)] cursor-pointer hover:underline"
              onClick={() => openExternal('mailto:niyongsheng@outlook.com')}
            >
              niyongsheng@outlook.com
            </button>
          </div>
          <div className="relative mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-mute)]">
            Mythpen · v{__APP_VERSION__}
          </div>
        </div>
      </div>
    </div>
  )
}

export function About() {
  const { t } = useT()
  const handleOpenWebsite = useCallback(() => openExternal(WEBSITE_URL), [])
  const handleOpenGithub = useCallback(() => openExternal(GITHUB_URL), [])
  const handleOpenSponsor = useCallback(() => openExternal(SPONSOR_URL), [])
  const handleOpenQqGroup = useCallback(() => openExternal(QQ_GROUP_URL), [])
  const [versionPop, setVersionPop] = useState(0)
  const [eggBurst, setEggBurst] = useState(0)
  const versionClicksRef = useRef(0)
  const versionResetTimerRef = useRef<number | null>(null)

  // Bumping the burst id mounts a fresh confetti batch; the egg counts itself down.
  const handleCloseEgg = useCallback(() => setEggBurst(0), [])

  useEffect(
    () => () => {
      if (versionResetTimerRef.current) window.clearTimeout(versionResetTimerRef.current)
    },
    [],
  )

  const handleVersionClick = useCallback(() => {
    setVersionPop((n) => n + 1)
    versionClicksRef.current += 1
    if (versionResetTimerRef.current) window.clearTimeout(versionResetTimerRef.current)
    if (versionClicksRef.current >= EASTER_EGG_CLICKS) {
      versionClicksRef.current = 0
      setEggBurst((n) => n + 1)
      return
    }
    versionResetTimerRef.current = window.setTimeout(() => {
      versionClicksRef.current = 0
    }, CLICK_STREAK_MS)
  }, [])

  return (
    <>
      <div className="page-header">
        <h2 className="flex items-center gap-2">
          <Info className="w-5 h-5" /> {t('pages.about')}
        </h2>
      </div>
      <div className="page-body">
        <div className="max-w-[600px] mx-auto mt-12">
          {/* App Identity */}
          <div className="text-center mb-10">
            <h1 className="font-display text-[32px] font-bold text-[var(--ink)] mb-2">Mythpen</h1>
            <p className="text-[var(--ink-tertiary)] text-[15px]">{t('app.tagline')}</p>
          </div>

          {/* Info Cards */}
          <div className="space-y-3">
            {/* Version — each click pops the number; seven quick clicks are rewarded. */}
            <button
              type="button"
              className="w-full bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg p-4 flex items-center justify-between cursor-pointer text-left transition-colors hover:bg-[var(--canvas-mid)]"
              onClick={handleVersionClick}
            >
              <span className="text-[14px] text-[var(--ink)]">{t('about.version')}</span>
              <span
                key={versionPop}
                className={`font-mono text-[13px] text-[var(--ink-mute)] ${versionPop > 0 ? 'version-pop' : ''}`}
              >
                v{__APP_VERSION__}
              </span>
            </button>

            {/* Official website */}
            <LinkCard
              icon={<Globe className="w-5 h-5 text-[var(--ink-secondary)] shrink-0" />}
              title={t('about.website')}
              subtitle="mythpen.looplooptech.com"
              onOpen={handleOpenWebsite}
            />

            {/* GitHub */}
            <LinkCard
              icon={<GithubIcon className="w-5 h-5 text-[var(--ink-secondary)] shrink-0" />}
              title={t('about.sourceCode')}
              subtitle="github.com/niyongsheng/mythpen"
              onOpen={handleOpenGithub}
            />

            {/* Sponsor */}
            <LinkCard
              icon={<Coffee className="w-5 h-5 text-[var(--ink-secondary)] shrink-0" />}
              title={t('about.support')}
              subtitle={t('about.supportDesc')}
              onOpen={handleOpenSponsor}
            />

            {/* Community — developer contact now lives inside the easter egg. */}
            <LinkCard
              icon={<Users className="w-5 h-5 text-[var(--ink-secondary)] shrink-0" />}
              title={t('about.community')}
              subtitle={t('about.communityDesc')}
              onOpen={handleOpenQqGroup}
            />

            {/* Tech Stack */}
            <div className="bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg p-4">
              <div className="text-[14px] text-[var(--ink)] mb-2">{t('about.techStack')}</div>
              <div className="flex flex-wrap gap-2">
                {['Tauri v2', 'Express 5', 'React 19', 'TypeScript', 'SQLite', 'Tailwind CSS'].map((tech) => (
                  <span
                    key={tech}
                    className="px-2.5 py-1 text-[12px] rounded-full bg-[var(--canvas-elevated)] text-[var(--ink-mute)] border border-[var(--hairline)]"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center mt-10 text-[12px] text-[var(--ink-tertiary)]">
            <p>Copyright © {new Date().getFullYear()} Mythpen</p>
          </div>
        </div>
      </div>
      {eggBurst > 0 && <EasterEgg key={eggBurst} onClose={handleCloseEgg} />}
    </>
  )
}
