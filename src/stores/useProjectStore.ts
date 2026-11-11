import { create } from 'zustand'
import { t } from '@/i18n'
import { track } from '@/lib/analytics'
import { ageDays, bucketCount, bucketWords } from '@/lib/analyticsBuckets'
import { chaptersApi, type ImportSseHandlers, projectsApi } from '@/lib/api'
import type { ImportResult, ImportSource } from '@/lib/import/types'
import { trackMilestone } from '@/lib/milestones'
import { captureError } from '@/lib/sentry'
import { useChapterStore } from '@/stores/useChapterStore'
import { useSidebarStore } from '@/stores/useSidebarStore'
import type { WorkflowPhase, WritingLanguage } from '@/types'

interface ProjectSummary {
  id: string
  name: string
  iconName: string
  genres: string[]
  styles?: string[]
  wordCount: number
  chapterCount: number
  lastOpened: string
  status: string
  mode?: string
  /** Opaque analytics id; never the project name. */
  analyticsId?: string
  createdAt?: string | null
  /** Absolute path for user-owned .mythpen documents; internal DB path otherwise. */
  filePath?: string
  isDocument?: boolean
  incompatible?: boolean
}

/** Fire project_opened at most once per project per app session. */
const openedProjects = new Set<string>()
function trackProjectOpened(project: ProjectSummary | undefined, source: 'restore' | 'select') {
  if (!project?.analyticsId || openedProjects.has(project.analyticsId)) return
  openedProjects.add(project.analyticsId)
  const age = ageDays(project.createdAt)
  track('project_opened', {
    project_key: project.analyticsId,
    mode: project.mode || 'unknown',
    chapters_bucket: bucketCount(project.chapterCount),
    words_bucket: bucketWords(project.wordCount),
    source,
    ...(age === undefined ? {} : { age_days: age }),
  })
}

interface ProjectState {
  currentProject: string | null
  projects: ProjectSummary[]
  showProjectList: boolean
  loading: boolean
  error: string | null
  workflowPhase: WorkflowPhase
  setCurrentProject: (name: string | null) => void
  /** Reload the list, select a project, load its chapters and open Writing. */
  activateProject: (name: string, phase: WorkflowPhase) => Promise<void>
  toggleProjectList: () => void
  showProjectListFn: () => void
  hideProjectList: () => void
  loadProjects: () => Promise<void>
  loadPhase: (project: string) => Promise<void>
  setPhase: (project: string, phase: WorkflowPhase) => Promise<void>
  createProject: (
    name: string,
    opts?: { mode?: string; language?: WritingLanguage; genres?: string[]; styles?: string[]; filePath?: string },
  ) => Promise<void>
  importProject: (
    name: string,
    opts: { mode?: string; language?: WritingLanguage; genres?: string[]; styles?: string[]; filePath?: string },
    source: ImportSource,
    handlers?: ImportSseHandlers,
    signal?: AbortSignal,
  ) => Promise<ImportResult | null>
  deleteProject: (name: string, deleteFile?: boolean) => Promise<void>
}

/** Shared post-create flow: refresh the list, select, load chapters, navigate. */
async function activateProject(name: string, phase: WorkflowPhase) {
  const store = useProjectStore.getState()
  await store.loadProjects()
  store.setCurrentProject(name)
  useProjectStore.setState({ loading: false, workflowPhase: phase })
  await useChapterStore.getState().loadChapters(name)
  useSidebarStore.getState().setActivePage('page-writing')
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  currentProject: null,
  projects: [],
  showProjectList: false,
  loading: false,
  error: null,
  workflowPhase: 'idea',

  setCurrentProject: (name) => {
    localStorage.setItem('mythpen-current-project', name || '')
    set({ currentProject: name, showProjectList: false })
    trackProjectOpened(
      get().projects.find((p) => p.name === name),
      'select',
    )
  },

  activateProject: (name, phase) => activateProject(name, phase),

  toggleProjectList: () => set((s) => ({ showProjectList: !s.showProjectList })),
  showProjectListFn: () => set({ showProjectList: true }),
  hideProjectList: () => set({ showProjectList: false }),

  loadProjects: async () => {
    set({ loading: true, error: null })
    try {
      const projects = await projectsApi.list()
      // Restore the last selected project. If a project was selected while this
      // request was in flight (e.g. the OS opened a .mythpen), keep it instead
      // of letting the stale response undo the selection.
      const saved = localStorage.getItem('mythpen-current-project')
      const inFlightSelection = get().currentProject
      const currentProject =
        inFlightSelection && projects.some((p: any) => p.name === inFlightSelection)
          ? inFlightSelection
          : projects.find((p: any) => p.name === saved)
            ? saved
            : projects[0]?.name || null
      // No projects → show the project list (new user / all deleted)
      const showProjectList = projects.length === 0
      set({ projects, currentProject, showProjectList, loading: false })
      trackProjectOpened(
        projects.find((p: ProjectSummary) => p.name === currentProject),
        'restore',
      )
      // Load phase for the current project
      if (currentProject) {
        const { phase } = await projectsApi.getPhase(currentProject)
        set({ workflowPhase: phase as WorkflowPhase })
      }
    } catch (err) {
      set({ error: (err as any).message, loading: false, showProjectList: true })
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
    const from = get().workflowPhase
    try {
      await projectsApi.setPhase(project, phase)
      set({ workflowPhase: phase })
      if (from !== phase) {
        const key = get().projects.find((p) => p.name === project)?.analyticsId
        track('project_phase_changed', { from, to: phase, ...(key ? { project_key: key } : {}) })
      }
    } catch {
      /* ignore */
    }
  },

  createProject: async (name, opts = {}) => {
    const { mode = 'medium-novel', language = 'zh', genres = ['sci-fi', 'romance'], styles = [], filePath } = opts
    set({ loading: true, error: null })
    try {
      // 1. Create the project (a .mythpen document when the desktop passed a path)
      const created = await projectsApi.create({ name, mode, language, genres, styles, filePath })
      const key = created?.analyticsId as string | undefined

      // 2. Auto-create Chapter 1 so user can start writing immediately
      await chaptersApi.create(name, { title: t('chapter.firstChapterTitle') })

      // 3. Reload project list, select it, load chapters & navigate to Writing
      await activateProject(name, 'idea')

      track('project_created', {
        mode,
        language,
        genres: genres.join(','),
        styles: styles.join(','),
        ...(key ? { project_key: key } : {}),
      })
      if (filePath) track('project_file_created', { mode })
      // The first chapter is created here, not through the chapter store, so
      // it needs its own event — otherwise the create → chapter funnel is wrong.
      track('chapter_created', { source: 'auto', ...(key ? { project_key: key } : {}) })
      trackMilestone('first_project', key)
      trackMilestone('first_chapter', key)
    } catch (err) {
      set({ error: (err as any).message || t('project.createFailed'), loading: false })
      throw err
    }
  },

  importProject: async (name, opts, source, handlers, signal) => {
    const { mode = 'medium-novel', language = 'zh', genres = ['sci-fi', 'romance'], styles = [], filePath } = opts
    const startedAt = Date.now()
    const sizeBucket = bucketWords(source.text?.length || 0)
    let lastStage = 'start'
    // Track the last pipeline stage so failures can be attributed to
    // structure/metadata/chapters/archive instead of just "import failed".
    const wrappedHandlers: ImportSseHandlers = {
      ...(handlers || {}),
      onStage: (payload) => {
        if (payload?.stage) lastStage = payload.stage
        handlers?.onStage?.(payload)
      },
    }
    set({ loading: true, error: null })
    track('import_started', { format: source.format, size_bucket: sizeBucket, mode })
    try {
      // The server analyzes the whole book and creates the project atomically.
      const result = await projectsApi.importWithAI(
        {
          name,
          mode,
          language,
          genres,
          styles,
          source: {
            fileName: source.fileName,
            format: source.format,
            title: source.title,
            author: source.author,
            description: source.description,
            language: source.language,
          },
          text: source.text,
          filePath,
        },
        wrappedHandlers,
        signal,
      )

      // loadChapters keeps the current chapter when possible; for a brand-new
      // import it falls back to the last chapter (the end of the source book).
      await activateProject(name, 'writing')

      const key = get().projects.find((p) => p.name === name)?.analyticsId
      track('project_imported', {
        format: source.format,
        volumes: result.volumes,
        chapters: result.chapters,
        words: result.wordCount,
        duration_ms: Date.now() - startedAt,
        ...(key ? { project_key: key } : {}),
      })
      trackMilestone('first_import', key)
      if (filePath) track('project_file_created', { mode, source: 'import' })
      return result as ImportResult
    } catch (err: any) {
      // A user-initiated cancel closes the SSE stream; no project was created.
      if (err?.name === 'AbortError') {
        track('import_canceled', {
          format: source.format,
          size_bucket: sizeBucket,
          stage: lastStage,
          duration_ms: Date.now() - startedAt,
        })
        set({ loading: false })
        return null
      }
      captureError(err, {
        area: 'project_import',
        format: source.format,
        stage: lastStage,
      })
      track('import_failed', {
        format: source.format,
        size_bucket: sizeBucket,
        stage: lastStage,
        duration_ms: Date.now() - startedAt,
        error_code: String(err?.code || (err?.name && err.name !== 'Error' ? err.name : 'import_error')),
      })
      set({
        error: err?.message || t('project.import.importFailed'),
        loading: false,
      })
      throw err
    }
  },

  deleteProject: async (name, deleteFile = false) => {
    set({ loading: true, error: null })
    try {
      await projectsApi.delete(name, deleteFile)
      await useProjectStore.getState().loadProjects()
      // If the deleted project was current, clear or pick another
      const state = useProjectStore.getState()
      if (state.currentProject === name) {
        const next = state.projects[0]?.name || null
        state.setCurrentProject(next)
      }
      set({ loading: false })
    } catch (err) {
      set({ error: (err as any).message || t('project.deleteFailed'), loading: false })
    }
  },
}))

export type { ProjectState, ProjectSummary }
