import { create } from 'zustand'
import { chaptersApi, projectsApi } from '@/lib/api'
import { useChapterStore } from '@/stores/useChapterStore'
import { useSidebarStore } from '@/stores/useSidebarStore'

interface ProjectSummary {
  id: string
  name: string
  iconName: string
  genres: string[]
  wordCount: number
  chapterCount: number
  lastOpened: string
  status: string
  mode?: string
}

interface ProjectState {
  currentProject: string | null
  projects: ProjectSummary[]
  showProjectList: boolean
  loading: boolean
  error: string | null
  setCurrentProject: (name: string | null) => void
  toggleProjectList: () => void
  showProjectListFn: () => void
  hideProjectList: () => void
  loadProjects: () => Promise<void>
  createProject: (name: string, opts?: { mode?: string; language?: string; genres?: string[] }) => Promise<void>
}

export const useProjectStore = create<ProjectState>((set) => ({
  currentProject: null,
  projects: [],
  showProjectList: false,
  loading: false,
  error: null,

  setCurrentProject: (name) => {
    localStorage.setItem('mythpen-current-project', name || '')
    set({ currentProject: name, showProjectList: false })
  },

  toggleProjectList: () => set((s) => ({ showProjectList: !s.showProjectList })),
  showProjectListFn: () => set({ showProjectList: true }),
  hideProjectList: () => set({ showProjectList: false }),

  loadProjects: async () => {
    set({ loading: true, error: null })
    try {
      const projects = await projectsApi.list()
      // Restore last selected project
      const saved = localStorage.getItem('mythpen-current-project')
      const currentProject = projects.find((p) => p.name === saved) ? saved : projects[0]?.name || null
      set({ projects, currentProject, loading: false })
    } catch (err) {
      set({ error: err.message, loading: false })
    }
  },

  createProject: async (name, opts = {}) => {
    const { mode = 'medium-novel', language = 'zh', genres = ['sci-fi', 'romance'] } = opts
    set({ loading: true, error: null })
    try {
      // 1. Create the project
      await projectsApi.create({ name, mode, language, genres })

      // 2. Auto-create Chapter 1 so user can start writing immediately
      await chaptersApi.create(name, { title: '第一章' })

      // 3. Reload project list & set current
      await useProjectStore.getState().loadProjects()
      set({ currentProject: name, showProjectList: false, loading: false })

      // 4. Load chapters into sidebar & navigate to Writing page
      await useChapterStore.getState().loadChapters(name)
      useSidebarStore.getState().setActivePage('page-writing')
    } catch (err) {
      set({ error: (err as any).message || '创建失败', loading: false })
      throw err
    }
  },
}))
