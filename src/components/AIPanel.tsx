import { Lightbulb, Loader, MessageSquare, Plus, SendHorizonal, ShieldCheck, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MarkdownContent } from '@/components/MarkdownContent'
import { ToastContainer } from '@/components/ToastContainer'
import { useT } from '@/hooks/useT'
import { useToast } from '@/hooks/useToast'
import { aiApi, chatApi } from '@/lib/api'
import { getModifiedEntities, notifyDataChanged } from '@/lib/dataEvents'
import { useProjectName } from '@/lib/useProjectData'
import { useAgentStore } from '@/stores/useAgentStore'
import { useChapterStore } from '@/stores/useChapterStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUIStore } from '@/stores/useUIStore'

export function AIPanel() {
  const {
    messages,
    isRunning,
    loading,
    sessions,
    currentSessionId,
    setTask,
    addMessage,
    loadSessions,
    createSession,
    switchSession,
    deleteSession,
    updateSessionTitle,
    cancelTask,
  } = useAgentStore()
  const currentChapter = useChapterStore((s) => s.currentChapter)
  const loadChapterContent = useChapterStore((s) => s.loadChapterContent)
  const project = useProjectName()
  const [input, setInput] = useState('')
  const [streamText, setStreamText] = useState('')
  const [taskName, setTaskName] = useState('')
  const [genTokens, setGenTokens] = useState(0)
  const [showConsistency, setShowConsistency] = useState(() => !localStorage.getItem('mythpen-hide-consistency'))
  const abortRef = useRef<AbortController | null>(null)
  const msgEndRef = useRef<HTMLDivElement | null>(null)
  const streamRef = useRef('')
  const runningRef = useRef(false)
  const msgIdCounter = useRef(0)
  const sessionsLoadedRef = useRef(false)
  const resizingRef = useRef(false)
  const setRightPanelWidth = useUIStore((s) => s.setRightPanelWidth)
  const [mode, setMode] = useState<'writing' | 'collab'>('collab')
  const [toolCalls, setToolCalls] = useState<any[]>([])
  const toolCallsRef = useRef<any[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { toasts, show: showToast } = useToast()
  const { t } = useT()

  // Resize handle drag logic
  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      resizingRef.current = true
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
    [setRightPanelWidth],
  )

  // Generate AI title for a new session based on first exchange
  const generateAITitle = useCallback(
    async (userMsg: string, aiResponse?: string) => {
      if (!project || !currentSessionId) return
      // Only generate if current title is still a timestamp placeholder
      const currentSession = sessions.find((s: any) => s.id === currentSessionId)
      if (!currentSession) return
      const isPlaceholder = currentSession.title?.startsWith('对话 ') || currentSession.title?.startsWith('新会话 ')
      if (!isPlaceholder) return

      try {
        const context = aiResponse ? `用户: ${userMsg}\nAI: ${aiResponse}` : `用户: ${userMsg}`
        const prompt = `你是一个小说创作助手。请根据以下对话内容，用2-6个字概括这场对话的主题。直接返回标题，不要任何额外文字、标点或引号。\n\n${context}`
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
  const saveMsg = (data: { role: 'user' | 'ai' | 'system'; content: string }) =>
    chatApi.save(project!, { ...data, session_id: currentSessionId || undefined }).catch(() => {})

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText])

  // Load sessions and messages when project changes, auto-create session if none exists
  useEffect(() => {
    if (!project) return
    sessionsLoadedRef.current = false
    loadSessions(project).then(() => {
      sessionsLoadedRef.current = true
      // Eagerly create a session if none exists (avoids race with handleSend)
      const state = useAgentStore.getState()
      if (!state.currentSessionId && state.sessions.length === 0) {
        const now = new Date()
        const ts = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
        void createSession(project, `对话 ${ts}`)
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

  const done = () => {
    runningRef.current = false
    setStreamText('')
    setTaskName('')
    streamRef.current = ''
    setToolCalls([])
    toolCallsRef.current = []
  }

  const stopTask = () => {
    if (abortRef.current) {
      abortRef.current?.abort()
      abortRef.current = null
    }
    cancelTask()
    runningRef.current = false
    setStreamText('')
    setTaskName('')
    setToolCalls([])
    toolCallsRef.current = []
  }

  const handleSend = () => {
    if (!project || runningRef.current || !input.trim()) return
    if (loading) return // wait for messages to finish loading
    runningRef.current = true
    const userMsg = input.trim()
    const isChat = mode === 'collab'
    setTaskName(isChat ? t('ai.taskCollab') : t('ai.taskContinue'))
    setTask({ status: 'running' })
    setStreamText('')
    setGenTokens(0)
    streamRef.current = ''

    addMessage({ id: nextMsgId(), role: 'user', content: userMsg })
    saveMsg({ role: 'user', content: userMsg }).catch(() => {})
    setInput('')
    // Force DOM clear — React 19 batch 处理后 onInput 事件可能恢复旧值
    const el = document.getElementById('ai-chat-input') as HTMLTextAreaElement | null
    if (el) el.value = ''

    const ch = currentChapter

    if (isChat) {
      // ── 共创模式 ──
      setToolCalls([])
      toolCallsRef.current = []
      const context = `项目：${project}\n当前章节：第${ch?.num}章「${ch?.title}」\n\n用户提问：${userMsg}\n\n我们正在一起构建这部小说的世界。在回答前，你可以先查询当前的角色、世界观、伏笔等已有设定。根据用户的问题，展开有建设性的讨论，提出创意建议。如果达成共识，使用对应工具将设定写入数据库。`
      // Build conversation history from stored messages.
      const chatHistory: any[] = []
      for (const msg of messages) {
        chatHistory.push({
          role: msg.role === 'ai' ? 'assistant' : (msg.role as 'user' | 'system'),
          content: msg.content,
        })
      }
      abortRef.current = aiApi.chatStream(
        [...chatHistory, { role: 'user', content: context }],
        project,
        (text: string) => {
          streamRef.current += text
          setStreamText(streamRef.current)
          setGenTokens((prev) => prev + 1)
        },
        async () => {
          setTask({ status: 'completed' })
          const fullText = streamRef.current
          const aiMsg = {
            role: 'ai' as const,
            content: fullText || '对话完成',
            toolCalls: toolCallsRef.current.length > 0 ? toolCallsRef.current : undefined,
          }
          addMessage({ id: nextMsgId(), ...aiMsg })
          saveMsg(aiMsg).catch(() => {})
          const hadToolCalls = toolCallsRef.current.length > 0
          done()
          showToast(fullText ? 'AI 回答完成' : '对话完成', 'success')
          generateAITitle(userMsg, fullText || undefined)
          if (hadToolCalls) {
            const toolNames = toolCallsRef.current.map((tc: any) => tc.name)
            const entities = getModifiedEntities(toolNames)
            // Broadcast each modified entity type so all stores can react
            for (const entity of entities) {
              notifyDataChanged(entity)
            }
            // Legacy: still reload critical data immediately for responsiveness
            useChapterStore.getState().loadChapters(project!)
            useProjectStore.getState().loadProjects()
          }
        },
        (err: any) => {
          setTask({ status: 'error' })
          const errMsg = { role: 'ai' as const, content: `错误: ${err.error || err}` }
          addMessage({ id: nextMsgId(), ...errMsg })
          saveMsg(errMsg).catch(() => {})
          done()
        },
        'collab',
        (tc: any) => {
          const updated = [...toolCallsRef.current, { ...tc, status: 'running' }]
          toolCallsRef.current = updated
          setToolCalls(updated)
        },
        (tr: any) => {
          const updated = toolCallsRef.current.map((tc) =>
            tc.id === tr.id ? { ...tc, result: tr.result, status: 'done' } : tc,
          )
          toolCallsRef.current = updated
          setToolCalls(updated)
        },
      )
    } else {
      // ── 写作模式 ──
      setToolCalls([])
      toolCallsRef.current = []
      const context = `项目：${project}\n当前章节：第${ch?.num}章「${ch?.title}」\n\n用户指令：${userMsg}\n\n请按照六步写作工作流执行：先阅读当前章节的大纲和前文内容，根据大纲用 update_chapter 写入正文，按照系统指令中的工作流推进章节状态。完成后将章节状态设为 review。所有创作内容必须通过工具写入数据库。`
      // Build chat history (same as chat mode for context continuity)
      const chatHistory: any[] = []
      for (const msg of messages) {
        chatHistory.push({
          role: msg.role === 'ai' ? 'assistant' : (msg.role as 'user' | 'system'),
          content: msg.content,
        })
      }
      abortRef.current = aiApi.chatStream(
        [...chatHistory, { role: 'user', content: context }],
        project,
        (text: string) => {
          streamRef.current += text
          setStreamText(streamRef.current)
          setGenTokens((prev) => prev + 1)
        },
        async () => {
          setTask({ status: 'completed' })
          const fullText = streamRef.current
          const aiMsg = {
            role: 'ai' as const,
            content: fullText || '创作完成',
            toolCalls: toolCallsRef.current.length > 0 ? toolCallsRef.current : undefined,
          }
          addMessage({ id: nextMsgId(), ...aiMsg })
          saveMsg(aiMsg).catch(() => {})
          const hadToolCalls = toolCallsRef.current.length > 0
          done()
          generateAITitle(userMsg, fullText || undefined)
          // Broadcast data change events to all stores
          if (hadToolCalls) {
            const toolNames = toolCallsRef.current.map((tc: any) => tc.name)
            const entities = getModifiedEntities(toolNames)
            for (const entity of entities) {
              notifyDataChanged(entity)
            }
          }
          // Reload chapter content if tool calls were made (content was saved to DB)
          if (hadToolCalls && ch?.num) {
            await loadChapterContent(project, ch.num)
          }
        },
        (err: any) => {
          setTask({ status: 'error' })
          showToast('AI 出错', 'error')
          const errMsg = { role: 'ai' as const, content: `错误: ${err.error || err}` }
          addMessage({ id: nextMsgId(), ...errMsg })
          saveMsg(errMsg).catch(() => {})
          done()
        },
        'writing',
        (tc: any) => {
          const updated = [...toolCallsRef.current, { ...tc, status: 'running' }]
          toolCallsRef.current = updated
          setToolCalls(updated)
        },
        (tr: any) => {
          const updated = toolCallsRef.current.map((tc) =>
            tc.id === tr.id ? { ...tc, result: tr.result, status: 'done' } : tc,
          )
          toolCallsRef.current = updated
          setToolCalls(updated)
        },
      )
    }
  }

  return (
    <aside className="w-[var(--right-panel-w)] bg-[var(--canvas-soft)] border-l border-[var(--hairline)] shrink-0 flex flex-col min-h-0 relative">
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
          {/* Mode toggle */}
          <div className="flex mt-2 bg-[var(--canvas-card)] rounded-[var(--radius-sm)] p-[2px] border border-[var(--hairline)]">
            <button
              className={`flex-1 h-[26px] rounded-[4px] text-[12px] font-medium transition-colors cursor-pointer border-none ${
                mode === 'collab'
                  ? 'bg-[var(--accent-gold)] text-[var(--canvas)]'
                  : 'bg-transparent text-[var(--ink-tertiary)] hover:text-[var(--ink)]'
              }`}
              onClick={() => setMode('collab')}
            >
              {t('ai.modeCollab')}
            </button>
            <button
              className={`flex-1 h-[26px] rounded-[4px] text-[12px] font-medium transition-colors cursor-pointer border-none ${
                mode === 'writing'
                  ? 'bg-[var(--accent-gold)] text-[var(--canvas)]'
                  : 'bg-transparent text-[var(--ink-tertiary)] hover:text-[var(--ink)]'
              }`}
              onClick={() => setMode('writing')}
            >
              {t('ai.modeWriting')}
            </button>
          </div>
        </div>

        {/* Session selector */}
        <div className="flex items-center gap-1.5">
          <select
            id="ai-session-select"
            name="ai-session-select"
            className="flex-1 h-[28px] px-2 bg-[var(--canvas-elevated)] border border-[var(--hairline)] rounded-[var(--radius-sm)] text-[var(--ink)] text-[12px] outline-none cursor-pointer focus:border-[var(--accent-gold)]"
            value={currentSessionId || ''}
            onChange={(e) => e.target.value && switchSession(project, e.target.value)}
          >
            {sessions.map((s: any, i) => (
              <option key={`${s.id}-${i}`} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          <button
            className="w-7 h-7 flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--hairline)] bg-[var(--canvas-elevated)] text-[var(--ink-tertiary)] cursor-pointer hover:text-[var(--ink)] hover:bg-[var(--canvas-mid)] transition-colors shrink-0"
            onClick={() => {
              const now = new Date()
              const ts = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
              void createSession(project, `新会话 ${ts}`)
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
      <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
        {/* Task runner */}
        {isRunning && (
          <div className="mx-4 mb-2.5 p-3 bg-[var(--accent-gold-soft-bg)] border border-[rgba(201,169,110,0.3)] rounded-lg">
            <div className="flex items-center gap-2.5">
              <span className="w-[7px] h-[7px] rounded-full bg-[var(--warning)] animate-pulse self-start mt-1 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-[var(--ink)] font-medium flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 inline-block mr-1" />
                  {taskName} · {currentChapter?.title || ''}
                </div>
                <div className="text-[11px] text-[var(--ink-tertiary)] mt-0.5 font-mono">
                  {t('ai.generatedTokens', { count: genTokens })}
                </div>
                <div className="h-[3px] bg-[var(--canvas-mid)] rounded-full mt-1.5 overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent-gold)] rounded-full animate-pulse"
                    style={{ width: `${Math.min(95, genTokens * 2)}%` }}
                  />
                </div>
              </div>
              <button
                className="w-[26px] h-[26px] flex items-center justify-center rounded-[var(--radius-sm)] border border-[var(--hairline-light)] text-[var(--ink-tertiary)] text-[13px] cursor-pointer shrink-0 hover:bg-[var(--error-soft)] hover:text-[var(--error)] hover:border-[var(--error)] transition-colors"
                onClick={stopTask}
                title={t('ai.cancel')}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

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
                <div className="p-2.5 rounded-lg text-[13px] leading-[1.6] mb-2 bg-[var(--canvas-elevated)] text-[var(--ink)]">
                  <MarkdownContent content={msg.content} />
                </div>
              )}
              {msg.role === 'ai' && msg.content && (
                <div
                  className={`p-2.5 rounded-lg text-[13px] leading-[1.6] mb-2 ${msg.content.startsWith('完成') || msg.content.startsWith('错误') ? 'text-[var(--ink-secondary)]' : 'bg-[var(--canvas-card)] text-[var(--ink-secondary)]'}`}
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
          <button
            className="w-7 h-7 rounded-[var(--radius-sm)] border-none bg-[var(--accent-gold)] text-[var(--canvas)] text-sm cursor-pointer flex items-center justify-center shrink-0 hover:bg-[var(--accent-gold-soft)] transition-colors disabled:opacity-40"
            onClick={handleSend}
            disabled={isRunning || !input.trim()}
          >
            {isRunning ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <SendHorizonal className="w-3.5 h-3.5" />}
          </button>
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
      <ToastContainer toasts={toasts} />

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
