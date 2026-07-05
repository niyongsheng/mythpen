import { create } from 'zustand'
import { chaptersApi, projectsApi } from '@/lib/api'
import { useChapterStore } from '@/stores/useChapterStore'
import { useSidebarStore } from '@/stores/useSidebarStore'
import type { WorkflowPhase } from '@/types'

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
  workflowPhase: WorkflowPhase
  setCurrentProject: (name: string | null) => void
  toggleProjectList: () => void
  showProjectListFn: () => void
  hideProjectList: () => void
  loadProjects: () => Promise<void>
  loadPhase: (project: string) => Promise<void>
  setPhase: (project: string, phase: WorkflowPhase) => Promise<void>
  createProject: (name: string, opts?: { mode?: string; language?: string; genres?: string[] }) => Promise<void>
  deleteProject: (name: string) => Promise<void>
}

export const useProjectStore = create<ProjectState>((set) => ({
  currentProject: null,
  projects: [],
  showProjectList: false,
  loading: false,
  error: null,
  workflowPhase: 'idea',

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
      // Load phase for the current project
      if (currentProject) {
        const { phase } = await projectsApi.getPhase(currentProject)
        set({ workflowPhase: phase as WorkflowPhase })
      }
    } catch (err) {
      set({ error: (err as any).message, loading: false })
    }
  },

  loadPhase: async (project) => {
    try {
      const { phase } = await projectsApi.getPhase(project)
      set({ workflowPhase: phase as WorkflowPhase })
    } catch {
      /* ignore */
    }
  },

  setPhase: async (project, phase) => {
    try {
      await projectsApi.setPhase(project, phase)
      set({ workflowPhase: phase })
    } catch {
      /* ignore */
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
      set({ currentProject: name, showProjectList: false, loading: false, workflowPhase: 'idea' })

      // 4. Load chapters into sidebar & navigate to Writing page
      await useChapterStore.getState().loadChapters(name)
      useSidebarStore.getState().setActivePage('page-writing')
    } catch (err) {
      set({ error: (err as any).message || '创建失败', loading: false })
      throw err
    }
  },

  deleteProject: async (name) => {
    set({ loading: true, error: null })
    try {
      await projectsApi.delete(name)
      await useProjectStore.getState().loadProjects()
      // If the deleted project was current, clear or pick another
      const state = useProjectStore.getState()
      if (state.currentProject === name) {
        const next = state.projects[0]?.name || null
        state.setCurrentProject(next)
      }
      set({ loading: false })
    } catch (err) {
      set({ error: (err as any).message || '删除失败', loading: false })
    }
  },
}))

export { type ProjectSummary, type ProjectState }
