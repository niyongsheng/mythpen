import { PanelRightClose, PanelRightOpen, Settings } from 'lucide-react'
import { ProjectIcon } from '@/components/ProjectIcon'
import { useT } from '@/hooks/useT'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUIStore } from '@/stores/useUIStore'

export function Titlebar() {
  const { currentProject, projects, showProjectListFn } = useProjectStore()
  const { toggleSettings, projectSwitcherOpen, setProjectSwitcherOpen, rightPanelVisible, toggleRightPanel } =
    useUIStore()
  const { t } = useT()

  return (
    <div className="flex items-center h-[var(--titlebar-h)] bg-[var(--canvas-soft)] border-b border-[var(--hairline)] px-4 gap-3 select-none shrink-0">
      {/* Brand */}
      <span
        className="font-display text-[13px] text-[var(--ink-tertiary)] tracking-[0.04em] uppercase ml-1 cursor-pointer"
        onClick={showProjectListFn}
      >
        mythpen
      </span>

      <span className="w-px h-[18px] bg-[var(--hairline)]" />

      {/* Project switcher — only visible with a project */}
      {currentProject && (
        <div className="relative">
          <div
            className="flex items-center gap-1 cursor-pointer"
            onClick={() => setProjectSwitcherOpen(!projectSwitcherOpen)}
          >
            <span className="text-[var(--ink-secondary)] text-[13px]">{currentProject}</span>
            <span className="text-[var(--ink-mute)] text-[12px]">· 第一卷</span>
          </div>

          {projectSwitcherOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setProjectSwitcherOpen(false)} />
              <div className="absolute top-full left-0 w-[280px] bg-[var(--canvas-elevated)] border border-[var(--hairline-light)] rounded-lg shadow-lg z-50 p-[6px] mt-[6px]">
                {projects.map((p) => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-sm cursor-pointer transition-colors hover:bg-[var(--canvas-mid)] ${p.name === currentProject ? 'bg-[var(--accent-gold-soft-bg)] border-l-2 border-[var(--accent-gold)]' : ''}`}
                    onClick={() => {
                      useProjectStore.getState().setCurrentProject(p.name)
                      setProjectSwitcherOpen(false)
                    }}
                  >
                    <ProjectIcon name={p.iconName} className="w-5 h-5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-[var(--ink)] truncate">{p.name}</div>
                      <div className="text-[11px] text-[var(--ink-tertiary)]">
                        {p.wordCount.toLocaleString()} 字 · {p.chapterCount} 章 · {p.genres.join(' ')}
                      </div>
                    </div>
                  </div>
                ))}
                <div
                  className="flex items-center gap-2 px-2.5 py-2 rounded-sm cursor-pointer text-[var(--accent-gold)] text-[13px] border-t border-[var(--hairline)] mt-1 pt-2.5 hover:bg-[var(--canvas-mid)]"
                  onClick={() => {
                    showProjectListFn()
                    setProjectSwitcherOpen(false)
                  }}
                >
                  <span>+</span> {t('titlebar.projects')}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Right actions */}
      <div className="ml-auto flex items-center gap-1">
        <button
          className="tool-btn text-base"
          title={rightPanelVisible ? t('titlebar.collapseAI') : t('titlebar.expandAI')}
          onClick={toggleRightPanel}
        >
          {rightPanelVisible ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
        </button>
        <button className="tool-btn text-base" title={t('titlebar.settings')} onClick={toggleSettings}>
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
