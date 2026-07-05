const { getProjectDb, getProjectDbPath, getConfigDb } = require('./db');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

function seedProject(name) {
  const dbPath = getProjectDbPath(name);
  // Remove existing for clean seed (also wipe WAL/SHM to avoid SQLITE_IOERR_SHORT_READ)
  for (const suffix of ['', '-wal', '-shm']) {
    const f = dbPath + suffix;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  const db = getProjectDb(name);

  // ─── Project Meta ───
  const metaInsert = db.prepare('INSERT OR REPLACE INTO project_meta (key, value) VALUES (?, ?)');
  const meta = {
    name, description: '关于时间旅行的故事', mode: 'long-novel', language: 'zh',
    version: '1', created_at: '2026-06-01T10:00:00Z', updated_at: '2026-07-05T14:30:00Z',
    word_count: '52300', author_name: '佚名',
  };
  for (const [k, v] of Object.entries(meta)) metaInsert.run(k, v);

  // ─── Genres ───
  db.prepare("INSERT OR IGNORE INTO project_genres (genre) VALUES ('sci-fi'), ('romance')").run();

  // ─── Volumes ───
  db.prepare("INSERT INTO volumes (id, sort_order, title, summary) VALUES (1, 1, '觉醒', '故事的开端')").run();
  db.prepare("INSERT INTO volumes (id, sort_order, title, summary) VALUES (2, 2, '风暴', '冲突升级')").run();

  // ─── Chapters ───
  const chapters = [
    { id: 1, volume_id: 1, num: 1, title: '开端', outline: '林晨在实验室发现导师的异常笔记', content: '# 第一章 开端\n\n林晨像往常一样刷卡进入研究所地下三层的实验室。走廊的灯管闪了两下才亮起来，发出嗡嗡的电流声。\n\n他已经记不清这是第几个通宵了。自从导师失踪后，他几乎住在了这里。\n\n办公桌上堆满了实验报告，最上面那本黑色笔记本引起了他的注意——这不是他的。\n\n他翻开第一页，瞳孔骤然收缩。\n\n那是导师的笔迹。', word_count: 4523, status: 'accepted', cognitive_frame: '理性世界观被动摇', emotional_anchor: '对导师失踪的担忧', world_texture: '深夜实验室的氛围', concrete_mystery: '笔记本中的异常公式', interpersonal_tension: '林晨与研究所的矛盾' },
    { id: 2, volume_id: 1, num: 2, title: '冲突', outline: '研究所封锁消息，林晨与领导发生争执', content: '# 第二章 冲突\n\n林晨被叫到了所长办公室。\n\n白发苍苍的老所长坐在办公桌后面，面色凝重。桌上放着那本黑色笔记本。\n\n"林晨，这件事你不要再查了。"\n\n"为什么？"林晨的声音比预想中更平静。\n\n"这是命令。"', word_count: 5100, status: 'accepted', cognitive_frame: '体制与个人的对抗', emotional_anchor: '对真相的执着', world_texture: '冰冷的行政大楼', concrete_mystery: '为什么要封锁消息？', interpersonal_tension: '林晨与所长的冲突' },
    { id: 3, volume_id: 1, num: 3, title: '转机', outline: '李薇带来了意想不到的线索', content: '# 第三章 转机\n\n她推开门的时候，雨已经停了。\n\n屋檐还在滴水，一滴一滴落在青石板上，像是某种没有节奏的钟声。空气里弥漫着雨后泥土的气息，混着一点若有若无的铁锈味——来自实验室方向。\n\n"你来了。"\n\n林晨没有回头。他办公桌上摊开的笔记本被台灯照得泛黄。\n\n李薇走到他身后，屏幕上的波形图还在跳动。三十二组实验，三十二组完全一致的结果。\n\n"你知道这意味着什么。"', word_count: 3240, status: 'review', cognitive_frame: '科学突破的震撼', emotional_anchor: '对李薇的微妙信任', world_texture: '雨后的研究所', concrete_mystery: '实验数据的一致性意味着什么？', interpersonal_tension: '林晨与李薇的合作' },
    { id: 4, volume_id: 1, num: 4, title: '深入', outline: '林晨决定秘密调查导师的踪迹', content: '# 第四章 深入\n\n深夜，林晨独自一人回到了地下实验室。\n\n他已经决定无视所长的警告。', word_count: 1200, status: 'writing', cognitive_frame: '', emotional_anchor: '', world_texture: '', concrete_mystery: '', interpersonal_tension: '' },
    { id: 5, volume_id: 2, num: 5, title: '新世界', outline: '', content: '', word_count: 0, status: 'pending', cognitive_frame: '', emotional_anchor: '', world_texture: '', concrete_mystery: '', interpersonal_tension: '' },
  ];
  const chInsert = db.prepare(`INSERT INTO chapters (id, volume_id, num, title, outline, content, word_count, status, cognitive_frame, emotional_anchor, world_texture, concrete_mystery, interpersonal_tension) VALUES (@id, @volume_id, @num, @title, @outline, @content, @word_count, @status, @cognitive_frame, @emotional_anchor, @world_texture, @concrete_mystery, @interpersonal_tension)`);
  for (const ch of chapters) chInsert.run(ch);

  // ─── Characters ───
  const chars = [
    { id: uuidv4(), name: '林晨', age: '28', gender: '男', appearance: '身高178cm，黑色短发，戴细框眼镜', personality: '理性、谨慎、有轻微的社交焦虑', background: '量子物理博士，某研究院研究员', motivation: '寻找失踪导师留下的研究笔记', arc: '从逃避责任到主动承担', ext_markers: '[白大褂从不扣扣子] [思考时会转动钢笔] [说话前必先清嗓子]' },
    { id: uuidv4(), name: '陈教授', age: '55', gender: '男', appearance: '花白头发，戴老花镜', personality: '严谨、慈祥、执着', background: '量子物理领域泰斗，林晨的导师', motivation: '探索量子领域的终极奥秘', arc: '——', ext_markers: '[总穿灰色中山装] [说话慢条斯理]' },
    { id: uuidv4(), name: '李薇', age: '26', gender: '女', appearance: '齐肩短发，眼神锐利', personality: '聪明、果断、有秘密', background: '理论物理学家，林晨的同事', motivation: '未知', arc: '从配角到关键人物', ext_markers: '[总带着一个U盘] [手机从不离身]' },
    { id: uuidv4(), name: '王队长', age: '42', gender: '男', appearance: '国字脸，身材魁梧', personality: '粗犷、直率', background: '研究所安保队长', motivation: '履行职责', arc: '——', ext_markers: '[]' },
  ];
  const charInsert = db.prepare(`INSERT INTO characters (id, name, age, gender, appearance, personality, background, motivation, arc, ext_markers) VALUES (@id, @name, @age, @gender, @appearance, @personality, @background, @motivation, @arc, @ext_markers)`);
  for (const c of chars) charInsert.run(c);

  // ─── Chapter-Character relations ───
  const charIds = chars.map(c => c.id);
  const ccInsert = db.prepare('INSERT OR IGNORE INTO chapter_characters (chapter_id, character_id, role) VALUES (?, ?, ?)');
  // Ch1: 林晨, 陈教授
  ccInsert.run(1, charIds[0], 'pov');
  ccInsert.run(1, charIds[1], 'mentioned');
  // Ch2: 林晨, 王队长
  ccInsert.run(2, charIds[0], 'pov');
  ccInsert.run(2, charIds[3], 'appears');
  // Ch3: 林晨, 李薇
  ccInsert.run(3, charIds[0], 'pov');
  ccInsert.run(3, charIds[2], 'speaks');

  // ─── World Entries ───
  const worlds = [
    { id: uuidv4(), category: 'location', name: '量子物理研究所', description: '位于城市西郊，建于2035年。主实验楼地下三层。', tags: '[]' },
    { id: uuidv4(), category: 'organization', name: '国家量子科学研究中心', description: '国家科技部直属，林晨所在的研究所是其分支机构。', tags: '[]' },
    { id: uuidv4(), category: 'concept', name: '量子纠缠通信', description: '基于量子纠缠态的即时通信技术。', tags: '[]' },
    { id: uuidv4(), category: 'event', name: '"静谧"实验事故', description: '三年前实验导致全体人员短暂失明17秒。导师从此失踪。', tags: '["关键事件"]' },
  ];
  const wInsert = db.prepare('INSERT INTO world_entries (id, category, name, description, tags) VALUES (?, ?, ?, ?, ?)');
  for (const w of worlds) wInsert.run(w.id, w.category, w.name, w.description, w.tags);

  // ─── Science Entries ───
  const sciences = [
    { id: uuidv4(), label: 'hypothesis', name: '量子态稳定技术', description: '通过超导环耦合实现量子态的毫秒级稳定，是"静谧"计划的基础。', references: '' },
    { id: uuidv4(), label: 'known', name: '量子纠缠瞬时性', description: '量子纠缠的"瞬时"特性已被多组实验证实，不违反相对论（无法传递信息）。', references: 'Nature Physics, 2028' },
    { id: uuidv4(), label: 'extrapolation', name: '量子纠缠通信', description: '基于纠缠态+经典信道辅助的即时通信，2035年仍为理论模型。', references: '' },
    { id: uuidv4(), label: 'extrapolation', name: '脑机量子接口', description: '将量子态直接映射到神经元的假想接口，小说核心设定。', references: '' },
    { id: uuidv4(), label: 'hypothesis', name: '"静谧"效应', description: '大规模量子退相干导致周边观察者短暂感知丧失（17秒）。', references: '' },
  ];
  const sciInsert = db.prepare('INSERT INTO science_entries (id, label, name, description, "references") VALUES (?, ?, ?, ?, ?)');
  for (const s of sciences) sciInsert.run(s.id, s.label, s.name, s.description, s.references);

  // ─── Foreshadows ───
  const foreshadows = [
    { id: uuidv4(), title: '导师的研究笔记', description: '黑色笔记本中的异常公式', status: 'planted', planted_chapter_id: 1, expected_resolve_chapter: 8, priority: 'high' },
    { id: uuidv4(), title: '林晨的头痛', description: '频繁出现的偏头痛', status: 'planted', planted_chapter_id: 2, expected_resolve_chapter: 6, priority: 'normal' },
    { id: uuidv4(), title: '实验室奇怪的声响', description: '地下三层夜间传出异常声响', status: 'planted', planted_chapter_id: 3, expected_resolve_chapter: 10, priority: 'low' },
    { id: uuidv4(), title: '李薇的真实身份', description: '她对量子阵列的异常熟悉', status: 'progressing', planted_chapter_id: 2, expected_resolve_chapter: 7, priority: 'high' },
    { id: uuidv4(), title: '量子阵列异常', description: '实验数据的系统性偏差', status: 'progressing', planted_chapter_id: 3, expected_resolve_chapter: 9, priority: 'normal' },
    { id: uuidv4(), title: '"静谧"计划的真相', description: '掩盖在事故背后的真实目的', status: 'progressing', planted_chapter_id: 4, expected_resolve_chapter: 12, priority: 'normal' },
    { id: uuidv4(), title: '陈教授的实验数据', description: '导师失踪前的最后实验记录', status: 'resolved', planted_chapter_id: 1, resolved_chapter_id: 4, priority: 'normal' },
  ];
  const fInsert = db.prepare('INSERT INTO foreshadows (id, title, description, status, planted_chapter_id, expected_resolve_chapter, resolved_chapter_id, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  for (const f of foreshadows) fInsert.run(f.id, f.title, f.description, f.status, f.planted_chapter_id, f.expected_resolve_chapter, f.resolved_chapter_id, f.priority);

  // ─── Memories ───
  const memories = [
    { id: uuidv4(), category: 'character', content: '林晨在"静谧"事故中失去了17秒记忆，这是他调查的直接动机。', source_chapter_id: 1 },
    { id: uuidv4(), category: 'promise', content: '林晨对导师承诺过"不公开笔记内容"，但调查迫使他违背。', source_chapter_id: 2 },
    { id: uuidv4(), category: 'location', content: '研究所地下三层实验室，需B级权限卡进入，导师失踪当晚门禁记录缺失。', source_chapter_id: 1 },
    { id: uuidv4(), category: 'item', content: '导师的旧式录音笔，林晨一直随身携带，电池已耗尽。', source_chapter_id: 3 },
    { id: uuidv4(), category: 'event', content: '"静谧"事故三年前发生，全体人员短暂失明17秒，导师从此失踪。', source_chapter_id: 1 },
    { id: uuidv4(), category: 'character', content: '李薇对量子阵列异常反应过度，暗示她知道更多内情。', source_chapter_id: 3 },
  ];
  const mInsert = db.prepare('INSERT INTO memories (id, category, content, source_chapter_id) VALUES (?, ?, ?, ?)');
  for (const m of memories) mInsert.run(m.id, m.category, m.content, m.source_chapter_id);

  // ─── Character Relations ───
  const rels = [
    { id: uuidv4(), character_a_id: charIds[0], character_b_id: charIds[1], relation_type: '师徒', description: '林晨是陈教授的学生', intensity: 5 },
    { id: uuidv4(), character_a_id: charIds[0], character_b_id: charIds[2], relation_type: '恋人', description: '暧昧的前同事关系', intensity: 3 },
    { id: uuidv4(), character_a_id: charIds[0], character_b_id: charIds[3], relation_type: '同事', description: '工作关系', intensity: 2 },
    { id: uuidv4(), character_a_id: charIds[2], character_b_id: charIds[3], relation_type: '宿敌', description: '李薇和王队长之间有矛盾', intensity: 4 },
  ];
  const rInsert = db.prepare('INSERT INTO character_relations (id, character_a_id, character_b_id, relation_type, description, intensity) VALUES (?, ?, ?, ?, ?, ?)');
  for (const r of rels) rInsert.run(r.id, r.character_a_id, r.character_b_id, r.relation_type, r.description, r.intensity);

  // ─── Timeline Events ───
  const timeline = [
    { id: uuidv4(), year: '2032', title: '量子态稳定技术首次验证', description: '导师团队在超导环中实现毫秒级量子态稳定，论文发表于《自然·物理》。', importance: 4 },
    { id: uuidv4(), year: '2033.6', title: '"静谧"实验事故', description: '大规模退相干实验导致全体人员短暂失明17秒，导师从此失踪。林晨在场。', importance: 5 },
    { id: uuidv4(), year: '2033.9', title: '研究所封锁消息', description: '国家量子科学研究中心将事故定性为"设备故障"，相关档案加密。', importance: 2 },
    { id: uuidv4(), year: '2036.3', title: '林晨发现导师笔记', description: '主实验楼地下三层，笔记本中包含无法解释的数学公式。（故事起点·第1章）', importance: 4 },
    { id: uuidv4(), year: '2036.4', title: '李薇带来线索', description: '李薇向林晨透露量子阵列的异常数据，调查重启。（第3章）', importance: 3 },
  ];
  const tInsert = db.prepare('INSERT INTO timeline_events (id, year, title, description, importance) VALUES (?, ?, ?, ?, ?)');
  for (const t of timeline) tInsert.run(t.id, t.year, t.title, t.description, t.importance);

  // ─── Update recent_projects in config ───
  const configDb = getConfigDb();
  configDb.prepare('INSERT OR REPLACE INTO recent_projects (id, name, file_path, last_opened, word_count) VALUES (?, ?, ?, ?, ?)').run(name, name, dbPath, new Date().toISOString(), 52300);

  console.log(`✅ Project "${name}" seeded successfully (${dbPath})`);
  return name;
}

// ─── Run ───
if (require.main === module) {
  seedProject('我的科幻小说');
  console.log('✅ Seed complete.');
}

module.exports = { seedProject };
