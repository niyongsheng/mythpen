// ─── Text utilities for AI-driven import ───
// Deterministic work only: normalize source text, index lines, propose heading
// candidates, and slice the original text at AI-approved boundaries. No
// structural decision is made here — the model decides which candidates are
// real volume/chapter headings.

const { CHAPTER_LABEL_RE, VOLUME_LABEL_RE } = require('../titles');

const ZERO_WIDTH_RE = /[​-‍﻿]/g;
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const SENTENCE_END_RE = /[。；…]$/;
const NUMBERED_RE = /^(?:[0-9]{1,4}[.、．)]|[一二三四五六七八九十百千]+[、.．)])\s*\S/;
const WRAPPED_RE = /^[【《[（(].*[】》\]）)]$/;
const HAS_TEXT_RE = /[\p{L}\p{N}]/u;

const MAX_CANDIDATE_LINES = 3000;
const MAX_CANDIDATE_TEXT = 200;

/**
 * Normalize only what is required to make offsets reliable. Body whitespace,
 * including blank lines, is deliberately preserved.
 */
function normalizeText(value) {
  return String(value ?? '')
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(ZERO_WIDTH_RE, '')
    .replace(CONTROL_RE, ' ');
}

/**
 * Build exact line offsets. `starts[i]`/`ends[i]` exclude the newline.
 * A trailing newline produces a final empty line, which is harmless.
 */
function buildLineIndex(text) {
  const starts = [];
  const ends = [];
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text.charCodeAt(i) === 10) {
      starts.push(start);
      ends.push(i);
      start = i + 1;
    }
  }
  if (starts.length === 0) {
    starts.push(0);
    ends.push(0);
  }
  return { starts, ends };
}

function lineText(text, lineIndex, line) {
  const index = line - 1;
  if (index < 0 || index >= lineIndex.starts.length) return '';
  return text.slice(lineIndex.starts[index], lineIndex.ends[index]);
}

function isBlank(value) {
  return !String(value ?? '').trim();
}

function cleanHeadingText(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Strip trailing table-of-contents leaders/page numbers: "第一章 .... 12"
    .replace(/\s*[.…·\-—]{2,}\s*\d+\s*$/, '')
    .replace(/\s+\d{1,5}\s*$/, '')
    .slice(0, MAX_CANDIDATE_TEXT);
}

function isPlausibleHeadingLine(value) {
  const line = String(value ?? '').trim();
  if (!line || line.length > 120) return false;
  if (SENTENCE_END_RE.test(line) && line.length > 40) return false;
  return HAS_TEXT_RE.test(line);
}

function classifyStrong(line) {
  if (!isPlausibleHeadingLine(line)) return null;
  // A body line such as "第三章正文。" must not become a heading candidate.
  if (SENTENCE_END_RE.test(line)) return null;
  if (VOLUME_LABEL_RE.test(line)) return 'volume';
  if (CHAPTER_LABEL_RE.test(line)) return 'chapter';
  if (NUMBERED_RE.test(line)) return 'chapter';
  return null;
}

/**
 * Find lines that might be headings. Candidates are intentionally permissive;
 * the AI decides. Returns `{ candidates, total, truncated, warnings }`.
 */
function extractCandidates(text, lineIndex, options = {}) {
  const maxCandidates = options.maxCandidates || MAX_CANDIDATE_LINES;
  const candidates = [];
  let total = 0;
  let strongCount = 0;

  for (let index = 0; index < lineIndex.starts.length; index++) {
    const raw = text.slice(lineIndex.starts[index], lineIndex.ends[index]);
    const line = raw.trim();
    if (!line || line.length > 80) continue;
    if (!HAS_TEXT_RE.test(line)) continue;

    const prevBlank = index === 0 ? true : isBlank(text.slice(lineIndex.starts[index - 1], lineIndex.ends[index - 1]));
    const nextRaw = index + 1 < lineIndex.starts.length
      ? text.slice(lineIndex.starts[index + 1], lineIndex.ends[index + 1])
      : '';
    const nextLen = nextRaw.trim().length;
    const nextBlank = index + 1 >= lineIndex.starts.length || isBlank(nextRaw);
    const strongType = classifyStrong(line);
    const weak = line.length <= 30
      && !SENTENCE_END_RE.test(line)
      && !/^[，、：:；;]/.test(line)
      && (prevBlank || nextBlank || nextLen > 40);

    if (!strongType && !weak) continue;
    total += 1;
    if (strongType) strongCount += 1;

    let score = strongType ? 100 : 10;
    if (prevBlank) score += 5;
    if (nextLen > 60) score += 5;
    if (nextBlank) score += 2;
    if (WRAPPED_RE.test(line)) score += 3;

    candidates.push({
      line: index + 1,
      start: lineIndex.starts[index],
      end: lineIndex.ends[index],
      text: cleanHeadingText(line),
      rawText: line,
      strong: Boolean(strongType),
      strongType,
      prevBlank,
      nextBlank,
      nextLen,
      score,
    });
  }

  // Keep all strong candidates first, then fill remaining slots with the
  // highest-scoring weak candidates. Preserve source order for stable ids.
  const strong = candidates.filter((item) => item.strong);
  const weak = candidates.filter((item) => !item.strong).sort((a, b) => b.score - a.score);
  let selected = strong;
  if (selected.length > maxCandidates) {
    selected = stratifiedSample(selected, maxCandidates);
  }
  if (selected.length < maxCandidates) {
    selected = selected.concat(weak.slice(0, maxCandidates - selected.length));
  }
  selected.sort((a, b) => a.line - b.line);

  // Gap to the next selected candidate helps the model spot TOC clusters.
  for (let i = 0; i < selected.length; i++) {
    const next = selected[i + 1];
    selected[i].gapNext = next ? next.start - selected[i].end : 0;
    selected[i].id = i + 1;
  }

  const warnings = [];
  if (total > maxCandidates) {
    warnings.push(`标题候选过多（${total} 个），已抽样 ${maxCandidates} 个交给 AI 识别`);
  }

  return {
    candidates: selected,
    total,
    strongCount,
    truncated: total > maxCandidates,
    warnings,
  };
}

function stratifiedSample(items, count) {
  if (items.length <= count) return items.slice();
  const result = [];
  const step = items.length / count;
  for (let i = 0; i < count; i++) {
    result.push(items[Math.min(items.length - 1, Math.floor(i * step))]);
  }
  return result;
}

/** Number every line for the small-book full-text structure prompt. */
function buildNumberedText(text, lineIndex, maxLines = 4000) {
  const lineCount = lineIndex.starts.length;
  if (lineCount > maxLines) return null;
  const lines = [];
  for (let i = 0; i < lineCount; i++) {
    const line = text.slice(lineIndex.starts[i], lineIndex.ends[i]);
    lines.push(`${String(i + 1).padStart(4, '0')}|${line}`);
  }
  return { text: lines.join('\n'), lineCount };
}

function normalizeTitleKey(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[.…·\-—]+$/g, '');
}

/**
 * Remove early duplicate TOC entries. A line is dropped only when it looks
 * like a TOC row (very little text before the next boundary) AND a later
 * selection carries the same title.
 */
function applyTocProtection(selections, text, lineIndex) {
  if (selections.length <= 1) return selections;
  const threshold = text.length * 0.05;
  const titleOf = (selection) => cleanHeadingText(lineText(text, lineIndex, selection.line)) || selection.title;
  const titleCounts = new Map();
  for (const selection of selections) {
    const key = normalizeTitleKey(titleOf(selection));
    if (key) titleCounts.set(key, (titleCounts.get(key) || 0) + 1);
  }

  const dropped = new Set();
  for (let i = 0; i < selections.length; i++) {
    const selection = selections[i];
    if (lineIndex.starts[selection.line - 1] >= threshold) continue;
    const next = selections[i + 1];
    if (!next) continue;
    const gap = lineIndex.starts[next.line - 1] - lineIndex.ends[selection.line - 1];
    if (gap >= 200) continue;
    const key = normalizeTitleKey(titleOf(selection));
    if (!key || (titleCounts.get(key) || 0) < 2) continue;
    dropped.add(selection);
  }
  return dropped.size > 0 ? selections.filter((selection) => !dropped.has(selection)) : selections;
}

/**
 * Slice the original text at AI-approved boundaries. Titles come from the
 * source heading line (verbatim, only trimmed); AI-provided titles are used
 * only when the source line is empty. Content is never generated.
 */
function sliceBook(text, lineIndex, boundaries) {
  const warnings = [];
  const valid = [];
  for (const boundary of Array.isArray(boundaries) ? boundaries : []) {
    const line = Number(boundary && boundary.line);
    if (!Number.isInteger(line) || line < 1 || line > lineIndex.starts.length) continue;
    const type = boundary.type === 'volume' ? 'volume' : 'chapter';
    const sourceRaw = lineText(text, lineIndex, line);
    const sourceLine = cleanHeadingText(sourceRaw);
    if (!sourceLine || !isPlausibleHeadingLine(sourceLine)) {
      warnings.push(`已忽略第 ${line} 行的边界（该行不像标题）`);
      continue;
    }
    valid.push({ line, type, title: sourceLine || boundary.title || '' });
  }

  valid.sort((a, b) => a.line - b.line);
  const unique = [];
  for (const boundary of valid) {
    const previous = unique[unique.length - 1];
    if (previous && previous.line === boundary.line) {
      if (boundary.type === 'chapter') unique[unique.length - 1] = boundary;
      continue;
    }
    unique.push(boundary);
  }

  if (unique.length === 0) {
    return { volumes: [], warnings: ['未识别到可用的卷章边界'] };
  }

  const segments = unique.map((boundary, index) => {
    const lineIndexValue = boundary.line - 1;
    const lineStart = lineIndex.starts[lineIndexValue];
    const lineEnd = lineIndex.ends[lineIndexValue];
    let contentStart = lineEnd;
    if (text[contentStart] === '\n') contentStart += 1;
    const next = unique[index + 1];
    const contentEnd = next ? lineIndex.starts[next.line - 1] : text.length;
    return {
      boundary,
      lineStart,
      contentStart,
      contentEnd,
      content: text.slice(contentStart, contentEnd).trim(),
    };
  });

  const volumes = [];
  let currentVolume = null;
  let volumePreamble = '';

  const ensureVolume = (title) => {
    if (!currentVolume) {
      currentVolume = { title: title || '正文', chapters: [] };
      volumes.push(currentVolume);
    }
    return currentVolume;
  };

  const addChapter = (title, content, prefix = '') => {
    const body = [prefix, content].filter((part) => part && part.trim()).join('\n\n').trim();
    if (!body) return;
    ensureVolume().chapters.push({ title: title || '', content: body });
  };

  const flushVolumePreamble = (isLast) => {
    if (!currentVolume) {
      volumePreamble = '';
      return;
    }
    const preamble = volumePreamble.trim();
    volumePreamble = '';
    if (!preamble) return;
    if (currentVolume.chapters.length === 0) {
      addChapter(isLast ? '正文' : '卷首语', preamble);
    }
  };

  for (const segment of segments) {
    if (segment.boundary.type === 'volume') {
      flushVolumePreamble(false);
      currentVolume = {
        title: segment.boundary.title || `第${volumes.length + 1}卷`,
        chapters: [],
      };
      volumes.push(currentVolume);
      volumePreamble = segment.content;
      continue;
    }

    ensureVolume('正文');
    let prefix = '';
    const preamble = volumePreamble.trim();
    volumePreamble = '';
    if (preamble) {
      if (preamble.length > 200) {
        addChapter('卷首语', preamble);
      } else {
        prefix = preamble;
      }
    }
    addChapter(segment.boundary.title, segment.content, prefix);
    prefix = '';
  }
  flushVolumePreamble(true);

  // Text before the first boundary: a real preface if substantial, otherwise
  // attach it to the first chapter so nothing is lost.
  const prefaceText = text.slice(0, lineIndex.starts[unique[0].line - 1]).trim();
  if (prefaceText) {
    const prefaceLines = prefaceText.split('\n').map((line) => line.trim()).filter(Boolean);
    const headingLines = prefaceLines.filter(
      (line) => isPlausibleHeadingLine(line) && (CHAPTER_LABEL_RE.test(line) || VOLUME_LABEL_RE.test(line)),
    );
    const looksLikeToc = headingLines.length >= 3 && headingLines.length >= prefaceLines.length * 0.25;
    if (looksLikeToc) {
      warnings.push('已忽略开头的目录页');
    } else if (prefaceText.length > 100) {
      volumes.unshift({ title: '序', chapters: [{ title: '前言', content: prefaceText }] });
    } else {
      const firstChapter = volumes.flatMap((volume) => volume.chapters)[0];
      if (firstChapter) firstChapter.content = `${prefaceText}\n\n${firstChapter.content}`;
      else volumes.push({ title: '正文', chapters: [{ title: '前言', content: prefaceText }] });
    }
  }

  // Renumber globally and drop anything empty.
  let chapterNum = 0;
  const cleaned = [];
  for (const volume of volumes) {
    const chapters = [];
    for (const chapter of volume.chapters) {
      if (!chapter.content.trim()) continue;
      chapterNum += 1;
      chapters.push({ num: chapterNum, title: chapter.title || `第${chapterNum}章`, content: chapter.content });
    }
    if (chapters.length > 0) cleaned.push({ title: volume.title || '正文', chapters });
  }

  return { volumes: cleaned, warnings };
}

/**
 * Last-resort content-preserving split. Used only when the model cannot
 * identify any usable boundary, so the book can still be imported.
 */
function fallbackSplit(text, lineIndex, targetChars = 10000) {
  const body = text.trim();
  if (!body) return { volumes: [], warnings: ['没有可导入的正文'] };

  const chunks = [];
  let chunkStart = 0;
  for (let i = 1; i < lineIndex.starts.length; i++) {
    const start = lineIndex.starts[i];
    if (start - chunkStart < targetChars) continue;
    const content = text.slice(chunkStart, start).trim();
    if (content) chunks.push(content);
    chunkStart = start;
  }
  const tail = text.slice(chunkStart).trim();
  if (tail) chunks.push(tail);

  const chapters = chunks.map((content, index) => ({
    num: index + 1,
    title: chunks.length === 1 ? '正文' : `第${index + 1}节`,
    content,
  }));
  return {
    volumes: [{ title: '正文', chapters }],
    warnings: ['AI 未能识别卷章结构，已按篇幅自动分节导入'],
  };
}

/** first / middle / last excerpt used for per-chapter analysis. */
function chapterExcerpt(content, maxChars = 1300) {
  const text = String(content ?? '');
  if (text.length <= maxChars) return text;
  const firstSize = Math.floor(maxChars * 0.46);
  const middleSize = Math.floor(maxChars * 0.23);
  const lastSize = maxChars - firstSize - middleSize;
  const middleStart = Math.max(0, Math.floor((text.length - middleSize) / 2));
  return [
    text.slice(0, firstSize),
    text.slice(middleStart, middleStart + middleSize),
    text.slice(-lastSize),
  ].join('\n…\n');
}

module.exports = {
  MAX_CANDIDATE_LINES,
  normalizeText,
  buildLineIndex,
  lineText,
  isBlank,
  cleanHeadingText,
  isPlausibleHeadingLine,
  extractCandidates,
  buildNumberedText,
  applyTocProtection,
  sliceBook,
  fallbackSplit,
  chapterExcerpt,
  normalizeTitleKey,
};
