import { Brain } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { MarkdownContent } from '@/components/MarkdownContent'
import { useT } from '@/hooks/useT'

interface ThinkingBlockProps {
  text: string
  /** True while the model is still producing reasoning. */
  live?: boolean
  /** Expand on mount; AIPanel turns this off once the answer starts. */
  defaultOpen?: boolean
}

/**
 * Collapsible reasoning display shared by the live run and persisted
 * messages. The body is only mounted while expanded: thinking can be tens of
 * thousands of characters, and collapsed history should not pay for it.
 */
export function ThinkingBlock({ text, live = false, defaultOpen = false }: ThinkingBlockProps) {
  const [open, setOpen] = useState(defaultOpen)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const stickToBottom = useRef(true)
  const { t } = useT()

  useEffect(() => {
    setOpen(defaultOpen)
  }, [defaultOpen])

  // Follow the stream: keep the body pinned to the newest line as reasoning
  // arrives, but stop once the user scrolls up to re-read earlier text.
  useEffect(() => {
    const el = bodyRef.current
    if (!text || !open || !el || !stickToBottom.current) return
    el.scrollTop = el.scrollHeight
  }, [text, open])

  const handleScroll = () => {
    const el = bodyRef.current
    if (!el) return
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 24
  }

  if (!text) return null

  return (
    <details
      open={open}
      onToggle={(event) => {
        const isOpen = event.currentTarget.open
        setOpen(isOpen)
        if (isOpen) stickToBottom.current = true
      }}
      className="group mb-2 rounded-[var(--radius-sm)] bg-[var(--canvas-card)] border border-[var(--hairline)] overflow-hidden"
    >
      <summary className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer text-[12px] select-none hover:bg-[var(--canvas-elevated)] transition-colors">
        <Brain size={12} className="text-[var(--accent-gold)] shrink-0" />
        <span className="font-medium text-[var(--ink-secondary)]">{t('ai.thinkingTitle')}</span>
        {live && (
          <span className="w-[5px] h-[5px] rounded-full bg-[var(--accent-gold)] animate-pulse" aria-hidden="true" />
        )}
        <span className="ml-auto text-[var(--ink-mute)] text-[10px] group-open:hidden">▼</span>
      </summary>
      <div
        ref={bodyRef}
        onScroll={handleScroll}
        className="border-t border-[var(--hairline)] px-2.5 py-2 text-[11px] leading-[1.7] text-[var(--ink-tertiary)] bg-[var(--canvas-elevated)] max-h-60 overflow-y-auto custom-scrollbar"
      >
        {open && <MarkdownContent content={text} />}
      </div>
    </details>
  )
}
