import { Pen, Pencil } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useT } from '@/hooks/useT'
import { useChapterStore } from '@/stores/useChapterStore'
import { useEditorStore } from '@/stores/useEditorStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useSidebarStore } from '@/stores/useSidebarStore'

export function EditorContent() {
  const { fontSize, fontFamily } = useEditorStore()
  const { currentChapter, volumes, updateChapter, createChapter, setSaveStatus } = useChapterStore()
  const currentProject = useProjectStore((s) => s.currentProject)
  const setActivePage = useSidebarStore((s) => s.setActivePage)
  const { t } = useT()
  const chapter = currentChapter
  const editorRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const isEditingRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedContentRef = useRef('')
  const hasSavedRef = useRef(false)
  const [isDirty, setIsDirty] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  const allChapters = volumes.flatMap((v) => v.chapters)
  const hasChapters = allChapters.length > 0

  const handleNewChapter = async () => {
    if (!currentProject) return
    const created = await createChapter(currentProject, '新章节')
    setActivePage('page-writing')
  }

  // Convert inline markers to HTML
  function inlineToHtml(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\*(.+?)\*/g, '<i>$1</i>')
      .replace(/__(.+?)__/g, '<u>$1</u>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
  }

  // Parse content to HTML for display
  function renderContent(content: string | undefined) {
    if (!content) return ''
    const lines = content.split('\n').filter((l) => l.trim())
    return lines
      .map((line) => {
        if (line.startsWith('# ')) return `<h1>${inlineToHtml(line.slice(2))}</h1>`
        if (line.startsWith('## ')) return `<h2>${inlineToHtml(line.slice(3))}</h2>`
        if (line.startsWith('「') || line.startsWith('"')) {
          return `<p class="dialogue">${inlineToHtml(line)}</p>`
        }
        return `<p>${inlineToHtml(line)}</p>`
      })
      .join('')
  }

  // Extract HTML editor content back to plain text with simple formatting markers
  function extractContent(html: string): string {
    const div = document.createElement('div')
    div.innerHTML = html
    const lines: string[] = []
    for (const child of div.children) {
      const tag = child.tagName.toLowerCase()
      if (tag === 'h1') lines.push(`# ${getInlineText(child as HTMLElement)}`)
      else if (tag === 'h2') lines.push(`## ${getInlineText(child as HTMLElement)}`)
      else if (tag === 'p') {
        const text = getInlineText(child as HTMLElement).trim()
        if (text) lines.push(text)
      } else if (tag === 'pre') {
        lines.push('```')
        lines.push((child as HTMLElement).textContent || '')
        lines.push('```')
      } else if (tag === 'hr') {
        lines.push('---')
      }
    }
    if (lines.length === 0) {
      const text = getInlineText(div).trim()
      if (text) lines.push(text)
    }
    return lines.join('\n')
  }

  // Serialize inline formatting to simple markers
  function getInlineText(el: HTMLElement): string {
    let result = ''
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        result += node.textContent
      } else if (node instanceof HTMLElement) {
        const tag = node.tagName.toLowerCase()
        const inner = getInlineText(node)
        if (tag === 'b' || tag === 'strong') result += `**${inner}**`
        else if (tag === 'i' || tag === 'em') result += `*${inner}*`
        else if (tag === 'u') result += `__${inner}__`
        else if (tag === 'code') result += `\`${inner}\``
        else if (tag === 'br') result += '\n'
        else result += inner
      }
    }
    return result
  }

  // Persist editor content to server — capture snapshot before any async gap
  const doSave = useCallback(async () => {
    const pn = useProjectStore.getState().currentProject
    const ch = useChapterStore.getState().currentChapter
    const chNum = ch?.num
    if (!pn || !ch || !chNum || !editorRef.current) return

    const html = editorRef.current.innerHTML
    const textContent = editorRef.current.textContent?.trim() || ''

    // Skip if empty
    if (textContent === '') {
      if (ch.content) {
        await updateChapter(pn, chNum, { content: '' })
      }
      lastSavedContentRef.current = ''
      setIsDirty(false)
      return
    }

    const markdown = extractContent(html)
    if (markdown !== lastSavedContentRef.current) {
      setSaveStatus('saving')
      await updateChapter(pn, chNum, { content: markdown })
      lastSavedContentRef.current = markdown
      hasSavedRef.current = true
      setSaveStatus('saved')
    }
    setIsDirty(false)
  }, [updateChapter, setSaveStatus]) // no longer depends on chapter/currentProject

  // Debounced auto-save — reads autoSaveInterval from settings
  const doSaveRef = useRef(doSave)
  doSaveRef.current = doSave

  const scheduleAutosave = useCallback(() => {
    const interval = useSettingsStore.getState().settings.autoSaveInterval
    if (!interval || interval <= 0) return // auto-save disabled
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      doSaveRef.current()
    }, interval * 1000)
  }, []) // stable — reads doSave and settings through refs

  // Sync editor content from store when chapter changes
  const syncContent = useCallback(() => {
    if (!editorRef.current) return
    if (!chapter) {
      editorRef.current.innerHTML = ''
      return
    }
    editorRef.current.innerHTML = chapter.content ? renderContent(chapter.content) : ''
    if (editorRef.current.innerHTML) {
      editorRef.current.removeAttribute('data-placeholder')
    } else {
      editorRef.current.setAttribute('data-placeholder', '开始写作吧...')
    }
    lastSavedContentRef.current = chapter.content || ''
  }, [chapter])

  // Watch chapter changes (switching chapters) and external content updates (AI generation)
  useEffect(() => {
    if (!isEditingRef.current) {
      syncContent()
    }
    setIsDirty(false)
    // Only show 'saved' if content exists and we've actually persisted it
    if (chapter?.content && hasSavedRef.current) {
      setSaveStatus('saved')
    } else if (chapter?.content) {
      // Content exists from load, not from our save — show neutral state
      setSaveStatus('saved')
    } else {
      // Empty chapter with no saves yet
      setSaveStatus('saved')
    }
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [chapter?.id, chapter?.num, syncContent])

  // Mark unsaved when user starts editing
  useEffect(() => {
    if (isDirty) setSaveStatus('unsaved')
  }, [isDirty, setSaveStatus])

  // Save on blur (immediate, no debounce)
  const handleBlur = useCallback(() => {
    isEditingRef.current = false
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    doSave()
  }, [doSave])

  // Schedule auto-save on each keystroke
  const handleInput = useCallback(() => {
    isEditingRef.current = true
    setIsDirty(true)
    if (editorRef.current?.hasAttribute('data-placeholder')) {
      editorRef.current.removeAttribute('data-placeholder')
    }
    scheduleAutosave()
  }, [scheduleAutosave])

  // Auto-focus editor when writing page becomes visible
  const activePage = useSidebarStore((s) => s.activePage)
  useEffect(() => {
    if (chapter && editorRef.current && activePage === 'page-writing') {
      const timer = setTimeout(() => editorRef.current?.focus(), 100)
      return () => clearTimeout(timer)
    }
  }, [chapter?.id, activePage])

  const handleFocus = useCallback(() => {
    isEditingRef.current = true
  }, [])

  // Title edit handlers
  const handleTitleClick = useCallback(() => {
    setEditingTitle(true)
    setTitleDraft(chapter?.title || '')
  }, [chapter?.title])

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTitleDraft(e.target.value)
  }, [])

  const handleTitleSave = useCallback(async () => {
    setEditingTitle(false)
    if (!currentProject || !chapter || !titleDraft.trim() || titleDraft.trim() === chapter.title) return
    await updateChapter(currentProject, chapter.num, { title: titleDraft.trim() })
  }, [currentProject, chapter, titleDraft, updateChapter])

  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      ;(e.target as HTMLInputElement).blur()
    }
    if (e.key === 'Escape') {
      setEditingTitle(false)
    }
  }, [])

  return (
    <div className="flex-1 overflow-y-auto px-16 pb-32 pt-12 flex justify-center custom-scrollbar">
      <div
        className="w-full max-w-[var(--editor-max-w)] leading-[1.9] tracking-[0.01em]"
        style={{ fontFamily, fontSize: `${fontSize}px`, color: 'var(--ink)' }}
      >
        {chapter ? (
          <>
            {editingTitle ? (
              <input
                className="font-display text-[36px] font-semibold leading-[1.25] tracking-[-0.01em] mb-[1.5em] w-full bg-transparent border-none outline-none text-[var(--ink)]"
                style={{ fontFamily }}
                value={titleDraft}
                onChange={handleTitleChange}
                onBlur={handleTitleSave}
                onKeyDown={handleTitleKeyDown}
                autoFocus
              />
            ) : (
              <h1
                ref={titleRef}
                className="font-display text-[36px] font-semibold leading-[1.25] tracking-[-0.01em] mb-[1.5em] cursor-pointer hover:text-[var(--accent-gold)] transition-colors"
                onClick={handleTitleClick}
                title="点击修改标题"
              >
                第{chapter.num}章 {chapter.title}
              </h1>
            )}
            <div
              ref={editorRef}
              className="editor-body outline-none cursor-text"
              contentEditable
              suppressContentEditableWarning
              onBlur={handleBlur}
              onInput={handleInput}
              onFocus={handleFocus}
            />
          </>
        ) : (
          <div className="text-center pt-20">
            <p className="text-[var(--ink-mute)] mb-4">
              {hasChapters ? t('editor.chooseChapter') : t('editor.noChaptersYet')}
            </p>
            <button
              className="h-[36px] px-6 rounded-lg border-none bg-[var(--accent-gold)] text-[var(--canvas)] font-medium text-[14px] cursor-pointer transition-colors hover:bg-[var(--accent-gold-soft)]"
              onClick={handleNewChapter}
            >
              <span className="inline-flex items-center gap-1.5">
                {hasChapters ? (
                  t('editor.newChapter')
                ) : (
                  <>
                    <Pen className="w-3.5 h-3.5" /> {t('editor.writeFirst')}
                  </>
                )}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
