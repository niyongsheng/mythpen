// ─── Tool-call markup scrubber ───
// When a DeepSeek model is asked to use tools but the request registers none,
// it emits its native tool-call syntax as ordinary text:
//
//   <｜｜DSML｜｜ calls>
//   <｜｜DSML｜｜ invoke name="list_chapters">
//   </｜｜DSML｜｜ invoke>
//   </｜｜DSML｜｜ calls>
//
// Streaming that into a chapter corrupts the prose, so such blocks are removed
// before the text is shown or saved. Some gateways use ASCII pipes instead of
// the full-width ｜, so both variants are handled.

const OPEN_TOKEN = String.raw`<[|｜]{1,2}DSML[|｜]{1,2}`;
const START_RE = new RegExp(OPEN_TOKEN);
const KIND_RE = new RegExp(`^${OPEN_TOKEN}\\s*([A-Za-z_]+)\\b[^>]*>`);
const STRAY_TOKEN_RE = new RegExp(String.raw`</?[|｜]{1,2}DSML[|｜]{1,2}[^>]*>`, 'g');

function closingRe(kind) {
  return new RegExp(`</\\s*[|｜]{1,2}DSML[|｜]{1,2}\\s*${kind}\\s*>`, 'i');
}

/**
 * Remove tool-call markup from a complete model response.
 * Prose before and after the markup is preserved; an unterminated block
 * (typically a response cut off by max_tokens) is dropped to the end.
 */
function stripToolMarkup(text) {
  if (!text || !text.includes('DSML')) return text;

  let out = '';
  let rest = text;
  while (rest) {
    const start = rest.search(START_RE);
    if (start === -1) {
      out += rest;
      break;
    }
    out += rest.slice(0, start);
    rest = rest.slice(start);

    const kindMatch = rest.match(KIND_RE);
    const closeMatch = closingRe(kindMatch ? kindMatch[1] : 'calls').exec(rest);
    if (!closeMatch) break;
    rest = rest.slice(closeMatch.index + closeMatch[0].length);
  }

  return out
    .replace(STRAY_TOKEN_RE, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

module.exports = { stripToolMarkup };
