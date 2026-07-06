/**
 * Shared project context builder — extracts current project state
 * from the database and formats it for injection into system prompts.
 */
const db = require('../db');

function buildProjectContext(projectName) {
  try {
    const pdb = db.getProjectDb(projectName);
    const meta = {};
    pdb.prepare('SELECT key, value FROM project_meta').all().forEach(m => meta[m.key] = m.value);
    const chars = pdb.prepare('SELECT * FROM characters').all();
    const chapters = pdb.prepare('SELECT num, title, outline, status FROM chapters ORDER BY num').all();
    const foreshadows = pdb.prepare("SELECT * FROM foreshadows WHERE status IN ('planted','progressing')").all();

    return `
项目: ${meta.name || projectName}
模式: ${meta.mode || 'medium-novel'}
写作语言: ${meta.language || 'zh'}
当前阶段: ${({idea:'选题',setting:'设定',outline:'大纲',writing:'写作',review:'审阅',consistency:'一致性',export:'导出'})[meta.workflow_phase] || meta.workflow_phase || '选题'}
当前总字数: ${meta.word_count || '0'}

角色列表:
${chars.map(c => `- ${c.name}（${c.age}岁，${c.gender}）：${c.personality || ''} ${c.background || ''}`).join('\n')}

章节概览:
${chapters.map(ch => `  [${ch.status}] 第${ch.num}章 ${ch.title} - ${ch.outline || '（暂无大纲）'}`).join('\n')}

活跃伏笔:
${foreshadows.map(f => `  [${f.priority}] ${f.title}：${f.description || ''}`).join('\n')}`;
  } catch(e) {
    return `项目: ${projectName}`;
  }
}

module.exports = { buildProjectContext };
