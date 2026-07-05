import { create } from 'zustand'

interface SidebarState {
  collapsed: boolean
  activePage: string
  toggleCollapsed: () => void
  setActivePage: (page: string) => void
}

export const useSidebarStore = create<SidebarState>((set) => ({
  collapsed: false,
  activePage: 'page-dashboard',
  toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
  setActivePage: (activePage) => set({ activePage }),
}))
