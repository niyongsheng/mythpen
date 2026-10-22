// ─── Tool schema definitions (OpenAI function-calling format) ───
const { stripLeadingChapterHeading } = require('./titles');

const TOOLS = [
  // ═══ Chapters ═══
  {
    type: 'function',
    function: {
      name: 'list_chapters',
      description: '列出小说的章节（分页），返回章节编号、标题、状态、字数和摘要。用于了解整体结构和进度。',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: '返回条数，默认 200，最大 1000' },
          offset: { type: 'number', description: '偏移量，默认 0' },
        },
        required: [],
      },
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
      description: '创建新章节。新建后会自动按全书顺序分配编号（跨卷唯一），并默认放入最后一卷。如需指定编号请传入 chapter_num。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '章节标题' },
          chapter_num: { type: 'number', description: '章节编号（可选）。不传则自动按全书顺序编号；传入则使用指定编号' },
          outline: { type: 'string', description: '章节大纲（可选）' },
          content: { type: 'string', description: '章节正文（可选）' },
          volume_id: { type: 'number', description: '所属卷ID，默认为最后一卷' },
          cognitive_frame: { type: 'string', description: '叙事维度 — 认知框架（可选）' },
          emotional_anchor: { type: 'string', description: '叙事维度 — 情感锚点（可选）' },
          world_texture: { type: 'string', description: '叙事维度 — 世界质感（可选）' },
          concrete_mystery: { type: 'string', description: '叙事维度 — 悬念设置（可选）' },
          interpersonal_tension: { type: 'string', description: '叙事维度 — 人际张力（可选）' },
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
          summary: { type: 'string', description: '章节摘要（可选）' },
          cognitive_frame: { type: 'string', description: '叙事维度 — 认知框架：角色的认知变化（可选）' },
          emotional_anchor: { type: 'string', description: '叙事维度 — 情感锚点：章节的情感基调（可选）' },
          world_texture: { type: 'string', description: '叙事维度 — 世界质感：场景氛围与细节（可选）' },
          concrete_mystery: { type: 'string', description: '叙事维度 — 悬念设置：本章要埋下或推进的谜团（可选）' },
          interpersonal_tension: { type: 'string', description: '叙事维度 — 人际张力：角色间的冲突与张力（可选）' },
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
          category: { type: 'string', enum: ['location', 'organization', 'concept', 'event'], description: '类别：location(地点)、organization(组织)、concept(概念)、event(事件)' },
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

  // ═══ Payoff Points (爽点) ═══
  {
    type: 'function',
    function: {
      name: 'list_payoffs',
      description: '列出小说的所有爽点（打脸、逆袭、装逼等爽感设计），可按状态筛选。写爽文章节前用它确认哪些爽点待铺垫或待释放。',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['planned', 'building', 'released', 'abandoned'], description: '按状态筛选（可选）' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_payoff',
      description: '设计一个新的爽点，用于规划爽文中的情绪释放：何时铺垫、何时爆发。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '爽点标题' },
          type: { type: 'string', enum: ['face-slap', 'flex', 'comeback', 'reveal', 'reward', 'revenge', 'breakthrough', 'other'], description: '爽点类型：face-slap(打脸)、flex(装逼)、comeback(逆袭)、reveal(身份/实力揭晓)、reward(获得奇遇)、revenge(复仇)、breakthrough(突破)、other(其他)' },
          description: { type: 'string', description: '爽点描述：如何铺垫、如何引爆、情绪如何释放' },
          intensity: { type: 'number', description: '爽感强度 1-5，默认 3' },
          setup_chapter: { type: 'number', description: '铺垫章节编号（可选）' },
          payoff_chapter: { type: 'number', description: '预计释放章节编号（可选）' },
        },
        required: ['title', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_payoff',
      description: '更新爽点的状态、类型、描述、强度或章节安排。写完后把已释放的爽点标记为 released。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '爽点标题' },
          status: { type: 'string', enum: ['planned', 'building', 'released', 'abandoned'], description: '新状态：planned(待铺垫)、building(铺垫中)、released(已释放)、abandoned(已放弃)' },
          type: { type: 'string', enum: ['face-slap', 'flex', 'comeback', 'reveal', 'reward', 'revenge', 'breakthrough', 'other'], description: '更新类型（可选）' },
          description: { type: 'string', description: '更新描述（可选）' },
          intensity: { type: 'number', description: '更新爽感强度 1-5（可选）' },
          setup_chapter: { type: 'number', description: '更新铺垫章节（可选）' },
          payoff_chapter: { type: 'number', description: '更新释放章节（可选）' },
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
  // ═══ Science ═══
  {
    type: 'function',
    function: {
      name: 'list_science',
      description: '列出小说的所有科幻设定条目，按标签（已知/外推/假设）分组。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_science_entry',
      description: '创建一条科幻设定条目。',
      parameters: {
        type: 'object',
        properties: {
          label: { type: 'string', enum: ['known', 'extrapolation', 'hypothesis'], description: '分类：已知/外推/假设' },
          name: { type: 'string', description: '条目名称' },
          description: { type: 'string', description: '详细描述' },
          references: { type: 'string', description: '参考文献（可选）' },
        },
        required: ['label', 'name', 'description'],
      },
    },
  },

  // ═══ Update tools ═══
  {
    type: 'function',
    function: {
      name: 'update_world_entry',
      description: '更新已有世界观设定条目的内容。只传需要修改的字段。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '条目ID' },
          category: { type: 'string', description: '类别（可选）' },
          name: { type: 'string', description: '条目名称（可选）' },
          description: { type: 'string', description: '详细描述（可选）' },
          tags: { type: 'string', description: '标签（可选）' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_relation',
      description: '更新角色关系。只传需要修改的字段。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '关系ID' },
          relation_type: { type: 'string', description: '关系类型，如：朋友、敌人、恋人等（可选）' },
          description: { type: 'string', description: '关系描述（可选）' },
          intensity: { type: 'number', description: '关系强度 1-5（可选）' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_memory',
      description: '更新创作记忆。只传需要修改的字段。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '记忆ID' },
          category: { type: 'string', enum: ['character', 'location', 'item', 'event', 'promise', 'other'], description: '类别（可选）' },
          content: { type: 'string', description: '记忆内容（可选）' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_timeline_event',
      description: '更新时间线事件。只传需要修改的字段。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '事件ID' },
          year: { type: 'string', description: '时间（如"2048年"）（可选）' },
          title: { type: 'string', description: '事件标题（可选）' },
          description: { type: 'string', description: '事件描述（可选）' },
          importance: { type: 'number', description: '重要性 1-5（可选）' },
        },
        required: ['id'],
      },
    },
  },

  // ═══ Delete tools ═══
  {
    type: 'function',
    function: {
      name: 'delete_science_entry',
      description: '删除指定科幻设定条目。此操作不可逆，请谨慎使用。',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: '条目ID' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_character',
      description: '删除指定角色。此操作不可逆，请谨慎使用。',
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
      name: 'delete_world_entry',
      description: '删除指定世界观条目。此操作不可逆，请谨慎使用。',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: '条目ID' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_foreshadow',
      description: '删除指定伏笔。此操作不可逆，请谨慎使用。',
      parameters: {
        type: 'object',
        properties: { title: { type: 'string', description: '伏笔标题' } },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_payoff',
      description: '删除指定爽点。此操作不可逆，请谨慎使用。',
      parameters: {
        type: 'object',
        properties: { title: { type: 'string', description: '爽点标题' } },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_relation',
      description: '删除指定角色关系。此操作不可逆，请谨慎使用。',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: '关系ID' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_memory',
      description: '删除指定创作记忆。此操作不可逆，请谨慎使用。',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: '记忆ID' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_timeline_event',
      description: '删除指定时间线事件。此操作不可逆，请谨慎使用。',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: '事件ID' } },
        required: ['id'],
      },
    },
  },
  // ── Chapter Characters ──
  {
    type: 'function',
    function: {
      name: 'list_chapter_characters',
      description: '查询指定章节或指定角色的出场记录。可传 chapter_num 按章查询，或传 character_name 按角色查询。',
      parameters: {
        type: 'object',
        properties: {
          chapter_num: { type: 'number', description: '章节编号（可选，不传则按角色查）' },
          character_name: { type: 'string', description: '角色姓名（可选，不传则按章节查）' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_chapter_character',
      description: '设置角色在指定章节中的出场角色（appears/speaks/pov/mentioned）。如果已存在则更新角色。',
      parameters: {
        type: 'object',
        properties: {
          chapter_num: { type: 'number', description: '章节编号' },
          character_name: { type: 'string', description: '角色姓名' },
          role: { type: 'string', enum: ['appears', 'speaks', 'pov', 'mentioned'], description: '出场方式' },
        },
        required: ['chapter_num', 'character_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_chapter_character',
      description: '移除角色在指定章节中的出场记录。',
      parameters: {
        type: 'object',
        properties: {
          chapter_num: { type: 'number', description: '章节编号' },
          character_name: { type: 'string', description: '角色姓名' },
        },
        required: ['chapter_num', 'character_name'],
      },
    },
  },
  // ── Clue Board ──
  {
    type: 'function',
    function: {
      name: 'list_clues',
      description: '查询线索板所有条目。可传 status 过滤未解决/已解决。',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['all', 'unresolved', 'resolved'], description: '过滤状态（默认 all）' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_clue',
      description: '在线索板上创建新条目。kind 类型：clue（线索）、red-herring（误导）、deduction（推理结论）、question（待解问题）。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '线索标题' },
          description: { type: 'string', description: '详细描述' },
          kind: { type: 'string', enum: ['clue', 'red-herring', 'deduction', 'question'], description: '条目类型' },
          related_chapter_num: { type: 'number', description: '关联章节编号（可选）' },
        },
        required: ['title', 'kind'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_clue',
      description: '更新线索板条目。可修改标题、描述、类型，或标记为已解决/未解决。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '线索ID' },
          title: { type: 'string', description: '新标题（可选）' },
          description: { type: 'string', description: '新描述（可选）' },
          kind: { type: 'string', enum: ['clue', 'red-herring', 'deduction', 'question'], description: '新类型（可选）' },
          resolved: { type: 'boolean', description: '是否已解决（可选）' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_clue',
      description: '删除线索板条目。此操作不可逆。',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: '线索ID' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_project_meta',
      description: '获取当前项目的完整元信息：名称、创作类型（genres）、篇幅模式、写作语言、当前阶段、总字数等。用于了解项目的基本定位和设定。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_project_phase',
      description: '推进项目创作阶段。阶段流转：选题(idea) → 设定(setting) → 大纲(outline) → 写作(writing) → 审阅(review) → 一致性(consistency) → 导出(export)。当当前阶段的创作要素讨论完成并写入数据库后，调用此工具推进到下一阶段。',
      parameters: {
        type: 'object',
        properties: {
          phase: { type: 'string', enum: ['idea', 'setting', 'outline', 'writing', 'review', 'consistency', 'export'], description: '要推进到的目标阶段' },
        },
        required: ['phase'],
      },
    },
  },
];
const { randomUUID } = require('crypto');

// Each tool entry owns its handler, client entity and prompt category.
const HANDLERS = {
  // ── Chapters ──
  list_chapters: {
    entity: null,
    category: '章节与卷',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      const total = pdb.prepare('SELECT COUNT(*) as c FROM chapters').get().c;
      const limit = Math.min(Math.max(parseInt(args.limit, 10) || 200, 1), 1000);
      const offset = Math.max(parseInt(args.offset, 10) || 0, 0);
      const rows = pdb.prepare(
        'SELECT num, title, status, word_count, outline, summary, volume_id, created_at, updated_at FROM chapters ORDER BY num LIMIT ? OFFSET ?',
      ).all(limit, offset);
      return { total, limit, offset, chapters: rows };
    },
  },
  get_chapter: {
    entity: null,
    category: '章节与卷',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      const row = pdb.prepare('SELECT * FROM chapters WHERE num = ?').get(args.chapter_num);
      if (!row) return { error: `章节 ${args.chapter_num} 不存在` };
      // Keep tool results bounded for very large (e.g. imported) chapters.
      const MAX_SIDE = 6000;
      if (typeof row.content === 'string' && row.content.length > MAX_SIDE * 2) {
        const omitted = row.content.length - MAX_SIDE * 2;
        row.content = `${row.content.slice(0, MAX_SIDE)}\n\n…（中间省略 ${omitted} 字）…\n\n${row.content.slice(-MAX_SIDE)}`;
        row.truncated = true;
        row.omitted_chars = omitted;
      }
      return row;
    },
  },
  create_chapter: {
    entity: 'chapter',
    category: '章节与卷',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      const volId = args.volume_id || db.lastVolumeId(projectName);
      const num = args.chapter_num !== undefined ? args.chapter_num : db.nextChapterNumber(projectName);
      pdb.prepare(`INSERT INTO chapters (volume_id, num, title, outline, content, word_count, status, cognitive_frame, emotional_anchor, world_texture, concrete_mystery, interpersonal_tension, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`)
        .run(volId, num, args.title, args.outline || '', args.content || '',
          args.content ? db.countWords(args.content) : 0,
          args.cognitive_frame || '', args.emotional_anchor || '', args.world_texture || '',
          args.concrete_mystery || '', args.interpersonal_tension || '');
      return { created: true, chapter_num: num, title: args.title };
    },
  },
  update_chapter: {
    entity: 'chapter',
    category: '章节与卷',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      const { chapter_num, ...fields } = args;
      const allowed = ['title', 'content', 'outline', 'status', 'summary', 'cognitive_frame', 'emotional_anchor', 'world_texture', 'concrete_mystery', 'interpersonal_tension'];
      const updates = [];
      const params = [];
      if (typeof fields.content === 'string') {
        // AI often repeats the chapter heading at the top of the body; the UI
        // renders the title separately, so store the content without it.
        const row = pdb.prepare('SELECT title FROM chapters WHERE num = ?').get(chapter_num);
        fields.content = stripLeadingChapterHeading(fields.content, {
          title: typeof fields.title === 'string' ? fields.title : row && row.title,
        });
      }
      for (const key of allowed) {
        if (fields[key] !== undefined) {
          updates.push(`${key} = ?`);
          params.push(fields[key]);
        }
      }
      if (updates.length === 0) return { error: '没有要更新的字段' };
      if (fields.content !== undefined) {
        const wc = db.countWords(fields.content);
        updates.push('word_count = ?');
        params.push(wc);
      }
      updates.push("updated_at = datetime('now')");
      params.push(chapter_num);
      pdb.prepare(`UPDATE chapters SET ${updates.join(', ')} WHERE num = ?`).run(...params);
      db.recalculateWordCount(projectName);
      return { updated: true, chapter_num, changed_fields: Object.keys(fields).filter(k => allowed.includes(k)) };
    },
  },
  delete_chapter: {
    entity: 'chapter',
    category: '章节与卷',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      const row = pdb.prepare('SELECT id FROM chapters WHERE num = ?').get(args.chapter_num);
      if (!row) return { error: `章节 ${args.chapter_num} 不存在` };
      pdb.prepare('DELETE FROM chapters WHERE num = ?').run(args.chapter_num);
      db.recalculateWordCount(projectName);
      return { deleted: true, chapter_num: args.chapter_num };
    },
  },
  // ── Characters ──
  list_characters: {
    entity: null,
    category: '设定构建',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      return pdb.prepare('SELECT id, name, age, gender, personality, background, motivation, arc, notes FROM characters ORDER BY name').all();
    },
  },
  get_character: {
    entity: null,
    category: '设定构建',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
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
    },
  },
  create_character: {
    entity: 'character',
    category: '设定构建',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      const id = randomUUID();
      pdb.prepare(`INSERT INTO characters (id, name, age, gender, appearance, personality, background, motivation, arc, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, args.name, args.age || '', args.gender || '', args.appearance || '', args.personality || '',
          args.background || '', args.motivation || '', args.arc || '', args.notes || '');
      return { created: true, id, name: args.name };
    },
  },
  update_character: {
    entity: 'character',
    category: '设定构建',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
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
    },
  },
  // ── World ──
  list_world: {
    entity: null,
    category: '世界观',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      return pdb.prepare('SELECT id, category, name, description, tags FROM world_entries ORDER BY category, name').all();
    },
  },
  create_world_entry: {
    entity: 'world',
    category: '世界观',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      const id = randomUUID();
      pdb.prepare('INSERT INTO world_entries (id, category, name, description, tags) VALUES (?, ?, ?, ?, ?)')
        .run(id, args.category, args.name, args.description, args.tags || '');
      return { created: true, id, category: args.category, name: args.name };
    },
  },
  // ── Foreshadows ──
  list_foreshadows: {
    entity: null,
    category: '伏笔与线索',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      let sql = 'SELECT * FROM foreshadows';
      const params = [];
      if (args.status) { sql += ' WHERE status = ?'; params.push(args.status); }
      sql += ' ORDER BY created_at';
      return pdb.prepare(sql).all(...params);
    },
  },
  create_foreshadow: {
    entity: 'foreshadow',
    category: '伏笔与线索',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      const id = randomUUID();
      pdb.prepare(`INSERT INTO foreshadows (id, title, description, status, priority, expected_resolve_chapter)
        VALUES (?, ?, ?, 'planted', ?, ?)`)
        .run(id, args.title, args.description, args.priority || 'normal', args.expected_resolve_chapter || 0);
      return { created: true, id, title: args.title };
    },
  },
  update_foreshadow: {
    entity: 'foreshadow',
    category: '伏笔与线索',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
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
    },
  },
  // ── Payoff Points (爽点) ──
  list_payoffs: {
    entity: null,
    category: '爽点设计',
    run(ctx) {
      const { pdb, args } = ctx;
      let sql = 'SELECT * FROM payoff_points';
      const params = [];
      if (args.status) { sql += ' WHERE status = ?'; params.push(args.status); }
      sql += ' ORDER BY payoff_chapter, created_at';
      return pdb.prepare(sql).all(...params);
    },
  },
  create_payoff: {
    entity: 'payoff',
    category: '爽点设计',
    run(ctx) {
      const { pdb, args } = ctx;
      const genres = pdb.prepare('SELECT genre FROM project_genres').all().map(g => g.genre);
      if (!genres.includes('power-fantasy')) {
        return { error: '当前项目不是爽文（power-fantasy）类型，无法创建爽点' };
      }
      const id = randomUUID();
      const intensity = Math.max(1, Math.min(5, Number(args.intensity) || 3));
      const types = ['face-slap', 'flex', 'comeback', 'reveal', 'reward', 'revenge', 'breakthrough', 'other'];
      const type = types.includes(args.type) ? args.type : 'other';
      pdb.prepare(`INSERT INTO payoff_points (id, title, type, description, status, intensity, setup_chapter, payoff_chapter)
        VALUES (?, ?, ?, ?, 'planned', ?, ?, ?)`)
        .run(id, args.title, type, args.description, intensity, args.setup_chapter || 0, args.payoff_chapter || 0);
      return { created: true, id, title: args.title };
    },
  },
  update_payoff: {
    entity: 'payoff',
    category: '爽点设计',
    run(ctx) {
      const { pdb, args, updateById } = ctx;
      if (args.status && !['planned', 'building', 'released', 'abandoned'].includes(args.status)) {
        return { error: `无效状态: ${args.status}` };
      }
      const p = pdb.prepare('SELECT id FROM payoff_points WHERE title = ?').get(args.title);
      if (!p) return { error: `爽点 "${args.title}" 不存在` };
      const fields = {
        type: args.type,
        description: args.description,
        status: args.status,
        intensity: args.intensity !== undefined ? Math.max(1, Math.min(5, Number(args.intensity) || 3)) : undefined,
        setup_chapter: args.setup_chapter,
        payoff_chapter: args.payoff_chapter,
      };
      return updateById(p.id, 'payoff_points', fields, ['type', 'description', 'status', 'intensity', 'setup_chapter', 'payoff_chapter'], true);
    },
  },
  // ── Relations ──
  list_relations: {
    entity: null,
    category: '设定构建',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      return pdb.prepare(`
        SELECT cr.*, ca.name as character_a_name, cb.name as character_b_name
        FROM character_relations cr
        JOIN characters ca ON cr.character_a_id = ca.id
        JOIN characters cb ON cr.character_b_id = cb.id
      `).all();
    },
  },
  create_relation: {
    entity: 'relation',
    category: '设定构建',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      const a = pdb.prepare('SELECT id FROM characters WHERE name = ?').get(args.character_a);
      const b = pdb.prepare('SELECT id FROM characters WHERE name = ?').get(args.character_b);
      if (!a) return { error: `角色 "${args.character_a}" 不存在，请先创建` };
      if (!b) return { error: `角色 "${args.character_b}" 不存在，请先创建` };
      const id = randomUUID();
      pdb.prepare(`INSERT INTO character_relations (id, character_a_id, character_b_id, relation_type, description, intensity)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run(id, a.id, b.id, args.relation_type, args.description || '', args.intensity || 3);
      return { created: true, id, relation: `${args.character_a} → ${args.character_b}: ${args.relation_type}` };
    },
  },
  // ── Memories ──
  list_memories: {
    entity: null,
    category: '时间线与记忆',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      return pdb.prepare('SELECT * FROM memories ORDER BY created_at DESC').all();
    },
  },
  create_memory: {
    entity: 'memory',
    category: '时间线与记忆',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      const id = randomUUID();
      pdb.prepare('INSERT INTO memories (id, category, content, source_chapter_id) VALUES (?, ?, ?, ?)')
        .run(id, args.category, args.content, args.source_chapter_num || null);
      return { created: true, id, category: args.category };
    },
  },
  // ── Timeline ──
  list_timeline: {
    entity: null,
    category: '时间线与记忆',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      return pdb.prepare('SELECT * FROM timeline_events ORDER BY year').all();
    },
  },
  create_timeline_event: {
    entity: 'timeline',
    category: '时间线与记忆',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      const id = randomUUID();
      pdb.prepare('INSERT INTO timeline_events (id, year, title, description, importance) VALUES (?, ?, ?, ?, ?)')
        .run(id, args.year, args.title, args.description, args.importance || 3);
      return { created: true, id, year: args.year, title: args.title };
    },
  },
  // ── Stats ──
  get_stats: {
    entity: null,
    category: '项目状态',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
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
    },
  },
  // ── Volumes ──
  list_volumes: {
    entity: null,
    category: '章节与卷',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      const vols = pdb.prepare('SELECT * FROM volumes ORDER BY sort_order').all();
      for (const v of vols) {
        v.chapters = pdb.prepare('SELECT num, title, status, word_count, outline, summary FROM chapters WHERE volume_id = ? ORDER BY num').all(v.id);
      }
      return vols;
    },
  },
  create_volume: {
    entity: 'volume',
    category: '章节与卷',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      const max = pdb.prepare('SELECT COALESCE(MAX(sort_order), 0) as mx FROM volumes').get();
      const sortOrder = (max?.mx || 0) + 1;
      const result = pdb.prepare("INSERT INTO volumes (sort_order, title, summary, created_at) VALUES (?, ?, ?, datetime('now'))")
        .run(sortOrder, args.title, args.summary || '');
      return { created: true, volume_id: result.lastInsertRowid, title: args.title };
    },
  },
  update_volume: {
    entity: 'volume',
    category: '章节与卷',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      const updates = [];
      const params = [];
      if (args.title !== undefined) { updates.push('title = ?'); params.push(args.title); }
      if (args.summary !== undefined) { updates.push('summary = ?'); params.push(args.summary); }
      if (updates.length === 0) return { error: '没有要更新的字段' };
      params.push(args.volume_id);
      pdb.prepare(`UPDATE volumes SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      return { updated: true, volume_id: args.volume_id };
    },
  },
  delete_volume: {
    entity: 'volume',
    category: '章节与卷',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      const vol = pdb.prepare('SELECT id FROM volumes WHERE id = ?').get(args.volume_id);
      if (!vol) return { error: `卷 ${args.volume_id} 不存在` };
      pdb.prepare('DELETE FROM chapters WHERE volume_id = ?').run(args.volume_id);
      pdb.prepare('DELETE FROM volumes WHERE id = ?').run(args.volume_id);
      return { deleted: true, volume_id: args.volume_id };
    },
  },
  // ── Science ──
  list_science: {
    entity: null,
    category: '科幻设定',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      return pdb.prepare('SELECT * FROM science_entries ORDER BY label, name').all();
    },
  },
  create_science_entry: {
    entity: 'science',
    category: '科幻设定',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      const id = randomUUID();
      pdb.prepare('INSERT INTO science_entries (id, label, name, description, "references") VALUES (?, ?, ?, ?, ?)')
        .run(id, args.label, args.name, args.description, args.references || '');
      return { created: true, id, label: args.label, name: args.name };
    },
  },
  // ── World update/delete ──
  update_world_entry: {
    entity: 'world',
    category: '世界观',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      return updateById(args.id, 'world_entries', args, ['category', 'name', 'description', 'tags'], true);
    },
  },
  delete_world_entry: {
    entity: 'world',
    category: '世界观',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      return deleteById(args.id, 'world_entries', 'id', '条目');
    },
  },
  // ── Relations update/delete ──
  update_relation: {
    entity: 'relation',
    category: '设定构建',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      return updateById(args.id, 'character_relations', args, ['relation_type', 'description', 'intensity'], false);
    },
  },
  delete_relation: {
    entity: 'relation',
    category: '设定构建',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      return deleteById(args.id, 'character_relations', 'id', '关系');
    },
  },
  // ── Memories update/delete ──
  update_memory: {
    entity: 'memory',
    category: '时间线与记忆',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      return updateById(args.id, 'memories', args, ['category', 'content'], false);
    },
  },
  delete_memory: {
    entity: 'memory',
    category: '时间线与记忆',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      return deleteById(args.id, 'memories', 'id', '记忆');
    },
  },
  // ── Timeline update/delete ──
  update_timeline_event: {
    entity: 'timeline',
    category: '时间线与记忆',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      return updateById(args.id, 'timeline_events', args, ['year', 'title', 'description', 'importance'], false);
    },
  },
  delete_timeline_event: {
    entity: 'timeline',
    category: '时间线与记忆',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      return deleteById(args.id, 'timeline_events', 'id', '事件');
    },
  },
  // ── Science delete ──
  delete_science_entry: {
    entity: 'science',
    category: '科幻设定',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      return deleteById(args.id, 'science_entries', 'id', '条目');
    },
  },
  // ── Character delete ──
  delete_character: {
    entity: 'character',
    category: '设定构建',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      return deleteById(args.name, 'characters', 'name', '角色');
    },
  },
  // ── Foreshadow delete ──
  delete_foreshadow: {
    entity: 'foreshadow',
    category: '伏笔与线索',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      return deleteById(args.title, 'foreshadows', 'title', '伏笔');
    },
  },
  delete_payoff: {
    entity: 'payoff',
    category: '爽点设计',
    run(ctx) {
      const { deleteById, args } = ctx;
      return deleteById(args.title, 'payoff_points', 'title', '爽点');
    },
  },
  // ── Chapter Characters ──
  list_chapter_characters: {
    entity: null,
    category: '章节与卷',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      if (args.chapter_num) {
        return pdb.prepare(`
          SELECT cc.chapter_id, c.title as chapter_title, cc.character_id, ch.name as character_name, cc.role
          FROM chapter_characters cc
          JOIN chapters c ON c.id = cc.chapter_id
          JOIN characters ch ON ch.id = cc.character_id
          WHERE c.num = ?
          ORDER BY ch.name`).all(args.chapter_num);
      }
      if (args.character_name) {
        return pdb.prepare(`
          SELECT cc.chapter_id, c.num as chapter_num, c.title as chapter_title, cc.role
          FROM chapter_characters cc
          JOIN chapters c ON c.id = cc.chapter_id
          JOIN characters ch ON ch.id = cc.character_id
          WHERE ch.name = ?
          ORDER BY c.num`).all(args.character_name);
      }
      // Return all
      return pdb.prepare(`
        SELECT cc.chapter_id, c.num as chapter_num, c.title as chapter_title,
               ch.name as character_name, cc.role
        FROM chapter_characters cc
        JOIN chapters c ON c.id = cc.chapter_id
        JOIN characters ch ON ch.id = cc.character_id
        ORDER BY c.num, ch.name`).all();
    },
  },
  set_chapter_character: {
    entity: 'chapter',
    category: '章节与卷',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      const ch = pdb.prepare('SELECT id FROM chapters WHERE num = ?').get(args.chapter_num);
      if (!ch) return { error: `章节 ${args.chapter_num} 不存在` };
      const char = pdb.prepare('SELECT id FROM characters WHERE name = ?').get(args.character_name);
      if (!char) return { error: `角色 ${args.character_name} 不存在` };
      const role = args.role || 'appears';
      pdb.prepare('INSERT OR REPLACE INTO chapter_characters (chapter_id, character_id, role) VALUES (?, ?, ?)')
        .run(ch.id, char.id, role);
      return { set: true, chapter_num: args.chapter_num, character_name: args.character_name, role };
    },
  },
  remove_chapter_character: {
    entity: 'chapter',
    category: '章节与卷',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      const ch = pdb.prepare('SELECT id FROM chapters WHERE num = ?').get(args.chapter_num);
      if (!ch) return { error: `章节 ${args.chapter_num} 不存在` };
      const char = pdb.prepare('SELECT id FROM characters WHERE name = ?').get(args.character_name);
      if (!char) return { error: `角色 ${args.character_name} 不存在` };
      const info = pdb.prepare('DELETE FROM chapter_characters WHERE chapter_id = ? AND character_id = ?').run(ch.id, char.id);
      if (info.changes === 0) return { error: `角色 ${args.character_name} 在章节 ${args.chapter_num} 中没有出场记录` };
      return { deleted: true, chapter_num: args.chapter_num, character_name: args.character_name };
    },
  },
  // ── Clue Board ──
  list_clues: {
    entity: null,
    category: '伏笔与线索',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      let sql = 'SELECT * FROM clue_board ORDER BY resolved, created_at DESC';
      if (args.status === 'unresolved') { sql = 'SELECT * FROM clue_board WHERE resolved = 0 ORDER BY created_at DESC'; }
      if (args.status === 'resolved') { sql = 'SELECT * FROM clue_board WHERE resolved = 1 ORDER BY resolved_at DESC'; }
      return pdb.prepare(sql).all();
    },
  },
  create_clue: {
    entity: null,
    category: '伏笔与线索',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      const id = randomUUID();
      let relatedChapterId = null;
      if (args.related_chapter_num) {
        const ch = pdb.prepare('SELECT id FROM chapters WHERE num = ?').get(args.related_chapter_num);
        if (ch) relatedChapterId = ch.id;
      }
      pdb.prepare('INSERT INTO clue_board (id, title, description, kind, related_chapter_id, resolved, created_at) VALUES (?, ?, ?, ?, ?, 0, datetime(\'now\'))')
        .run(id, args.title, args.description || '', args.kind, relatedChapterId);
      return { created: true, id, title: args.title, kind: args.kind };
    },
  },
  update_clue: {
    entity: null,
    category: '伏笔与线索',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      const existing = pdb.prepare('SELECT * FROM clue_board WHERE id = ?').get(args.id);
      if (!existing) return { error: `线索 ${args.id} 不存在` };
      const updates = []; const params = [];
      if (args.title !== undefined) { updates.push('title = ?'); params.push(args.title); }
      if (args.description !== undefined) { updates.push('description = ?'); params.push(args.description); }
      if (args.kind !== undefined) { updates.push('kind = ?'); params.push(args.kind); }
      if (args.resolved !== undefined) {
        updates.push('resolved = ?');
        params.push(args.resolved ? 1 : 0);
        updates.push(args.resolved ? "resolved_at = datetime('now')" : 'resolved_at = NULL');
      }
      if (updates.length === 0) return { error: '没有要更新的字段' };
      params.push(args.id);
      pdb.prepare(`UPDATE clue_board SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      return { updated: true, id: args.id };
    },
  },
  delete_clue: {
    entity: null,
    category: '伏笔与线索',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      return deleteById(args.id, 'clue_board', 'id', '线索');
    },
  },
  // ── Project Meta ──
  get_project_meta: {
    entity: null,
    category: '项目状态',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      const meta = {};
      pdb.prepare('SELECT key, value FROM project_meta').all().forEach(m => meta[m.key] = m.value);
      const genres = pdb.prepare('SELECT genre FROM project_genres').all().map(g => g.genre);
      const genreLabels = { 'sci-fi': '科幻', 'fantasy': '玄幻', 'romance': '言情', 'history': '历史', 'urban': '都市', 'power-fantasy': '爽文', 'biography': '传记', 'other': '其他' };
      return {
        name: meta.name || '',
        genres: genres,
        genreLabels: genres.map(g => genreLabels[g] || g),
        mode: meta.mode || 'medium-novel',
        language: meta.language || 'zh',
        phase: meta.workflow_phase || 'idea',
        phaseLabel: ({idea:'选题',setting:'设定',outline:'大纲',writing:'写作',review:'审阅',consistency:'一致性',export:'导出'})[meta.workflow_phase] || '选题',
        wordCount: Number(meta.word_count) || 0,
        authorName: meta.author_name || '',
        description: meta.description || '',
      };
    },
  },
  // ── Project Phase ──
  update_project_phase: {
    entity: 'project',
    category: '项目状态',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      const validPhases = ['idea', 'setting', 'outline', 'writing', 'review', 'consistency', 'export'];
      if (!validPhases.includes(args.phase)) {
        return { error: `无效阶段: ${args.phase}，有效值: ${validPhases.join('、')}` };
      }
      pdb.prepare("INSERT OR REPLACE INTO project_meta (key, value) VALUES ('workflow_phase', ?)").run(args.phase);
      return { updated: true, phase: args.phase };
    },
  },
};

// Single tool registry: schema + handler + entity + prompt category.
// TOOLS (the AI-facing schema array) is the source for names/params; the
// handler map is validated against it at startup so the two cannot drift.
const TOOL_REGISTRY = Object.fromEntries(
  TOOLS.map((schema) => {
    const name = schema.function.name;
    const handler = HANDLERS[name];
    if (!handler) throw new Error(`Tool "${name}" has no handler`);
    return [
      name,
      {
        name,
        description: schema.function.description,
        parameters: schema.function.parameters,
        entity: handler.entity,
        category: handler.category,
        run: handler.run,
      },
    ];
  }),
);
for (const name of Object.keys(HANDLERS)) {
  if (!TOOL_REGISTRY[name]) throw new Error(`Handler "${name}" has no tool schema`);
}

const CATEGORY_ORDER = ['设定构建', '世界观', '科幻设定', '伏笔与线索', '爽点设计', '章节与卷', '时间线与记忆', '项目状态', '其他'];

function describeParams(tool) {
  const props = tool.parameters?.properties || {};
  const required = new Set(tool.parameters?.required || []);
  return Object.entries(props)
    .map(([key, schema]) => {
      const hint = schema.enum ? schema.enum.join('|') : schema.type;
      return `${key}${required.has(key) ? '' : '?'}${hint ? `:${hint}` : ''}`;
    })
    .join(', ');
}

/** Compact tool manual generated from the registry (used by prompts). */
function buildToolReference() {
  const groups = new Map();
  for (const tool of Object.values(TOOL_REGISTRY)) {
    if (!groups.has(tool.category)) groups.set(tool.category, []);
    groups.get(tool.category).push(tool);
  }
  const order = [...groups.keys()].sort(
    (a, b) => (CATEGORY_ORDER.indexOf(a) + 1 || 99) - (CATEGORY_ORDER.indexOf(b) + 1 || 99),
  );
  return order
    .map((category) => {
      const items = groups.get(category).map((tool) => {
        const summary = String(tool.description || '').split(/[。\n]/)[0].slice(0, 120);
        return `- ${tool.name}(${describeParams(tool)}) — ${summary}`;
      });
      return `【${category}】\n${items.join('\n')}`;
    })
    .join('\n\n');
}

function executeTool(projectName, toolName, args) {
  const tool = TOOL_REGISTRY[toolName];
  if (!tool) return { error: `未知工具: ${toolName}` };

  const db = require('./db');
  const pdb = db.getProjectDb(projectName);

  // ─── Shared helpers ───
  function updateById(id, table, fields, allowed, addUpdatedAt) {
    const updates = []; const params = [];
    for (const key of allowed) {
      if (fields[key] !== undefined) { updates.push(`${key} = ?`); params.push(fields[key]); }
    }
    if (updates.length === 0) return { error: '没有要更新的字段' };
    if (addUpdatedAt) updates.push("updated_at = datetime('now')");
    params.push(id);
    const info = pdb.prepare(`UPDATE ${table} SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    if (info.changes === 0) return { error: `条目 ${id} 不存在` };
    return { updated: true, id };
  }

  function deleteById(id, table, idField, entityName) {
    const info = pdb.prepare(`DELETE FROM ${table} WHERE ${idField} = ?`).run(id);
    if (info.changes === 0) return { error: `${entityName} ${id} 不存在` };
    return { deleted: true, [idField]: id };
  }

  return tool.run({ db, pdb, projectName, args, updateById, deleteById });
}

module.exports = { TOOLS, TOOL_REGISTRY, buildToolReference, executeTool };

