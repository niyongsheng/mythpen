/**
 * Prompt for one-shot page tasks (foreshadow/payoff design, relation
 * organization, memory extraction, consistency checks, outline generation…).
 *
 * These calls never register tools, so the prompt must not mention the
 * agentic writing workflow or the tool manual — otherwise models emit
 * tool-call markup as literal text or try to run a workflow they cannot.
 */
const { buildProjectContext } = require('./context');

function buildTaskPrompt(projectName) {
  const context = buildProjectContext(projectName, { toolHints: false });

  return `你是一位经验丰富的小说创作助手，正在完成一项独立的任务。

${context}

## 输出要求

- 只输出任务要求的内容，不要输出前言、解释、总结或 Markdown 标题。
- 如果任务要求 JSON，只输出 JSON 本身，不要使用 Markdown 代码块。
- 本次请求没有可用工具，不要调用任何工具，也不要输出工具调用标记。`;
}

module.exports = { buildTaskPrompt };
