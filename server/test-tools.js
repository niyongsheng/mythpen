// ─── AI Tool Integration Test ───
// Tests every tool in tools.js and REST API routes in routes/api.js
// Covers: CRUD lifecycle, error paths, field verification, cross-volume numbering
//
// Usage: node server/test-tools.js
// Requires Express server running on :3001

const http = require('http');
const BASE = 'http://localhost:3001/api';
const PROJECT = 'test-tools-project';

let passed = 0;
let failed = 0;
let createdIds = {};

function assert(label, ok, detail) {
  if (ok) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}: ${detail || 'FAILED'}`);
  }
}

async function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const opts = { method, hostname: url.hostname, port: url.port, path: url.pathname + url.search, headers: { 'Content-Type': 'application/json' } };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function e(name) { return encodeURIComponent(name); }

async function run() {
  console.log('\n═══════════════════════════════════════');
  console.log('  AI Tool Integration Test');
  console.log('═══════════════════════════════════════\n');

  // ═══════════════════════════════════════════
  // STEP 1: Create test project
  // ═══════════════════════════════════════════
  console.log('📁 Step 1: Create test project');
  const proj = await api('POST', '/projects', { name: PROJECT, mode: 'short-story', language: 'zh', genres: ['sci-fi'] });
  assert('Create project', proj.status === 201 || proj.status === 200, JSON.stringify(proj.body));

  const projList = await api('GET', '/projects');
  assert('List projects', projList.body.some(p => p.name === PROJECT), 'project not found');

  // ── Error: duplicate project name ──
  const dupProj = await api('POST', '/projects', { name: PROJECT, mode: 'short-story' });
  assert('Reject duplicate project name', dupProj.status === 409, `expected 409 got ${dupProj.status}`);

  // ── Error: empty project name ──
  const emptyProj = await api('POST', '/projects', { name: '', mode: 'short-story' });
  assert('Reject empty project name', emptyProj.status === 400, `expected 400 got ${emptyProj.status}`);

  // ═══════════════════════════════════════════
  // STEP 2: Create entities
  // ═══════════════════════════════════════════
  console.log('\n📝 Step 2: Create entities');

  // Volume
  const vol = await api('POST', `/${e(PROJECT)}/volumes`, { title: '第一卷', summary: '测试用' });
  assert('Create volume', vol.status === 201, JSON.stringify(vol.body));
  createdIds.volumeId = vol.body.id;

  // Chapter (auto-number within volume)
  const ch = await api('POST', `/${e(PROJECT)}/chapters`, { title: '测试章', outline: '测试大纲', volume_id: createdIds.volumeId || 1 });
  assert('Create chapter', ch.status === 201, JSON.stringify(ch.body));
  createdIds.chapterNum = ch.body.num;

  // Chapter with explicit chapter_num (cross-volume continuation style)
  const ch2 = await api('POST', `/${e(PROJECT)}/chapters`, { title: '跨卷续接章', chapter_num: 42, volume_id: createdIds.volumeId || 1 });
  assert('Create chapter with explicit chapter_num', ch2.status === 201 && ch2.body.num === 42, `expected num=42 got ${JSON.stringify(ch2.body)}`);

  // Character
  const char = await api('POST', `/${e(PROJECT)}/characters`, { name: '测试角色', age: '20', gender: '男', personality: '测试性格', background: '测试背景' });
  assert('Create character', char.status === 201, JSON.stringify(char.body));
  createdIds.characterId = char.body.id;

  // ── Error: character without name ──
  const noNameChar = await api('POST', `/${e(PROJECT)}/characters`, { age: '20', gender: '男' });
  assert('Reject character without name', noNameChar.status === 400, `expected 400 got ${noNameChar.status}`);

  // World entry
  const world = await api('POST', `/${e(PROJECT)}/world`, { category: 'location', name: '测试地点', description: '测试描述', tags: 'test' });
  assert('Create world entry', world.status === 201, JSON.stringify(world.body));
  createdIds.worldId = world.body.id;

  // Science entry
  const sci = await api('POST', `/${e(PROJECT)}/science`, { label: 'known', name: '测试科学', description: '测试科学描述' });
  assert('Create science entry', sci.status === 201, JSON.stringify(sci.body));
  createdIds.scienceId = sci.body.id;

  // Foreshadow
  const fs = await api('POST', `/${e(PROJECT)}/foreshadows`, { title: '测试伏笔', description: '测试伏笔描述', priority: 'high', expected_resolve_chapter: 10 });
  assert('Create foreshadow', fs.status === 201, JSON.stringify(fs.body));

  // Relation
  const rel = await api('POST', `/${e(PROJECT)}/relations`, { character_a_id: createdIds.characterId, character_b_id: createdIds.characterId, relation_type: '朋友', description: '测试关系' });
  assert('Create relation', rel.status === 201, JSON.stringify(rel.body));
  createdIds.relationId = rel.body.id;

  // Memory
  const mem = await api('POST', `/${e(PROJECT)}/memories`, { category: 'event', content: '测试记忆' });
  assert('Create memory', mem.status === 201, JSON.stringify(mem.body));
  createdIds.memoryId = mem.body.id;

  // Timeline event
  const tl = await api('POST', `/${e(PROJECT)}/timeline`, { year: '2048', title: '测试事件', description: '测试事件描述', importance: 5 });
  assert('Create timeline event', tl.status === 201, JSON.stringify(tl.body));
  createdIds.timelineId = tl.body.id;

  // ═══════════════════════════════════════════
  // STEP 3: List / Get
  // ═══════════════════════════════════════════
  console.log('\n📋 Step 3: List/Get entities');

  const chapters = await api('GET', `/${e(PROJECT)}/chapters`);
  assert('List chapters', chapters.status === 200 && chapters.body.length >= 2, `expected >=2 got ${chapters.body.length}`);

  const ch3 = await api('GET', `/${e(PROJECT)}/chapters/${createdIds.chapterNum}`);
  assert('Get chapter', ch3.status === 200 && ch3.body.num === createdIds.chapterNum, `num mismatch: ${JSON.stringify(ch3.body)}`);

  const vols = await api('GET', `/${e(PROJECT)}/volumes`);
  assert('List volumes', vols.status === 200 && vols.body.length > 0);

  const chars = await api('GET', `/${e(PROJECT)}/characters`);
  assert('List characters', chars.status === 200 && chars.body.length > 0);

  // ── Get single character by id ──
  const charById = await api('GET', `/${e(PROJECT)}/characters/${createdIds.characterId}`);
  assert('Get character by id', charById.status === 200 && charById.body.name === '测试角色', `name mismatch: ${JSON.stringify(charById.body)}`);

  const worlds = await api('GET', `/${e(PROJECT)}/world`);
  assert('List world entries', worlds.status === 200 && worlds.body.length > 0);

  const sciList = await api('GET', `/${e(PROJECT)}/science`);
  assert('List science entries', sciList.status === 200 && sciList.body.length > 0);

  const fsList = await api('GET', `/${e(PROJECT)}/foreshadows`);
  assert('List foreshadows', fsList.status === 200 && fsList.body.length > 0);

  // ── Foreshadow status filter ──
  const fsFiltered = await api('GET', `/${e(PROJECT)}/foreshadows?status=planted`);
  assert('Filter foreshadows by status', fsFiltered.status === 200 && fsFiltered.body.length > 0);

  const relList = await api('GET', `/${e(PROJECT)}/relations`);
  assert('List relations', relList.status === 200 && relList.body.length > 0);

  const memList = await api('GET', `/${e(PROJECT)}/memories`);
  assert('List memories', memList.status === 200 && memList.body.length > 0);

  const tlList = await api('GET', `/${e(PROJECT)}/timeline`);
  assert('List timeline events', tlList.status === 200 && tlList.body.length > 0);

  const stats = await api('GET', `/${e(PROJECT)}/stats`);
  assert('Get stats', stats.status === 200);
  // Verify stat values are sensible
  assert('Stats contain chapter count', typeof stats.body.chapterCount === 'number' && stats.body.chapterCount >= 2, `unexpected chapterCount: ${stats.body.chapterCount}`);
  assert('Stats contain character count', typeof stats.body.characterCount === 'number' && stats.body.characterCount > 0);

  // ── Additional GET endpoints ──
  const singleProj = await api('GET', `/projects/${e(PROJECT)}`);
  assert('Get single project', singleProj.status === 200 && singleProj.body.name === PROJECT, `name mismatch: ${JSON.stringify(singleProj.body)}`);

  const meta = await api('GET', `/${e(PROJECT)}/meta`);
  assert('Get project meta', meta.status === 200 && meta.body.name === PROJECT, `meta name mismatch: ${JSON.stringify(meta.body)}`);
  // meta should include genres
  assert('Meta includes genres', Array.isArray(meta.body.genres), `genres not an array: ${JSON.stringify(meta.body)}`);

  const settings = await api('GET', '/settings');
  assert('Get settings', settings.status === 200, `got ${settings.status}`);
  assert('Settings is object', typeof settings.body === 'object', `settings not an object: ${JSON.stringify(settings.body)}`);

  // ── Error: get non-existent entity ──
  const noChar = await api('GET', `/${e(PROJECT)}/characters/nonexistent-id-12345`);
  assert('Get non-existent character returns 404', noChar.status === 404, `expected 404 got ${noChar.status}`);

  const noChapter = await api('GET', `/${e(PROJECT)}/chapters/99999`);
  assert('Get non-existent chapter returns 404', noChapter.status === 404, `expected 404 got ${noChapter.status}`);

  // ═══════════════════════════════════════════
  // STEP 4: Update entities
  // ═══════════════════════════════════════════
  console.log('\n✏️ Step 4: Update entities');

  // ── Update chapter ──
  const upCh = await api('PUT', `/${e(PROJECT)}/chapters/${createdIds.chapterNum}`, { title: '修改后标题', content: '新内容', status: 'writing' });
  assert('Update chapter returns 200', upCh.status === 200 || upCh.status === 201);
  // Re-read and verify fields changed
  const chAfter = await api('GET', `/${e(PROJECT)}/chapters/${createdIds.chapterNum}`);
  assert('Chapter title updated', chAfter.status === 200 && chAfter.body.title === '修改后标题', `title: ${chAfter.body.title}`);
  assert('Chapter content updated', chAfter.body.content === '新内容', `content: ${chAfter.body.content}`);
  assert('Chapter status updated', chAfter.body.status === 'writing', `status: ${chAfter.body.status}`);

  // ── Update volume ──
  const upVol = await api('PUT', `/${e(PROJECT)}/volumes/${createdIds.volumeId}`, { title: '修改后卷名' });
  assert('Update volume returns 200', upVol.status === 200);
  // Verify via re-read (re-list volumes)
  const volsAfter = await api('GET', `/${e(PROJECT)}/volumes`);
  const updatedVol = volsAfter.body.find(v => v.id === createdIds.volumeId);
  assert('Volume title updated', updatedVol && updatedVol.title === '修改后卷名', `title: ${JSON.stringify(updatedVol)}`);

  // ── Update character ──
  const upChar = await api('PUT', `/${e(PROJECT)}/characters/${createdIds.characterId}`, { name: '修改后角色' });
  assert('Update character returns 200', upChar.status === 200);
  const charAfter = await api('GET', `/${e(PROJECT)}/characters/${createdIds.characterId}`);
  assert('Character name updated', charAfter.body.name === '修改后角色', `name: ${charAfter.body.name}`);

  // ── Update world ──
  const upWorld = await api('PUT', `/${e(PROJECT)}/world/${createdIds.worldId}`, { description: '修改后描述' });
  assert('Update world entry returns 200', upWorld.status === 200);
  // Verify via re-list
  const worldsAfter = await api('GET', `/${e(PROJECT)}/world`);
  const updatedWorld = worldsAfter.body.find(w => w.id === createdIds.worldId);
  assert('World description updated', updatedWorld && updatedWorld.description === '修改后描述', `desc: ${JSON.stringify(updatedWorld)}`);

  // ── Update relation ──
  const upRel = await api('PUT', `/${e(PROJECT)}/relations/${createdIds.relationId}`, { intensity: 5 });
  assert('Update relation returns 200', upRel.status === 200);
  const relsAfter = await api('GET', `/${e(PROJECT)}/relations`);
  const updatedRel = relsAfter.body.find(r => r.id === createdIds.relationId);
  assert('Relation intensity updated', updatedRel && updatedRel.intensity === 5, `intensity: ${JSON.stringify(updatedRel)}`);

  // ── Update memory ──
  const upMem = await api('PUT', `/${e(PROJECT)}/memories/${createdIds.memoryId}`, { content: '修改后记忆' });
  assert('Update memory returns 200', upMem.status === 200);
  const memsAfter = await api('GET', `/${e(PROJECT)}/memories`);
  const updatedMem = memsAfter.body.find(m => m.id === createdIds.memoryId);
  assert('Memory content updated', updatedMem && updatedMem.content === '修改后记忆', `content: ${JSON.stringify(updatedMem)}`);

  // ── Update timeline ──
  const upTl = await api('PUT', `/${e(PROJECT)}/timeline/${createdIds.timelineId}`, { importance: 1 });
  assert('Update timeline returns 200', upTl.status === 200);
  const tlsAfter = await api('GET', `/${e(PROJECT)}/timeline`);
  const updatedTl = tlsAfter.body.find(t => t.id === createdIds.timelineId);
  assert('Timeline importance updated', updatedTl && updatedTl.importance === 1, `importance: ${JSON.stringify(updatedTl)}`);

  // ── Workflow phase ──
  const phase = await api('PUT', `/${e(PROJECT)}/workflow/phase`, { phase: 'writing' });
  assert('Update workflow phase', phase.status === 200);

  const phaseGet = await api('GET', `/${e(PROJECT)}/workflow/phase`);
  assert('Get workflow phase returns updated value', phaseGet.status === 200 && phaseGet.body.phase === 'writing', `phase: ${JSON.stringify(phaseGet.body)}`);

  // ── Settings write ──
  const setPut = await api('PUT', '/settings', { key: 'test_key', value: 'test_value' });
  assert('Update settings', setPut.status === 200);
  const settingsAfter = await api('GET', '/settings');
  assert('Settings readback shows written value', settingsAfter.status === 200 && settingsAfter.body.test_key === 'test_value', `key not found: ${JSON.stringify(settingsAfter.body)}`);

  // ── Error: update non-existent entity ──
  const badVol = await api('PUT', `/${e(PROJECT)}/volumes/999999`, { title: '不存在' });
  assert('Update non-existent volume returns 404', badVol.status === 404, `expected 404 got ${badVol.status}`);

  const badWorld = await api('PUT', `/${e(PROJECT)}/world/nonexistent-id-99999`, { description: '不存在' });
  assert('Update non-existent world returns 404', badWorld.status === 404, `expected 404 got ${badWorld.status}`);

  const badRel = await api('PUT', `/${e(PROJECT)}/relations/nonexistent-id-99999`, { intensity: 1 });
  assert('Update non-existent relation returns 404', badRel.status === 404, `expected 404 got ${badRel.status}`);

  const badMem = await api('PUT', `/${e(PROJECT)}/memories/nonexistent-id-99999`, { content: '不存在' });
  assert('Update non-existent memory returns 404', badMem.status === 404, `expected 404 got ${badMem.status}`);

  const badTl = await api('PUT', `/${e(PROJECT)}/timeline/nonexistent-id-99999`, { importance: 1 });
  assert('Update non-existent timeline returns 404', badTl.status === 404, `expected 404 got ${badTl.status}`);

  // ── Error: empty update body ──
  const emptyUpdate = await api('PUT', `/${e(PROJECT)}/volumes/${createdIds.volumeId}`, {});
  assert('Reject empty update body', emptyUpdate.status === 400, `expected 400 got ${emptyUpdate.status}`);

  // ── Error: delete non-existent entity ──
  const badDelWorld = await api('DELETE', `/${e(PROJECT)}/world/nonexistent-id-99999`);
  assert('Delete non-existent world returns 404', badDelWorld.status === 404, `expected 404 got ${badDelWorld.status}`);

  const badDelRel = await api('DELETE', `/${e(PROJECT)}/relations/nonexistent-id-99999`);
  assert('Delete non-existent relation returns 404', badDelRel.status === 404, `expected 404 got ${badDelRel.status}`);

  const badDelMem = await api('DELETE', `/${e(PROJECT)}/memories/nonexistent-id-99999`);
  assert('Delete non-existent memory returns 404', badDelMem.status === 404, `expected 404 got ${badDelMem.status}`);

  // ═══════════════════════════════════════════
  // STEP 5: Delete & verify
  // ═══════════════════════════════════════════
  console.log('\n🗑️ Step 5: Delete & verify');

  // Chapter
  const delCh = await api('DELETE', `/${e(PROJECT)}/chapters/${createdIds.chapterNum}`);
  assert('Delete chapter', delCh.status === 200);
  const chGone = await api('GET', `/${e(PROJECT)}/chapters/${createdIds.chapterNum}`);
  assert('Deleted chapter returns 404', chGone.status === 404, `expected 404 got ${chGone.status}`);

  // Volume (cascades: deletes chapters in volume + the volume itself)
  const delVol = await api('DELETE', `/${e(PROJECT)}/volumes/${createdIds.volumeId}`);
  assert('Delete volume', delVol.status === 200);

  // Relation
  const delRel = await api('DELETE', `/${e(PROJECT)}/relations/${createdIds.relationId}`);
  assert('Delete relation', delRel.status === 200);

  // Character
  const delChar = await api('DELETE', `/${e(PROJECT)}/characters/${createdIds.characterId}`);
  assert('Delete character', delChar.status === 200);
  const charGone = await api('GET', `/${e(PROJECT)}/characters/${createdIds.characterId}`);
  assert('Deleted character returns 404', charGone.status === 404, `expected 404 got ${charGone.status}`);

  // World
  const delWorld = await api('DELETE', `/${e(PROJECT)}/world/${createdIds.worldId}`);
  assert('Delete world entry', delWorld.status === 200);
  const worldGone = await api('GET', `/${e(PROJECT)}/world`);
  assert('Deleted world absent from list', worldGone.status === 200 && !worldGone.body.some(w => w.id === createdIds.worldId), 'world still in list');

  // Science
  const delSci = await api('DELETE', `/${e(PROJECT)}/science/${createdIds.scienceId}`);
  assert('Delete science entry', delSci.status === 200);

  // Memory
  const delMem = await api('DELETE', `/${e(PROJECT)}/memories/${createdIds.memoryId}`);
  assert('Delete memory', delMem.status === 200);
  const memGone = await api('GET', `/${e(PROJECT)}/memories`);
  assert('Deleted memory absent from list', memGone.status === 200 && !memGone.body.some(m => m.id === createdIds.memoryId), 'memory still in list');

  // Timeline
  const delTl = await api('DELETE', `/${e(PROJECT)}/timeline/${createdIds.timelineId}`);
  assert('Delete timeline event', delTl.status === 200);
  const tlGone = await api('GET', `/${e(PROJECT)}/timeline`);
  assert('Deleted timeline absent from list', tlGone.status === 200 && !tlGone.body.some(t => t.id === createdIds.timelineId), 'timeline still in list');

  // ── Error: delete non-existent chapter ──
  const delNoCh = await api('DELETE', `/${e(PROJECT)}/chapters/99999`);
  assert('Delete non-existent chapter returns 404', delNoCh.status === 404, `expected 404 got ${delNoCh.status}`);

  // ═══════════════════════════════════════════
  // STEP 6: Cleanup
  // ═══════════════════════════════════════════
  console.log('\n🧹 Step 6: Cleanup');
  const delProj = await api('DELETE', `/projects/${e(PROJECT)}`);
  assert('Delete project', delProj.status === 200);

  // ── Results ──
  console.log('\n═══════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
  console.log('═══════════════════════════════════════\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('Test error:', e); process.exit(1); });
