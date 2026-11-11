import { useEffect, useRef, useState } from 'react'

const TRANSITION_MS = 300

/**
 * Keep a panel mounted while its 300ms enter/exit transition plays.
 *
 * `frames` is the number of animation frames to wait before entering. Use 2
 * when the element must paint its collapsed state first; a single frame can be
 * coalesced with the insertion and skip the transition.
 */
export function useMountTransition(
  open: boolean,
  { frames = 1, onExit }: { frames?: 1 | 2; onExit?: () => void } = {},
): { mounted: boolean; entered: boolean } {
  const [mounted, setMounted] = useState(open)
  const [entered, setEntered] = useState(open)
  const onExitRef = useRef(onExit)

  useEffect(() => {
    onExitRef.current = onExit
  }, [onExit])

  useEffect(() => {
    if (open) {
      setMounted(true)
      let inner = 0
      const outer = requestAnimationFrame(() => {
        if (frames === 2) {
          inner = requestAnimationFrame(() => setEntered(true))
        } else {
          setEntered(true)
        }
      })
      return () => {
        cancelAnimationFrame(outer)
        cancelAnimationFrame(inner)
      }
    }
    setEntered(false)
    onExitRef.current?.()
    const timer = setTimeout(() => setMounted(false), TRANSITION_MS)
    return () => clearTimeout(timer)
  }, [open, frames])

  return { mounted, entered }
}
