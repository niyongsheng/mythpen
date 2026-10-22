import { useCallback, useEffect, useRef, useState } from 'react'
import { statsApi } from '@/lib/api'

/** Inline target-words editor shared by the sidebar and dashboard. */
export function useTargetWordsEditor(project: string | null, reload: () => void) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const save = useCallback(async () => {
    const value = parseInt(input, 10)
    if (project && !Number.isNaN(value) && value >= 1000) {
      try {
        await statsApi.updateTargetWords(project, value)
        reload()
      } catch {
        /* ignore */
      }
    }
    setEditing(false)
    setInput('')
  }, [input, project, reload])

  const reset = useCallback(async () => {
    if (project) {
      try {
        await statsApi.resetTargetWords(project)
        reload()
      } catch {
        /* ignore */
      }
    }
    setEditing(false)
    setInput('')
  }, [project, reload])

  return { editing, setEditing, input, setInput, inputRef, save, reset }
}
