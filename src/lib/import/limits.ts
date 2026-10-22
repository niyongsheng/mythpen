/** Hard limits for importing a book into a single project. */
export const MAX_FILE_BYTES = 30 * 1024 * 1024
export const MAX_TEXT_CHARS = 20_000_000
export const MAX_CHAPTERS = 5000
/** Warn (but still import) when one chapter is larger than this. */
export const BIG_CHAPTER_CHARS = 100_000
export const MAX_EPUB_ENTRY_BYTES = 20 * 1024 * 1024
export const MAX_EPUB_TOTAL_BYTES = 200 * 1024 * 1024
