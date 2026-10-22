// In Tauri v2, __TAURI_INTERNALS__ is injected by the runtime automatically.
// No npm package needed for this detection.
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
