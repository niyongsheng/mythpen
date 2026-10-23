import { create } from 'zustand'

/** Keep a deep history so authors can step back through long editing sessions. */
const MAX_HISTORY_STEPS = 500
/** Bound memory for very large chapters; oldest steps are dropped first. */
const MAX_HISTORY_CHARS = 12_000_000

function trimPast(past: string[], pastChars: number): { past: string[]; pastChars: number } {
  while (past.length > MAX_HISTORY_STEPS || pastChars > MAX_HISTORY_CHARS) {
    const removed = past.shift()
    if (removed === undefined) break
    pastChars -= removed.length
  }
  return { past, pastChars }
}

interface EditorHistoryState {
  past: string[]
  pastChars: number
  future: string[]
  /** Last committed editor HTML. */
  last: string
  /** Reset history when the editor is (re)loaded with new content. */
  reset: (html: string) => void
  /** Commit the current editor HTML as a new history step. */
  record: (html: string) => void
  undo: (currentHtml: string) => string | null
  redo: (currentHtml: string) => string | null
}

export const useEditorHistoryStore = create<EditorHistoryState>((set, get) => ({
  past: [],
  pastChars: 0,
  future: [],
  last: '',

  reset: (html) => set({ past: [], pastChars: 0, future: [], last: html }),

  record: (html) => {
    const { past, pastChars, last } = get()
    if (html === last) return
    const nextPast = [...past, last]
    const trimmed = trimPast(nextPast, pastChars + last.length)
    set({ ...trimmed, future: [], last: html })
  },

  undo: (currentHtml) => {
    let { past, pastChars, last } = get()
    // The last keystroke may not have been committed yet; commit it first so
    // redo can return to this exact state.
    if (currentHtml !== last) {
      past = [...past, last]
      pastChars += last.length
      const trimmed = trimPast(past, pastChars)
      past = trimmed.past
      pastChars = trimmed.pastChars
      last = currentHtml
    }
    if (past.length === 0) {
      set({ last })
      return null
    }

    const previous = past[past.length - 1]
    const { future } = get()
    set({
      past: past.slice(0, -1),
      pastChars: pastChars - previous.length,
      future: [currentHtml, ...future].slice(0, MAX_HISTORY_STEPS),
      last: previous,
    })
    return previous
  },

  redo: (currentHtml) => {
    const { past, pastChars, future } = get()
    if (future.length === 0) return null

    const next = future[0]
    const trimmed = trimPast([...past, currentHtml], pastChars + currentHtml.length)
    set({ ...trimmed, future: future.slice(1), last: next })
    return next
  },
}))
