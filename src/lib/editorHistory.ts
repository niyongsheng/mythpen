import { useEditorHistoryStore } from '@/stores/useEditorHistoryStore'

export interface EditorSelection {
  start: number
  end: number
}

/** Character offset of a DOM position within the editor. */
function offsetOf(editor: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange()
  range.selectNodeContents(editor)
  range.setEnd(node, offset)
  return range.toString().length
}

/** DOM position for a character offset within the editor. */
function positionAt(editor: HTMLElement, offset: number): { node: Node; offset: number } {
  let remaining = Math.max(0, offset)
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const length = node.textContent?.length || 0
    if (remaining <= length) return { node, offset: remaining }
    remaining -= length
  }
  return { node: editor, offset: editor.childNodes.length }
}

export function captureSelection(editor: HTMLElement): EditorSelection | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return null
  return {
    start: offsetOf(editor, range.startContainer, range.startOffset),
    end: offsetOf(editor, range.endContainer, range.endOffset),
  }
}

export function restoreSelection(editor: HTMLElement, selection: EditorSelection | null): void {
  if (!selection) return
  const start = positionAt(editor, selection.start)
  const end = positionAt(editor, selection.end)
  const range = document.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  const current = window.getSelection()
  current?.removeAllRanges()
  current?.addRange(range)
}

/** Apply a custom undo/redo step to the editor, preserving the caret. */
export function performHistory(editor: HTMLElement, action: 'undo' | 'redo'): boolean {
  const currentHtml = editor.innerHTML
  const selection = captureSelection(editor)
  const store = useEditorHistoryStore.getState()
  const target = action === 'undo' ? store.undo(currentHtml) : store.redo(currentHtml)
  if (target === null) return false

  editor.innerHTML = target
  restoreSelection(editor, selection)
  editor.dispatchEvent(new Event('input', { bubbles: true }))
  return true
}
