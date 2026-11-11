// End-to-end tests for user-owned .mythpen documents.
// Run with: node --test server/test-project-file.js

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PORT = 3199;
const BASE = `http://127.0.0.1:${PORT}/api`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mythpen-file-test-'));
const WORK_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mythpen-files-'));

let server;
let projectName;

function enc(value) {
  return encodeURIComponent(value);
}

async function api(pathname, options = {}) {
  const response = await fetch(`${BASE}${pathname}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body };
}

async function waitForHealth() {
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('server did not start');
}

function appId(filePath) {
  const header = fs.readFileSync(filePath).subarray(0, 100);
  return header.readUInt32BE(68);
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

before(async () => {
  server = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, MYTHPEN_DATA_DIR: DATA_DIR, PORT: String(PORT) },
    stdio: 'ignore',
  });
  await waitForHealth();
});

after(async () => {
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 3000);
      server.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  fs.rmSync(WORK_DIR, { recursive: true, force: true });
});

test('experimental project files are disabled by default', async () => {
  const settings = await api('/settings');
  assert.equal(settings.status, 200);
  assert.equal(settings.body.experimental_document_mode, 'false');

  const opened = await api('/projects/open-file', {
    method: 'POST',
    body: JSON.stringify({ path: path.join(WORK_DIR, 'not-created.mythpen') }),
  });
  assert.equal(opened.status, 403);
  assert.equal(opened.body.error.code, 'FEATURE_DISABLED');

  const created = await api('/projects', {
    method: 'POST',
    body: JSON.stringify({ name: '禁用测试', filePath: path.join(WORK_DIR, 'off.mythpen') }),
  });
  assert.equal(created.status, 403);
  assert.equal(created.body.error.code, 'FEATURE_DISABLED');
  assert.equal(fs.existsSync(path.join(WORK_DIR, 'off.mythpen')), false);
});

test('enables experimental project files', async () => {
  const enabled = await api('/settings', {
    method: 'PUT',
    body: JSON.stringify({ key: 'experimental_document_mode', value: 'true' }),
  });
  assert.equal(enabled.status, 200);

  const settings = await api('/settings');
  assert.equal(settings.body.experimental_document_mode, 'true');
});

test('creates a self-contained .mythpen document', async () => {
  const filePath = path.join(WORK_DIR, 'novel.mythpen');
  const created = await api('/projects', {
    method: 'POST',
    body: JSON.stringify({ name: '测试小说', filePath }),
  });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(created.body.isDocument, true);
  projectName = created.body.name;

  const chapter = await api(`/${enc(projectName)}/chapters`, {
    method: 'POST',
    body: JSON.stringify({ title: '第一章' }),
  });
  assert.equal(chapter.status, 201);

  await api(`/${enc(projectName)}/chapters/1`, {
    method: 'PUT',
    body: JSON.stringify({ content: '你好，世界。', status: 'accepted' }),
  });
  await api(`/${enc(projectName)}/characters`, {
    method: 'POST',
    body: JSON.stringify({ name: '林舟', role: 'major' }),
  });
  await api(`/${enc(projectName)}/cover`, {
    method: 'POST',
    body: JSON.stringify({ data: Buffer.from('fake-png').toString('base64'), mime: 'image/png' }),
  });

  const saved = await api(`/projects/${enc(projectName)}/save`, { method: 'POST' });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.ok(fs.existsSync(filePath));
  assert.equal(appId(filePath), 0x4d595448);
  // A document must not create an internal projects/<uuid> DB.
  const projectsDir = path.join(DATA_DIR, 'projects');
  const internal = fs.existsSync(projectsDir) ? fs.readdirSync(projectsDir).filter((f) => f.endsWith('.db')) : [];
  assert.deepEqual(internal, []);
});

test('auto-flushes document writes to disk', async () => {
  const filePath = path.join(WORK_DIR, 'autosave.mythpen');
  const created = await api('/projects', {
    method: 'POST',
    body: JSON.stringify({ name: '自动保存', filePath }),
  });
  assert.equal(created.status, 200);
  const name = created.body.name;
  await api(`/${enc(name)}/chapters`, { method: 'POST', body: JSON.stringify({ title: '第一章' }) });
  await api(`/${enc(name)}/chapters/1`, {
    method: 'PUT',
    body: JSON.stringify({ content: '自动保存正文' }),
  });

  // The document flush delay is 1.5s; give it margin.
  await new Promise((resolve) => setTimeout(resolve, 2200));

  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const raw = new SQL.Database(fs.readFileSync(filePath));
  const stmt = raw.prepare('SELECT content FROM chapters WHERE num = 1');
  assert.equal(stmt.step(), true);
  assert.equal(stmt.getAsObject().content, '自动保存正文');
  stmt.free();
  raw.close();
});

test('opens a copied document and keeps all data', async () => {
  const original = path.join(WORK_DIR, 'novel.mythpen');
  const copy = path.join(WORK_DIR, 'copied.mythpen');
  fs.copyFileSync(original, copy);

  const opened = await api('/projects/open-file', {
    method: 'POST',
    body: JSON.stringify({ path: copy }),
  });
  assert.equal(opened.status, 200, JSON.stringify(opened.body));
  const name = opened.body.name;

  const chapter = await api(`/${enc(name)}/chapters/1`);
  assert.equal(chapter.status, 200);
  assert.equal(chapter.body.content, '你好，世界。');

  const characters = await api(`/${enc(name)}/characters`);
  assert.equal(characters.body.length, 1);
  assert.equal(characters.body[0].name, '林舟');

  const cover = await fetch(`${BASE}/${enc(name)}/cover`);
  assert.equal(cover.status, 200);
  assert.equal(Buffer.from(await cover.arrayBuffer()).toString(), 'fake-png');
});

test('allocates a unique name for a duplicate document', async () => {
  const duplicate = path.join(WORK_DIR, 'duplicate.mythpen');
  fs.copyFileSync(path.join(WORK_DIR, 'novel.mythpen'), duplicate);

  const opened = await api('/projects/open-file', {
    method: 'POST',
    body: JSON.stringify({ path: duplicate }),
  });
  assert.equal(opened.status, 200, JSON.stringify(opened.body));
  assert.notEqual(opened.body.name, projectName);
  assert.ok(opened.body.name.startsWith(projectName));
});

test('rejects a newer schema without touching the file', async () => {
  const future = path.join(WORK_DIR, 'future.mythpen');
  fs.copyFileSync(path.join(WORK_DIR, 'novel.mythpen'), future);

  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const raw = new SQL.Database(fs.readFileSync(future));
  raw.run("UPDATE project_meta SET value = '99' WHERE key = 'schema_version'");
  fs.writeFileSync(future, Buffer.from(raw.export()));
  raw.close();

  const hashBefore = sha256(future);
  const opened = await api('/projects/open-file', {
    method: 'POST',
    body: JSON.stringify({ path: future }),
  });
  assert.equal(opened.status, 409);
  assert.equal(opened.body.error.code, 'PROJECT_SCHEMA_TOO_NEW');
  assert.equal(sha256(future), hashBefore);
});

test('save-as leaves the original intact and registers the copy', async () => {
  const copyPath = path.join(WORK_DIR, 'save-as.mythpen');
  const result = await api(`/projects/${enc(projectName)}/save-as`, {
    method: 'POST',
    body: JSON.stringify({ path: copyPath }),
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.ok(fs.existsSync(copyPath));
  assert.ok(fs.existsSync(path.join(WORK_DIR, 'novel.mythpen')));

  const reopened = await api('/projects/open-file', {
    method: 'POST',
    body: JSON.stringify({ path: copyPath }),
  });
  assert.equal(reopened.status, 200);
  assert.notEqual(reopened.body.name, projectName);
});

test('does not resurrect a document deleted behind the app', async () => {
  const filePath = path.join(WORK_DIR, 'gone.mythpen');
  const created = await api('/projects', {
    method: 'POST',
    body: JSON.stringify({ name: '已删除文件', filePath }),
  });
  assert.equal(created.status, 200);
  const name = created.body.name;
  await api(`/${enc(name)}/chapters`, { method: 'POST', body: JSON.stringify({ title: '第一章' }) });
  await api(`/${enc(name)}/chapters/1`, { method: 'PUT', body: JSON.stringify({ content: '删除前的正文' }) });
  await api(`/projects/${enc(name)}/save`, { method: 'POST' });
  fs.unlinkSync(filePath);

  await api(`/${enc(name)}/chapters/1`, { method: 'PUT', body: JSON.stringify({ content: '删除后的正文' }) });
  await new Promise((resolve) => setTimeout(resolve, 2200));
  assert.equal(fs.existsSync(filePath), false);

  const saved = await api(`/projects/${enc(name)}/save`, { method: 'POST' });
  assert.equal(saved.status, 409);
  assert.equal(saved.body.error.code, 'PROJECT_FILE_CHANGED');
});

test('save-as recovers when the original document was moved or deleted', async () => {
  const source = path.join(WORK_DIR, 'vanishing.mythpen');
  const created = await api('/projects', {
    method: 'POST',
    body: JSON.stringify({ name: '消失的文件', filePath: source }),
  });
  assert.equal(created.status, 200);
  const name = created.body.name;
  await api(`/${enc(name)}/chapters`, { method: 'POST', body: JSON.stringify({ title: '第一章' }) });
  await api(`/projects/${enc(name)}/save`, { method: 'POST' });
  fs.unlinkSync(source);

  const recovered = path.join(WORK_DIR, 'recovered.mythpen');
  const result = await api(`/projects/${enc(name)}/save-as`, {
    method: 'POST',
    body: JSON.stringify({ path: recovered }),
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.ok(fs.existsSync(recovered));
});

test('delete removes only the recent entry unless deleteFile=1', async () => {
  const filePath = path.join(WORK_DIR, 'deletable.mythpen');
  const created = await api('/projects', {
    method: 'POST',
    body: JSON.stringify({ name: '可删除', filePath }),
  });
  assert.equal(created.status, 200);

  const removed = await api(`/projects/${enc(created.body.name)}`, { method: 'DELETE' });
  assert.equal(removed.status, 200);
  assert.equal(fs.existsSync(filePath), true);

  const reopened = await api('/projects/open-file', {
    method: 'POST',
    body: JSON.stringify({ path: filePath }),
  });
  assert.equal(reopened.status, 200);

  const deleted = await api(`/projects/${enc(reopened.body.name)}?deleteFile=1`, { method: 'DELETE' });
  assert.equal(deleted.status, 200);
  assert.equal(fs.existsSync(filePath), false);
});
