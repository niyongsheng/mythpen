/**
 * Per-project "author notes" — user-authored writing rules
 * (voice, POV, chapter format, no-go areas, collaboration style).
 *
 * Stored in project_meta as plain text so it travels with the project
 * database (backup/import/export) and needs no schema migration. It is
 * injected into every AI system prompt, so keep it bounded: 2000 characters
 * is roughly 2k tokens on each request.
 */
const MAX_AUTHOR_NOTES = 2000;

/** Save (or clear) author notes. Throws when the text exceeds the limit. */
function saveAuthorNotes(pdb, raw) {
  const notes = typeof raw === 'string' ? raw.trim() : '';
  if (notes.length > MAX_AUTHOR_NOTES) {
    throw new Error(`创作约定最多 ${MAX_AUTHOR_NOTES} 字，当前 ${notes.length} 字，请精简后再保存。`);
  }
  if (notes) {
    pdb.prepare("INSERT OR REPLACE INTO project_meta (key, value) VALUES ('author_notes', ?)").run(notes);
  } else {
    pdb.prepare("DELETE FROM project_meta WHERE key = 'author_notes'").run();
  }
  return notes;
}

module.exports = { MAX_AUTHOR_NOTES, saveAuthorNotes };
