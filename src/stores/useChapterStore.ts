import { create } from 'zustand'
import { t } from '@/i18n'
import { track } from '@/lib/analytics'
import { chaptersApi, statsApi, volumesApi } from '@/lib/api'
import { useProjectStore } from '@/stores/useProjectStore'

interface Chapter {
  id: number
  volumeId: number
  num: number
  title: string
  outline: string
  content: string
  wordCount: number
  status: string
  cognitiveFrame?: string
  emotionalAnchor?: string
  worldTexture?: string
  concreteMystery?: string
  interpersonalTension?: string
}

interface Volume {
  id: number
  sortOrder: number
  title: string
  chapters: Chapter[]
}

interface ChapterState {
  volumes: Volume[]
  currentChapter: Chapter | null
  loading: boolean
  projectName: string | null
  saveStatus: 'saved' | 'saving' | 'unsaved'
  setSaveStatus: (status: 'saved' | 'saving' | 'unsaved') => void
  setCurrentChapter: (ch: Chapter | null) => void
  loadChapters: (project: string) => Promise<void>
  loadChapterContent: (project: string, num: number, volumeId?: number) => Promise<void>
  updateChapter: (project: string, num: number, data: Partial<Chapter>) => Promise<void>
  createChapter: (project: string, title?: string, outline?: string, volumeId?: number) => Promise<any>
}

const EMPTY_VOLUMES: Volume[] = []

export const useChapterStore = create<ChapterState>((set, get) => ({
  volumes: EMPTY_VOLUMES,
  currentChapter: null,
  loading: false,
  projectName: null,
  saveStatus: 'saved',

  setSaveStatus: (status) => set({ saveStatus: status }),

  setCurrentChapter: (ch) => set({ currentChapter: ch }),

  loadChapters: async (project) => {
    set({ loading: true })
    try {
      // Slim response: chapter bodies are fetched separately for the selected
      // chapter, so large imported books don't transfer the whole text each load.
      const vols = await volumesApi.list(project, true)

      // Guard: discard response if project has switched since the request was made
      const currentProj = useProjectStore.getState().currentProject
      if (currentProj !== project) {
        set({ loading: false })
        return
      }

      const volumes: Volume[] = vols.map((v: any) => ({
        id: v.id,
        sortOrder: v.sort_order,
        title: v.title,
        chapters: (v.chapters || []).map((c: any) => ({
          id: c.id,
          volumeId: c.volume_id,
          num: c.num,
          title: c.title,
          outline: c.outline || '',
          content: c.content || '',
          wordCount: c.word_count || 0,
          status: c.status,
          cognitiveFrame: c.cognitive_frame || '',
          emotionalAnchor: c.emotional_anchor || '',
          worldTexture: c.world_texture || '',
          concreteMystery: c.concrete_mystery || '',
          interpersonalTension: c.interpersonal_tension || '',
        })),
      }))

      const allChapters = volumes.flatMap((v) => v.chapters)
      const state = get()
      let currentChapter: Chapter | null = null

      // Keep the chapter the user is currently on across refreshes (AI tool
      // calls, status updates, etc.), as long as it still exists.
      if (state.projectName === project && state.currentChapter) {
        currentChapter = allChapters.find((c) => c.id === state.currentChapter?.id) || null
      }
      if (!currentChapter) {
        currentChapter =
          allChapters.find((c) => c.status === 'writing' || c.status === 'pending') ||
          allChapters[allChapters.length - 1] ||
          null
      }

      // Fetch the selected chapter's body (slim volumes omit content) before
      // publishing the state, so the editor never briefly renders empty/old
      // content during a project switch.
      let loadedChapter = currentChapter
      if (currentChapter) {
        try {
          const full = await chaptersApi.get(project, currentChapter.num, currentChapter.volumeId)
          if (full) {
            loadedChapter = {
              ...currentChapter,
              content: full.content || '',
              outline: full.outline || currentChapter.outline,
              wordCount: full.word_count || currentChapter.wordCount,
              status: full.status || currentChapter.status,
            }
          }
        } catch {
          /* keep the slim chapter if the body request fails */
        }
      }

      // Discard if the project switched while the body was loading.
      if (useProjectStore.getState().currentProject !== project) {
        set({ loading: false })
        return
      }

      set({ volumes, currentChapter: loadedChapter, loading: false, projectName: project })
    } catch (err) {
      console.error('Failed to load chapters:', err)
      set({ loading: false })
    }
  },

  loadChapterContent: async (project, num, volumeId) => {
    try {
      const ch = await chaptersApi.get(project, num, volumeId)
      if (ch) {
        set((s) => {
          const chapter = {
            id: ch.id,
            volumeId: ch.volume_id,
            num: ch.num,
            title: ch.title,
            outline: ch.outline || '',
            content: ch.content || '',
            wordCount: ch.word_count || 0,
            status: ch.status,
            cognitiveFrame: ch.cognitive_frame || '',
            emotionalAnchor: ch.emotional_anchor || '',
            worldTexture: ch.world_texture || '',
            concreteMystery: ch.concrete_mystery || '',
            interpersonalTension: ch.interpersonal_tension || '',
          }
          return { currentChapter: chapter }
        })
      }
    } catch (err) {
      console.error('Failed to load chapter content:', err)
    }
  },

  updateChapter: async (project, num, data) => {
    try {
      const apiData: any = {}
      if (data.title !== undefined) apiData.title = data.title
      if (data.content !== undefined) apiData.content = data.content
      if (data.outline !== undefined) apiData.outline = data.outline
      if (data.status !== undefined) apiData.status = data.status
      if (data.cognitiveFrame !== undefined) apiData.cognitive_frame = data.cognitiveFrame
      if (data.emotionalAnchor !== undefined) apiData.emotional_anchor = data.emotionalAnchor
      if (data.worldTexture !== undefined) apiData.world_texture = data.worldTexture
      if (data.concreteMystery !== undefined) apiData.concrete_mystery = data.concreteMystery
      if (data.interpersonalTension !== undefined) apiData.interpersonal_tension = data.interpersonalTension

      await chaptersApi.update(project, num, apiData)
      // Only reload if user is still on this chapter (avoid overwriting after sidebar nav)
      const currentAfterSave = useChapterStore.getState().currentChapter
      if (currentAfterSave?.num === num) {
        await useChapterStore.getState().loadChapterContent(project, num, currentAfterSave.volumeId)
      }
    } catch (err) {
      console.error('Failed to update chapter:', err)
    }
  },

  createChapter: async (project, title = t('chapter.defaultTitle'), outline = '', volumeId?: number) => {
    try {
      const created = await chaptersApi.create(project, { title, outline, volume_id: volumeId })
      track('chapter_created')
      // Reload chapters to include the new one
      await useChapterStore.getState().loadChapters(project)
      // Set the newly created chapter as current
      set((s) => {
        const ch = s.volumes.flatMap((v) => v.chapters).find((c) => c.num === created.num) || null
        return { currentChapter: ch }
      })
      return created
    } catch (err) {
      console.error('Failed to create chapter:', err)
      throw err
    }
  },
}))
