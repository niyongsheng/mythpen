type FlushFn = () => Promise<void>

let flushFn: FlushFn | null = null

/** Register the editor's save routine so other UI can await pending edits. */
export function registerEditorSave(fn: FlushFn): () => void {
  flushFn = fn
  return () => {
    if (flushFn === fn) flushFn = null
  }
}

/** Flush unsaved editor content. No-op when no editor is mounted. */
export async function flushEditorSave(): Promise<void> {
  await flushFn?.()
}
