/**
 * Shared project context builder — extracts current project state
 * from the database and formats it for injection into system prompts.
 */
const db = require('../db');
const { chapterHeading } = require('../titles');

const GENRE_LABELS = {
  'sci-fi': '科幻', 'fantasy': '玄幻', 'romance': '言情',
  'history': '历史', 'urban': '都市', 'power-fantasy': '爽文',
  'biography': '传记', 'other': '其他',
};

const MODE_LABELS = {
  'short-story': '短篇（<=3万字）',
  'medium-novel': '中篇（5-10万字）',
  'long-novel': '长篇（20万字+）',
};

const PHASE_LABELS = {
  idea: '选题', setting: '设定', outline: '大纲',
  writing: '写作', review: '审阅', consistency: '一致性', export: '导出',
};

function buildProjectContext(projectName) {
  try {
    const pdb = db.getProjectDb(projectName);
    const meta = {};
    pdb.prepare('SELECT key, value FROM project_meta').all().forEach(m => meta[m.key] = m.value);
    const genres = pdb.prepare('SELECT genre FROM project_genres').all().map(g => g.genre);

    // Keep prompts bounded even for very large imported works. The AI can
    // page through the full list with list_chapters / get_chapter.
    const totalChapters = pdb.prepare('SELECT COUNT(*) as c FROM chapters').get().c;
    const firstChapters = pdb.prepare(
      'SELECT num, title, outline, status FROM chapters ORDER BY num LIMIT 3'
    ).all();
    const recentChapters = pdb.prepare(
      'SELECT num, title, outline, status FROM chapters ORDER BY num DESC LIMIT 60'
    ).all().reverse();
    const chapterMap = new Map();
    for (const ch of [...firstChapters, ...recentChapters]) chapterMap.set(ch.num, ch);
    const chapters = [...chapterMap.values()].sort((a, b) => a.num - b.num);

    const chars = pdb.prepare(
      'SELECT name, age, gender, personality, background FROM characters ORDER BY name LIMIT 50'
    ).all();
    const totalChars = pdb.prepare('SELECT COUNT(*) as c FROM characters').get().c;
    const worldEntries = pdb.prepare(
      'SELECT category, name, description FROM world_entries ORDER BY name LIMIT 30'
    ).all();
    const foreshadows = pdb.prepare(
      "SELECT * FROM foreshadows WHERE status IN ('planted','progressing') LIMIT 30"
    ).all();

    const genreStr = genres.map(g => GENRE_LABELS[g] || g).join('、') || '未设定';
    const modeStr = MODE_LABELS[meta.mode] || meta.mode || '中篇';
    const langStr = meta.language === 'en' ? 'English' : '中文';
    const phaseStr = PHASE_LABELS[meta.workflow_phase] || meta.workflow_phase || '选题';

    const descriptionLine = meta.description ? `\n故事简介: ${meta.description}` : '';
    const importSource = meta.import_source_title || meta.book_title;
    const importNote = meta.import_source_format && importSource
      ? `\n导入来源: 《${importSource}》（${String(meta.import_source_format).toUpperCase()}），已有 ${totalChapters} 章正文导入并定稿。除非用户明确要求，不要重写或删除已有章节；续写/同人二创应接着已有内容展开。`
      : '';

    const chapterNote = totalChapters > chapters.length
      ? `（共 ${totalChapters} 章，仅列出前 3 章与最近 ${recentChapters.length} 章；其余请用 list_chapters / get_chapter 查询）`
      : `（共 ${totalChapters} 章）`;

    const charNote = totalChars > chars.length ? `（共 ${totalChars} 个，仅列出前 ${chars.length} 个）` : '';

    return `
项目: ${meta.name || projectName}
创作类型: ${genreStr}
篇幅模式: ${modeStr}
写作语言: ${langStr}
当前阶段: ${phaseStr}
当前总字数: ${meta.word_count || '0'}${descriptionLine}${importNote}

角色列表${charNote}:
${chars.length ? chars.map(c => `- ${c.name}（${c.age || '?'}岁，${c.gender || '?'}）：${c.personality || ''} ${c.background || ''}`).join('\n') : '（暂无）'}

世界观设定（最多 30 条）:
${worldEntries.length ? worldEntries.map(w => `- [${w.category}] ${w.name}：${w.description || ''}`).join('\n') : '（暂无）'}

章节概览${chapterNote}:
${chapters.length ? chapters.map(ch => `[${ch.status}] ${chapterHeading(ch)} - ${ch.outline || '（暂无大纲）'}`).join('\n') : '（暂无章节）'}

活跃伏笔:
${foreshadows.length ? foreshadows.map(f => `[${f.priority}] ${f.title}：${f.description || ''}`).join('\n') : '（暂无）'}`;
  } catch (e) {
    return `项目: ${projectName}`;
  }
}

module.exports = { buildProjectContext };
