/**
 * Shared project context builder — extracts current project state
 * from the database and formats it for injection into system prompts.
 */
const db = require('../db');
const { MAX_AUTHOR_NOTES } = require('../author-notes');
const { STYLE_LABELS } = require('../styles');
const { languageName } = require('../languages');
const { chapterHeading, volumeHeading } = require('../titles');

const GENRE_LABELS = {
  'sci-fi': '科幻', 'fantasy': '玄幻', 'xianxia': '仙侠', 'wuxia': '武侠',
  'romance': '言情', 'history': '历史', 'urban': '都市', 'mystery': '悬疑',
  'game': '游戏', 'biography': '传记', 'other': '其他',
};

// What each genre's chapters should advance. Drives the per-chapter
// `genre_beat` dimension and the "type progression" hint in the context.
const GENRE_FOCUS = {
  'sci-fi': '设定规则揭示、技术使用',
  fantasy: '力量体系、势力变化',
  xianxia: '境界、战力、资源变化',
  wuxia: '武功、江湖局势变化',
  romance: '关系阶段、心动或误会',
  history: '史实锚点、时代细节',
  urban: '现实局势、社会关系推进',
  mystery: '线索、疑点、误导',
  game: '任务、数值、关卡推进',
  biography: '真实人生节点',
  other: '类型核心推进',
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

const CHARACTER_ROLE_LABELS = { major: '主角', minor: '配角', extra: '客串' };

// Imported projects can hold thousands of characters and 1000-character
// descriptions. The context is sent on every tool round, so keep each line
// short and let the AI page through full records with list_* / get_* tools.
function clip(value, max) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// Concise style directives injected into the shared project context.
const STYLE_GUIDANCE = {
  dark: '暗黑：基调压抑，保留道德灰度，避免廉价圆满。',
  realistic: '写实：细节可信、人物动机落地，避免悬浮设定与过度巧合。',
  healing: '治愈：冲突克制，情绪温暖，重视日常细节与关系修复。',
  poetic: '诗意：重视意象、节奏与留白，允许适度的抒情性描写。',
  'power-fantasy': '爽文：小爽点密集、大爽点集中在卷末高潮，避免连续章节堆叠高强度爽点。',
  light: '轻快：节奏明快，语言轻松，善用反差与幽默，少做沉重铺陈。',
};

// `toolHints: false` keeps tool names out of the prompt entirely — required for
// tool-less requests such as /api/ai/continue, where mentioning them makes the
// model emit tool-call markup as literal text.
function buildProjectContext(projectName, { toolHints = true } = {}) {
  try {
    const pdb = db.getProjectDb(projectName);
    const meta = {};
    pdb.prepare('SELECT key, value FROM project_meta').all().forEach(m => meta[m.key] = m.value);
    const genres = pdb.prepare('SELECT genre FROM project_genres').all().map(g => g.genre);
    const styles = pdb.prepare('SELECT style FROM project_styles').all().map(s => s.style);
    // 爽文 is a writing style; the payoff board and tools are bound to it.
    // Fall back to the legacy meta flag for projects opened before migration.
    const powerFantasy = styles.includes('power-fantasy') || meta.power_fantasy === '1';

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

    // Volumes are few, so include the full structure. This keeps the AI in
    // sync after a user renames a volume from the sidebar.
    const volumes = pdb.prepare(`
      SELECT v.id, v.sort_order, v.title, COUNT(c.num) AS chapter_count
      FROM volumes v
      LEFT JOIN chapters c ON c.volume_id = v.id
      GROUP BY v.id
      ORDER BY v.sort_order
    `).all();
    const volumeLines = volumes
      .map(v => `- ${volumeHeading(v)}（${v.chapter_count} 章）`)
      .join('\n');

    const chars = pdb.prepare(
      `SELECT name, species, age, gender, role, personality, background, notes
       FROM characters
       ORDER BY CASE role WHEN 'major' THEN 0 WHEN 'minor' THEN 1 WHEN 'extra' THEN 2 ELSE 3 END, name
       LIMIT 50`,
    ).all();
    const totalChars = pdb.prepare('SELECT COUNT(*) as c FROM characters').get().c;
    const worldEntries = pdb.prepare(
      'SELECT category, name, description FROM world_entries ORDER BY category, name LIMIT 24'
    ).all();
    const foreshadows = pdb.prepare(
      "SELECT * FROM foreshadows WHERE status IN ('planted','progressing') ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, created_at LIMIT 20"
    ).all();
    // Settings, relations and continuity data are central for genre fiction.
    // Keep each section bounded; the AI can page through the full lists with
    // the corresponding list_* tools when it needs more.
    const scienceEntries = pdb.prepare(
      'SELECT label, category, name, description FROM science_entries ORDER BY sort_order, category, name LIMIT 20'
    ).all();
    const relations = pdb.prepare(`
      SELECT ca.name AS character_a, cb.name AS character_b, cr.relation_type, cr.intensity
      FROM character_relations cr
      JOIN characters ca ON ca.id = cr.character_a_id
      JOIN characters cb ON cb.id = cr.character_b_id
      ORDER BY cr.intensity DESC, ca.name
      LIMIT 20
    `).all();
    const timelineEvents = pdb.prepare(
      'SELECT year, title, description, importance FROM timeline_events ORDER BY importance DESC, year LIMIT 10'
    ).all();
    const clues = pdb.prepare(
      'SELECT title, kind, description FROM clue_board WHERE resolved = 0 ORDER BY created_at DESC LIMIT 10'
    ).all();
    const memories = pdb.prepare(
      'SELECT category, content FROM memories ORDER BY created_at DESC LIMIT 10'
    ).all();
    // Include released payoffs too: both writing and payoff design need the
    // existing rhythm to avoid clustering new payoffs on the same chapters.
    const payoffs = powerFantasy
      ? pdb.prepare(
          "SELECT * FROM payoff_points WHERE status != 'abandoned' ORDER BY COALESCE(NULLIF(payoff_chapter, 0), 999999), created_at LIMIT 25"
        ).all()
      : [];

    const genreStr = genres.map(g => GENRE_LABELS[g] || g).join('、') || '未设定';
    const genreFocusStr = genres.map(g => GENRE_FOCUS[g]).filter(Boolean).join('；');
    const styleStr = styles.map(s => STYLE_LABELS[s] || s).join('、') || '未设定';
    const styleGuide = styles
      .map(s => STYLE_GUIDANCE[s])
      .filter(Boolean)
      .map(line => `- ${line}`)
      .join('\n');
    const modeStr = MODE_LABELS[meta.mode] || meta.mode || '中篇';
    const langStr = languageName(meta.language);
    const phaseStr = PHASE_LABELS[meta.workflow_phase] || meta.workflow_phase || '选题';

    const descriptionLine = meta.description ? `\n故事简介: ${meta.description}` : '';
    const importSource = meta.import_source_title || meta.book_title;
    const importNote = meta.import_source_format && importSource
      ? `\n导入来源: 《${importSource}》（${String(meta.import_source_format).toUpperCase()}），已有 ${totalChapters} 章正文导入并定稿。除非用户明确要求，不要重写或删除已有章节；续写/同人二创应接着已有内容展开。`
      : '';

    // User-authored rules. Keep newlines intact (unlike clip(), which flattens
    // whitespace) and cap the text so a legacy/oversized value cannot bloat
    // every request.
    const authorNotesRaw = String(meta.author_notes || '').trim();
    const authorNotes = authorNotesRaw.length > MAX_AUTHOR_NOTES
      ? `${authorNotesRaw.slice(0, MAX_AUTHOR_NOTES)}…`
      : authorNotesRaw;
    const authorNotesSection = authorNotes
      ? `\n\n作者约定（用户为本项目设定的写作规则，优先级高于默认写作习惯；与下方项目状态中的事实冲突时，先向用户指出冲突，不要默默忽略）:\n${authorNotes}`
      : '';

    const chapterNote = totalChapters > chapters.length
      ? `（共 ${totalChapters} 章，仅列出前 3 章与最近 ${recentChapters.length} 章${toolHints ? '；其余请用 list_chapters / get_chapter 查询' : ''}）`
      : `（共 ${totalChapters} 章）`;

    const charNote = totalChars > chars.length ? `（共 ${totalChars} 个，仅列出前 ${chars.length} 个）` : '';

    const payoffSection = powerFantasy
      ? `

爽点排期（按释放章节排序，含已释放）:
${payoffs.length ? payoffs.map(p => `[${p.status}/${p.type}/强度${p.intensity}] ${p.title}（铺垫${p.setup_chapter || '?'}→释放${p.payoff_chapter || '?'}）：${clip(p.description, 110)}`).join('\n') : '（暂无）'}`
      : '';

    return `
项目: ${meta.name || projectName}
创作类型: ${genreStr}${genreFocusStr ? `\n类型推进关注点: ${genreFocusStr}` : ''}
写作风格: ${styleStr}${styleGuide ? `\n风格要求:\n${styleGuide}` : ''}
篇幅模式: ${modeStr}
写作语言: ${langStr}
当前阶段: ${phaseStr}
当前总字数: ${meta.word_count || '0'}${descriptionLine}${importNote}${authorNotesSection}

角色列表${charNote}:
${chars.length ? chars.map(c => `- ${c.name}（${c.species ? `${c.species}，` : ''}${CHARACTER_ROLE_LABELS[c.role] || '未定位'}，${/^\d+$/.test(String(c.age || '').trim()) ? `${c.age}岁` : (c.age || '?')}，${c.gender || '?'}）：${clip(c.personality, 70)} ${clip(c.background, 100)}${c.notes ? `｜备注：${clip(c.notes, 100)}` : ''}`).join('\n') : '（暂无）'}

世界观设定（最多 24 条）:
${worldEntries.length ? worldEntries.map(w => `- [${w.category}] ${w.name}：${clip(w.description, 140)}`).join('\n') : '（暂无）'}

设定体系（最多 20 条）:
${scienceEntries.length ? scienceEntries.map(s => `- [${s.category || '未分类'}/${s.label}] ${s.name}：${clip(s.description, 140)}`).join('\n') : '（暂无）'}

角色关系（最多 20 条）:
${relations.length ? relations.map(r => `- ${r.character_a} → ${r.character_b}：${r.relation_type}${r.intensity ? `（强度${r.intensity}）` : ''}`).join('\n') : '（暂无）'}

时间线（最多 10 条）:
${timelineEvents.length ? timelineEvents.map(e => `- [${e.year}] ${e.title}：${clip(e.description, 110)}`).join('\n') : '（暂无）'}

待解决线索（最多 10 条）:
${clues.length ? clues.map(c => `- [${c.kind}] ${c.title}：${clip(c.description, 110)}`).join('\n') : '（暂无）'}

创作记忆（最近 10 条）:
${memories.length ? memories.map(m => `- [${m.category}] ${clip(m.content, 110)}`).join('\n') : '（暂无）'}

卷结构:
${volumeLines || '（暂无分卷）'}

章节概览${chapterNote}:
${chapters.length ? chapters.map(ch => `[${ch.status}] ${chapterHeading(ch)} - ${clip(ch.outline, 140) || '（暂无大纲）'}`).join('\n') : '（暂无章节）'}

活跃伏笔:
${foreshadows.length ? foreshadows.map(f => `[${f.priority}] ${f.title}：${clip(f.description, 110)}`).join('\n') : '（暂无）'}${payoffSection}`;
  } catch (e) {
    return `项目: ${projectName}`;
  }
}

module.exports = { buildProjectContext };
