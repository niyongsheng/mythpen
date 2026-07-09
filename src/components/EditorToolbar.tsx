import { Loader, Pen, RemoveFormatting, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { aiApi } from '@/lib/api'
import { useChapterStore } from '@/stores/useChapterStore'
import { useProjectStore } from '@/stores/useProjectStore'

/** Walk from `node` up to `editor`, return first ancestor matching `predicate`. */
function findAncestor(node: Node | null, editor: HTMLElement, predicate: (el: Element) => boolean): Element | null {
  while (node && node !== editor) {
    if ((node as Element).tagName && predicate(node as Element)) return node as Element
    node = node.parentNode
  }
  return null
}

/** Replace a heading element with a `<p>` keeping its children, restore cursor. */
function unwrapToParagraph(el: Element, sel: Selection): void {
  const p = document.createElement('p')
  p.innerHTML = (el as HTMLElement).innerHTML
  el.replaceWith(p)
  const range = document.createRange()
  range.selectNodeContents(p)
  range.collapse()
  sel.removeAllRanges()
  sel.addRange(range)
}

export function EditorToolbar() {
  const currentChapter = useChapterStore((s) => s.currentChapter)
  const loadChapterContent = useChapterStore((s) => s.loadChapterContent)
  const currentProject = useProjectStore((s) => s.currentProject)
  const [loading, setLoading] = useState<'continue' | 'polish' | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [fmt, setFmt] = useState({ bold: false, italic: false, underline: false })

  // Track selection formatting state
  useEffect(() => {
    const handler = () => {
      const editor = document.querySelector('[contenteditable]')
      if (editor !== document.activeElement) {
        if (fmt.bold || fmt.italic || fmt.underline) setFmt({ bold: false, italic: false, underline: false })
        return
      }
      try {
        setFmt({
          bold: document.queryCommandState('bold'),
          italic: document.queryCommandState('italic'),
          underline: document.queryCommandState('underline'),
        })
      } catch {}
    }
    document.addEventListener('selectionchange', handler)
    return () => document.removeEventListener('selectionchange', handler)
  }, [])

  const exec = useCallback((command: string, value?: string) => {
    document.execCommand(command, false, value)
    const editor = document.querySelector('[contenteditable]')
    if (editor && document.activeElement !== editor) {
      ;(editor as HTMLElement).focus()
    }
  }, [])

  const handleFormat = useCallback(
    (cmd: string, val?: string) => {
      exec(cmd, val)
      const editor = document.querySelector('[contenteditable]')
      if (editor) editor.dispatchEvent(new Event('input', { bubbles: true }))
    },
    [exec],
  )

  const handleBlock = useCallback((tag: string) => {
    const editor = document.querySelector('[contenteditable]') as HTMLElement | null
    if (!editor) return
    if (document.activeElement !== editor) editor.focus()

    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return
    const range = sel.getRangeAt(0)

    // Toggle: if inside same heading type, unwrap to paragraph
    const existing = findAncestor(range.startContainer, editor, (el) => el.tagName.toLowerCase() === tag)
    if (existing) {
      unwrapToParagraph(existing, sel)
      editor.dispatchEvent(new Event('input', { bubbles: true }))
      return
    }

    // Wrap the current block in the heading tag
    let node: Node | null = range.startContainer
    while (node && node.parentNode !== editor) node = node.parentNode
    if (!node || node === editor) {
      // Fallback: insert a new heading at cursor
      const el = document.createElement(tag)
      el.textContent = ' '
      range.insertNode(el)
      range.setStart(el, 0)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
    } else {
      const heading = document.createElement(tag)
      heading.innerHTML = (node as HTMLElement).innerHTML
      ;(node as HTMLElement).replaceWith(heading)
      const newRange = document.createRange()
      newRange.selectNodeContents(heading)
      newRange.collapse()
      sel.removeAllRanges()
      sel.addRange(newRange)
    }

    editor.dispatchEvent(new Event('input', { bubbles: true }))
  }, [])

  const handleInsertQuote = useCallback(() => {
    const editor = document.querySelector('[contenteditable]')
    if (!editor) return
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return
    const range = sel.getRangeAt(0)
    const block = document.createElement('p')
    block.className = 'dialogue'
    block.textContent = sel.toString() || '「」'
    range.deleteContents()
    range.insertNode(block)
    const textNode = block.firstChild
    if (textNode) {
      range.setStart(textNode, 1)
      range.setEnd(textNode, 1)
      sel.removeAllRanges()
      sel.addRange(range)
    }
    editor.dispatchEvent(new Event('input', { bubbles: true }))
  }, [])

  const handleInsertDivider = useCallback(() => {
    exec('insertHorizontalRule')
  }, [exec])

  const handleInsertCode = useCallback(() => {
    const editor = document.querySelector('[contenteditable]')
    if (!editor) return
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return
    const range = sel.getRangeAt(0)
    const pre = document.createElement('pre')
    const code = document.createElement('code')
    code.textContent = sel.toString() || '代码'
    pre.appendChild(code)
    range.deleteContents()
    range.insertNode(pre)
    editor.dispatchEvent(new Event('input', { bubbles: true }))
  }, [])

  // Start AI continue writing
  const handleContinue = useCallback(() => {
    if (loading || !currentProject || !currentChapter) return
    setLoading('continue')
    const ch = currentChapter
    const context = `项目：${currentProject}\n当前章节：第${ch?.num}章「${ch?.title}」\n当前内容：${ch?.content || ''}\n\n请直接续写小说内容，保持原有风格，不要加前缀说明。`

    abortRef.current = aiApi.continueWriting(
      ch?.num || 1,
      context,
      currentProject,
      () => {}, // chunk handler — no-op for toolbar (streaming handled server-side)
      async () => {
        setLoading(null)
        if (ch?.num) await loadChapterContent(currentProject, ch.num)
      },
      () => {
        setLoading(null)
      },
    )
  }, [loading, currentProject, currentChapter, loadChapterContent])

  // Clear formatting on selected text
  const handleClearFormat = useCallback(() => {
    const editor = document.querySelector('[contenteditable]') as HTMLElement | null
    if (!editor) return
    if (document.activeElement !== editor) editor.focus()

    // Unwrap headings (h1/h2/h3) back to paragraphs
    const sel = window.getSelection()
    if (sel && sel.rangeCount) {
      const heading = findAncestor(sel.getRangeAt(0).startContainer, editor, (el) =>
        ['h1', 'h2', 'h3'].includes(el.tagName.toLowerCase()),
      )
      if (heading) unwrapToParagraph(heading, sel)
    }

    document.execCommand('removeFormat')
    editor.dispatchEvent(new Event('input', { bubbles: true }))
  }, [])

  // Start AI polish
  const handlePolish = useCallback(() => {
    if (loading || !currentProject || !currentChapter) return
    setLoading('polish')
    const ch = currentChapter
    const context = `项目：${currentProject}\n当前章节：第${ch?.num}章「${ch?.title}」\n\n请润色当前章节的文字，保持原有风格和情节，提升文学质感。不要改变故事内容和剧情走向。`

    abortRef.current = aiApi.continueWriting(
      ch?.num || 1,
      context,
      currentProject,
      () => {},
      async () => {
        setLoading(null)
        if (ch?.num) await loadChapterContent(currentProject, ch.num)
      },
      () => {
        setLoading(null)
      },
    )
  }, [loading, currentProject, currentChapter, loadChapterContent])

  return (
    <div className="h-[var(--toolbar-h)] bg-[var(--canvas-soft)] border-b border-[var(--hairline)] flex items-center px-3 gap-0.5 shrink-0">
      <div className="flex gap-[1px] items-center">
        <ToolBtn onClick={() => handleBlock('h1')}>H1</ToolBtn>
        <ToolBtn onClick={() => handleBlock('h2')}>H2</ToolBtn>
      </div>
      <span className="w-px h-5 bg-[var(--hairline)] mx-1.5" />
      <div className="flex gap-[1px] items-center">
        <ToolBtn active={fmt.bold} onClick={() => handleFormat('bold')}>
          <b>B</b>
        </ToolBtn>
        <ToolBtn active={fmt.italic} onClick={() => handleFormat('italic')}>
          <i>I</i>
        </ToolBtn>
        <ToolBtn active={fmt.underline} onClick={() => handleFormat('underline')}>
          <u>U</u>
        </ToolBtn>
      </div>
      <span className="w-px h-5 bg-[var(--hairline)] mx-1.5" />
      <div className="flex gap-[1px] items-center">
        <ToolBtn onClick={handleInsertQuote}>"</ToolBtn>
        <ToolBtn onClick={handleInsertDivider}>≡</ToolBtn>
        <ToolBtn onClick={handleInsertCode}>&lt;/&gt;</ToolBtn>
        <span className="w-px h-5 bg-[var(--hairline)] mx-1.5" />
        <ToolBtn onClick={handleClearFormat}>
          <RemoveFormatting className="w-3.5 h-3.5" />
        </ToolBtn>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <button
          className={`tool-btn-ai-pill inline-flex items-center gap-1 ${loading === 'polish' ? 'opacity-60 pointer-events-none' : ''}`}
          onClick={handlePolish}
          disabled={!!loading}
        >
          {loading === 'polish' ? (
            <Loader className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          <span className="text-[12px]">{loading === 'polish' ? '润色中...' : '润色'}</span>
        </button>
        <button
          className={`tool-btn-ai-pill inline-flex items-center gap-1 ${loading === 'continue' ? 'opacity-60 pointer-events-none' : ''}`}
          onClick={handleContinue}
          disabled={!!loading}
        >
          {loading === 'continue' ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Pen className="w-3.5 h-3.5" />}
          <span className="text-[12px]">{loading === 'continue' ? '续写中...' : '续写'}</span>
        </button>
      </div>
    </div>
  )
}

function ToolBtn({ children, onClick, active }: { children: React.ReactNode; onClick?: () => void; active?: boolean }) {
  return (
    <button
      className={`w-7 h-7 flex items-center justify-center rounded-[var(--radius-sm)] text-sm transition-colors cursor-pointer border-none
        ${active ? 'text-[var(--accent-gold)]' : 'text-[var(--ink-tertiary)]'}
        hover:bg-[var(--canvas-card)] hover:text-[var(--ink)]`}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </button>
  )
}
