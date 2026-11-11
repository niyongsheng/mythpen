import { chaptersApi } from '@/lib/api'
import type { Chapter } from '@/types'

/**
 * Fetch bounded previews of the most recent chapters and format them as one
 * AI-ready digest. Shared by the memory-extraction and consistency prompts so
 * both agree on chapter headings and preview limits.
 */
export async function buildRecentChapterDigest(
  project: string,
  chapters: Pick<Chapter, 'num' | 'volumeId'>[],
  { count, previewChars }: { count: number; previewChars: number },
): Promise<string> {
  const previews = await Promise.all(
    chapters
      .slice(-count)
      .map((chapter) => chaptersApi.get(project, chapter.num, chapter.volumeId, previewChars).catch(() => null)),
  )
  return previews
    .filter((chapter): chapter is Chapter => chapter !== null)
    .map((chapter) => `第${chapter.num}章「${chapter.title}」\n${chapter.content || ''}`)
    .join('\n\n')
}
