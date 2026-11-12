// ─── Tool schema definitions (OpenAI function-calling format) ───
const { stripLeadingChapterHeading } = require('./titles');
const { saveAuthorNotes } = require('./author-notes');
const { ALLOWED_SETTING_CATEGORIES, SETTING_PAGE_GENRES } = require('./settings');
const { STYLE_LABELS } = require('./styles');

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
      description: '创建新章节框架。新建后会自动按全书顺序分配编号（跨卷唯一）。必须指定 volume_id（卷结构里有卷ID）。大纲和正文请用 update_chapter 写入。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '章节标题' },
          chapter_num: { type: 'number', description: '章节编号（可选）。不传则自动按全书顺序编号；传入则使用指定编号' },
          volume_id: { type: 'number', description: '所属卷ID（必填），见项目上下文「卷结构」' },
        },
        required: ['title', 'volume_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_chapter',
      description: '更新章节内容。只传需要修改的字段。status: pending/writing/review/accepted。传 volume_id 可把章节移到另一卷（不改正文）。',
      parameters: {
        type: 'object',
        properties: {
          chapter_num: { type: 'number', description: '章节编号' },
          title: { type: 'string', description: '标题（可选）' },
          content: { type: 'string', description: '正文内容（可选）' },
          outline: { type: 'string', description: '大纲（可选）' },
          status: { type: 'string', enum: ['pending', 'writing', 'review', 'accepted'], description: '状态（可选）' },
          summary: { type: 'string', description: '章节摘要（可选）' },
          cognitive_frame: { type: 'string', description: '叙事维度：认知框架（可选）' },
          emotional_anchor: { type: 'string', description: '叙事维度：情感锚点（可选）' },
          world_texture: { type: 'string', description: '叙事维度：世界质感（可选）' },
          concrete_mystery: { type: 'string', description: '叙事维度：具体悬念（可选）' },
          interpersonal_tension: { type: 'string', description: '叙事维度：人际张力（可选）' },
          genre_beat: { type: 'string', description: '类型推进：本章在作品类型上的核心推进（可选）' },
          volume_id: { type: 'number', description: '移动到指定卷ID（可选）。用于修正章节归属的卷，不会改动正文' },
        },
        required: ['chapter_num'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_chapter',
      description: '删除指定章节。已定稿（accepted）章节默认受保护；如用户明确要求删除，需传 force=true。此操作不可逆，请谨慎使用。',
      parameters: {
        type: 'object',
        properties: {
          chapter_num: { type: 'number', description: '要删除的章节编号' },
          force: { type: 'boolean', description: '用户已明确确认删除定稿章节时传 true（默认 false）' },
        },
        required: ['chapter_num'],
      },
    },
  },

  // ═══ Characters ═══
  {
    type: 'function',
    function: {
      name: 'list_characters',
      description: '列出小说角色及其基本信息（姓名、种族/类型、年龄、性别、性格、背景等）。长篇/导入作品建议分页。',
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
          species: { type: 'string', description: '种族/类型（可选）' },
          age: { type: 'string', description: '年龄或存在时长（可选）' },
          gender: { type: 'string', description: '性别（可选）' },
          appearance: { type: 'string', description: '外观/形态（可选）' },
          personality: { type: 'string', description: '性格（可选）' },
          background: { type: 'string', description: '背景故事（可选）' },
          motivation: { type: 'string', description: '动机（可选）' },
          arc: { type: 'string', description: '角色弧线（可选）' },
          role: { type: 'string', enum: ['major', 'minor', 'extra'], description: '角色定位（可选）' },
          notes: { type: 'string', description: '备注/别名（可选）' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_character',
      description: '更新已有角色的信息。可用角色姓名或 id 定位；支持改名。只传需要修改的字段。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '角色姓名（用于定位，可选；与 id 二选一）' },
          id: { type: 'string', description: '角色 ID（用于定位，可选；与 name 二选一）' },
          new_name: { type: 'string', description: '新姓名（可选，用于改名）' },
          species: { type: 'string', description: '种族/类型（可选）' },
          age: { type: 'string', description: '年龄或存在时长（可选）' },
          gender: { type: 'string', description: '性别（可选）' },
          appearance: { type: 'string', description: '外观/形态（可选）' },
          personality: { type: 'string', description: '性格（可选）' },
          background: { type: 'string', description: '背景（可选）' },
          motivation: { type: 'string', description: '动机（可选）' },
          arc: { type: 'string', description: '角色弧线（可选）' },
          role: { type: 'string', enum: ['major', 'minor', 'extra'], description: '角色定位（可选）' },
          notes: { type: 'string', description: '备注/别名（可选）' },
        },
        required: [],
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
          category: { type: 'string', enum: ['location', 'organization', 'concept', 'event', 'other'], description: '类别：location(地点)、organization(组织)、concept(概念)、event(事件)、other(其他)' },
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
      description: '更新伏笔的状态、标题、描述、优先级或预计回收章节。可用 id 或标题定位。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '伏笔 ID（用于定位，可选；优先使用）' },
          title: { type: 'string', description: '伏笔标题（用于定位，可选；与 id 二选一）' },
          new_title: { type: 'string', description: '新标题（可选，用于改名）' },
          status: { type: 'string', enum: ['planted', 'progressing', 'resolved', 'abandoned'], description: '新状态' },
          description: { type: 'string', description: '更新描述（可选）' },
          priority: { type: 'string', enum: ['low', 'normal', 'high'], description: '优先级（可选）' },
          expected_resolve_chapter: { type: 'number', description: '预计揭晓章节编号（可选，0 表示未设置）' },
        },
        required: [],
      },
    },
  },

  // ═══ Payoff Points (爽点) ═══
  {
    type: 'function',
    function: {
      name: 'list_payoffs',
      description: '列出小说的所有爽点（打脸、逆袭、装逼等爽感设计），可按状态筛选。写爽文模式章节前用它确认哪些爽点待铺垫或待释放。',
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
      description: '设计一个新的爽点，用于规划爽文模式项目中的情绪释放：何时铺垫、何时爆发。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '爽点标题' },
          type: { type: 'string', enum: ['face-slap', 'flex', 'comeback', 'reveal', 'reward', 'revenge', 'breakthrough', 'other'], description: '爽点类型（可选）' },
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
      description: '更新爽点的标题、状态、类型、描述、强度或章节安排。可用 id 或标题定位。写完后把已释放的爽点标记为 released。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '爽点 ID（用于定位，可选；优先使用）' },
          title: { type: 'string', description: '爽点标题（用于定位，可选；与 id 二选一）' },
          new_title: { type: 'string', description: '新标题（可选，用于改名）' },
          status: { type: 'string', enum: ['planned', 'building', 'released', 'abandoned'], description: '新状态（可选）' },
          type: { type: 'string', enum: ['face-slap', 'flex', 'comeback', 'reveal', 'reward', 'revenge', 'breakthrough', 'other'], description: '更新类型（可选）' },
          description: { type: 'string', description: '更新描述（可选）' },
          intensity: { type: 'number', description: '更新爽感强度 1-5（可选）' },
          setup_chapter: { type: 'number', description: '更新铺垫章节（可选）' },
          payoff_chapter: { type: 'number', description: '更新释放章节（可选）' },
        },
        required: [],
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
      description: '列出创作记忆（关键事件、承诺、伏笔提醒等）。可按内容关键词或类别筛选。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '内容关键词（可选）' },
          category: { type: 'string', enum: ['character', 'location', 'item', 'event', 'promise', 'other'], description: '按类别筛选（可选）' },
          limit: { type: 'number', description: '返回条数，默认 100，最大 500' },
        },
        required: [],
      },
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
      description: '获取小说的统计数据：总字数、目标字数、章节数、角色/关系/伏笔/世界观/设定/时间线/记忆/线索数量、章节状态分布与 Token 用量。',
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
      description: '删除指定卷及其下的所有章节。卷内有章节时必须由用户明确确认并传 force=true。此操作不可逆，请谨慎使用。',
      parameters: {
        type: 'object',
        properties: {
          volume_id: { type: 'number', description: '要删除的卷ID' },
          force: { type: 'boolean', description: '用户已明确确认级联删除卷内章节时传 true（默认 false）' },
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
      description: '列出小说的所有设定体系条目。所有题材按分类（默认分类或用户自定义分类）分组，科幻条目同时带有标签（已知/外推/假设）。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_science_entry',
      description: '创建一条设定体系条目（科幻设定、修炼境界、武功体系、游戏系统等）。',
      parameters: {
        type: 'object',
        properties: {
          label: { type: 'string', enum: ['known', 'extrapolation', 'hypothesis'], description: '科幻条目的标签：已知/外推/假设（非科幻项目可省略）' },
          category: { type: 'string', description: '分类键。科幻: tech/biology/physics/society/politics/military/ai/alien/planet/history/other；玄幻/仙侠: realm/technique/artifact/sect/other；武侠: martial-art/school/weapon/other；游戏: system/skill/equipment/dungeon/other；也可用项目已有自定义分类' },
          name: { type: 'string', description: '条目名称' },
          description: { type: 'string', description: '详细描述' },
          references: { type: 'string', description: '参考文献（可选）' },
          sort_order: { type: 'number', description: '排序（数字越小越靠前，用于境界/等级等有序体系）' },
        },
        required: ['name', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_science_entry',
      description: '更新设定体系条目（科幻设定、修炼境界、武功体系、游戏系统等）。只传需要修改的字段。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '条目ID' },
          label: { type: 'string', enum: ['known', 'extrapolation', 'hypothesis'], description: '科幻条目标签：已知/外推/假设（可选）' },
          category: { type: 'string', description: '设定分类（可选，使用内置分类或项目已有自定义分类）' },
          name: { type: 'string', description: '条目名称（可选）' },
          description: { type: 'string', description: '详细描述（可选）' },
          references: { type: 'string', description: '参考文献（可选）' },
          sort_order: { type: 'number', description: '排序（可选）' },
        },
        required: ['id'],
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
      description: '删除指定设定体系条目。此操作不可逆，请谨慎使用。',
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
      description: '删除指定伏笔。优先用 id 定位（同名伏笔可能有多条）。此操作不可逆，请谨慎使用。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '伏笔 ID（可选，优先使用）' },
          title: { type: 'string', description: '伏笔标题（与 id 二选一）' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_payoff',
      description: '删除指定爽点。优先用 id 定位（同名爽点可能有多条）。此操作不可逆，请谨慎使用。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '爽点 ID（可选，优先使用）' },
          title: { type: 'string', description: '爽点标题（与 id 二选一）' },
        },
        required: [],
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
          related_chapter_num: { type: 'number', description: '关联章节编号（可选，0 表示取消关联）' },
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
      description: '获取当前项目的完整元信息：名称、创作类型（genres）、篇幅模式、写作语言、当前阶段、总字数、作者约定等。用于了解项目的基本定位和设定。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_author_notes',
      description: '更新本项目的「作者约定」——作者手写的写作规则（文风、人称、章节格式、禁区、协作方式等）。仅当用户明确要求记住或修改写作约定时调用，不要把对话内容自行总结写入。最多 2000 字；传空字符串可清空。',
      parameters: {
        type: 'object',
        properties: {
          notes: { type: 'string', description: '完整的创作约定内容（纯文本，最多 2000 字）' },
        },
        required: ['notes'],
      },
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
      return { total, limit, offset, chapters: clipFields(rows, ['outline', 'summary'], 200) };
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
    chapterTree: true,
    category: '章节与卷',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      // The chapter body can be far larger than a single tool call should
      // carry. Keep this tool to the frame and make the model write prose via
      // update_chapter, where the workflow expects it.
      const hasText = (value) => typeof value === 'string' && value.trim().length > 0;
      if (hasText(args.content) || hasText(args.outline)) {
        return { error: 'create_chapter 只创建章节框架，不接收 outline/content。请先创建章节，再用 update_chapter 写入大纲和正文。' };
      }
      // Never guess the volume: a wrong default silently files chapters under
      // another volume. The prompt/context provides volume IDs.
      const volId = args.volume_id;
      if (volId === undefined || volId === null) {
        return { error: 'create_chapter 必须指定 volume_id，可先用 list_volumes 查看卷ID' };
      }
      if (!pdb.prepare('SELECT id FROM volumes WHERE id = ?').get(volId)) {
        return { error: `卷 ${volId} 不存在，可先用 list_volumes 查看卷ID` };
      }
      const num = args.chapter_num !== undefined ? args.chapter_num : db.nextChapterNumber(projectName);
      pdb.prepare(`INSERT INTO chapters (volume_id, num, title, outline, content, word_count, status, cognitive_frame, emotional_anchor, world_texture, concrete_mystery, interpersonal_tension, genre_beat, created_at, updated_at)
        VALUES (?, ?, ?, '', '', 0, 'pending', ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`)
        .run(volId, num, args.title,
          args.cognitive_frame || '', args.emotional_anchor || '', args.world_texture || '',
          args.concrete_mystery || '', args.interpersonal_tension || '', args.genre_beat || '');
      return { created: true, chapter_num: num, title: args.title };
    },
  },
  update_chapter: {
    entity: 'chapter',
    chapterTree: true,
    category: '章节与卷',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      const { chapter_num, ...fields } = args;
      const allowed = ['title', 'content', 'outline', 'status', 'summary', 'cognitive_frame', 'emotional_anchor', 'world_texture', 'concrete_mystery', 'interpersonal_tension', 'genre_beat', 'volume_id'];
      if (fields.volume_id !== undefined) {
        const volume = pdb.prepare('SELECT id FROM volumes WHERE id = ?').get(fields.volume_id);
        if (!volume) return { error: `卷 ${fields.volume_id} 不存在` };
      }
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
      const info = pdb.prepare(`UPDATE chapters SET ${updates.join(', ')} WHERE num = ?`).run(...params);
      if (info.changes === 0) {
        return { error: `章节 ${chapter_num} 不存在，可能已被用户删除` };
      }
      db.recalculateWordCount(projectName);
      return { updated: true, chapter_num, changed_fields: Object.keys(fields).filter(k => allowed.includes(k)) };
    },
  },
  delete_chapter: {
    entity: 'chapter',
    chapterTree: true,
    // Deleting a chapter cascades chapter_characters and nulls chapter
    // references in foreshadows, memories and the clue board.
    extraEntities: ['character', 'foreshadow', 'memory', 'clue'],
    category: '章节与卷',
    run(ctx) {
      const { pdb, args, db, projectName } = ctx;
      const row = pdb.prepare('SELECT id, status FROM chapters WHERE num = ?').get(args.chapter_num);
      if (!row) return { error: `章节 ${args.chapter_num} 不存在` };
      // The UI protects accepted chapters from deletion. Mirror that guard in
      // the tool layer; `force` is only for an explicit user instruction.
      if (row.status === 'accepted' && args.force !== true) {
        return { error: `章节 ${args.chapter_num} 已定稿（accepted），默认不允许删除。如用户明确要求删除，请传 force=true。` };
      }
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
      const { pdb, args } = ctx;
      const limit = Math.min(Math.max(parseInt(args.limit, 10) || 200, 1), 1000);
      const offset = Math.max(parseInt(args.offset, 10) || 0, 0);
      const rows = pdb.prepare(`
        SELECT id, name, species, age, gender, role, personality, background, motivation, arc, notes
        FROM characters
        ORDER BY CASE role WHEN 'major' THEN 0 WHEN 'minor' THEN 1 WHEN 'extra' THEN 2 ELSE 3 END, name
        LIMIT ? OFFSET ?
      `).all(limit, offset);
      return clipFields(rows, ['personality', 'background', 'motivation', 'arc', 'notes'], 300);
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
      pdb.prepare(`INSERT INTO characters (id, name, species, age, gender, appearance, personality, background, motivation, arc, role, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, args.name, args.species || '', args.age || '', args.gender || '', args.appearance || '', args.personality || '',
          args.background || '', args.motivation || '', args.arc || '', args.role || '', args.notes || '');
      return { created: true, id, name: args.name };
    },
  },
  update_character: {
    entity: 'character',
    category: '设定构建',
    run(ctx) {
      const { pdb, args } = ctx;
      const lookup = args.id
        ? pdb.prepare('SELECT id, name FROM characters WHERE id = ?').get(args.id)
        : pdb.prepare('SELECT id, name FROM characters WHERE name = ?').get(args.name);
      if (!lookup) return { error: `角色 ${args.id || args.name} 不存在` };
      const allowed = ['species', 'age', 'gender', 'appearance', 'personality', 'background', 'motivation', 'arc', 'role', 'notes'];
      const updates = [];
      const params = [];
      if (args.new_name !== undefined) {
        const nextName = String(args.new_name).trim();
        if (!nextName) return { error: '新姓名不能为空' };
        updates.push('name = ?');
        params.push(nextName);
      }
      for (const key of allowed) {
        if (args[key] !== undefined) { updates.push(`${key} = ?`); params.push(args[key]); }
      }
      if (updates.length === 0) return { error: '没有要更新的字段' };
      updates.push("updated_at = datetime('now')");
      params.push(lookup.id);
      try {
        pdb.prepare(`UPDATE characters SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      } catch (e) {
        if (/UNIQUE/i.test(e.message)) return { error: `角色名 "${args.new_name}" 已存在` };
        throw e;
      }
      return { updated: true, id: lookup.id, name: args.new_name || lookup.name };
    },
  },
  // ── World ──
  list_world: {
    entity: null,
    category: '世界观',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      return clipFields(
        pdb.prepare('SELECT id, category, name, description, tags FROM world_entries ORDER BY category, name').all(),
        ['description'],
      );
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
      return clipFields(pdb.prepare(sql).all(...params), ['description']);
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
      const { pdb, args } = ctx;
      const f = args.id
        ? pdb.prepare('SELECT id, title FROM foreshadows WHERE id = ?').get(args.id)
        : pdb.prepare('SELECT id, title FROM foreshadows WHERE title = ?').get(args.title);
      if (!f) return { error: `伏笔 ${args.id || args.title} 不存在` };
      const updates = [];
      const params = [];
      if (args.new_title !== undefined) {
        const nextTitle = String(args.new_title).trim();
        if (!nextTitle) return { error: '伏笔标题不能为空' };
        updates.push('title = ?'); params.push(nextTitle);
      }
      if (args.status) { updates.push('status = ?'); params.push(args.status); }
      if (args.description !== undefined) { updates.push('description = ?'); params.push(args.description); }
      if (args.priority) { updates.push('priority = ?'); params.push(args.priority); }
      if (args.expected_resolve_chapter !== undefined) {
        updates.push('expected_resolve_chapter = ?');
        params.push(Number(args.expected_resolve_chapter) || 0);
      }
      if (updates.length === 0) return { error: '没有要更新的字段' };
      updates.push("updated_at = datetime('now')");
      params.push(f.id);
      pdb.prepare(`UPDATE foreshadows SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      return { updated: true, id: f.id, title: args.new_title || f.title };
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
      return clipFields(pdb.prepare(sql).all(...params), ['description']);
    },
  },
  create_payoff: {
    entity: 'payoff',
    category: '爽点设计',
    run(ctx) {
      const { pdb, args } = ctx;
      const hasStyle = pdb.prepare("SELECT 1 AS x FROM project_styles WHERE style = 'power-fantasy'").get();
      const legacy = pdb.prepare("SELECT value FROM project_meta WHERE key = 'power_fantasy'").get();
      if (!hasStyle && legacy?.value !== '1') {
        return { error: '当前项目未开启爽文模式，无法创建爽点' };
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
      const p = args.id
        ? pdb.prepare('SELECT id, title FROM payoff_points WHERE id = ?').get(args.id)
        : pdb.prepare('SELECT id, title FROM payoff_points WHERE title = ?').get(args.title);
      if (!p) return { error: `爽点 ${args.id || args.title} 不存在` };
      if (args.new_title !== undefined && !String(args.new_title).trim()) {
        return { error: '爽点标题不能为空' };
      }
      const fields = {
        title: args.new_title !== undefined ? String(args.new_title).trim() : undefined,
        type: args.type,
        description: args.description,
        status: args.status,
        intensity: args.intensity !== undefined ? Math.max(1, Math.min(5, Number(args.intensity) || 3)) : undefined,
        setup_chapter: args.setup_chapter,
        payoff_chapter: args.payoff_chapter,
      };
      return updateById(p.id, 'payoff_points', fields, ['title', 'type', 'description', 'status', 'intensity', 'setup_chapter', 'payoff_chapter'], true);
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
      const { pdb, args } = ctx;
      const conditions = [];
      const params = [];
      if (args.category) { conditions.push('m.category = ?'); params.push(args.category); }
      if (args.query) { conditions.push('m.content LIKE ?'); params.push(`%${args.query}%`); }
      const limit = Math.min(Math.max(parseInt(args.limit, 10) || 100, 1), 500);
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      return clipFields(
        pdb.prepare(`
          SELECT m.*, c.num AS source_chapter_num
          FROM memories m
          LEFT JOIN chapters c ON c.id = m.source_chapter_id
          ${where}
          ORDER BY m.created_at DESC
          LIMIT ?
        `).all(...params, limit),
        ['content'],
      );
    },
  },
  create_memory: {
    entity: 'memory',
    category: '时间线与记忆',
    run(ctx) {
      const { pdb, args } = ctx;
      const id = randomUUID();
      // `source_chapter_id` is a foreign key to chapters.id, while the tool
      // speaks in chapter numbers. Resolve the number before inserting —
      // passing the number straight through either hit an FK error or linked
      // the memory to an unrelated chapter.
      let sourceChapterId = null;
      if (args.source_chapter_num) {
        const chapter = pdb.prepare('SELECT id FROM chapters WHERE num = ?').get(args.source_chapter_num);
        if (!chapter) return { error: `章节 ${args.source_chapter_num} 不存在` };
        sourceChapterId = chapter.id;
      }
      pdb.prepare('INSERT INTO memories (id, category, content, source_chapter_id) VALUES (?, ?, ?, ?)')
        .run(id, args.category, args.content, sourceChapterId);
      return { created: true, id, category: args.category };
    },
  },
  // ── Timeline ──
  list_timeline: {
    entity: null,
    category: '时间线与记忆',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      return clipFields(pdb.prepare('SELECT * FROM timeline_events ORDER BY year').all(), ['description']);
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
      const { pdb } = ctx;
      const totalWords = pdb.prepare('SELECT SUM(word_count) as total FROM chapters').get().total || 0;
      const chCount = pdb.prepare('SELECT COUNT(*) as cnt FROM chapters').get().cnt;
      const charCount = pdb.prepare('SELECT COUNT(*) as cnt FROM characters').get().cnt;
      const foreshadowCount = pdb.prepare('SELECT COUNT(*) as cnt FROM foreshadows').get().cnt;
      const worldCount = pdb.prepare('SELECT COUNT(*) as cnt FROM world_entries').get().cnt;
      const sciCount = pdb.prepare('SELECT COUNT(*) as cnt FROM science_entries').get().cnt;
      const relationCount = pdb.prepare('SELECT COUNT(*) as cnt FROM character_relations').get().cnt;
      const memoryCount = pdb.prepare('SELECT COUNT(*) as cnt FROM memories').get().cnt;
      const timelineCount = pdb.prepare('SELECT COUNT(*) as cnt FROM timeline_events').get().cnt;
      const clueUnresolved = pdb.prepare('SELECT COUNT(*) as cnt FROM clue_board WHERE resolved = 0').get().cnt;
      const volumeCount = pdb.prepare('SELECT COUNT(*) as cnt FROM volumes').get().cnt;
      const payoffCount = pdb.prepare('SELECT COUNT(*) as cnt FROM payoff_points').get().cnt;
      const tokenRow = pdb.prepare('SELECT COALESCE(SUM(input_tokens), 0) AS tokenInput, COALESCE(SUM(output_tokens), 0) AS tokenOutput FROM token_usage').get();
      const statusBreakdown = {};
      pdb.prepare('SELECT status, COUNT(*) as cnt FROM chapters GROUP BY status').all()
        .forEach(r => statusBreakdown[r.status] = r.cnt);
      const meta = {};
      pdb.prepare("SELECT key, value FROM project_meta WHERE key IN ('mode', 'target_words')").all()
        .forEach((row) => { meta[row.key] = row.value; });
      const modeTargets = { 'short-story': 30000, 'medium-novel': 100000, 'long-novel': 200000 };
      const targetWords = meta.target_words
        ? parseInt(meta.target_words, 10) || 0
        : modeTargets[meta.mode] || 100000;
      return {
        totalWords,
        targetWords,
        chapterCount: chCount,
        characterCount: charCount,
        relationCount,
        foreshadowCount,
        worldCount,
        sciCount,
        memoryCount,
        timelineCount,
        clueUnresolved,
        volumeCount,
        payoffCount,
        tokenInput: tokenRow.tokenInput,
        tokenOutput: tokenRow.tokenOutput,
        chapterStatus: statusBreakdown,
      };
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
        v.chapters = clipFields(
          pdb.prepare('SELECT num, title, status, word_count, outline, summary FROM chapters WHERE volume_id = ? ORDER BY num').all(v.id),
          ['outline', 'summary'],
          200,
        );
      }
      return vols;
    },
  },
  create_volume: {
    entity: 'volume',
    chapterTree: true,
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
    chapterTree: true,
    category: '章节与卷',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      const updates = [];
      const params = [];
      if (args.title !== undefined) { updates.push('title = ?'); params.push(args.title); }
      if (args.summary !== undefined) { updates.push('summary = ?'); params.push(args.summary); }
      if (updates.length === 0) return { error: '没有要更新的字段' };
      params.push(args.volume_id);
      const info = pdb.prepare(`UPDATE volumes SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      if (info.changes === 0) {
        return { error: `卷 ${args.volume_id} 不存在，可能已被用户删除` };
      }
      return { updated: true, volume_id: args.volume_id };
    },
  },
  delete_volume: {
    entity: 'volume',
    chapterTree: true,
    // Removing a volume deletes its chapters, so the chapter tree and every
    // chapter-deletion side effect are invalidated too.
    extraEntities: ['chapter', 'character', 'foreshadow', 'memory', 'clue'],
    category: '章节与卷',
    run(ctx) {
      const { pdb, args, db, projectName } = ctx;
      const vol = pdb.prepare('SELECT id FROM volumes WHERE id = ?').get(args.volume_id);
      if (!vol) return { error: `卷 ${args.volume_id} 不存在` };
      const chapters = pdb.prepare('SELECT num, status FROM chapters WHERE volume_id = ?').all(args.volume_id);
      if (chapters.length > 0 && args.force !== true) {
        const accepted = chapters.filter((ch) => ch.status === 'accepted').length;
        return {
          error: `卷 ${args.volume_id} 内有 ${chapters.length} 章${accepted ? `（其中 ${accepted} 章已定稿）` : ''}，删除会一并删除。请先向用户确认；确认后传 force=true。`,
        };
      }
      pdb.prepare('DELETE FROM chapters WHERE volume_id = ?').run(args.volume_id);
      pdb.prepare('DELETE FROM volumes WHERE id = ?').run(args.volume_id);
      db.recalculateWordCount(projectName);
      return { deleted: true, volume_id: args.volume_id, deleted_chapters: chapters.length };
    },
  },
  // ── Settings (science_entries) ──
  list_science: {
    entity: null,
    category: '设定体系',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      return clipFields(
        pdb.prepare('SELECT * FROM science_entries ORDER BY sort_order, category, label, name').all(),
        ['description', 'references'],
      );
    },
  },
  create_science_entry: {
    entity: 'science',
    category: '设定体系',
    run(ctx) {
      const { pdb, args } = ctx;
      const gate = genreGate(pdb, SETTING_PAGE_GENRES, '设定体系');
      if (gate) return gate;
      const id = randomUUID();
      const category = resolveScienceCategory(
        pdb,
        typeof args.category === 'string' ? args.category.trim() : '',
      );
      pdb.prepare(`INSERT INTO science_entries (id, label, name, description, "references", category, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(
          id,
          args.label || 'known',
          args.name,
          args.description,
          args.references || '',
          category,
          Number(args.sort_order) || 0,
        );
      return { created: true, id, label: args.label || 'known', category, name: args.name };
    },
  },
  update_science_entry: {
    entity: 'science',
    category: '设定体系',
    run(ctx) {
      const { pdb, args } = ctx;
      const existing = pdb.prepare('SELECT id FROM science_entries WHERE id = ?').get(args.id);
      if (!existing) return { error: `设定条目 ${args.id} 不存在` };
      const fields = {};
      if (args.label !== undefined) fields.label = args.label;
      if (args.name !== undefined) fields.name = args.name;
      if (args.description !== undefined) fields.description = args.description;
      if (args.references !== undefined) fields.references = args.references;
      if (args.sort_order !== undefined) fields.sort_order = Number(args.sort_order) || 0;
      if (args.category !== undefined) {
        fields.category = resolveScienceCategory(
          pdb,
          typeof args.category === 'string' ? args.category.trim() : '',
        );
      }
      if (Object.keys(fields).length === 0) return { error: '没有要更新的字段' };
      const updates = [];
      const params = [];
      for (const key of ['label', 'name', 'description', 'references', 'category', 'sort_order']) {
        if (fields[key] === undefined) continue;
        updates.push(key === 'references' ? '"references" = ?' : `${key} = ?`);
        params.push(fields[key]);
      }
      updates.push("updated_at = datetime('now')");
      params.push(args.id);
      pdb.prepare(`UPDATE science_entries SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      return { updated: true, id: args.id, category: fields.category };
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
    category: '设定体系',
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
      const { pdb, args, deleteById } = ctx;
      if (args.id) return deleteById(args.id, 'foreshadows', 'id', '伏笔');
      if (!args.title) return { error: '请提供 id 或 title' };
      return deleteByTitle(pdb, deleteById, 'foreshadows', args.title, '伏笔');
    },
  },
  delete_payoff: {
    entity: 'payoff',
    category: '爽点设计',
    run(ctx) {
      const { pdb, args, deleteById } = ctx;
      if (args.id) return deleteById(args.id, 'payoff_points', 'id', '爽点');
      if (!args.title) return { error: '请提供 id 或 title' };
      return deleteByTitle(pdb, deleteById, 'payoff_points', args.title, '爽点');
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
    extraEntities: ['character'],
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
    extraEntities: ['character'],
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
      return clipFields(pdb.prepare(sql).all(), ['description']);
    },
  },
  create_clue: {
    entity: 'clue',
    category: '伏笔与线索',
    run(ctx) {
      const { pdb, args } = ctx;
      const gate = genreGate(pdb, ['mystery'], '线索板');
      if (gate) return gate;
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
    entity: 'clue',
    category: '伏笔与线索',
    run(ctx) {
      const { pdb, args, db, projectName, updateById, deleteById } = ctx;
      const existing = pdb.prepare('SELECT * FROM clue_board WHERE id = ?').get(args.id);
      if (!existing) return { error: `线索 ${args.id} 不存在` };
      const updates = []; const params = [];
      if (args.title !== undefined) { updates.push('title = ?'); params.push(args.title); }
      if (args.description !== undefined) { updates.push('description = ?'); params.push(args.description); }
      if (args.kind !== undefined) { updates.push('kind = ?'); params.push(args.kind); }
      if (args.related_chapter_num !== undefined) {
        const num = Number(args.related_chapter_num) || 0;
        if (num > 0) {
          const chapter = pdb.prepare('SELECT id FROM chapters WHERE num = ?').get(num);
          if (!chapter) return { error: `章节 ${num} 不存在` };
          updates.push('related_chapter_id = ?'); params.push(chapter.id);
        } else {
          updates.push('related_chapter_id = NULL');
        }
      }
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
    entity: 'clue',
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
      const styles = pdb.prepare('SELECT style FROM project_styles').all().map(s => s.style);
      const genreLabels = { 'sci-fi': '科幻', 'fantasy': '玄幻', 'xianxia': '仙侠', 'wuxia': '武侠', 'romance': '言情', 'history': '历史', 'urban': '都市', 'mystery': '悬疑', 'game': '游戏', 'biography': '传记', 'other': '其他' };
      return {
        name: meta.name || '',
        genres: genres,
        genreLabels: genres.map(g => genreLabels[g] || g),
        styles: styles,
        styleLabels: styles.map(s => STYLE_LABELS[s] || s),
        powerFantasy: styles.includes('power-fantasy') || meta.power_fantasy === '1',
        mode: meta.mode || 'medium-novel',
        language: meta.language || 'zh',
        phase: meta.workflow_phase || 'idea',
        phaseLabel: ({idea:'选题',setting:'设定',outline:'大纲',writing:'写作',review:'审阅',consistency:'一致性',export:'导出'})[meta.workflow_phase] || '选题',
        wordCount: Number(meta.word_count) || 0,
        authorName: meta.author_name || '',
        description: meta.description || '',
        authorNotes: meta.author_notes || '',
      };
    },
  },
  // ── Author Notes ──
  update_author_notes: {
    entity: 'project',
    category: '项目状态',
    run(ctx) {
      const { pdb, args } = ctx;
      try {
        const notes = saveAuthorNotes(pdb, args.notes);
        return { updated: true, authorNotes: notes };
      } catch (e) {
        return { error: e.message };
      }
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

// Single tool registry: schema + handler + affected entities + prompt category.
// TOOLS (the AI-facing schema array) is the source for names/params; the
// handler map is validated against it at startup so the two cannot drift.
// `entities` and `chapterTree` are sent to the client with every tool event so
// the UI never has to mirror this table.
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
        entities: [...(handler.entity ? [handler.entity] : []), ...(handler.extraEntities || [])],
        chapterTree: handler.chapterTree === true,
        category: handler.category,
        run: handler.run,
      },
    ];
  }),
);
for (const name of Object.keys(HANDLERS)) {
  if (!TOOL_REGISTRY[name]) throw new Error(`Handler "${name}" has no tool schema`);
}

const CATEGORY_ORDER = ['设定构建', '世界观', '设定体系', '伏笔与线索', '爽点设计', '章节与卷', '时间线与记忆', '项目状态', '其他'];

// Pages hidden by genre/style must not be writable by the AI either, otherwise
// entities land in a page the author cannot open or manage.
// (Genre list lives in settings.js with the category presets.)

// Tool results are appended to the conversation and resent on every later
// round. Imported projects can hold 1000-character descriptions, so keep list
// rows bounded; the AI can use get_* when it needs the full record.
function clipFields(rows, fields, max = 400) {
  for (const row of rows) {
    for (const field of fields) {
      if (typeof row[field] === 'string' && row[field].length > max) {
        row[field] = `${row[field].slice(0, max)}…`;
      }
    }
  }
  return rows;
}

// Parameter names whose meaning is already carried by the name itself. Drop
// their descriptions before sending the schema; keep descriptions for lookup
// keys, ranges, enums with side effects, and anything ambiguous.
const OMIT_PARAM_DESCRIPTIONS = new Set([
  'id',
  'name',
  'title',
  'content',
  'outline',
  'summary',
  'description',
  'age',
  'gender',
  'appearance',
  'personality',
  'background',
  'motivation',
  'status',
  'label',
  'role',
  'kind',
  'year',
  'chapter_num',
  'volume_id',
  'references',
]);

function compactToolDescriptions(tools) {
  return tools.map((tool) => {
    const properties = tool.function?.parameters?.properties;
    if (!properties) return tool;
    const nextProperties = {};
    for (const [key, value] of Object.entries(properties)) {
      if (!OMIT_PARAM_DESCRIPTIONS.has(key) || !value.description) {
        nextProperties[key] = value;
        continue;
      }
      const { description, ...rest } = value;
      nextProperties[key] = rest;
    }
    return {
      ...tool,
      function: {
        ...tool.function,
        parameters: { ...tool.function.parameters, properties: nextProperties },
      },
    };
  });
}

function projectGenres(pdb) {
  return pdb.prepare('SELECT genre FROM project_genres').all().map((row) => row.genre);
}

function genreGate(pdb, allowedGenres, featureName) {
  const genres = projectGenres(pdb);
  // Legacy projects without genre metadata: keep the old permissive behavior.
  if (genres.length === 0 || genres.some((genre) => allowedGenres.includes(genre))) return null;
  return { error: `当前项目类型没有「${featureName}」页面，不能创建此类内容。` };
}

/**
 * Accept a built-in category key or one the project already uses, so the AI can
 * file entries under custom categories but cannot invent new ones.
 */
function resolveScienceCategory(pdb, requested) {
  if (!requested) return '';
  if (ALLOWED_SETTING_CATEGORIES.has(requested)) return requested;
  const used = pdb.prepare('SELECT 1 AS x FROM science_entries WHERE category = ? LIMIT 1').get(requested);
  return used ? requested : '';
}

/**
 * Delete by title, refusing when the title is ambiguous so a single tool call
 * can never remove several rows.
 */
function deleteByTitle(pdb, deleteById, table, title, entityName) {
  const matches = pdb.prepare(`SELECT id FROM ${table} WHERE title = ?`).all(title);
  if (matches.length > 1) {
    return { error: `标题 "${title}" 对应 ${matches.length} 条${entityName}，请改用 id 精确删除：${matches.map((m) => m.id).join(', ')}` };
  }
  return deleteById(title, table, 'title', entityName);
}

// ─── Per-request tool selection ───
// Passing every schema on every round costs thousands of input tokens and makes the
// model choose from tools that do not apply to the project or the current
// intent. Keep the default set lean; destructive tools appear only when the
// author explicitly asks to delete something.
const DELETE_INTENT_RE = /删除|删掉|移除|去掉|清理|delete|remove|drop/i;
const VOLUME_INTENT_RE = /卷|volume/i;
// Author notes are user-owned rules. Only expose the write tool when the
// author explicitly asks to remember/change a preference, so the model does
// not silently promote its own summary of the conversation into the rules.
const NOTES_INTENT_RE = /创作约定|作者约定|写作约定|写作规则|偏好|记住|记下|记录一下|以后都|每次都|不要再|别再|author\s*notes?|writing\s*rules?|preferences?|remember|from\s+now\s+on/i;
const DESTRUCTIVE_TOOL_NAMES = new Set([
  'delete_chapter',
  'delete_volume',
  'delete_character',
  'delete_world_entry',
  'delete_science_entry',
  'delete_foreshadow',
  'delete_payoff',
  'delete_relation',
  'delete_memory',
  'delete_timeline_event',
  'delete_clue',
  'remove_chapter_character',
]);
const SETTING_TOOL_NAMES = new Set([
  'list_science',
  'create_science_entry',
  'update_science_entry',
  'delete_science_entry',
]);
const CLUE_TOOL_NAMES = new Set(['list_clues', 'create_clue', 'update_clue', 'delete_clue']);
const PAYOFF_TOOL_NAMES = new Set(['list_payoffs', 'create_payoff', 'update_payoff', 'delete_payoff']);

function projectFeatureFlags(projectName) {
  try {
    const db = require('./db');
    const pdb = db.getProjectDb(projectName);
    const genres = projectGenres(pdb);
    const styles = pdb.prepare('SELECT style FROM project_styles').all().map((row) => row.style);
    const legacyPowerFantasy = pdb
      .prepare("SELECT value FROM project_meta WHERE key = 'power_fantasy'")
      .get()?.value === '1';
    return {
      genres,
      hasScience: pdb.prepare('SELECT COUNT(*) AS c FROM science_entries').get().c > 0,
      hasClues: pdb.prepare('SELECT COUNT(*) AS c FROM clue_board').get().c > 0,
      hasPayoffs:
        styles.includes('power-fantasy') ||
        legacyPowerFantasy ||
        pdb.prepare('SELECT COUNT(*) AS c FROM payoff_points').get().c > 0,
    };
  } catch {
    return { genres: [], hasScience: false, hasClues: false, hasPayoffs: false };
  }
}

/**
 * Return the tool schemas worth sending for this request.
 *
 * @param {string} projectName
 * @param {'writing'|'collab'} mode
 * @param {Array<{role: string, content?: string}>} messages
 */
function getToolsForRequest(projectName, mode, messages = []) {
  const flags = projectFeatureFlags(projectName);
  const recentUserText = messages
    .filter((message) => message.role === 'user')
    .slice(-3)
    .map((message) => String(message.content || ''))
    .join('\n');
  // Notes can also be written right after the assistant offers to remember
  // something and the author just replies "好". Keep the destructive-tool
  // intents user-only, but let the assistant's own offer count for notes.
  const recentAssistantText = messages
    .filter((message) => message.role === 'assistant')
    .slice(-3)
    .map((message) => String(message.content || ''))
    .join('\n');
  const deleteIntent = DELETE_INTENT_RE.test(recentUserText);
  const volumeIntent = VOLUME_INTENT_RE.test(recentUserText);
  const notesIntent = NOTES_INTENT_RE.test(recentUserText) || NOTES_INTENT_RE.test(recentAssistantText);

  const hasSettingPage = flags.genres.length === 0
    || flags.genres.some((genre) => SETTING_PAGE_GENRES.includes(genre))
    || flags.hasScience;
  const hasCluePage = flags.genres.length === 0 || flags.genres.includes('mystery') || flags.hasClues;
  const hasPayoffPage = flags.hasPayoffs;

  return compactToolDescriptions(TOOLS.filter((tool) => {
    const name = tool.function.name;
    if (DESTRUCTIVE_TOOL_NAMES.has(name) && !deleteIntent) return false;
    if (name === 'delete_volume' && !volumeIntent) return false;
    if (name === 'create_volume' && mode === 'writing' && !volumeIntent) return false;
    if (name === 'update_author_notes' && !notesIntent) return false;
    if (!hasSettingPage && SETTING_TOOL_NAMES.has(name)) return false;
    if (!hasCluePage && CLUE_TOOL_NAMES.has(name)) return false;
    if (!hasPayoffPage && PAYOFF_TOOL_NAMES.has(name)) return false;
    return true;
  }));
}

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

module.exports = { TOOLS, TOOL_REGISTRY, buildToolReference, getToolsForRequest, executeTool };

