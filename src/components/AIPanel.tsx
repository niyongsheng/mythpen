import { Gamepad2, Joystick, Lightbulb, MessageSquare, Plus, SendHorizonal, ShieldCheck, Square, X } from 'lucide-react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { MarkdownContent } from '@/components/MarkdownContent'
import { SessionSelect } from '@/components/SessionSelect'
import { ToastContainer } from '@/components/ToastContainer'
import { useMountTransition } from '@/hooks/useMountTransition'
import { useT } from '@/hooks/useT'
import { useToast } from '@/hooks/useToast'
import { getSessionTitlePlaceholders } from '@/i18n'
import { aiErrorCode, aiRuntimeProps, aiToolNames } from '@/lib/aiAnalytics'
import { track } from '@/lib/analytics'
import { aiApi, chatApi } from '@/lib/api'
import { type EntityType, notifyDataChanged } from '@/lib/dataEvents'
import { trackMilestone } from '@/lib/milestones'
import { bucketCount, projectKey, projectProps } from '@/lib/projectIdentity'
import { captureError } from '@/lib/sentry'
import { playAiCompletionSound, primeCompletionSound } from '@/lib/sound'
import { useProjectName } from '@/lib/useProjectData'
import { useAgentStore } from '@/stores/useAgentStore'
import { useChapterStore } from '@/stores/useChapterStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUIStore } from '@/stores/useUIStore'

// Per-run bookkeeping that must survive project switches. Runs themselves live
// in the agent store, keyed by project + session.
const EMPTY_TOOL_CALLS: any[] = []
const abortControllers = new Map<string, AbortController>()
const runModifiedEntities = new Map<string, Set<EntityType>>()
const runPendingEntities = new Map<string, Set<EntityType>>()
const runRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>()
// Timing for analytics lives outside the store: it is only needed by the
// handlers that finish (or fail) a run.
const runMetrics = new Map<string, { startedAt: number; firstTokenAt?: number }>()
const runKey = (project: string, sessionId: string) => `${project}\u0000${sessionId}`

// Collab runs create entities over many rounds. Flush page refreshes while the
// run is still streaming instead of waiting for it to finish.
const PROGRESSIVE_REFRESH_MS = 1000
// Chapter/foreshadow stay on the end-of-run refresh: the sidebar tree is fed
// by the chapter store, and Consistency re-runs its local check on these.
const PROGRESSIVE_SKIP = new Set<EntityType>(['chapter', 'foreshadow'])

/** Queue a throttled page refresh for entities a tool run just touched. */
function queueProgressiveRefresh(key: string, project: string, entities?: EntityType[]): void {
  const fresh = (entities || []).filter((entity) => !PROGRESSIVE_SKIP.has(entity))
  if (fresh.length === 0) return

  let pending = runPendingEntities.get(key)
  if (!pending) runPendingEntities.set(key, (pending = new Set()))
  for (const entity of fresh) pending.add(entity)
  if (runRefreshTimers.has(key)) return

  runRefreshTimers.set(
    key,
    setTimeout(() => {
      runRefreshTimers.delete(key)
      const batch = runPendingEntities.get(key)
      runPendingEntities.delete(key)
      if (!batch?.size || useProjectStore.getState().currentProject !== project) return
      for (const entity of batch) notifyDataChanged(entity)
    }, PROGRESSIVE_REFRESH_MS),
  )
}

/** Drop a run's pending progressive refreshes. */
function clearRunRefresh(key: string): void {
  const timer = runRefreshTimers.get(key)
  if (timer) clearTimeout(timer)
  runRefreshTimers.delete(key)
  runPendingEntities.delete(key)
}

/** Tool name → entity type, for entity_created on successful collab writes. */
const AI_CREATE_ENTITIES: Record<string, string> = {
  create_character: 'character',
  create_world_entry: 'world',
  create_foreshadow: 'foreshadow',
  create_payoff: 'payoff',
  create_relation: 'relation',
  create_memory: 'memory',
  create_timeline_event: 'timeline',
  create_volume: 'volume',
  create_science_entry: 'science',
  create_clue: 'clue',
}

// Chapter fields shown in the sidebar/outline tree. An update_chapter call
// that only writes prose does not need the full tree reloaded.
const TREE_CHAPTER_FIELDS = new Set([
  'title',
  'status',
  'outline',
  'summary',
  'cognitive_frame',
  'emotional_anchor',
  'world_texture',
  'concrete_mystery',
  'interpersonal_tension',
  'genre_beat',
])

/**
 * Whether a run changed the data behind the sidebar/outline tree. The server
 * marks tree-affecting tools with `chapterTree` on every tool event.
 */
function hasChapterTreeChange(toolCalls: any[]): boolean {
  return toolCalls.some((tc) => {
    if (!tc.chapterTree) return false
    // update_chapter is also used for prose-only writes; only fields shown in
    // the tree need the full reload.
    if (tc.name !== 'update_chapter') return true
    const changed = tc.result?.changed_fields
    // Missing results mean the run was cut short; reload conservatively.
    if (!Array.isArray(changed)) return true
    return changed.some((field: string) => TREE_CHAPTER_FIELDS.has(field))
  })
}

/** Collect the entities a run touched and clear its pending set. */
function takeModifiedEntities(key: string): Set<EntityType> {
  clearRunRefresh(key)
  const modified = new Set<EntityType>(runModifiedEntities.get(key) || [])
  runModifiedEntities.delete(key)
  return modified
}

/** Notify pages and reload stores affected by a finished/cancelled run. */
function refreshAfterRun(
  project: string,
  modified: Set<EntityType>,
  toolCalls: any[],
  {
    collab = false,
    chapter = null,
    force = false,
  }: {
    collab?: boolean
    chapter?: { num?: number; volumeId?: number } | null
    force?: boolean
  } = {},
): void {
  if (!force && modified.size === 0) return
  if (useProjectStore.getState().currentProject !== project) return

  for (const entity of modified) notifyDataChanged(entity)
  // The stats endpoint aggregates every entity, so any change invalidates it.
  if (modified.size > 0) notifyDataChanged('stats')

  if (collab || hasChapterTreeChange(toolCalls)) {
    // Reload the sidebar/outline tree (and the selected chapter's body).
    void useChapterStore.getState().loadChapters(project)
    void useProjectStore.getState().loadProjects()
  } else if (chapter?.num) {
    void useChapterStore.getState().loadChapterContent(project, chapter.num, chapter.volumeId)
  }
}

function AIPanelContent() {
  const {
    messages,
    loading,
    sessions,
    currentSessionId,
    runs,
    addMessage,
    loadSessions,
    createSession,
    switchSession,
    deleteSession,
    updateSessionTitle,
    startRun,
    updateRun,
    finishRun,
  } = useAgentStore()
  const currentChapter = useChapterStore((s) => s.currentChapter)
  const project = useProjectName()
  const [input, setInput] = useState('')
  const [showConsistency, setShowConsistency] = useState(() => !localStorage.getItem('mythpen-hide-consistency'))
  const msgEndRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const msgIdCounter = useRef(0)
  const sessionsLoadedRef = useRef(false)
  const resizingRef = useRef(false)
  const setRightPanelWidth = useUIStore((s) => s.setRightPanelWidth)
  const setRightPanelResizing = useUIStore((s) => s.setRightPanelResizing)
  const [mode, setMode] = useState<'writing' | 'collab'>('collab')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { toasts, show: showToast, dismiss: dismissToast } = useToast()
  const { t } = useT()

  // Only the run belonging to the visible project + session is rendered.
  const activeRun = project && currentSessionId ? runs[project]?.[currentSessionId] : undefined
  const isRunning = activeRun?.status === 'running'
  const streamText = activeRun?.streamText ?? ''
  const toolCalls = activeRun?.toolCalls ?? EMPTY_TOOL_CALLS

  // Drop pending progressive-refresh timers when the panel unmounts.
  useEffect(
    () => () => {
      for (const timer of runRefreshTimers.values()) clearTimeout(timer)
      runRefreshTimers.clear()
      runPendingEntities.clear()
    },
    [],
  )

  // Resize handle drag logic
  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      resizingRef.current = true
      setRightPanelResizing(true)
      const startX = e.clientX
      const startWidth =
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--right-panel-w')) || 320

      const handleMouseMove = (ev: MouseEvent) => {
        if (!resizingRef.current) return
        const delta = startX - ev.clientX // drag left = widen, drag right = narrow
        const newWidth = startWidth + delta
        setRightPanelWidth(newWidth)
      }

      const handleMouseUp = () => {
        resizingRef.current = false
        setRightPanelResizing(false)
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    },
    [setRightPanelWidth, setRightPanelResizing],
  )

  // Generate AI title for a new session based on first exchange
  const generateAITitle = useCallback(
    async (userMsg: string, aiResponse?: string) => {
      if (!project || !currentSessionId) return
      // Only generate if current title is still a timestamp placeholder
      const currentSession = sessions.find((s: any) => s.id === currentSessionId)
      if (!currentSession) return
      const isPlaceholder = getSessionTitlePlaceholders().some((prefix) => currentSession.title?.startsWith(prefix))
      if (!isPlaceholder) return

      try {
        const userLabel = t('ai.contextUser')
        const aiLabel = t('ai.contextAI')
        const context = aiResponse ? `${userLabel}: ${userMsg}\n${aiLabel}: ${aiResponse}` : `${userLabel}: ${userMsg}`
        const prompt = t('ai.titleGenPrompt', { context })
        const res = await aiApi.chat([{ role: 'user', content: prompt }], project)
        const title = (res.choices?.[0]?.message?.content || '').trim().replace(/["""「」]/g, '')
        if (title && title.length <= 20) {
          await updateSessionTitle(project, currentSessionId, title)
        }
      } catch {
        // Silently fail — timestamp title stays as fallback
      }
    },
    [project, currentSessionId, sessions, updateSessionTitle],
  )

  // Unique message ID generator
  const nextMsgId = () => `${Date.now()}-${++msgIdCounter.current}`

  // Helper: save message scoped to current session
  const saveMsg = (data: { role: 'user' | 'ai' | 'system'; content: string }) => {
    if (!currentSessionId) {
      console.warn('[AIPanel] No session to save message to')
      return Promise.resolve()
    }
    return chatApi
      .save(project!, { ...data, session_id: currentSessionId })
      .catch((e) => console.warn('[AIPanel] Failed to save message:', e))
  }

  // Auto-scroll to bottom when messages or stream text changes
  useEffect(() => {
    if (msgEndRef.current && scrollContainerRef.current) {
      // Use direct scrollTop for reliable scrolling (scrollIntoView can fail in nested scroll contexts)
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [messages, streamText, toolCalls])

  // Load sessions and messages when project changes, auto-create session if none exists
  useEffect(() => {
    sessionsLoadedRef.current = false
    // Reset only the visible view — runs belonging to other projects/sessions
    // keep streaming in the background and stay in `runs`.
    useAgentStore.setState({ currentSessionId: null, messages: [], sessions: [], loading: false })

    if (!project) return
    loadSessions(project).then(() => {
      // Guard: ignore stale completions — captured project must match the current real project
      const currentProject = useProjectStore.getState().currentProject
      if (project !== currentProject) return
      sessionsLoadedRef.current = true
      const state = useAgentStore.getState()
      if (state.sessions.length === 0) {
        // No sessions exist — create one
        const now = new Date()
        const ts = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
        void createSession(currentProject, t('ai.newSessionTemplate', { ts }))
      } else if (state.messages.length === 0) {
        // Session already selected (by loadSessions) — load messages
        useAgentStore.getState().loadMessages(project)
      }
    })
  }, [project])

  // Tool type detection for colored indicators
  const getToolType = (name: string): 'read' | 'create' | 'update' | 'delete' => {
    if (name.startsWith('list_') || name.startsWith('get_')) return 'read'
    if (name.startsWith('create_')) return 'create'
    if (name.startsWith('update_')) return 'update'
    if (name.startsWith('delete_')) return 'delete'
    return 'read'
  }
  const toolTypeColor: Record<string, string> = {
    read: 'var(--info)',
    create: 'var(--success)',
    update: 'var(--warning)',
    delete: 'var(--error)',
  }

  // Format tool arguments for compact display
  const formatToolArgs = (args: any) => {
    if (!args || Object.keys(args).length === 0) return t('ai.noParams')
    const entries = Object.entries(args).slice(0, 2)
    return entries
      .map(
        ([k, v]) => `${k}=${typeof v === 'string' ? (v.length > 20 ? v.slice(0, 20) + '...' : v) : JSON.stringify(v)}`,
      )
      .join(', ')
  }

  const stopTask = () => {
    if (!project || !currentSessionId) return
    const key = runKey(project, currentSessionId)
    const run = useAgentStore.getState().runs[project]?.[currentSessionId]
    if (!run) return
    const metrics = runMetrics.get(key)
    runMetrics.delete(key)
    const tools = aiToolNames(run.toolCalls)
    track('ai_run_finished', {
      mode: mode === 'collab' ? 'collab' : 'writing',
      ok: 0,
      canceled: 1,
      duration_ms: metrics ? Date.now() - metrics.startedAt : 0,
      ...(metrics?.firstTokenAt ? { first_token_ms: metrics.firstTokenAt - metrics.startedAt } : {}),
      tool_calls: run.toolCalls.length,
      ...(tools ? { tools } : {}),
      partial_bucket: bucketCount(run.streamText.length),
      error_code: 'user_canceled',
      ...aiRuntimeProps(),
      ...projectProps(project),
    })
    abortControllers.get(key)?.abort()
    abortControllers.delete(key)
    const modified = takeModifiedEntities(key)
    finishRun(project, currentSessionId)

    // Stopping keeps the partial answer instead of discarding what the model
    // already produced.
    const partial = run.streamText.trim()
    if (partial) {
      const aiMsg = {
        role: 'ai' as const,
        content: partial,
        toolCalls: run.toolCalls.length > 0 ? run.toolCalls : undefined,
      }
      addMessage({ id: nextMsgId(), ...aiMsg })
      saveMsg(aiMsg).catch(() => {})
    }

    refreshAfterRun(project, modified, run.toolCalls, {
      collab: mode === 'collab',
      chapter: useChapterStore.getState().currentChapter,
    })

    showToast(t('ai.stopped'), 'info')
  }

  const handleSend = () => {
    if (!project || !currentSessionId || loading || !input.trim()) return
    // A run belongs to the session it was started from — don't start a second
    // one there, but don't block sends in other projects/sessions either.
    if (useAgentStore.getState().runs[project]?.[currentSessionId]?.status === 'running') return

    const runProject = project
    const runSessionId = currentSessionId
    const key = runKey(runProject, runSessionId)
    const userMsg = input.trim()
    const isChat = mode === 'collab'
    // Unlock audio while we still have the send gesture; the cue plays later.
    primeCompletionSound()
    track('ai_message_sent', { mode: isChat ? 'collab' : 'writing', ...projectProps(runProject) })
    runMetrics.set(key, { startedAt: Date.now() })
    startRun(runProject, runSessionId, isChat ? t('ai.taskCollab') : t('ai.taskContinue'))
    runModifiedEntities.set(key, new Set())

    addMessage({ id: nextMsgId(), role: 'user', content: userMsg })
    saveMsg({ role: 'user', content: userMsg }).catch(() => {})
    setInput('')
    // Force DOM clear — React 19 batch 处理后 onInput 事件可能恢复旧值
    const el = document.getElementById('ai-chat-input') as HTMLTextAreaElement | null
    if (el) el.value = ''

    const ch = currentChapter

    // Build chat history from stored messages.
    const chatHistory: any[] = messages.map((msg) => ({
      role: msg.role === 'ai' ? 'assistant' : (msg.role as 'user' | 'system'),
      content: msg.content,
    }))

    const context = isChat
      ? t('ai.collabPrompt', { project: runProject, num: ch?.num ?? 0, title: ch?.title ?? '', userMsg })
      : t('ai.writingPrompt', { project: runProject, num: ch?.num ?? 0, title: ch?.title ?? '', userMsg })

    const isRunVisible = () =>
      useProjectStore.getState().currentProject === runProject &&
      useAgentStore.getState().currentSessionId === runSessionId

    const controller = aiApi.chatStream(
      [...chatHistory, { role: 'user', content: context }],
      runProject,
      // onChunk
      (text: string) => {
        const run = useAgentStore.getState().runs[runProject]?.[runSessionId]
        if (!run) return // stopped
        const metrics = runMetrics.get(key)
        if (metrics && !metrics.firstTokenAt) metrics.firstTokenAt = Date.now()
        updateRun(runProject, runSessionId, {
          streamText: run.streamText + text,
          genTokens: run.genTokens + 1,
        })
      },
      // onComplete
      async (endData?: any) => {
        const run = useAgentStore.getState().runs[runProject]?.[runSessionId]
        if (!run) return // stopped
        playAiCompletionSound()
        const fullText = run.streamText
        const runToolCalls = run.toolCalls
        const metrics = runMetrics.get(key)
        runMetrics.delete(key)
        const tools = aiToolNames(runToolCalls)
        track('ai_run_finished', {
          mode: isChat ? 'collab' : 'writing',
          ok: 1,
          canceled: 0,
          duration_ms: metrics ? Date.now() - metrics.startedAt : 0,
          ...(metrics?.firstTokenAt ? { first_token_ms: metrics.firstTokenAt - metrics.startedAt } : {}),
          tokens_in: Number(endData?.inputTokens ?? endData?.usage?.prompt_tokens) || 0,
          tokens_out: Number(endData?.outputTokens ?? endData?.usage?.completion_tokens) || 0,
          tool_calls: runToolCalls.length,
          ...(tools ? { tools } : {}),
          ...aiRuntimeProps(),
          ...projectProps(runProject),
        })
        trackMilestone('first_ai', projectKey(runProject))
        const defaultMsg = isChat ? t('ai.dialogComplete') : t('ai.execComplete')
        const aiMsg = {
          role: 'ai' as const,
          content: fullText || defaultMsg,
          toolCalls: runToolCalls.length > 0 ? runToolCalls : undefined,
        }
        const visible = isRunVisible()
        if (visible) addMessage({ id: nextMsgId(), ...aiMsg })
        // Persist to the session this run started from, even if the user has
        // switched to another project in the meantime.
        await saveMsg(aiMsg).catch(() => {})

        const hadToolCalls = runToolCalls.length > 0
        const modified = takeModifiedEntities(key)
        abortControllers.delete(key)
        finishRun(runProject, runSessionId)

        if (visible && fullText) {
          showToast(t('ai.responseComplete'), 'success')
        }
        generateAITitle(userMsg, fullText || undefined)

        // Only touch visible project data when that project is still on
        // screen; switching back reloads chapters and data anyway.
        refreshAfterRun(runProject, modified, runToolCalls, {
          collab: isChat,
          chapter: ch,
          force: hadToolCalls,
        })
      },
      // onError
      (err: any) => {
        const run = useAgentStore.getState().runs[runProject]?.[runSessionId]
        if (!run) return // stopped
        const metrics = runMetrics.get(key)
        runMetrics.delete(key)
        const tools = aiToolNames(run.toolCalls)
        track('ai_run_finished', {
          mode: isChat ? 'collab' : 'writing',
          ok: 0,
          canceled: 0,
          duration_ms: metrics ? Date.now() - metrics.startedAt : 0,
          ...(metrics?.firstTokenAt ? { first_token_ms: metrics.firstTokenAt - metrics.startedAt } : {}),
          tool_calls: run.toolCalls.length,
          ...(tools ? { tools } : {}),
          error_code: aiErrorCode(err),
          ...aiRuntimeProps(),
          ...projectProps(runProject),
        })
        const visible = isRunVisible()
        captureError(err, {
          area: 'ai_chat',
          mode: isChat ? 'collab' : 'writing',
        })
        const errMsg = { role: 'ai' as const, content: t('ai.errorPrefix', { msg: err.error || err }) }
        if (visible) {
          if (!isChat) showToast(t('ai.chatError'), 'error')
          addMessage({ id: nextMsgId(), ...errMsg })
        }
        saveMsg(errMsg).catch(() => {})

        // The run may have written data before failing; refresh those pages
        // instead of leaving them stale until a manual refresh.
        const modified = takeModifiedEntities(key)
        abortControllers.delete(key)
        finishRun(runProject, runSessionId)
        refreshAfterRun(runProject, modified, run.toolCalls)
      },
      mode,
      (tc: any) => {
        const run = useAgentStore.getState().runs[runProject]?.[runSessionId]
        if (!run) return
        // Record entities from the call event too, so a run stopped before the
        // result arrives still refreshes the pages the tool touched.
        for (const entity of tc.entities || []) {
          runModifiedEntities.get(key)?.add(entity as EntityType)
        }
        updateRun(runProject, runSessionId, {
          toolCalls: [...run.toolCalls, { ...tc, status: 'running' }],
        })
      },
      (tr: any) => {
        for (const entity of tr.entities || []) {
          runModifiedEntities.get(key)?.add(entity as EntityType)
        }
        const run = useAgentStore.getState().runs[runProject]?.[runSessionId]
        if (!run) return
        if (!tr.result?.error) {
          queueProgressiveRefresh(key, runProject, tr.entities)
          if (tr.name === 'create_chapter') {
            track('chapter_created', { source: 'ai_collab', ...projectProps(runProject) })
            trackMilestone('first_chapter', projectKey(runProject))
          } else if (AI_CREATE_ENTITIES[tr.name]) {
            track('entity_created', {
              entity_type: AI_CREATE_ENTITIES[tr.name],
              source: 'ai_collab',
              ...projectProps(runProject),
            })
          }
        }
        updateRun(runProject, runSessionId, {
          toolCalls: run.toolCalls.map((tc) => (tc.id === tr.id ? { ...tc, result: tr.result, status: 'done' } : tc)),
        })
      },
    )
    abortControllers.set(key, controller)
  }

  // Status/error summaries are rendered without a card background. The
  // prefixes cover the localized defaults plus legacy Chinese summaries.
  const mutedMessagePrefixes = [
    t('ai.errorPrefix', { msg: '' }),
    t('ai.execComplete'),
    t('ai.dialogComplete'),
    '完成',
    '错误',
  ]

  return (
    <aside className="w-full h-full bg-[var(--canvas-soft)] border-l border-[var(--hairline)] flex flex-col min-h-0 relative">
      {/* Resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[4px] cursor-col-resize z-10 transition-colors hover:bg-[var(--accent-gold)] active:bg-[var(--accent-gold)]"
        onMouseDown={handleResizeMouseDown}
      />
      {/* Fixed header area */}
      <div className="shrink-0 px-4 pt-4 pb-2">
        {/* Header */}
        <div className="pb-3">
          <div className="flex items-center gap-1.5">
            <MessageSquare className="w-4 h-4" />
            <h3 className="text-[11px] font-medium text-[var(--ink-mute)] tracking-[0.06em] uppercase font-sans">
              {t('ai.assistant')}
            </h3>
            <span className="ml-auto inline-flex items-center gap-1.5 px-2 py-[2px] rounded-full bg-[var(--canvas-card)] border border-[var(--hairline)] text-[10px]">
              <span
                className={`w-[7px] h-[7px] rounded-full shrink-0 inline-block ${
                  isRunning ? 'bg-[var(--warning)] animate-pulse' : 'bg-[var(--success)]'
                }`}
                style={
                  isRunning
                    ? { boxShadow: '0 0 0 2px rgba(212,160,64,0.2)' }
                    : { boxShadow: '0 0 0 2px rgba(76,175,125,0.2)' }
                }
              />
              {isRunning ? t('ai.generating') : project || t('ai.idle')}
            </span>
          </div>
          {/* Mode toggle — sliding highlight instead of swapping backgrounds */}
          <div className="relative flex mt-2 bg-[var(--canvas-card)] rounded-[var(--radius-sm)] p-[2px] border border-[var(--hairline)]">
            <span
              aria-hidden="true"
              className={`absolute top-[2px] bottom-[2px] left-[2px] w-[calc(50%-2px)] rounded-[4px] bg-[var(--accent-gold)] transition-transform duration-200 ease-out motion-reduce:transition-none ${
                mode === 'writing' ? 'translate-x-full' : 'translate-x-0'
              }`}
            />
            <button
              type="button"
              aria-pressed={mode === 'collab'}
              className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 h-[26px] rounded-[4px] text-[12px] font-medium transition-colors cursor-pointer border-none bg-transparent ${
                mode === 'collab' ? 'text-[var(--canvas)]' : 'text-[var(--ink-tertiary)] hover:text-[var(--ink)]'
              }`}
              onClick={() => setMode('collab')}
            >
              <Joystick className="w-4 h-4" aria-hidden="true" />
              {t('ai.modeCollab')}
            </button>
            <button
              type="button"
              aria-pressed={mode === 'writing'}
              className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 h-[26px] rounded-[4px] text-[12px] font-medium transition-colors cursor-pointer border-none bg-transparent ${
                mode === 'writing' ? 'text-[var(--canvas)]' : 'text-[var(--ink-tertiary)] hover:text-[var(--ink)]'
              }`}
              onClick={() => setMode('writing')}
            >
              <Gamepad2 className="w-4 h-4" aria-hidden="true" />
              {t('ai.modeWriting')}
            </button>
          </div>
        </div>

        {/* Session selector */}
        <div className="flex items-center gap-1.5">
          <SessionSelect
            sessions={sessions}
            currentSessionId={currentSessionId}
            onSelect={(sessionId) => switchSession(project, sessionId)}
          />
          <button
            className="w-7 h-7 flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--hairline)] bg-[var(--canvas-elevated)] text-[var(--ink-tertiary)] cursor-pointer hover:text-[var(--ink)] hover:bg-[var(--canvas-mid)] transition-colors shrink-0"
            onClick={() => {
              const now = new Date()
              const ts = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
              void createSession(project, t('ai.newSessionTemplate', { ts }))
            }}
            title={t('ai.newSession')}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          {currentSessionId && sessions.length > 1 && (
            <button
              className="w-7 h-7 flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--hairline)] bg-[var(--canvas-elevated)] text-[var(--ink-tertiary)] cursor-pointer hover:text-[var(--error)] hover:bg-[var(--error-soft)] hover:border-[var(--error)] transition-colors shrink-0"
              onClick={() => setConfirmDelete(true)}
              title={t('ai.deleteSession')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable messages area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
        {/* Consistency report */}
        {showConsistency && (
          <div
            className="mx-4 mb-2.5 p-3 bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg border-l-[3px]"
            style={{ borderLeftColor: 'var(--warning)' }}
          >
            <div className="text-[12px] font-medium text-[var(--ink)] mb-2 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 inline-block mr-1" />
              {t('ai.consistencyActive')}
              <button
                className="ml-auto text-[10px] text-[var(--ink-mute)] cursor-pointer bg-none border-none hover:text-[var(--ink)]"
                onClick={() => {
                  setShowConsistency(false)
                  localStorage.setItem('mythpen-hide-consistency', '1')
                }}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="text-[11px] text-[var(--ink-secondary)]">{t('ai.autoSaveDesc')}</div>
          </div>
        )}

        {/* Messages */}
        <div className="px-4">
          {messages.length === 0 && !streamText && (
            <div className="text-[13px] text-[var(--ink-tertiary)] leading-[1.6] mb-2 p-3 rounded-lg bg-[var(--canvas-card)]">
              <Lightbulb className="w-3.5 h-3.5 inline-block mr-1" />
              {t('ai.welcomeMessage')}
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id}>
              {msg.role === 'user' && (
                <div className="mb-2 flex justify-end">
                  <div className="max-w-[85%] p-2.5 rounded-lg text-[13px] leading-[1.6] bg-[var(--canvas-elevated)] text-[var(--ink)]">
                    <MarkdownContent content={msg.content} />
                  </div>
                </div>
              )}
              {msg.role === 'ai' && msg.content && (
                <div
                  className={`p-2.5 rounded-lg text-[13px] leading-[1.6] mb-2 ${mutedMessagePrefixes.some((prefix) => prefix && msg.content.startsWith(prefix)) ? 'text-[var(--ink-secondary)]' : 'bg-[var(--canvas-card)] text-[var(--ink-secondary)]'}`}
                >
                  {/* Inline tool calls */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="mb-1.5 space-y-[2px]">
                      {msg.toolCalls.map((tc: any) => (
                        <div
                          key={tc.id}
                          className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] bg-[var(--canvas-mid)]"
                        >
                          <span
                            className="w-[5px] h-[5px] rounded-full shrink-0"
                            style={{ background: toolTypeColor[getToolType(tc.name)] || 'var(--info)' }}
                          />
                          <span className="font-medium text-[var(--ink)]">{tc.name}</span>
                          <span className="text-[var(--ink-tertiary)] truncate">{formatToolArgs(tc.arguments)}</span>
                          {tc.result && !tc.result.error && <span className="ml-auto text-[var(--success)]">✓</span>}
                          {tc.result?.error && <span className="ml-auto text-[var(--error)]">✗</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  <MarkdownContent content={msg.content} />
                </div>
              )}
            </div>
          ))}

          {/* Tool call chain */}
          {toolCalls.length > 0 && (
            <div className="mb-2 space-y-1">
              <div className="text-[10px] text-[var(--ink-mute)] uppercase tracking-[0.05em] mb-1 px-1 font-mono">
                {t('ai.toolCalls')}
              </div>
              {toolCalls.map((tc) => (
                <details
                  key={tc.id}
                  className="group rounded-[var(--radius-sm)] bg-[var(--canvas-card)] border border-[var(--hairline)] overflow-hidden"
                >
                  <summary className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer text-[12px] select-none hover:bg-[var(--canvas-elevated)] transition-colors">
                    <span
                      className={`w-[6px] h-[6px] rounded-full shrink-0 ${
                        tc.status === 'running' ? 'animate-pulse' : ''
                      }`}
                      style={{
                        background:
                          tc.status === 'running'
                            ? toolTypeColor[getToolType(tc.name)] || 'var(--info)'
                            : tc.result?.error
                              ? 'var(--error)'
                              : toolTypeColor[getToolType(tc.name)] || 'var(--info)',
                        opacity: tc.status === 'running' ? 0.6 : 1,
                      }}
                    />
                    <span className="font-medium text-[var(--ink)]">{tc.name}</span>
                    <span className="text-[var(--ink-tertiary)] truncate flex-1 min-w-0">
                      {tc.status === 'running' ? t('ai.executing') : formatToolArgs(tc.arguments)}
                    </span>
                    <span className="text-[var(--ink-mute)] text-[10px] group-open:hidden">▼</span>
                  </summary>
                  <div className="border-t border-[var(--hairline)] px-2.5 py-2 text-[11px] leading-[1.5] font-mono text-[var(--ink-secondary)] bg-[var(--canvas-elevated)] max-h-40 overflow-y-auto custom-scrollbar">
                    <div className="text-[var(--ink-mute)] mb-1">{t('ai.params')}</div>
                    <pre className="whitespace-pre-wrap break-all mb-2">{JSON.stringify(tc.arguments, null, 2)}</pre>
                    {tc.result && (
                      <>
                        <div className={`mb-1 ${tc.result.error ? 'text-[var(--error)]' : 'text-[var(--ink-mute)]'}`}>
                          {tc.result.error ? t('ai.errorLabel') : t('ai.result')}
                        </div>
                        <pre className="whitespace-pre-wrap break-all">{JSON.stringify(tc.result, null, 2)}</pre>
                      </>
                    )}
                  </div>
                </details>
              ))}
            </div>
          )}

          {/* Streaming content */}
          {streamText && (
            <div className="p-2.5 rounded-lg text-[13px] leading-[1.6] mb-2 text-[var(--accent-gold-soft)] bg-[var(--accent-gold-soft-bg)]">
              <div className="text-[10px] text-[var(--ink-mute)] mb-1 uppercase font-mono">
                {t('ai.generatingTitle')}
              </div>
              <MarkdownContent content={streamText} />
              <span className="inline-block w-[2px] h-[1em] bg-[var(--accent-gold)] ml-[1px] align-text-bottom animate-pulse" />
            </div>
          )}

          <div ref={msgEndRef} />
        </div>
      </div>

      {/* Chat input */}
      <div className="px-4 pb-4 pt-0 shrink-0">
        <div className="flex items-end gap-2 bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-lg p-[6px_8px] transition-colors focus-within:border-[var(--accent-gold)]">
          <textarea
            id="ai-chat-input"
            name="ai-chat-input"
            className="flex-1 bg-transparent border-none outline-none resize-none font-sans text-[13px] text-[var(--ink)] leading-[1.5] max-h-20 min-h-5"
            placeholder={mode === 'collab' ? t('ai.placeholderCollab') : t('ai.placeholderWriting')}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                handleSend()
              }
            }}
            disabled={isRunning}
          />
          {isRunning ? (
            <button
              type="button"
              className="group relative w-7 h-7 rounded-[var(--radius-sm)] border-none bg-transparent text-[var(--error)] cursor-pointer flex items-center justify-center shrink-0"
              onClick={stopTask}
              title={t('ai.cancel')}
              aria-label={t('ai.cancel')}
            >
              {/* Warm comet sweeping around the button while the run streams. */}
              <span aria-hidden="true" className="ai-stop-glow">
                <span className="ai-stop-glow-clip">
                  <span className="ai-stop-streak" />
                </span>
              </span>
              <span aria-hidden="true" className="ai-stop-ring">
                <span className="ai-stop-streak" />
              </span>
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-[inherit] border border-[var(--hairline-light)] bg-[var(--error-soft)] transition-colors duration-150 group-hover:bg-[var(--error)] group-hover:border-[var(--error)]"
              />
              <Square className="relative w-3 h-3 fill-current transition-colors duration-150 group-hover:text-white" />
            </button>
          ) : (
            <button
              type="button"
              className="w-7 h-7 rounded-[var(--radius-sm)] border-none bg-[var(--accent-gold)] text-[var(--canvas)] text-sm cursor-pointer flex items-center justify-center shrink-0 hover:bg-[var(--accent-gold-soft)] transition-colors disabled:opacity-40"
              onClick={handleSend}
              disabled={!input.trim()}
            >
              <SendHorizonal className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="text-[11px] text-[var(--ink-mute)] mt-1.5 pl-1 font-sans">
          <kbd className="bg-[var(--canvas-mid)] px-[5px] py-[1px] rounded-[3px] font-sans text-[10px] text-[var(--ink-tertiary)]">
            Enter
          </kbd>{' '}
          {t('ai.enterSend')} ·{' '}
          <kbd className="bg-[var(--canvas-mid)] px-[5px] py-[1px] rounded-[3px] font-sans text-[10px] text-[var(--ink-tertiary)]">
            Shift+Enter
          </kbd>{' '}
          {t('ai.enterNewline')}
        </div>
      </div>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {confirmDelete && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200]"
          onClick={() => setConfirmDelete(false)}
        >
          <div
            className="bg-[var(--canvas-card)] border border-[var(--hairline)] rounded-xl p-6 w-[360px] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[16px] font-medium text-[var(--ink)] mb-2">{t('ai.deleteSessionTitle')}</h3>
            <p className="text-[13px] text-[var(--ink-tertiary)] mb-5">{t('ai.deleteSessionConfirm')}</p>
            <div className="flex justify-end gap-2">
              <button
                className="h-[32px] px-4 rounded-lg border border-[var(--hairline-light)] bg-[var(--canvas-elevated)] text-[var(--ink)] text-[13px] cursor-pointer hover:bg-[var(--canvas-mid)]"
                onClick={() => setConfirmDelete(false)}
              >
                {t('ai.cancelAction')}
              </button>
              <button
                className="h-[32px] px-4 rounded-lg bg-[var(--error)] text-white text-[13px] font-medium cursor-pointer border-none hover:brightness-110"
                onClick={() => {
                  if (!currentSessionId) return
                  // Stop a run in this session before deleting it, otherwise
                  // its late save would target a deleted session.
                  const key = runKey(project, currentSessionId)
                  abortControllers.get(key)?.abort()
                  abortControllers.delete(key)
                  runModifiedEntities.delete(key)
                  finishRun(project, currentSessionId)
                  void deleteSession(project, currentSessionId)
                  setConfirmDelete(false)
                }}
              >
                {t('ai.confirmDelete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}

// The shell re-renders on every animation frame state change; memoizing the
// heavy chat transcript keeps the width transition from re-rendering it.
const AIPanel = memo(AIPanelContent)

/**
 * Width-animated shell for the AI panel. Keeps the panel mounted during the
 * 300ms close transition, then unmounts it so streaming/timer effects stop.
 * The inner content keeps its full width while the shell collapses, avoiding
 * a reflow flash.
 */
export function AIPanelShell() {
  const visible = useUIStore((s) => s.rightPanelVisible)
  const resizing = useUIStore((s) => s.rightPanelResizing)
  // Two frames: the first paints the collapsed width, the second starts the
  // transition. A drag interrupted by the panel closing must not disable the
  // next open/close transition, so reset it on exit.
  const { mounted, entered } = useMountTransition(visible, {
    frames: 2,
    onExit: () => useUIStore.getState().setRightPanelResizing(false),
  })

  if (!mounted) return null

  return (
    <div
      className={`shrink-0 overflow-hidden will-change-[width,opacity] ${
        resizing ? 'transition-none' : 'transition-[width,opacity] duration-300 ease-out'
      } ${entered ? 'opacity-100' : 'opacity-0'}`}
      style={{ width: entered ? 'var(--right-panel-w)' : '0px' }}
      aria-hidden={!entered}
    >
      <div className="h-full w-[var(--right-panel-w)]">
        <AIPanel />
      </div>
    </div>
  )
}
