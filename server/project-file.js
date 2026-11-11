// Validation helpers for user-owned `.mythpen` project documents.
//
// A document is a plain SQLite database with `PRAGMA application_id = "MYTH"`.
// Validation happens before openProjectDb() so an invalid/newer file is never
// migrated, written to, or registered.

const fs = require('fs');
const path = require('path');
const db = require('./db');

const MAX_DOCUMENT_BYTES = 512 * 1024 * 1024;
const MIN_DOCUMENT_BYTES = 100;
const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'binary');

function fileError(code, message, status = 400) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  err.recoverable = true;
  return err;
}

/** Normalize and validate the path syntax of a document (does not touch disk). */
function resolveDocumentPath(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw fileError('PROJECT_FILE_INVALID', '缺少项目文件路径');
  }
  const resolved = path.resolve(input.trim());
  if (!resolved.toLowerCase().endsWith(db.DOCUMENT_EXT)) {
    throw fileError('PROJECT_FILE_INVALID', `项目文件必须以 ${db.DOCUMENT_EXT} 结尾`);
  }
  // Canonicalize the parent so symlinked folders (e.g. Documents → iCloud)
  // resolve to the same path that open-file later sees via realpath.
  try {
    return path.join(fs.realpathSync(path.dirname(resolved)), path.basename(resolved));
  } catch {
    return resolved;
  }
}

/** Ensure the parent directory exists and is a directory. */
function ensureParentDirectory(filePath) {
  const parent = path.dirname(filePath);
  let stat;
  try {
    stat = fs.statSync(parent);
  } catch {
    throw fileError('PROJECT_FILE_INVALID', '保存目录不存在');
  }
  if (!stat.isDirectory()) throw fileError('PROJECT_FILE_INVALID', '保存目录不存在');
}

/** New-project / import targets must not exist yet. */
function ensureTargetAbsent(filePath) {
  if (fs.existsSync(filePath)) {
    throw fileError('PROJECT_FILE_EXISTS', '目标文件已存在，请选择其他名称', 409);
  }
}

function readHeader(filePath) {
  const header = Buffer.alloc(100);
  const fd = fs.openSync(filePath, 'r');
  try {
    let offset = 0;
    while (offset < header.length) {
      const read = fs.readSync(fd, header, offset, header.length - offset, offset);
      if (!read) break;
      offset += read;
    }
    return header;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Validate an existing document without opening it for writing.
 * Returns { filePath, size, appId, schemaVersion? }.
 */
function validateExistingDocument(input) {
  let filePath = resolveDocumentPath(input);
  let stat;
  try {
    // Canonicalize so the same file opened through a symlink or a different
    // case (macOS/Windows) is recognized as already registered.
    filePath = fs.realpathSync(filePath);
    stat = fs.statSync(filePath);
  } catch {
    throw fileError('PROJECT_FILE_NOT_FOUND', '项目文件不存在', 404);
  }
  if (!stat.isFile()) throw fileError('PROJECT_FILE_INVALID', '路径不是文件');
  if (stat.size < MIN_DOCUMENT_BYTES) {
    throw fileError('PROJECT_FILE_INVALID', '文件过小，不是有效的 Mythpen 项目文件');
  }
  if (stat.size > MAX_DOCUMENT_BYTES) {
    throw fileError('PROJECT_FILE_TOO_LARGE', '项目文件超过 512 MB，无法打开', 413);
  }

  const header = readHeader(filePath);
  if (!header.subarray(0, 16).equals(SQLITE_MAGIC)) {
    throw fileError('PROJECT_FILE_INVALID', '不是有效的 Mythpen 项目文件');
  }

  const appId = header.readUInt32BE(68);
  const info = { filePath, size: stat.size, appId };
  if (appId === db.MYTHPEN_APP_ID) return info;
  if (appId !== 0) {
    throw fileError('PROJECT_FILE_INVALID', '不是有效的 Mythpen 项目文件');
  }

  // application_id 0 = an older/internal DB renamed to .mythpen. Inspect it in
  // a temporary sql.js instance; do not migrate or touch the file.
  let inspected;
  try {
    inspected = db.inspectProjectFile(filePath);
  } catch {
    throw fileError('PROJECT_FILE_INVALID', '项目文件已损坏或格式不正确');
  }
  if (!inspected.hasProjectMeta) {
    throw fileError('PROJECT_FILE_INVALID', '不是有效的 Mythpen 项目文件');
  }
  info.schemaVersion = inspected.schemaVersion;
  return info;
}

/** Refuse a document whose schema is newer than this app understands. */
function assertSchemaSupported(schemaVersion) {
  if (Number(schemaVersion) > db.PROJECT_SCHEMA_VERSION) {
    throw db.schemaTooNewError(Number(schemaVersion), db.PROJECT_SCHEMA_VERSION);
  }
}

/** Shared 403 response for endpoints gated by the experimental document mode. */
function documentModeDisabled(res) {
  return res.status(403).json({
    error: {
      code: 'FEATURE_DISABLED',
      message: '项目文件功能未启用。请在 设置 → 实验功能 中开启。',
      recoverable: true,
    },
  });
}

/** Reserve a brand-new document path for a long-running import. */
function reserveNewDocument(input) {
  const filePath = resolveDocumentPath(input);
  ensureParentDirectory(filePath);
  ensureTargetAbsent(filePath);
  try {
    const fd = fs.openSync(filePath, 'wx');
    fs.closeSync(fd);
  } catch (err) {
    if (err.code === 'EEXIST') {
      throw fileError('PROJECT_FILE_EXISTS', '目标文件已存在，请选择其他名称', 409);
    }
    throw fileError('PROJECT_FILE_INVALID', `无法创建项目文件：${err.message}`);
  }
  return filePath;
}

module.exports = {
  MAX_DOCUMENT_BYTES,
  MIN_DOCUMENT_BYTES,
  fileError,
  resolveDocumentPath,
  ensureParentDirectory,
  ensureTargetAbsent,
  validateExistingDocument,
  assertSchemaSupported,
  documentModeDisabled,
  reserveNewDocument,
};
