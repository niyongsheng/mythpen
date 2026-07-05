// ─── Tool schema definitions (OpenAI function-calling format) ───
const TOOLS = [
  // ═══ Chapters ═══
  {
    type: 'function',
    function: {
      name: 'list_chapters',
      description: '列出小说的所有章节，返回章节编号、标题、状态、字数和摘要。用于了解整体结构和进度。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_chapter',
      description: '获取指定章节的完整正文内容和详细信息（含大纲、叙事维度等）。用于在续写前了解前文。',
      parameters: {
        type: 'object',
        properties: { chapter_num: { type: 'number', description: '章节编号' } },
        required: ['chapter_num'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_chapter',
      description: '创建新章节。新建后会自动分配编号。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '章节标题' },
          outline: { type: 'string', description: '章节大纲（可选）' },
          content: { type: 'string', description: '章节正文（可选，可以先创建空章节再写入）' },
          volume_id: { type: 'number', description: '所属卷ID，默认为1' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_chapter',
      description: '更新章节内容。可以只更新部分字段，传入哪些就更新哪些。支持更新的字段：title、content、outline、status、summary、cognitive_frame、emotional_anchor、world_texture、concrete_mystery、interpersonal_tension。status 可选值：pending（待写）、writing（写作中）、review（审核中）、accepted（已定稿）。',
      parameters: {
        type: 'object',
        properties: {
          chapter_num: { type: 'number', description: '章节编号' },
          title: { type: 'string', description: '标题（可选）' },
          content: { type: 'string', description: '正文内容（可选）' },
          outline: { type: 'string', description: '大纲（可选）' },
          status: { type: 'string', enum: ['pending', 'writing', 'review', 'accepted'], description: '状态（可选）' },
          summary: { type: 'string', description: '摘要（可选）' },
        },
        required: ['chapter_num'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_chapter',
      description: '删除指定章节。此操作不可逆，请谨慎使用。',
      parameters: {
        type: 'object',
        properties: { chapter_num: { type: 'number', description: '要删除的章节编号' } },
        required: ['chapter_num'],
      },
    },
  },

  // ═══ Characters ═══
  {
    type: 'function',
    function: {
      name: 'list_characters',
      description: '列出小说所有角色及其基本信息（姓名、年龄、性别、性格、背景等）。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_character',
      description: '获取指定角色的完整信息，包括外貌、性格、背景、动机、角色弧线等。',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: '角色姓名' } },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_character',
      description: '创建一个新角色。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '姓名' },
          age: { type: 'string', description: '年龄（可选）' },
          gender: { type: 'string', description: '性别（可选）' },
          appearance: { type: 'string', description: '外貌描述（可选）' },
          personality: { type: 'string', description: '性格描述（可选）' },
          background: { type: 'string', description: '背景故事（可选）' },
          motivation: { type: 'string', description: '动机（可选）' },
          arc: { type: 'string', description: '角色弧线（可选）' },
          notes: { type: 'string', description: '备注（可选）' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_character',
      description: '更新已有角色的信息。只传需要修改的字段。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '角色姓名' },
          age: { type: 'string', description: '年龄' },
          gender: { type: 'string', description: '性别' },
          appearance: { type: 'string', description: '外貌' },
          personality: { type: 'string', description: '性格' },
          background: { type: 'string', description: '背景' },
          motivation: { type: 'string', description: '动机' },
          arc: { type: 'string', description: '角色弧线' },
          notes: { type: 'string', description: '备注' },
        },
        required: ['name'],
      },
    },
  },

  // ═══ World ═══
  {
    type: 'function',
    function: {
      name: 'list_world',
      description: '列出小说的所有世界观设定条目，按类别分组。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_world_entry',
      description: '创建一条世界观设定。',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', description: '类别，如：地理、历史、科技、文化、政治、魔法体系等' },
          name: { type: 'string', description: '条目名称' },
          description: { type: 'string', description: '详细描述' },
          tags: { type: 'string', description: '标签，逗号分隔（可选）' },
        },
        required: ['category', 'name', 'description'],
      },
    },
  },

  // ═══ Foreshadows ═══
  {
    type: 'function',
    function: {
      name: 'list_foreshadows',
      description: '列出小说的所有伏笔，可按状态筛选。',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['planted', 'progressing', 'resolved', 'abandoned'], description: '按状态筛选（可选）' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_foreshadow',
      description: '埋下一个新伏笔。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '伏笔标题' },
          description: { type: 'string', description: '伏笔描述' },
          priority: { type: 'string', enum: ['low', 'normal', 'high'], description: '优先级' },
          expected_resolve_chapter: { type: 'number', description: '预计揭晓的章节编号' },
        },
        required: ['title', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_foreshadow',
      description: '更新伏笔状态。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '伏笔标题' },
          status: { type: 'string', enum: ['planted', 'progressing', 'resolved', 'abandoned'], description: '新状态' },
          description: { type: 'string', description: '更新描述（可选）' },
        },
        required: ['title'],
      },
    },
  },

  // ═══ Relations ═══
  {
    type: 'function',
    function: {
      name: 'list_relations',
      description: '列出所有角色之间的关系。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_relation',
      description: '创建两个角色之间的关系。',
      parameters: {
        type: 'object',
        properties: {
          character_a: { type: 'string', description: '角色A的姓名' },
          character_b: { type: 'string', description: '角色B的姓名' },
          relation_type: { type: 'string', description: '关系类型，如：朋友、敌人、恋人、师徒、亲人等' },
          description: { type: 'string', description: '关系描述' },
          intensity: { type: 'number', description: '关系强度 1-5，3为默认' },
        },
        required: ['character_a', 'character_b', 'relation_type'],
      },
    },
  },

  // ═══ Memories ═══
  {
    type: 'function',
    function: {
      name: 'list_memories',
      description: '列出所有创作记忆（关键事件、承诺、伏笔提醒等）。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_memory',
      description: '记录一条创作记忆，用于提醒后续章节注意的事项。',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['character', 'location', 'item', 'event', 'promise', 'other'], description: '类别' },
          content: { type: 'string', description: '记忆内容' },
          source_chapter_num: { type: 'number', description: '来源章节编号（可选）' },
        },
        required: ['category', 'content'],
      },
    },
  },

  // ═══ Timeline ═══
  {
    type: 'function',
    function: {
      name: 'list_timeline',
      description: '列出小说的所有时间线事件。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_timeline_event',
      description: '创建一条时间线事件。',
      parameters: {
        type: 'object',
        properties: {
          year: { type: 'string', description: '时间（如"2048年"或"第一章之前"）' },
          title: { type: 'string', description: '事件标题' },
          description: { type: 'string', description: '事件描述' },
          importance: { type: 'number', description: '重要性 1-5，3为默认' },
        },
        required: ['year', 'title', 'description'],
      },
    },
  },

  // ═══ Stats ═══
  {
    type: 'function',
    function: {
      name: 'get_stats',
      description: '获取小说的统计数据：总字数、章节数、角色数、伏笔数、世界观条目数、Token用量等。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },

  // ═══ Volumes ═══
  {
    type: 'function',
    function: {
      name: 'list_volumes',
      description: '列出小说的所有卷（volume）及其章节结构。用于了解整体分卷和章节布局。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_volume',
      description: '创建一个新卷（volume），用于将小说划分为不同部分。新卷会自动分配排序序号。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '卷名称，如"第二卷"、"风暴"等' },
          summary: { type: 'string', description: '卷简介（可选）' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_volume',
      description: '更新卷的名称或简介。不能修改卷的排序。',
      parameters: {
        type: 'object',
        properties: {
          volume_id: { type: 'number', description: '要更新的卷ID' },
          title: { type: 'string', description: '新卷名（可选）' },
          summary: { type: 'string', description: '新卷简介（可选）' },
        },
        required: ['volume_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_volume',
      description: '删除指定卷及其下的所有章节。此操作不可逆，请谨慎使用。',
      parameters: {
        type: 'object',
        properties: {
          volume_id: { type: 'number', description: '要删除的卷ID' },
        },
        required: ['volume_id'],
      },
    },
  },
];

// ─── Tool executor ───
const { v4: uuidv4 } = require('uuid');

function executeTool(projectName, toolName, args) {
  const db = require('./db');
  const pdb = db.getProjectDb(projectName);

  switch (toolName) {
    // ── Chapters ──
    case 'list_chapters': {
      const rows = pdb.prepare('SELECT num, title, status, word_count, outline, summary, created_at, updated_at FROM chapters ORDER BY num').all();
      return rows;
    }
    case 'get_chapter': {
      const row = pdb.prepare('SELECT * FROM chapters WHERE num = ?').get(args.chapter_num);
      if (!row) return { error: `章节 ${args.chapter_num} 不存在` };
      return row;
    }
    case 'create_chapter': {
      const volId = args.volume_id || 1;
      const max = pdb.prepare('SELECT MAX(num) as mx FROM chapters WHERE volume_id = ?').get(volId);
      const num = (max?.mx || 0) + 1;
      pdb.prepare("INSERT INTO chapters (volume_id, num, title, outline, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))")
        .run(volId, num, args.title, args.outline || '', args.content || '');
      return { created: true, chapter_num: num, title: args.title };
    }
    case 'update_chapter': {
      const { chapter_num, ...fields } = args;
      const allowed = ['title', 'content', 'outline', 'status', 'summary', 'cognitive_frame', 'emotional_anchor', 'world_texture', 'concrete_mystery', 'interpersonal_tension'];
      const updates = [];
      const params = [];
      for (const key of allowed) {
        if (fields[key] !== undefined) {
          updates.push(`${key} = ?`);
          params.push(fields[key]);
        }
      }
      if (updates.length === 0) return { error: '没有要更新的字段' };
      if (fields.content !== undefined) {
        const wc = String(fields.content).replace(/\s/g, '').length;
        updates.push('word_count = ?');
        params.push(wc);
      }
      updates.push("updated_at = datetime('now')");
      params.push(chapter_num);
      pdb.prepare(`UPDATE chapters SET ${updates.join(', ')} WHERE num = ?`).run(...params);
      // Update project word count
      const total = pdb.prepare('SELECT SUM(word_count) as total FROM chapters').get().total || 0;
      pdb.prepare("UPDATE project_meta SET value = ? WHERE key = 'word_count'").run(String(total));
      pdb.prepare("UPDATE project_meta SET value = ? WHERE key = 'updated_at'").run(new Date().toISOString());
      return { updated: true, chapter_num, changed_fields: Object.keys(fields).filter(k => allowed.includes(k)) };
    }
    case 'delete_chapter': {
      const row = pdb.prepare('SELECT id FROM chapters WHERE num = ?').get(args.chapter_num);
      if (!row) return { error: `章节 ${args.chapter_num} 不存在` };
      pdb.prepare('DELETE FROM chapters WHERE num = ?').run(args.chapter_num);
      return { deleted: true, chapter_num: args.chapter_num };
    }

    // ── Characters ──
    case 'list_characters': {
      return pdb.prepare('SELECT id, name, age, gender, personality, background, motivation, arc, notes FROM characters ORDER BY name').all();
    }
    case 'get_character': {
      const row = pdb.prepare('SELECT * FROM characters WHERE name = ?').get(args.name);
      if (!row) return { error: `角色 "${args.name}" 不存在` };
      // Get chapters this character appears in
      const chapters = pdb.prepare(`
        SELECT c.num, c.title FROM chapter_characters cc
        JOIN chapters c ON cc.chapter_id = c.id
        JOIN characters ch ON cc.character_id = ch.id
        WHERE ch.name = ?
      `).all(args.name);
      return { ...row, appears_in: chapters };
    }
    case 'create_character': {
      const id = uuidv4();
      pdb.prepare(`INSERT INTO characters (id, name, age, gender, appearance, personality, background, motivation, arc, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, args.name, args.age || '', args.gender || '', args.appearance || '', args.personality || '',
          args.background || '', args.motivation || '', args.arc || '', args.notes || '');
      return { created: true, id, name: args.name };
    }
    case 'update_character': {
      const { name, ...fields } = args;
      const existing = pdb.prepare('SELECT id FROM characters WHERE name = ?').get(name);
      if (!existing) return { error: `角色 "${name}" 不存在` };
      const allowed = ['age', 'gender', 'appearance', 'personality', 'background', 'motivation', 'arc', 'notes'];
      const updates = [];
      const params = [];
      for (const key of allowed) {
        if (fields[key] !== undefined) { updates.push(`${key} = ?`); params.push(fields[key]); }
      }
      if (updates.length === 0) return { error: '没有要更新的字段' };
      updates.push("updated_at = datetime('now')");
      params.push(name);
      pdb.prepare(`UPDATE characters SET ${updates.join(', ')} WHERE name = ?`).run(...params);
      return { updated: true, name };
    }

    // ── World ──
    case 'list_world': {
      return pdb.prepare('SELECT id, category, name, description, tags FROM world_entries ORDER BY category, name').all();
    }
    case 'create_world_entry': {
      const id = uuidv4();
      pdb.prepare('INSERT INTO world_entries (id, category, name, description, tags) VALUES (?, ?, ?, ?, ?)')
        .run(id, args.category, args.name, args.description, args.tags || '');
      return { created: true, id, category: args.category, name: args.name };
    }

    // ── Foreshadows ──
    case 'list_foreshadows': {
      let sql = 'SELECT * FROM foreshadows';
      const params = [];
      if (args.status) { sql += ' WHERE status = ?'; params.push(args.status); }
      sql += ' ORDER BY created_at';
      return pdb.prepare(sql).all(...params);
    }
    case 'create_foreshadow': {
      const id = uuidv4();
      pdb.prepare(`INSERT INTO foreshadows (id, title, description, status, priority, expected_resolve_chapter)
        VALUES (?, ?, ?, 'planted', ?, ?)`)
        .run(id, args.title, args.description, args.priority || 'normal', args.expected_resolve_chapter || 0);
      return { created: true, id, title: args.title };
    }
    case 'update_foreshadow': {
      const f = pdb.prepare('SELECT id FROM foreshadows WHERE title = ?').get(args.title);
      if (!f) return { error: `伏笔 "${args.title}" 不存在` };
      const updates = [];
      const params = [];
      if (args.status) { updates.push('status = ?'); params.push(args.status); }
      if (args.description) { updates.push('description = ?'); params.push(args.description); }
      if (updates.length === 0) return { error: '没有要更新的字段' };
      updates.push("updated_at = datetime('now')");
      params.push(args.title);
      pdb.prepare(`UPDATE foreshadows SET ${updates.join(', ')} WHERE title = ?`).run(...params);
      return { updated: true, title: args.title };
    }

    // ── Relations ──
    case 'list_relations': {
      return pdb.prepare(`
        SELECT cr.*, ca.name as character_a_name, cb.name as character_b_name
        FROM character_relations cr
        JOIN characters ca ON cr.character_a_id = ca.id
        JOIN characters cb ON cr.character_b_id = cb.id
      `).all();
    }
    case 'create_relation': {
      const a = pdb.prepare('SELECT id FROM characters WHERE name = ?').get(args.character_a);
      const b = pdb.prepare('SELECT id FROM characters WHERE name = ?').get(args.character_b);
      if (!a) return { error: `角色 "${args.character_a}" 不存在，请先创建` };
      if (!b) return { error: `角色 "${args.character_b}" 不存在，请先创建` };
      const id = uuidv4();
      pdb.prepare(`INSERT INTO character_relations (id, character_a_id, character_b_id, relation_type, description, intensity)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run(id, a.id, b.id, args.relation_type, args.description || '', args.intensity || 3);
      return { created: true, id, relation: `${args.character_a} → ${args.character_b}: ${args.relation_type}` };
    }

    // ── Memories ──
    case 'list_memories': {
      return pdb.prepare('SELECT * FROM memories ORDER BY created_at DESC').all();
    }
    case 'create_memory': {
      const id = uuidv4();
      pdb.prepare('INSERT INTO memories (id, category, content, source_chapter_id) VALUES (?, ?, ?, ?)')
        .run(id, args.category, args.content, args.source_chapter_num || null);
      return { created: true, id, category: args.category };
    }

    // ── Timeline ──
    case 'list_timeline': {
      return pdb.prepare('SELECT * FROM timeline_events ORDER BY year').all();
    }
    case 'create_timeline_event': {
      const id = uuidv4();
      pdb.prepare('INSERT INTO timeline_events (id, year, title, description, importance) VALUES (?, ?, ?, ?, ?)')
        .run(id, args.year, args.title, args.description, args.importance || 3);
      return { created: true, id, year: args.year, title: args.title };
    }

    // ── Stats ──
    case 'get_stats': {
      const totalWords = pdb.prepare('SELECT SUM(word_count) as total FROM chapters').get().total || 0;
      const chCount = pdb.prepare('SELECT COUNT(*) as cnt FROM chapters').get().cnt;
      const charCount = pdb.prepare('SELECT COUNT(*) as cnt FROM characters').get().cnt;
      const foreshadowCount = pdb.prepare('SELECT COUNT(*) as cnt FROM foreshadows').get().cnt;
      const worldCount = pdb.prepare('SELECT COUNT(*) as cnt FROM world_entries').get().cnt;
      const sciCount = pdb.prepare('SELECT COUNT(*) as cnt FROM science_entries').get().cnt;
      const statusBreakdown = {};
      pdb.prepare('SELECT status, COUNT(*) as cnt FROM chapters GROUP BY status').all()
        .forEach(r => statusBreakdown[r.status] = r.cnt);
      return { totalWords, chapterCount: chCount, characterCount: charCount, foreshadowCount, worldCount, sciCount, chapterStatus: statusBreakdown };
    }

    // ── Volumes ──
    case 'list_volumes': {
      return pdb.prepare('SELECT * FROM volumes ORDER BY sort_order').all();
    }
    case 'create_volume': {
      const max = pdb.prepare('SELECT COALESCE(MAX(sort_order), 0) as mx FROM volumes').get();
      const sortOrder = (max?.mx || 0) + 1;
      const result = pdb.prepare("INSERT INTO volumes (sort_order, title, summary, created_at) VALUES (?, ?, ?, datetime('now'))")
        .run(sortOrder, args.title, args.summary || '');
      return { created: true, volume_id: result.lastInsertRowid, title: args.title };
    }
    case 'update_volume': {
      const updates = [];
      const params = [];
      if (args.title !== undefined) { updates.push('title = ?'); params.push(args.title); }
      if (args.summary !== undefined) { updates.push('summary = ?'); params.push(args.summary); }
      if (updates.length === 0) return { error: '没有要更新的字段' };
      params.push(args.volume_id);
      pdb.prepare(`UPDATE volumes SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      return { updated: true, volume_id: args.volume_id };
    }
    case 'delete_volume': {
      const vol = pdb.prepare('SELECT id FROM volumes WHERE id = ?').get(args.volume_id);
      if (!vol) return { error: `卷 ${args.volume_id} 不存在` };
      pdb.prepare('DELETE FROM chapters WHERE volume_id = ?').run(args.volume_id);
      pdb.prepare('DELETE FROM volumes WHERE id = ?').run(args.volume_id);
      return { deleted: true, volume_id: args.volume_id };
    }

    default:
      return { error: `未知工具: ${toolName}` };
  }
}

module.exports = { TOOLS, executeTool };
