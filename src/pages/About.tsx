import { Info, Mail } from 'lucide-react'
import { useT } from '@/hooks/useT'

declare const __APP_VERSION__: string

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

export function About() {
  const { t } = useT()

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
            {/* Version */}
            <div className="bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg p-4 flex items-center justify-between">
              <span className="text-[14px] text-[var(--ink)]">{t('about.version')}</span>
              <span className="font-mono text-[13px] text-[var(--ink-mute)]">v{__APP_VERSION__}</span>
            </div>

            {/* GitHub */}
            <a
              href="https://github.com/niyongsheng/mythpen"
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg p-4 flex items-center gap-3 no-underline hover:bg-[var(--canvas-mid)] transition-colors"
            >
              <GithubIcon className="w-5 h-5 text-[var(--ink-secondary)] shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[14px] text-[var(--ink)]">{t('about.sourceCode')}</div>
                <div className="text-[12px] text-[var(--ink-tertiary)] truncate">github.com/niyongsheng/mythpen</div>
              </div>
              <span className="text-[12px] text-[var(--accent-gold)]">{t('about.openLink')} →</span>
            </a>

            {/* Contact */}
            <div className="bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg p-4 flex items-center gap-3">
              <Mail className="w-5 h-5 text-[var(--ink-secondary)] shrink-0" />
              <div>
                <div className="text-[14px] text-[var(--ink)]">{t('about.contact')}</div>
                <div className="text-[12px] text-[var(--ink-tertiary)]">niyongsheng@outlook.com</div>
              </div>
            </div>

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
    </>
  )
}
