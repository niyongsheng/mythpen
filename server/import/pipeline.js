// ─── AI import pipeline ───
// Orchestrates structure detection, metadata extraction, per-chapter
// enrichment, and whole-book archive extraction. Everything is analyzed in
// memory; persistence happens only after the pipeline succeeds, so a cancel
// or fatal error never leaves a half-created project.

const {
  normalizeText,
  buildLineIndex,
  extractCandidates,
  buildNumberedText,
  applyTocProtection,
  sliceBook,
  fallbackSplit,
  chapterExcerpt,
} = require('./text');
const { callJson, processBatches, codedError } = require('./ai-json');
const { LANGUAGE_CODES, languageName, normalizeLanguageCode, perChapterTokens } = require('../languages');
const { ALLOWED_STYLES } = require('../styles');
const prompts = require('../prompts/import');

const MAX_TEXT_CHARS = 20_000_000;
const MAX_CHAPTERS = 5000;
const FULLTEXT_STRUCTURE_LIMIT = 50_000;
const FULLTEXT_MAX_LINES = 4000;
const FULLTEXT_MAX_CANDIDATES = 400;
const DEEP_ARCHIVE_LIMIT = 120_000;
const CHAPTER_EXCERPT_CHARS = 1300;
const ARCHIVE_CHUNK = 20_000;
const CANDIDATE_CAP = 3000;

const ALLOWED_GENRES = new Set([
  'sci-fi',
  'fantasy',
  'xianxia',
  'wuxia',
  'romance',
  'history',
  'urban',
  'mystery',
  'game',
  'biography',
  'other',
]);
const ALLOWED_MODES = new Set(['short-story', 'medium-novel', 'long-novel']);
const ALLOWED_LANGUAGES = LANGUAGE_CODES;
const WORLD_CATEGORIES = new Set(['location', 'organization', 'concept', 'event']);
const MEMORY_CATEGORIES = new Set(['character', 'location', 'item', 'event', 'promise', 'other']);
const FORESHADOW_STATUSES = new Set(['planted', 'progressing', 'resolved', 'abandoned']);
const FORESHADOW_PRIORITIES = new Set(['low', 'normal', 'high']);
const SCIENCE_LABELS = new Set(['known', 'extrapolation', 'hypothesis']);
const CHARACTER_ROLES = new Set(['appears', 'speaks', 'pov', 'mentioned']);

const ARCHIVE_CAPS = {
  characters: 80,
  world: 100,
  relations: 100,
  events: 80,
  foreshadows: 60,
  memories: 100,
  science: 40,
};

function createUsage() {
  return {
    structure: { inputTokens: 0, outputTokens: 0 },
    metadata: { inputTokens: 0, outputTokens: 0 },
    chapters: { inputTokens: 0, outputTokens: 0 },
    archive: { inputTokens: 0, outputTokens: 0 },
    total: { inputTokens: 0, outputTokens: 0 },
  };
}

function addStageUsage(usage, stage, resultUsage) {
  const inputTokens = Number(resultUsage?.inputTokens) || 0;
  const outputTokens = Number(resultUsage?.outputTokens) || 0;
  usage[stage].inputTokens += inputTokens;
  usage[stage].outputTokens += outputTokens;
  usage.total.inputTokens += inputTokens;
  usage.total.outputTokens += outputTokens;
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function cleanName(value, maxLength) {
  return cleanText(value, maxLength);
}

/** Keep source text from prematurely closing the wrapper tag in a prompt. */
function escapeClosingTag(value, tag) {
  return String(value ?? '').replace(new RegExp(`</${tag}>`, 'gi'), `&lt;/${tag}&gt;`);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/** Models sometimes emit booleans as strings; accept the common spellings. */
function asBool(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function oneOf(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

function flattenChapters(volumes) {
  return volumes.flatMap((volume) => volume.chapters);
}

function dedupeSelections(selections) {
  const byLine = new Map();
  for (const selection of selections) {
    const line = Number(selection.line);
    if (!Number.isInteger(line) || line < 1) continue;
    const existing = byLine.get(line);
    const normalized = {
      line,
      type: selection.type === 'volume' ? 'volume' : 'chapter',
      title: cleanText(selection.title, 200),
    };
    if (!existing || (existing.type !== 'chapter' && normalized.type === 'chapter')) {
      byLine.set(line, normalized);
    }
  }
  return [...byLine.values()].sort((a, b) => a.line - b.line);
}

function normalizeFulltextSelections(data, lineCount) {
  const list = asArray(data?.selections).concat(asArray(data?.items));
  const selections = [];
  for (const item of list) {
    const line = Number(item?.line ?? item?.i);
    if (!Number.isInteger(line) || line < 1 || line > lineCount) continue;
    const type = item?.type === 'volume' || item?.kind === 'volume' ? 'volume' : 'chapter';
    selections.push({ line, type, title: item?.title || '' });
  }
  return dedupeSelections(selections);
}

function normalizeCandidateSelections(data, candidates) {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const byLine = new Map(candidates.map((candidate) => [candidate.line, candidate]));
  const list = asArray(data?.selections).concat(asArray(data?.items));
  const selections = [];
  for (const item of list) {
    const candidate = byId.get(Number(item?.id)) || byLine.get(Number(item?.line));
    if (!candidate) continue;
    const aiType = item?.type ?? item?.kind;
    const type = aiType === 'volume'
      ? 'volume'
      : aiType === 'chapter'
        ? 'chapter'
        : candidate.strongType === 'volume'
          ? 'volume'
          : 'chapter';
    // Titles always come from the source line, never from the model.
    selections.push({ line: candidate.line, type, title: candidate.text });
  }
  return dedupeSelections(selections);
}

function finalizeStructure({ text, lineIndex, selections, warnings }) {
  let resolved = dedupeSelections(selections);
  resolved = applyTocProtection(resolved, text, lineIndex);

  let chapterCount = resolved.filter((selection) => selection.type === 'chapter').length;
  if (chapterCount > MAX_CHAPTERS) {
    throw codedError(`章节数超过上限（${MAX_CHAPTERS} 章）`, 'TOO_MANY_CHAPTERS');
  }

  let sliced = sliceBook(text, lineIndex, resolved);
  warnings.push(...sliced.warnings);
  chapterCount = flattenChapters(sliced.volumes).length;

  if (chapterCount === 0) {
    sliced = fallbackSplit(text, lineIndex);
    warnings.push(...sliced.warnings);
    chapterCount = flattenChapters(sliced.volumes).length;
  }

  if (chapterCount > MAX_CHAPTERS) {
    throw codedError(`章节数超过上限（${MAX_CHAPTERS} 章）`, 'TOO_MANY_CHAPTERS');
  }
  if (chapterCount === 0) {
    throw codedError('AI 未能识别出任何可导入的正文', 'STRUCTURE_FAILED');
  }

  return { volumes: sliced.volumes, chapterCount, warnings };
}

async function runFulltextStructure({ text, lineIndex, fileName, format, adapter, isCancelled, signal, onUsage, warnings }) {
  const numbered = buildNumberedText(text, lineIndex, FULLTEXT_MAX_LINES);
  if (!numbered) return null;

  const input = `<book_content>\n【文件】${fileName}\n【格式】${format}\n【总字数】${text.length}\n\n${escapeClosingTag(numbered.text, 'book_content')}\n</book_content>`;
  try {
    const data = await callJson(adapter, prompts.STRUCTURE_FULLTEXT_SYSTEM_PROMPT, input, {
      isCancelled,
      signal,
      onUsage,
      label: '结构识别',
      timeoutMs: 180000,
      maxRetries: 2,
    });
    return normalizeFulltextSelections(data, numbered.lineCount);
  } catch (err) {
    if (err.code === 'CANCELLED') throw err;
    if (err.status === 400 || ['AI_TRUNCATED', 'AI_CONTEXT_LENGTH', 'AI_BAD_JSON', 'AI_TIMEOUT'].includes(err.code)) {
      warnings.push('全文结构识别未完成，已改用标题候选模式');
      return null;
    }
    throw err;
  }
}

async function runCandidateStructure({ text, fileName, format, candidates, adapter, maxOutputTokens, isCancelled, signal, onUsage, warnings, emit }) {
  if (candidates.length === 0) return [];

  const budget = Math.max(1024, Number(maxOutputTokens) || 8192);
  const batchSize = Math.max(10, Math.min(120, Math.floor(budget / 100)));
  const bookInfo = {
    fileName,
    format,
    totalChars: text.length,
    opening: cleanText(text.slice(0, 1200), 1200),
    ending: cleanText(text.slice(-600), 600),
  };
  const payload = candidates.map((candidate) => ({
    id: candidate.id,
    line: candidate.line,
    text: candidate.text,
    prevBlank: candidate.prevBlank,
    nextLen: candidate.nextLen,
    gapNext: candidate.gapNext,
  }));

  const results = await processBatches(payload, batchSize, async (batch) => {
    const input = `<candidate_lines>\n${escapeClosingTag(JSON.stringify({ book: bookInfo, candidates: batch }), 'candidate_lines')}\n</candidate_lines>`;
    const data = await callJson(adapter, prompts.STRUCTURE_CANDIDATE_SYSTEM_PROMPT, input, {
      isCancelled,
      signal,
      onUsage,
      label: '结构识别',
      timeoutMs: 180000,
      maxRetries: 2,
    });
    return normalizeCandidateSelections(data, candidates);
  }, {
    isCancelled,
    onProgress: (current, total) => emit('progress', { stage: 'structure', current, total }),
    onItemError: (err, batch) => {
      warnings.push(`结构识别批次失败（${batch.length} 个候选）：${err.message}`);
    },
  });

  return results;
}

async function detectStructure({ text, fileName, format, adapter, maxOutputTokens, isCancelled, signal, onUsage, emit }) {
  const lineIndex = buildLineIndex(text);
  const candidateInfo = extractCandidates(text, lineIndex, { maxCandidates: CANDIDATE_CAP });
  const warnings = [...candidateInfo.warnings];
  const lineCount = lineIndex.starts.length;

  const canUseFulltext = text.length <= FULLTEXT_STRUCTURE_LIMIT
    && lineCount <= FULLTEXT_MAX_LINES
    && candidateInfo.total <= FULLTEXT_MAX_CANDIDATES;

  let selections = null;
  if (canUseFulltext) {
    selections = await runFulltextStructure({
      text,
      lineIndex,
      fileName,
      format,
      adapter,
      isCancelled,
      signal,
      onUsage,
      warnings,
    });
  }

  if (!selections || selections.length === 0) {
    selections = await runCandidateStructure({
      text,
      fileName,
      format,
      candidates: candidateInfo.candidates,
      adapter,
      maxOutputTokens,
      isCancelled,
      signal,
      onUsage,
      warnings,
      emit,
    });
  }

  const finalized = finalizeStructure({ text, lineIndex, selections, warnings });
  return { lineIndex, ...finalized, warnings };
}

function buildOpeningSample(volumes) {
  const chapters = flattenChapters(volumes);
  if (chapters.length === 0) return '';
  return chapters
    .slice(0, 3)
    .map((chapter) => `【${chapter.title}】\n${chapter.content.slice(0, 3000)}`)
    .join('\n\n')
    .slice(0, 8000);
}

function buildEndingSample(volumes) {
  const chapters = flattenChapters(volumes);
  return chapters
    .slice(-2)
    .map((chapter) => `【${chapter.title}】\n${chapter.content.slice(-1500)}`)
    .join('\n\n')
    .slice(-3000);
}

function normalizeMetadata(data, source, options) {
  const value = data && typeof data === 'object' ? data : {};
  const rawGenres = asArray(value.genres);
  const aiGenres = rawGenres.filter((genre) => ALLOWED_GENRES.has(genre));
  const genres = [...new Set([
    ...asArray(options.genres).filter((genre) => ALLOWED_GENRES.has(genre)),
    ...aiGenres,
  ])];
  // 爽文 is a style flag; legacy models may still report it as a genre.
  const powerFantasy = asBool(value.powerFantasy)
    || options.powerFantasy === true
    || rawGenres.includes('power-fantasy');
  const styleSet = new Set(asArray(options.styles).filter((style) => ALLOWED_STYLES.has(style)));
  if (powerFantasy) styleSet.add('power-fantasy');
  return {
    title: cleanName(value.title, 200) || cleanName(source.title, 200) || options.name,
    author: cleanName(value.author, 100) || cleanName(source.author, 100) || '佚名',
    description: cleanText(value.description, 1200) || cleanText(source.description, 1200),
    language: normalizeLanguageCode(options.language),
    mode: options.mode,
    genres,
    styles: [...styleSet],
    powerFantasy,
    synopsis: cleanText(value.synopsis, 2400) || cleanText(value.description, 1200) || '',
  };
}

async function analyzeMetadata({ volumes, source, options, fileName, format, adapter, isCancelled, signal, onUsage, warnings }) {
  const chapters = flattenChapters(volumes);
  const sourceLine = source.title && format === 'epub'
    ? `【文件元数据】书名=${source.title}；作者=${source.author || '未知'}；简介=${cleanText(source.description, 800)}`
    : `【文件名】${fileName}`;
  const content = [
    `【文件】${fileName}`,
    `【格式】${format}`,
    `【用户选择】语言=${languageName(options.language)}；模式=${options.mode}；类型=${asArray(options.genres).join(',') || '未指定'}`,
    sourceLine,
    `【章节数量】${chapters.length}`,
    `【开头】\n${buildOpeningSample(volumes)}`,
    `【结尾】\n${buildEndingSample(volumes)}`,
    `【章节标题（前 80 个）】\n${chapters.slice(0, 80).map((chapter) => chapter.title).join('\n')}`,
  ].filter(Boolean).join('\n\n');
  const input = `<book_content>\n${escapeClosingTag(content, 'book_content')}\n</book_content>`;

  try {
    const data = await callJson(adapter, prompts.METADATA_SYSTEM_PROMPT, input, {
      isCancelled,
      signal,
      onUsage,
      label: '元数据提取',
      timeoutMs: 120000,
      maxRetries: 2,
    });
    return normalizeMetadata(data, source, options);
  } catch (err) {
    if (err.code === 'CANCELLED') throw err;
    warnings.push(`作品信息提取失败，已使用文件信息兜底：${err.message}`);
    return normalizeMetadata(null, source, options);
  }
}

function computeEnrichBatch(maxOutputTokens, language) {
  const budget = Math.max(1024, Number(maxOutputTokens) || 8192) - 500;
  const perChapter = perChapterTokens(language);
  return Math.max(1, Math.min(20, Math.floor(budget / perChapter)));
}

function normalizeChapterFields(item) {
  const characters = asArray(item?.characters)
    .map((character) => {
      if (typeof character === 'string') {
        return { name: cleanName(character, 100), role: 'appears' };
      }
      return {
        name: cleanName(character?.name, 100),
        role: oneOf(character?.role, CHARACTER_ROLES, 'appears'),
      };
    })
    .filter((character) => character.name)
    .slice(0, 12);

  return {
    outline: cleanText(item?.outline, 600),
    summary: cleanText(item?.summary, 400),
    cognitive_frame: cleanText(item?.cognitive_frame, 200),
    emotional_anchor: cleanText(item?.emotional_anchor, 200),
    world_texture: cleanText(item?.world_texture, 200),
    concrete_mystery: cleanText(item?.concrete_mystery, 200),
    interpersonal_tension: cleanText(item?.interpersonal_tension, 200),
    characters,
  };
}

async function enrichChapters({ volumes, language, adapter, maxOutputTokens, isCancelled, signal, onUsage, warnings, emit }) {
  const chapters = flattenChapters(volumes);
  const chapterByNum = new Map(chapters.map((chapter) => [chapter.num, chapter]));
  const fields = new Map();
  const charactersByChapter = new Map();
  if (chapters.length === 0) return { fields, charactersByChapter };

  const batchSize = computeEnrichBatch(maxOutputTokens, language);
  await processBatches(chapters, batchSize, async (batch) => {
    const payload = batch.map((chapter) => ({
      num: chapter.num,
      title: chapter.title,
      excerpt: chapterExcerpt(chapter.content, CHAPTER_EXCERPT_CHARS),
    }));
    const input = `<chapters>\n${escapeClosingTag(JSON.stringify({ language: languageName(language), chapters: payload }), 'chapters')}\n</chapters>`;
    const data = await callJson(adapter, prompts.CHAPTER_SYSTEM_PROMPT, input, {
      isCancelled,
      signal,
      onUsage,
      label: '章节分析',
      timeoutMs: 180000,
      maxRetries: 2,
    });

    const items = asArray(data?.chapters).concat(asArray(data?.items));
    for (const item of items) {
      let num = Number(item?.num);
      if (!chapterByNum.has(num)) {
        const index = Number(item?.i);
        if (Number.isInteger(index) && index >= 0 && index < batch.length) {
          num = batch[index].num;
        }
      }
      if (!chapterByNum.has(num) || fields.has(num)) continue;
      const normalized = normalizeChapterFields(item);
      fields.set(num, normalized);
      charactersByChapter.set(num, normalized.characters);
    }
    return [];
  }, {
    isCancelled,
    onProgress: (current, total) => emit('progress', { stage: 'chapters', current, total }),
    onItemError: (err, batch) => {
      warnings.push(`章节分析批次失败（${batch.length} 章）：${err.message}`);
    },
  });

  if (fields.size < chapters.length) {
    warnings.push(`章节档案生成未完成：${fields.size}/${chapters.length} 章`);
  }

  return { fields, charactersByChapter };
}

function splitByParagraph(text, maxChars) {
  if (text.length <= maxChars) return [text];
  const lines = text.split('\n');
  const parts = [];
  let buffer = '';
  for (const line of lines) {
    if (line.length > maxChars) {
      if (buffer.trim()) parts.push(buffer.trim());
      buffer = '';
      for (let offset = 0; offset < line.length; offset += maxChars) {
        parts.push(line.slice(offset, offset + maxChars));
      }
      continue;
    }
    if (buffer.length + line.length + 1 > maxChars && buffer.trim()) {
      parts.push(buffer.trim());
      buffer = '';
    }
    buffer += `${line}\n`;
  }
  if (buffer.trim()) parts.push(buffer.trim());
  return parts.filter(Boolean);
}

function buildArchiveChunks(text, volumes, warnings) {
  const chapters = flattenChapters(volumes);
  const items = [];

  if (text.length <= DEEP_ARCHIVE_LIMIT) {
    for (const chapter of chapters) {
      for (const part of splitByParagraph(chapter.content, ARCHIVE_CHUNK)) {
        items.push({
          label: `第${chapter.num}章 ${chapter.title}`,
          num: chapter.num,
          text: part,
        });
      }
    }
    warnings.push(`已对全书 ${chapters.length} 个章节进行档案分析`);
  } else {
    const indices = new Set();
    for (const index of [0, 1, 2, chapters.length - 3, chapters.length - 2, chapters.length - 1]) {
      if (index >= 0 && index < chapters.length) indices.add(index);
    }
    const sampleCount = Math.min(15, chapters.length);
    for (let i = 0; i < sampleCount; i++) {
      indices.add(Math.floor(((i + 0.5) * chapters.length) / sampleCount));
    }
    const sorted = [...indices].filter((index) => index >= 0 && index < chapters.length).sort((a, b) => a - b);
    for (const index of sorted) {
      const chapter = chapters[index];
      items.push({
        label: `第${chapter.num}章 ${chapter.title}`,
        num: chapter.num,
        text: chapter.content.slice(0, 6000),
      });
    }
    warnings.push(`长书采用抽样档案分析：共 ${chapters.length} 章，抽样 ${sorted.length} 章`);
  }

  const chunks = [];
  let current = [];
  let size = 0;
  for (const item of items) {
    if (current.length > 0 && size + item.text.length > ARCHIVE_CHUNK) {
      chunks.push({ items: current });
      current = [];
      size = 0;
    }
    current.push(item);
    size += item.text.length + item.label.length + 4;
  }
  if (current.length > 0) chunks.push({ items: current });
  return chunks;
}

function normalizeArchiveChunk(data) {
  const value = data && typeof data === 'object' ? data : {};

  const characters = asArray(value.characters)
    .map((character) => ({
      name: cleanName(character?.name, 100),
      aliases: asArray(character?.aliases).map((alias) => cleanName(alias, 100)).filter(Boolean).slice(0, 5),
      age: cleanText(character?.age, 50),
      gender: cleanText(character?.gender, 20),
      appearance: cleanText(character?.appearance, 500),
      personality: cleanText(character?.personality, 1000),
      background: cleanText(character?.background, 1500),
      motivation: cleanText(character?.motivation, 800),
      arc: cleanText(character?.arc, 800),
    }))
    .filter((character) => character.name)
    .slice(0, 15);

  const world = asArray(value.world)
    .map((entry) => ({
      category: oneOf(entry?.category, WORLD_CATEGORIES, 'concept'),
      name: cleanName(entry?.name, 100),
      description: cleanText(entry?.description, 1000),
    }))
    .filter((entry) => entry.name)
    .slice(0, 12);

  const relations = asArray(value.relations)
    .map((relation) => ({
      a: cleanName(relation?.a ?? relation?.character_a, 100),
      b: cleanName(relation?.b ?? relation?.character_b, 100),
      type: cleanText(relation?.type ?? relation?.relation_type, 100),
      description: cleanText(relation?.description, 1000),
      intensity: clampInt(relation?.intensity, 1, 5, 3),
    }))
    .filter((relation) => relation.a && relation.b && relation.type && relation.a !== relation.b)
    .slice(0, 15);

  const events = asArray(value.events)
    .map((event) => ({
      year: cleanText(event?.year, 100),
      title: cleanName(event?.title, 200),
      description: cleanText(event?.description, 1000),
      importance: clampInt(event?.importance, 1, 5, 3),
    }))
    .filter((event) => event.title)
    .slice(0, 8);

  const foreshadows = asArray(value.foreshadows)
    .map((foreshadow) => ({
      title: cleanName(foreshadow?.title, 200),
      description: cleanText(foreshadow?.description, 1000),
      status: oneOf(foreshadow?.status, FORESHADOW_STATUSES, 'planted'),
      priority: oneOf(foreshadow?.priority, FORESHADOW_PRIORITIES, 'normal'),
      chapter_num: clampInt(foreshadow?.chapter_num ?? foreshadow?.planted_chapter_num, 0, MAX_CHAPTERS, 0),
      expected_resolve_chapter: clampInt(foreshadow?.expected_resolve_chapter, 0, MAX_CHAPTERS, 0),
    }))
    .filter((foreshadow) => foreshadow.title)
    .slice(0, 8);

  const memories = asArray(value.memories)
    .map((memory) => ({
      category: oneOf(memory?.category, MEMORY_CATEGORIES, 'other'),
      content: cleanText(memory?.content, 1000),
      chapter_num: clampInt(memory?.chapter_num ?? memory?.source_chapter_num, 0, MAX_CHAPTERS, 0),
    }))
    .filter((memory) => memory.content)
    .slice(0, 8);

  const science = asArray(value.science)
    .map((entry) => ({
      label: oneOf(entry?.label, SCIENCE_LABELS, 'known'),
      name: cleanName(entry?.name, 200),
      description: cleanText(entry?.description, 1000),
    }))
    .filter((entry) => entry.name)
    .slice(0, 4);

  return {
    synopsis: cleanText(value.synopsis, 800),
    characters,
    world,
    relations,
    events,
    foreshadows,
    memories,
    science,
  };
}

async function analyzeArchive({ text, volumes, language, adapter, maxOutputTokens, isCancelled, signal, onUsage, warnings, emit }) {
  const chunks = buildArchiveChunks(text, volumes, warnings);
  const partials = [];
  if (maxOutputTokens < 4096) {
    warnings.push('最大输出 Token 较低，完整档案可能不够完整，建议在设置中调高后重新分析');
  }
  const budgetNote = maxOutputTokens < 4096
    ? '【本次输出预算】请严格控制数量：characters≤6，world≤5，relations≤6，events≤4，foreshadows≤4，memories≤4，science≤2；只保留最关键的信息。'
    : '';

  await processBatches(chunks, 1, async (batch) => {
    const chunk = batch[0];
    const body = chunk.items.map((item) => `【${item.label}】\n${item.text}`).join('\n\n');
    const input = `<book_content>\n${budgetNote ? `${budgetNote}\n\n` : ''}${escapeClosingTag(body, 'book_content')}\n</book_content>`;
    const data = await callJson(adapter, prompts.ARCHIVE_SYSTEM_PROMPT, input, {
      isCancelled,
      signal,
      onUsage,
      label: '档案提取',
      timeoutMs: 180000,
      maxRetries: 2,
    });
    partials.push(normalizeArchiveChunk(data));
    return [];
  }, {
    isCancelled,
    onProgress: (current, total) => emit('progress', { stage: 'archive', current, total }),
    onItemError: (err, batch) => {
      warnings.push(`档案提取片段失败（${batch.length} 个片段）：${err.message}`);
    },
  });

  return partials;
}

function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .toLowerCase();
}

function mergeCharacter(target, incoming) {
  for (const field of ['age', 'gender', 'appearance', 'personality', 'background', 'motivation', 'arc']) {
    if ((incoming[field] || '').length > (target[field] || '').length) target[field] = incoming[field];
  }
  const aliases = new Set([...(target.aliases || []), ...(incoming.aliases || [])]);
  target.aliases = [...aliases].filter(Boolean).slice(0, 8);
}

function mergeArchive(partials, charactersByChapter, warnings) {
  const characterMap = new Map();
  const aliasToKey = new Map();
  const relationMap = new Map();
  const worldMap = new Map();
  const eventMap = new Map();
  const foreshadowMap = new Map();
  const memoryMap = new Map();
  const scienceMap = new Map();

  const resolveCharacterKey = (name) => {
    const key = normalizeName(name);
    return aliasToKey.get(key) || key;
  };

  const resolveIncomingCharacterKey = (character) => {
    const nameKey = normalizeName(character.name);
    if (!nameKey) return '';
    if (characterMap.has(nameKey)) return nameKey;
    const mapped = aliasToKey.get(nameKey);
    if (mapped && characterMap.has(mapped)) return mapped;
    for (const alias of character.aliases || []) {
      const aliasKey = normalizeName(alias);
      if (!aliasKey) continue;
      if (characterMap.has(aliasKey)) return aliasKey;
      const aliasMapped = aliasToKey.get(aliasKey);
      if (aliasMapped && characterMap.has(aliasMapped)) return aliasMapped;
    }
    return nameKey;
  };

  for (const partial of partials) {
    for (const character of partial.characters) {
      const key = resolveIncomingCharacterKey(character);
      if (!key) continue;
      const existing = characterMap.get(key);
      if (existing) {
        mergeCharacter(existing, character);
      } else {
        characterMap.set(key, {
          ...character,
          aliases: [...(character.aliases || [])],
        });
      }
      aliasToKey.set(key, key);
      const nameKey = normalizeName(character.name);
      const nameMapped = aliasToKey.get(nameKey);
      if (!nameMapped || nameMapped === key || !characterMap.has(nameMapped)) {
        aliasToKey.set(nameKey, key);
      }
      for (const alias of character.aliases) {
        const aliasKey = normalizeName(alias);
        if (!aliasKey) continue;
        const existingMapped = aliasToKey.get(aliasKey);
        if (!existingMapped || existingMapped === key || !characterMap.has(existingMapped)) {
          aliasToKey.set(aliasKey, key);
        }
      }
    }

    for (const entry of partial.world) {
      const key = `${entry.category}|${normalizeName(entry.name)}`;
      const existing = worldMap.get(key);
      if (!existing) worldMap.set(key, { ...entry });
      else if ((entry.description || '').length > (existing.description || '').length) existing.description = entry.description;
    }

    for (const event of partial.events) {
      const key = `${normalizeName(event.year)}|${normalizeName(event.title)}`;
      const existing = eventMap.get(key);
      if (!existing) eventMap.set(key, { ...event });
      else {
        if ((event.description || '').length > (existing.description || '').length) existing.description = event.description;
        existing.importance = Math.max(existing.importance, event.importance);
      }
    }

    for (const foreshadow of partial.foreshadows) {
      const key = normalizeName(foreshadow.title);
      if (!key) continue;
      const existing = foreshadowMap.get(key);
      if (!existing) {
        foreshadowMap.set(key, { ...foreshadow });
      } else {
        if ((foreshadow.description || '').length > (existing.description || '').length) {
          existing.description = foreshadow.description;
        }
        const statusRank = { abandoned: 0, planted: 1, progressing: 2, resolved: 3 };
        const priorityRank = { low: 0, normal: 1, high: 2 };
        if ((statusRank[foreshadow.status] || 0) > (statusRank[existing.status] || 0)) {
          existing.status = foreshadow.status;
        }
        if ((priorityRank[foreshadow.priority] || 0) > (priorityRank[existing.priority] || 0)) {
          existing.priority = foreshadow.priority;
        }
        if (!existing.chapter_num && foreshadow.chapter_num) existing.chapter_num = foreshadow.chapter_num;
        if (!existing.expected_resolve_chapter && foreshadow.expected_resolve_chapter) {
          existing.expected_resolve_chapter = foreshadow.expected_resolve_chapter;
        }
      }
    }

    for (const memory of partial.memories) {
      const key = `${memory.category}|${normalizeName(memory.content)}`;
      if (!memoryMap.has(key)) memoryMap.set(key, { ...memory });
    }

    for (const entry of partial.science) {
      const key = `${entry.label}|${normalizeName(entry.name)}`;
      if (!scienceMap.has(key)) scienceMap.set(key, { ...entry });
    }
  }

  // Count appearances for ranking and add stubs for characters that only
  // appear in per-chapter enrichment.
  const appearanceCount = new Map();
  for (const characters of charactersByChapter.values()) {
    const seen = new Set();
    for (const character of characters) {
      const key = resolveCharacterKey(character.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      appearanceCount.set(key, (appearanceCount.get(key) || 0) + 1);
    }
  }

  let stubs = 0;
  for (const [chapterNum, characters] of charactersByChapter.entries()) {
    for (const character of characters) {
      const key = resolveCharacterKey(character.name);
      if (!key || characterMap.has(key)) continue;
      if (stubs >= 100) break;
      stubs += 1;
      characterMap.set(key, {
        name: character.name,
        aliases: [],
        age: '',
        gender: '',
        appearance: '',
        personality: '',
        background: '',
        motivation: '',
        arc: '',
        notes: `由第 ${chapterNum} 章的出场记录自动补充`,
      });
      aliasToKey.set(key, key);
    }
  }

  // Relations are resolved only after every character (including stubs) is
  // known. This prevents a chunk from losing a relation just because the
  // other endpoint first appeared in a later chunk.
  for (const partial of partials) {
    for (const relation of partial.relations) {
      const keyA = resolveCharacterKey(relation.a);
      const keyB = resolveCharacterKey(relation.b);
      const characterA = characterMap.get(keyA);
      const characterB = characterMap.get(keyB);
      if (!characterA || !characterB) {
        warnings.push(`已跳过指向未知角色的关系：${relation.a} → ${relation.b}`);
        continue;
      }
      const pair = [keyA, keyB].sort().join('|') + '|' + normalizeName(relation.type);
      const existing = relationMap.get(pair);
      if (existing) {
        if ((relation.description || '').length > (existing.description || '').length) {
          existing.description = relation.description;
        }
        existing.intensity = Math.max(existing.intensity, relation.intensity);
      } else {
        relationMap.set(pair, {
          a: characterA.name,
          b: characterB.name,
          type: relation.type,
          description: relation.description,
          intensity: relation.intensity,
        });
      }
    }
  }

  const characters = [...characterMap.entries()]
    .map(([key, character]) => ({
      ...character,
      _key: key,
      _count: appearanceCount.get(key) || 0,
    }))
    .sort((a, b) => b._count - a._count)
    .slice(0, ARCHIVE_CAPS.characters)
    .map(({ _key, _count, ...character }) => character);

  const keptCharacterNames = new Set(characters.map((character) => normalizeName(character.name)));

  return {
    characters,
    relations: [...relationMap.values()]
      .filter((relation) => keptCharacterNames.has(normalizeName(relation.a)) && keptCharacterNames.has(normalizeName(relation.b)))
      .slice(0, ARCHIVE_CAPS.relations),
    world: [...worldMap.values()].slice(0, ARCHIVE_CAPS.world),
    events: [...eventMap.values()].slice(0, ARCHIVE_CAPS.events),
    foreshadows: [...foreshadowMap.values()].slice(0, ARCHIVE_CAPS.foreshadows),
    memories: [...memoryMap.values()].slice(0, ARCHIVE_CAPS.memories),
    science: [...scienceMap.values()].slice(0, ARCHIVE_CAPS.science),
  };
}

async function reduceSynopsis({ partials, fallbackSynopsis, adapter, isCancelled, signal, onUsage, warnings }) {
  const synopses = partials.map((partial) => partial.synopsis).filter(Boolean);
  if (synopses.length === 0) return fallbackSynopsis;
  if (synopses.length === 1) return synopses[0];

  try {
    const input = `<book_content>\n${escapeClosingTag(synopses.join('\n---\n'), 'book_content')}\n</book_content>`;
    const data = await callJson(adapter, prompts.SYNOPSIS_SYSTEM_PROMPT, input, {
      isCancelled,
      signal,
      onUsage,
      label: '梗概汇总',
      timeoutMs: 120000,
      maxRetries: 1,
    });
    return cleanText(data?.synopsis, 2400) || fallbackSynopsis;
  } catch (err) {
    if (err.code === 'CANCELLED') throw err;
    warnings.push(`全书梗概汇总失败，已使用作品梗概：${err.message}`);
    return fallbackSynopsis;
  }
}

/**
 * Run the full analysis. Returns data ready for persistence; nothing is
 * written to disk here.
 */
async function runImportPipeline({
  text,
  fileName,
  format,
  source,
  options,
  adapter,
  aiConfig,
  emit,
  isCancelled,
  signal,
}) {
  const normalized = normalizeText(text);
  if (!normalized.trim()) throw codedError('没有可导入的正文', 'EMPTY_IMPORT');
  if (normalized.length > MAX_TEXT_CHARS) throw codedError('正文内容过大，请拆分后分项目导入', 'FILE_TOO_LARGE');

  const language = normalizeLanguageCode(options.language);
  const mode = ALLOWED_MODES.has(options.mode) ? options.mode : 'medium-novel';
  const maxOutputTokens = Number(aiConfig.maxOutputTokens) || 8192;
  const usage = createUsage();
  const warnings = [];
  let flushedWarnings = 0;
  let emittedWarnings = 0;
  const flushWarnings = () => {
    while (flushedWarnings < warnings.length) {
      const message = warnings[flushedWarnings];
      flushedWarnings += 1;
      // Keep the live toast stream bounded; the final payload still carries
      // the complete warning list.
      if (emittedWarnings >= 30) continue;
      emittedWarnings += 1;
      emit('warning', { message });
    }
  };

  emit('stage', { stage: 'structure', message: '正在识别章节结构' });
  const structure = await detectStructure({
    text: normalized,
    fileName,
    format,
    adapter,
    maxOutputTokens,
    isCancelled,
    signal,
    onUsage: (resultUsage) => addStageUsage(usage, 'structure', resultUsage),
    emit,
  });
  warnings.push(...structure.warnings);
  flushWarnings();
  if (structure.chapterCount > MAX_CHAPTERS) {
    throw codedError(`章节数超过上限（${MAX_CHAPTERS} 章）`, 'TOO_MANY_CHAPTERS');
  }
  emit('stage', {
    stage: 'structure',
    status: 'done',
    message: `已识别 ${structure.volumes.length} 卷 / ${structure.chapterCount} 章`,
  });

  emit('stage', { stage: 'metadata', message: '正在提取作品信息' });
  const meta = await analyzeMetadata({
    volumes: structure.volumes,
    source,
    options: { ...options, language, mode },
    fileName,
    format,
    adapter,
    isCancelled,
    signal,
    onUsage: (resultUsage) => addStageUsage(usage, 'metadata', resultUsage),
    warnings,
  });
  flushWarnings();
  emit('stage', { stage: 'metadata', status: 'done', message: '作品信息提取完成' });

  emit('stage', { stage: 'chapters', message: '正在生成章节档案' });
  const chapterResult = await enrichChapters({
    volumes: structure.volumes,
    language,
    adapter,
    maxOutputTokens,
    isCancelled,
    signal,
    onUsage: (resultUsage) => addStageUsage(usage, 'chapters', resultUsage),
    warnings,
    emit,
  });
  flushWarnings();
  emit('stage', { stage: 'chapters', status: 'done', message: '章节档案生成完成' });

  emit('stage', { stage: 'archive', message: '正在提取角色与世界观' });
  const partials = await analyzeArchive({
    text: normalized,
    volumes: structure.volumes,
    language,
    adapter,
    maxOutputTokens,
    isCancelled,
    signal,
    onUsage: (resultUsage) => addStageUsage(usage, 'archive', resultUsage),
    warnings,
    emit,
  });
  const synopsis = await reduceSynopsis({
    partials,
    fallbackSynopsis: meta.synopsis,
    adapter,
    isCancelled,
    signal,
    onUsage: (resultUsage) => addStageUsage(usage, 'archive', resultUsage),
    warnings,
  });
  const archive = mergeArchive(partials, chapterResult.charactersByChapter, warnings);
  archive.synopsis = synopsis || meta.synopsis;
  flushWarnings();
  emit('stage', { stage: 'archive', status: 'done', message: '项目档案提取完成' });

  return {
    meta,
    volumes: structure.volumes,
    chapterFields: Object.fromEntries(chapterResult.fields),
    chapterCharacters: Object.fromEntries(chapterResult.charactersByChapter),
    archive,
    warnings,
    usage,
  };
}

module.exports = {
  MAX_TEXT_CHARS,
  MAX_CHAPTERS,
  ALLOWED_GENRES,
  ALLOWED_MODES,
  ALLOWED_LANGUAGES,
  runImportPipeline,
  // Exported for focused manual tests.
  _internal: {
    createUsage,
    mergeArchive,
    normalizeArchiveChunk,
    normalizeMetadata,
    buildArchiveChunks,
    finalizeStructure,
    normalizeName,
  },
};
