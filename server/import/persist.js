// ─── Persist an analyzed import ───
// All analysis happens before this module runs. It creates the project DB and
// writes volumes, chapters, and the complete archive in one transaction.

const fs = require('fs');
const { randomUUID } = require('crypto');
const db = require('../db');
const { ALLOWED_STYLES } = require('../styles');

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
const WORLD_CATEGORIES = new Set(['location', 'organization', 'concept', 'event']);
const MEMORY_CATEGORIES = new Set(['character', 'location', 'item', 'event', 'promise', 'other']);
const FORESHADOW_STATUSES = new Set(['planted', 'progressing', 'resolved', 'abandoned']);
const FORESHADOW_PRIORITIES = new Set(['low', 'normal', 'high']);
const SCIENCE_LABELS = new Set(['known', 'extrapolation', 'hypothesis']);
const CHARACTER_ROLES = new Set(['appears', 'speaks', 'pov', 'mentioned']);

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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function oneOf(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

function dedupeWarnings(warnings) {
  return [...new Set(asArray(warnings).filter((warning) => typeof warning === 'string' && warning.trim()))].slice(0, 100);
}

function countChapters(volumes) {
  return volumes.reduce((total, volume) => total + volume.chapters.length, 0);
}

function cleanup(filePath, name) {
  try {
    db.closeProjectDb(filePath);
  } catch {
    /* ignore */
  }
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
  try {
    const row = db.dbGet('SELECT file_path FROM recent_projects WHERE name = ?', [name]);
    if (row && row.file_path === filePath) {
      db.dbExecute('DELETE FROM recent_projects WHERE name = ?', [name]);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Create a project from analyzed data. Throws on any failure after cleaning
 * up the partially created DB and registry entry.
 */
function createProjectFromImport(input) {
  const {
    name,
    options = {},
    meta = {},
    volumes = [],
    chapterFields = {},
    chapterCharacters = {},
    archive = {},
    source = {},
    usage = null,
    warnings = [],
    model = '',
  } = input;

  if (db.dbGet('SELECT 1 AS x FROM recent_projects WHERE name = ?', [name])) {
    throw Object.assign(new Error(`项目"${name}"已存在`), { code: 'PROJECT_ALREADY_EXISTS' });
  }

  const filePath = db.newProjectFilePath();
  try {
    db.openProjectDb(filePath);
    db.registerRecentProject(name, filePath, 0);
  } catch (err) {
    cleanup(filePath, name);
    throw err;
  }

  try {
    const warningList = cleanWarnings(warnings);
    const partial = hasFailureWarning(warningList);
    const genres = [...new Set([
      ...asArray(options.genres),
      ...asArray(meta.genres),
    ].filter((genre) => ALLOWED_GENRES.has(genre)))];
    // 爽文 is a style flag; accept the legacy genre value from older clients.
    const powerFantasy = options.powerFantasy === true
      || meta.powerFantasy === true
      || asArray(options.genres).includes('power-fantasy')
      || asArray(meta.genres).includes('power-fantasy');
    const styles = [...new Set([
      ...asArray(options.styles),
      ...asArray(meta.styles),
    ].filter((style) => ALLOWED_STYLES.has(style)))];
    if (powerFantasy && !styles.includes('power-fantasy')) styles.push('power-fantasy');
    const description = cleanText(meta.description, 1200) || cleanText(meta.synopsis, 1200);
    const synopsis = cleanText(archive.synopsis || meta.synopsis, 2400);
    const bookTitle = cleanName(meta.title, 200) || name;
    const author = cleanName(meta.author, 100) || '佚名';
    const totalChapters = countChapters(volumes);

    db.initProjectMeta(name, {
      description,
      mode: options.mode || 'medium-novel',
      language: options.language || 'zh',
      power_fantasy: powerFantasy ? '1' : '0',
      author_name: author,
      workflow_phase: 'writing',
      book_title: bookTitle,
      import_source_file: cleanName(source.fileName, 200),
      import_source_format: source.format === 'epub' ? 'epub' : 'txt',
      import_source_title: cleanName(source.title, 200) || bookTitle,
      import_volume_count: String(volumes.length),
      import_chapter_count: String(totalChapters),
      imported_at: new Date().toISOString(),
      ai_analysis_status: partial ? 'partial' : 'done',
      ai_synopsis: synopsis,
    });
    db.initProjectGenres(name, genres);
    db.initProjectStyles(name, styles);

    let wordCount = 0;
    let insertedCharacters = 0;
    let insertedRelations = 0;
    let insertedWorld = 0;
    let insertedTimeline = 0;
    let insertedForeshadows = 0;
    let insertedMemories = 0;
    let insertedScience = 0;
    let insertedChapterLinks = 0;
    const chapterIdByNum = new Map();
    const characterIdByName = new Map();
    const characterIdByAlias = new Map();

    const resolveCharacterId = (value) => {
      const name = cleanName(value, 100);
      if (!name) return null;
      return characterIdByName.get(name) || characterIdByAlias.get(name) || null;
    };

    const pdb = db.getProjectDb(name);
    db.projectTransaction(name, () => {
      const insertVolume = pdb.prepare(
        "INSERT INTO volumes (id, sort_order, title, summary, created_at) VALUES (?, ?, ?, '', datetime('now'))",
      );
      const insertChapter = pdb.prepare(
        `INSERT INTO chapters
          (volume_id, num, title, outline, content, summary, word_count, status,
           cognitive_frame, emotional_anchor, world_texture, concrete_mystery, interpersonal_tension,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      );
      const insertCharacter = pdb.prepare(
        `INSERT INTO characters
          (id, name, age, gender, appearance, personality, background, motivation, arc, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      );
      const insertChapterCharacter = pdb.prepare(
        'INSERT OR IGNORE INTO chapter_characters (chapter_id, character_id, role) VALUES (?, ?, ?)',
      );
      const insertRelation = pdb.prepare(
        `INSERT INTO character_relations
          (id, character_a_id, character_b_id, relation_type, description, intensity, created_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      );
      const insertWorld = pdb.prepare(
        `INSERT INTO world_entries (id, category, name, description, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, '', datetime('now'), datetime('now'))`,
      );
      const insertTimeline = pdb.prepare(
        `INSERT INTO timeline_events (id, year, title, description, importance, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      );
      const insertForeshadow = pdb.prepare(
        `INSERT INTO foreshadows
          (id, title, description, status, priority, expected_resolve_chapter, planted_chapter_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      );
      const insertMemory = pdb.prepare(
        `INSERT INTO memories (id, category, content, source_chapter_id, created_at)
         VALUES (?, ?, ?, ?, datetime('now'))`,
      );
      const insertScience = pdb.prepare(
        `INSERT INTO science_entries (id, label, name, description, "references", created_at, updated_at)
         VALUES (?, ?, ?, ?, '', datetime('now'), datetime('now'))`,
      );
      const setMeta = pdb.prepare('INSERT OR REPLACE INTO project_meta (key, value) VALUES (?, ?)');

      for (let index = 0; index < volumes.length; index++) {
        const volume = volumes[index];
        const volumeId = index + 1;
        insertVolume.run(volumeId, index + 1, cleanName(volume.title, 200) || `第${index + 1}卷`);
        for (const chapter of volume.chapters) {
          const fields = chapterFields[chapter.num] || chapterFields[String(chapter.num)] || {};
          const chapterWordCount = db.countWords(chapter.content);
          wordCount += chapterWordCount;
          const result = insertChapter.run(
            volumeId,
            chapter.num,
            cleanName(chapter.title, 200) || `第${chapter.num}章`,
            cleanText(fields.outline, 600),
            chapter.content,
            cleanText(fields.summary, 400),
            chapterWordCount,
            cleanText(fields.cognitive_frame, 200),
            cleanText(fields.emotional_anchor, 200),
            cleanText(fields.world_texture, 200),
            cleanText(fields.concrete_mystery, 200),
            cleanText(fields.interpersonal_tension, 200),
          );
          chapterIdByNum.set(chapter.num, result.lastInsertRowid);
        }
      }

      for (const character of asArray(archive.characters)) {
        const characterName = cleanName(character.name, 100);
        if (!characterName || characterIdByName.has(characterName)) continue;
        const id = randomUUID();
        const aliases = asArray(character.aliases).map((alias) => cleanName(alias, 100)).filter(Boolean);
        const notes = [
          cleanText(character.notes, 1000),
          aliases.length > 0 ? `别名：${aliases.join('、')}` : '',
        ].filter(Boolean).join('\n');
        insertCharacter.run(
          id,
          characterName,
          cleanText(character.age, 50),
          cleanText(character.gender, 20),
          cleanText(character.appearance, 500),
          cleanText(character.personality, 1000),
          cleanText(character.background, 2000),
          cleanText(character.motivation, 1000),
          cleanText(character.arc, 1000),
          notes,
        );
        characterIdByName.set(characterName, id);
        for (const alias of aliases) {
          if (!characterIdByAlias.has(alias)) characterIdByAlias.set(alias, id);
        }
        insertedCharacters += 1;
      }

      for (const [num, characters] of Object.entries(chapterCharacters)) {
        const chapterId = chapterIdByNum.get(Number(num));
        if (!chapterId) continue;
        for (const character of asArray(characters)) {
          const characterId = resolveCharacterId(character?.name);
          if (!characterId) continue;
          const role = oneOf(character?.role, CHARACTER_ROLES, 'appears');
          insertChapterCharacter.run(chapterId, characterId, role);
          insertedChapterLinks += 1;
        }
      }

      const relationKeys = new Set();
      for (const relation of asArray(archive.relations)) {
        const characterA = resolveCharacterId(relation.a);
        const characterB = resolveCharacterId(relation.b);
        const relationType = cleanText(relation.type, 100);
        if (!characterA || !characterB || characterA === characterB || !relationType) continue;
        const key = [characterA, characterB].sort().join('|') + '|' + relationType;
        if (relationKeys.has(key)) continue;
        relationKeys.add(key);
        insertRelation.run(
          randomUUID(),
          characterA,
          characterB,
          relationType,
          cleanText(relation.description, 1000),
          clampInt(relation.intensity, 1, 5, 3),
        );
        insertedRelations += 1;
      }

      const worldKeys = new Set();
      for (const entry of asArray(archive.world)) {
        const category = oneOf(entry.category, WORLD_CATEGORIES, 'concept');
        const entryName = cleanName(entry.name, 100);
        if (!entryName) continue;
        const key = `${category}|${entryName}`;
        if (worldKeys.has(key)) continue;
        worldKeys.add(key);
        insertWorld.run(randomUUID(), category, entryName, cleanText(entry.description, 1000));
        insertedWorld += 1;
      }

      const timelineKeys = new Set();
      for (const event of asArray(archive.events)) {
        const title = cleanName(event.title, 200);
        if (!title) continue;
        const key = `${cleanText(event.year, 100)}|${title}`;
        if (timelineKeys.has(key)) continue;
        timelineKeys.add(key);
        insertTimeline.run(
          randomUUID(),
          cleanText(event.year, 100) || '未知时间',
          title,
          cleanText(event.description, 1000),
          clampInt(event.importance, 1, 5, 3),
        );
        insertedTimeline += 1;
      }

      const foreshadowKeys = new Set();
      for (const foreshadow of asArray(archive.foreshadows)) {
        const title = cleanName(foreshadow.title, 200);
        if (!title || foreshadowKeys.has(title)) continue;
        foreshadowKeys.add(title);
        insertForeshadow.run(
          randomUUID(),
          title,
          cleanText(foreshadow.description, 1000),
          oneOf(foreshadow.status, FORESHADOW_STATUSES, 'planted'),
          oneOf(foreshadow.priority, FORESHADOW_PRIORITIES, 'normal'),
          clampInt(foreshadow.expected_resolve_chapter, 0, 5000, 0),
          chapterIdByNum.get(Number(foreshadow.chapter_num)) || null,
        );
        insertedForeshadows += 1;
      }

      const memoryKeys = new Set();
      for (const memory of asArray(archive.memories)) {
        const content = cleanText(memory.content, 1000);
        if (!content) continue;
        const category = oneOf(memory.category, MEMORY_CATEGORIES, 'other');
        const key = `${category}|${content}`;
        if (memoryKeys.has(key)) continue;
        memoryKeys.add(key);
        insertMemory.run(
          randomUUID(),
          category,
          content,
          chapterIdByNum.get(Number(memory.chapter_num)) || null,
        );
        insertedMemories += 1;
      }

      const scienceKeys = new Set();
      for (const entry of asArray(archive.science)) {
        const entryName = cleanName(entry.name, 200);
        if (!entryName) continue;
        const label = oneOf(entry.label, SCIENCE_LABELS, 'known');
        const key = `${label}|${entryName}`;
        if (scienceKeys.has(key)) continue;
        scienceKeys.add(key);
        insertScience.run(randomUUID(), label, entryName, cleanText(entry.description, 1000));
        insertedScience += 1;
      }

      setMeta.run('import_chapter_count', String(totalChapters));
      setMeta.run('import_volume_count', String(volumes.length));
      setMeta.run('ai_analysis_status', partial ? 'partial' : 'done');
      setMeta.run('ai_synopsis', synopsis);
      setMeta.run('ai_import_stats', JSON.stringify({
        volumes: volumes.length,
        chapters: totalChapters,
        characters: insertedCharacters,
        chapterLinks: insertedChapterLinks,
        relations: insertedRelations,
        world: insertedWorld,
        timeline: insertedTimeline,
        foreshadows: insertedForeshadows,
        memories: insertedMemories,
        science: insertedScience,
      }));
      setMeta.run('ai_import_warnings', JSON.stringify(warningList));
      setMeta.run('ai_import_model', cleanText(model, 200));
      setMeta.run('ai_imported_at', new Date().toISOString());
    });

    db.recalculateWordCount(name);
    db.registerRecentProject(name, filePath, wordCount);

    if (usage) {
      for (const stage of ['structure', 'metadata', 'chapters', 'archive']) {
        const stageUsage = usage[stage];
        if (stageUsage && (stageUsage.inputTokens || stageUsage.outputTokens)) {
          db.recordTokenUsage(name, `import_${stage}`, stageUsage, model);
        }
      }
    }

    return {
      project: name,
      volumes: volumes.length,
      chapters: totalChapters,
      characters: insertedCharacters,
      chapterLinks: insertedChapterLinks,
      relations: insertedRelations,
      world: insertedWorld,
      timeline: insertedTimeline,
      foreshadows: insertedForeshadows,
      memories: insertedMemories,
      science: insertedScience,
      wordCount,
      warnings: warningList,
    };
  } catch (err) {
    cleanup(filePath, name);
    throw err;
  }
}

function cleanWarnings(warnings) {
  return dedupeWarnings(warnings);
}

/** Informational notes (sampling, TOC cleanup) must not mark the import partial. */
function hasFailureWarning(warnings) {
  return warnings.some((warning) => /失败|已跳过|未完成|无法|未能|未识别|边界/.test(warning));
}

module.exports = { createProjectFromImport };
