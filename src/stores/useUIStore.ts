import { create } from 'zustand'

interface UIState {
  settingsOpen: boolean
  projectDialogOpen: boolean
  projectSwitcherOpen: boolean
  rightPanelVisible: boolean
  rightPanelWidth: number
  toggleSettings: () => void
  closeSettings: () => void
  setProjectDialogOpen: (open: boolean) => void
  setProjectSwitcherOpen: (open: boolean) => void
  toggleRightPanel: () => void
  setRightPanelWidth: (w: number) => void
}

export const useUIStore = create<UIState>((set) => ({
  settingsOpen: false,
  projectDialogOpen: false,
  projectSwitcherOpen: false,
  rightPanelVisible: true,
  rightPanelWidth: 320,
  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
  closeSettings: () => set({ settingsOpen: false }),
  setProjectDialogOpen: (open) => set({ projectDialogOpen: open }),
  setProjectSwitcherOpen: (open) => set({ projectSwitcherOpen: open }),
  toggleRightPanel: () => set((s) => ({ rightPanelVisible: !s.rightPanelVisible })),
  setRightPanelWidth: (w) => {
    const clamped = Math.max(240, Math.min(600, w))
    set({ rightPanelWidth: clamped })
    document.documentElement.style.setProperty('--right-panel-w', `${clamped}px`)
    localStorage.setItem('mythpen-right-panel-width', String(clamped))
  },
}))
