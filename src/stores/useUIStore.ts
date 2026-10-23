import { create } from 'zustand'

const MIN_RIGHT_PANEL_WIDTH = 240
const MAX_RIGHT_PANEL_WIDTH = 600
const MIN_SIDEBAR_WIDTH = 200
const MAX_SIDEBAR_WIDTH = 400
/** Preferred width of the page area between the sidebar and AI panel. */
const MIN_CONTENT_WIDTH = 640
const DEFAULT_SIDEBAR_WIDTH = 260

/** Cap the AI panel so the middle content keeps its preferred width. */
function maxRightPanelWidth(): number {
  if (typeof window === 'undefined' || typeof document === 'undefined') return MAX_RIGHT_PANEL_WIDTH
  const sidebar =
    Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w')) ||
    DEFAULT_SIDEBAR_WIDTH
  return Math.max(
    MIN_RIGHT_PANEL_WIDTH,
    Math.min(MAX_RIGHT_PANEL_WIDTH, window.innerWidth - sidebar - MIN_CONTENT_WIDTH),
  )
}

interface UIState {
  settingsOpen: boolean
  projectDialogOpen: boolean
  projectSwitcherOpen: boolean
  rightPanelVisible: boolean
  rightPanelWidth: number
  sidebarWidth: number
  toggleSettings: () => void
  closeSettings: () => void
  setProjectDialogOpen: (open: boolean) => void
  setProjectSwitcherOpen: (open: boolean) => void
  toggleRightPanel: () => void
  setRightPanelWidth: (w: number) => void
  setSidebarWidth: (w: number) => void
}

export const useUIStore = create<UIState>((set, get) => ({
  settingsOpen: false,
  projectDialogOpen: false,
  projectSwitcherOpen: false,
  rightPanelVisible: true,
  rightPanelWidth: 320,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
  closeSettings: () => set({ settingsOpen: false }),
  setProjectDialogOpen: (open) => set({ projectDialogOpen: open }),
  setProjectSwitcherOpen: (open) => set({ projectSwitcherOpen: open }),
  toggleRightPanel: () => {
    set((s) => ({ rightPanelVisible: !s.rightPanelVisible }))
    if (get().rightPanelVisible) {
      // Showing the panel can steal space from the middle; re-clamp both sides.
      get().setRightPanelWidth(get().rightPanelWidth)
      get().setSidebarWidth(get().sidebarWidth)
    }
  },
  setRightPanelWidth: (w) => {
    const clamped = Math.max(MIN_RIGHT_PANEL_WIDTH, Math.min(maxRightPanelWidth(), w))
    set({ rightPanelWidth: clamped })
    document.documentElement.style.setProperty('--right-panel-w', `${clamped}px`)
    localStorage.setItem('mythpen-right-panel-width', String(clamped))
  },
  setSidebarWidth: (w) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    const { rightPanelVisible, rightPanelWidth } = get()
    const reserved = rightPanelVisible ? rightPanelWidth : 0
    const maxByViewport = window.innerWidth - reserved - MIN_CONTENT_WIDTH
    const max = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, maxByViewport))
    const clamped = Math.max(MIN_SIDEBAR_WIDTH, Math.min(max, w))
    set({ sidebarWidth: clamped })
    document.documentElement.style.setProperty('--sidebar-w', `${clamped}px`)
    localStorage.setItem('mythpen-sidebar-width', String(clamped))
  },
}))
