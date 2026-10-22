/**
 * API row → client model mappers.
 *
 * The server speaks snake_case; the UI types are camelCase. Keep the
 * translation at this boundary so pages and stores never read raw rows.
 */
import type { Chapter, Character, CharacterRelation, Foreshadow, Memory, ProjectStats } from '@/types'

export function toChapter(row: any): Chapter {
  return {
    id: row.id,
    volumeId: row.volume_id,
    num: row.num,
    title: row.title ?? '',
    outline: row.outline ?? '',
    content: row.content ?? '',
    summary: row.summary ?? '',
    wordCount: row.word_count ?? 0,
    status: row.status,
    cognitiveFrame: row.cognitive_frame ?? '',
    emotionalAnchor: row.emotional_anchor ?? '',
    worldTexture: row.world_texture ?? '',
    concreteMystery: row.concrete_mystery ?? '',
    interpersonalTension: row.interpersonal_tension ?? '',
    createdAt: row.created_at ?? '',
    updatedAt: row.updated_at ?? '',
  }
}

export function toCharacter(row: any): Character {
  return {
    id: row.id,
    name: row.name ?? '',
    age: row.age ?? '',
    gender: row.gender ?? '',
    appearance: row.appearance ?? '',
    personality: row.personality ?? '',
    background: row.background ?? '',
    motivation: row.motivation ?? '',
    arc: row.arc ?? '',
    extMarkers: row.ext_markers ?? '',
    avatar: row.avatar ?? '',
    notes: row.notes ?? '',
    chapterCount: row.chapterCount ?? 0,
  }
}

export function toForeshadow(row: any): Foreshadow {
  return {
    id: row.id,
    title: row.title ?? '',
    description: row.description ?? '',
    status: row.status,
    plantedChapterId: row.planted_chapter_id ?? undefined,
    expectedResolveChapter: row.expected_resolve_chapter ?? 0,
    resolvedChapterId: row.resolved_chapter_id ?? undefined,
    priority: row.priority,
  }
}

export function toMemory(row: any): Memory {
  return {
    id: row.id,
    category: row.category,
    content: row.content ?? '',
    sourceChapterId: row.source_chapter_id ?? undefined,
    similarity: row.similarity ?? undefined,
  }
}

export function toRelation(row: any): CharacterRelation {
  return {
    id: row.id,
    characterAId: row.character_a_id,
    characterBId: row.character_b_id,
    relationType: row.relation_type,
    description: row.description ?? '',
    intensity: row.intensity ?? 3,
    startedAt: row.started_at ?? '',
    endedAt: row.ended_at ?? '',
    layoutX: row.layout_x ?? undefined,
    layoutY: row.layout_y ?? undefined,
  }
}

export function toStats(row: any): ProjectStats {
  return {
    ...row,
    volumes: row.volumes?.map((v: any) => ({
      id: v.id,
      title: v.title,
      sortOrder: v.sort_order,
      chapterCount: v.chapter_count,
      wordCount: v.word_count,
    })),
    chapters: (row.chapters || []).map((c: any) => ({
      id: c.id,
      num: c.num,
      title: c.title,
      wordCount: c.word_count,
      status: c.status,
    })),
  }
}
