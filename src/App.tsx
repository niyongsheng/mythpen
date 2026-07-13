import { useEffect } from 'react'
import { AIPanel } from '@/components/AIPanel'
import { BottomStatusbar } from '@/components/BottomStatusbar'
import { NewProjectDialog } from '@/components/NewProjectDialog'
import { SettingsDrawer } from '@/components/SettingsDrawer'
import { Sidebar } from '@/components/Sidebar'
import { Titlebar } from '@/components/Titlebar'
import { ToastContainer } from '@/components/ToastContainer'
import { useToast } from '@/hooks/useToast'
import { t } from '@/i18n'
import { refreshAllData } from '@/lib/dataEvents'
import { About } from '@/pages/About'
import { Characters } from '@/pages/Characters'
import { Consistency } from '@/pages/Consistency'
import { Dashboard } from '@/pages/Dashboard'
import { ExportPage } from '@/pages/ExportPage'
import { Foreshadows } from '@/pages/Foreshadows'
import { Memory } from '@/pages/Memory'
import { Outline } from '@/pages/Outline'
import { ProjectList } from '@/pages/ProjectList'
import { Relations } from '@/pages/Relations'
import { Science } from '@/pages/Science'
import { Timeline } from '@/pages/Timeline'
import { World } from '@/pages/World'
import { Writing } from '@/pages/Writing'
import { useChapterStore } from '@/stores/useChapterStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useSidebarStore } from '@/stores/useSidebarStore'
import { useUIStore } from '@/stores/useUIStore'

const PAGES: Record<string, React.ReactNode> = {
  'page-dashboard': <Dashboard />,
  'page-writing': <Writing />,
  'page-characters': <Characters />,
  'page-world': <World />,
  'page-outline': <Outline />,
  'page-foreshadow': <Foreshadows />,
  'page-relations': <Relations />,
  'page-export': <ExportPage />,
  'page-science': <Science />,
  'page-memory': <Memory />,
  'page-timeline': <Timeline />,
  'page-consistency': <Consistency />,
  'page-about': <About />,
}

function App() {
  const showProjectList = useProjectStore((s) => s.showProjectList)
  const activePage = useSidebarStore((s) => s.activePage)
  const currentProject = useProjectStore((s) => s.currentProject)
  const loadProjects = useProjectStore((s) => s.loadProjects)
  const loadChapters = useChapterStore((s) => s.loadChapters)
  const loadSettings = useSettingsStore((s) => s.loadFromServer)
  const rightPanelVisible = useUIStore((s) => s.rightPanelVisible)
  const setRightPanelWidth = useUIStore((s) => s.setRightPanelWidth)
  const { toasts, show: showToast } = useToast()

  // Load projects and settings on mount
  useEffect(() => {
    loadProjects()
    loadSettings()
  }, [])

  // Global keyboard shortcut: ⌘⇧R / Ctrl+Shift+R — manual refresh
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'R') {
        e.preventDefault()
        refreshAllData(currentProject || undefined).then(() => {
          showToast(t('common.dataRefreshed'), 'success', 3000)
        })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentProject])

  // Reload chapters when project changes
  useEffect(() => {
    if (currentProject) {
      loadChapters(currentProject)
    }
  }, [currentProject])

  // Restore right panel width from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('mythpen-right-panel-width')
    if (saved) setRightPanelWidth(Number(saved))
  }, [])

  return (
    <>
      <Titlebar />
      <div className="flex flex-1 min-h-0">
        {showProjectList ? (
          <ProjectList />
        ) : (
          <>
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0 min-h-0">
              {/* App view with pages */}
              <div className="flex flex-1 min-w-0 min-h-0">
                {/* Page content + AI panel */}
                <div className={`flex-1 flex flex-col min-w-0 min-h-0 ${showProjectList ? 'hidden' : 'flex'}`}>
                  {Object.entries(PAGES).map(([id, page]) => (
                    <div
                      key={id}
                      className={`flex-1 flex-col min-w-0 min-h-0 ${activePage === id ? 'flex' : 'hidden'}`}
                    >
                      {page}
                    </div>
                  ))}
                </div>
                {/* AI Panel - toggle via Titlebar button */}
                {!showProjectList && rightPanelVisible && <AIPanel />}
              </div>
            </div>
          </>
        )}
      </div>
      <BottomStatusbar />
      <NewProjectDialog />
      <SettingsDrawer />
      <ToastContainer toasts={toasts} />

      {/* Global styles for reused patterns */}
      <style>{`
        .page-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 24px;
          border-bottom: 1px solid var(--hairline);
          flex-shrink: 0;
        }
        .page-header h2 {
          font-family: var(--font-display);
          font-size: 22px;
          font-weight: 500;
        }
        .page-header-actions {
          display: flex;
          gap: 8px;
        }
        .page-body {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
        }
        .page-body::-webkit-scrollbar { width: 6px; }
        .page-body::-webkit-scrollbar-thumb { background: var(--canvas-mid); border-radius: 9999px; }
        .btn-primary {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          border-radius: 8px;
          border: none;
          background: var(--accent-gold);
          color: var(--canvas);
          font-weight: 500;
          font-family: var(--font-sans);
          font-size: 13px;
          cursor: pointer;
          transition: background 0.1s;
        }
        .btn-primary:hover { background: var(--accent-gold-soft); }
        .btn-secondary {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          border-radius: 8px;
          background: var(--canvas-elevated);
          color: var(--ink);
          border: 1px solid var(--hairline-light);
          font-family: var(--font-sans);
          font-size: 13px;
          cursor: pointer;
          transition: background 0.1s;
        }
        .btn-secondary:hover { background: var(--canvas-mid); }
        .form-input {
          width: 100%;
          height: 36px;
          background: var(--canvas-elevated);
          border: 1px solid var(--hairline);
          border-radius: 8px;
          padding: 0 12px;
          font-family: var(--font-sans);
          font-size: 15px;
          color: var(--ink);
          outline: none;
          transition: border 0.15s;
        }
        .form-input:focus {
          border-color: var(--accent-gold);
          box-shadow: 0 0 0 2px rgba(201, 169, 110, 0.2);
        }
        .form-textarea {
          width: 100%;
          background: var(--canvas-elevated);
          border: 1px solid var(--hairline);
          border-radius: 6px;
          padding: 8px 10px;
          font-family: var(--font-sans);
          font-size: 13px;
          color: var(--ink);
          outline: none;
          resize: vertical;
          min-height: 50px;
        }
        .form-textarea:focus {
          border-color: var(--accent-gold);
          box-shadow: 0 0 0 2px rgba(201, 169, 110, 0.2);
        }
        .setting-select {
          height: 30px;
          padding: 0 10px;
          background: var(--canvas-elevated);
          border: 1px solid var(--hairline);
          border-radius: 6px;
          color: var(--ink);
          font-family: var(--font-sans);
          font-size: 13px;
          cursor: pointer;
          outline: none;
        }
        .setting-select:focus { border-color: var(--accent-gold); }
        .setting-input {
          height: 30px;
          padding: 0 8px;
          background: var(--canvas-elevated);
          border: 1px solid var(--hairline);
          border-radius: 6px;
          color: var(--ink);
          font-family: var(--font-sans);
          font-size: 13px;
          text-align: center;
          outline: none;
        }
        .setting-input:focus { border-color: var(--accent-gold); }
        .setting-label {
          font-size: 13px;
          color: var(--ink);
        }
        .dash-card-title {
          font-size: 11px;
          font-weight: 500;
          color: var(--ink-mute);
          letter-spacing: 0.04em;
          text-transform: uppercase;
          margin-bottom: 12px;
        }
        .tool-btn {
          background: none;
          border: none;
          color: var(--ink-tertiary);
          width: 28px;
          height: 28px;
          border-radius: 6px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          transition: all 0.1s;
        }
        .tool-btn:hover { background: var(--canvas-card); color: var(--ink); }
        .tool-btn-ai {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: none;
          border: none;
          color: var(--accent-gold);
          font-size: 12px;
          font-weight: 500;
          padding: 0 10px;
          height: 28px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.1s;
        }
        .tool-btn-ai:hover { background: rgba(201, 169, 110, 0.15); }
        .tool-btn-ai-pill {
          background: var(--canvas-card);
          border: 1px solid var(--hairline);
          border-radius: 9999px;
          padding: 3px 12px;
          height: 28px;
          min-width: 72px;
          justify-content: center;
          color: var(--accent-gold);
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.1s;
        }
        .tool-btn-ai-pill:hover { background: var(--canvas-elevated); }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        @keyframes shimmer {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-spin-once {
          animation: spin-once 0.5s ease-in-out;
        }
        @keyframes spin-once {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  )
}

export default App
