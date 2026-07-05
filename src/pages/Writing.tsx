import { EditorContent } from '@/components/EditorContent'
import { EditorStatusbar } from '@/components/EditorStatusbar'
import { EditorToolbar } from '@/components/EditorToolbar'

export function Writing() {
  return (
    <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-[var(--canvas)]">
      <EditorToolbar />
      <EditorContent />
      <EditorStatusbar />
    </main>
  )
}
