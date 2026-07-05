import { create } from 'zustand'

interface EditorState {
  fontSize: number
  fontFamily: string
  setFontSize: (size: number) => void
  setFontFamily: (family: string) => void
}

const DEFAULT_FONT_SIZE = 17
const DEFAULT_FONT_FAMILY = "'Noto Serif SC', 'Source Han Serif SC', 'STSong', Georgia, serif"

/** Load font preferences from the settings store's localStorage key. */
function loadFromSettings(): { fontSize: number; fontFamily: string } {
  try {
    const stored = localStorage.getItem('mythpen-settings')
    if (stored) {
      const parsed = JSON.parse(stored)
      return {
        fontSize: parsed.editorFontSize ?? DEFAULT_FONT_SIZE,
        fontFamily: parsed.editorFontFamily ?? DEFAULT_FONT_FAMILY,
      }
    }
  } catch {
    /* ignore */
  }
  return { fontSize: DEFAULT_FONT_SIZE, fontFamily: DEFAULT_FONT_FAMILY }
}

const persisted = loadFromSettings()

export const useEditorStore = create<EditorState>((set) => ({
  fontSize: persisted.fontSize,
  fontFamily: persisted.fontFamily,
  setFontSize: (fontSize) => set({ fontSize }),
  setFontFamily: (fontFamily) => set({ fontFamily }),
}))
