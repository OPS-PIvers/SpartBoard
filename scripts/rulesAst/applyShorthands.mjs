#!/usr/bin/env node
// Rules between `// shorthands: off` and `// shorthands: on` are left alone (each call costs evaluation steps).
// Rewrites firestore.rules to use the incoming()/existing()/authUid()/unchanged()/isX() shorthands.
// Idempotent. Prove the result with: java -cp <emulator jar> scripts/rulesAst/RulesAst.java equiv <before> <after>
import { readFileSync, writeFileSync } from 'node:fs';

const TYPES = {
  string: 'Str',
  int: 'Int',
  bool: 'Bool',
  list: 'List',
  map: 'Map',
  number: 'Number',
  timestamp: 'Timestamp',
  float: 'Float',
  path: 'Path',
};
const PRE = String.raw`(^|\(|&&|\|\||\breturn|\bif)(\s*)`;
const POST = String.raw`(?=\s*(?:&&|\|\||\)|;|$))`;
const SAME = new RegExp(
  PRE + String.raw`incoming\(\)\.(\w+) == existing\(\)\.\3(?![\w.(\[])` + POST,
  'g'
);
const IS = new RegExp(
  PRE + String.raw`incoming\(\)\.(\w+) is (${Object.keys(TYPES).join('|')})\b` + POST,
  'g'
);
const HELPER_LINE =
  /^\s*function (incoming|existing|authUid|unchanged|is[A-Z]\w*)\(\w*\) \{ return re(quest|source)\./;
const ANCHOR = 'match /databases/{database}/documents {\n';
const COMMENT =
  '    // Shorthands: compiled rules size counts expression nodes, and each use saves 2-4.';
const HELPERS = [
  '    function incoming() { return request.resource.data; }',
  '    function existing() { return resource.data; }',
  '    function authUid() { return request.auth.uid; }',
  '    function unchanged(k) { return request.resource.data[k] == resource.data[k]; }',
  ...Object.entries(TYPES).map(
    ([t, n]) => `    function is${n}(k) { return request.resource.data[k] is ${t}; }`
  ),
];

export function applyShorthands(source) {
  let on = true;
  const lines = source.split('\n').map((line) => {
    const marker = line.match(/^\s*\/\/ shorthands: (on|off)\b/);
    if (marker) on = marker[1] === 'on';
    if (!on || line.trimStart().startsWith('//') || HELPER_LINE.test(line)) return line;
    const at = line.indexOf(' //');
    const split = at >= 0 && !line.slice(at).includes("'");
    let code = split ? line.slice(0, at) : line;
    code = code
      .replace(/\brequest\.resource\.data\b(?!\w)/g, 'incoming()')
      .replace(/(?<![\w.])resource\.data\b(?!\w)/g, 'existing()')
      .replace(/\brequest\.auth\.uid\b(?!\w)/g, 'authUid()')
      .replace(SAME, "$1$2unchanged('$3')")
      .replace(IS, (_m, a, b, k, t) => `${a}${b}is${TYPES[t]}('${k}')`);
    return split ? code + line.slice(at) : code;
  });
  let text = lines.join('\n');
  const start = text.indexOf(ANCHOR) + ANCHOR.length;
  const missing = HELPERS.filter((h) => {
    const name = h.match(/function (\w+)/)[1];
    return (
      !text.includes(`function ${name}(`) &&
      (/^(incoming|existing|authUid|unchanged)$/.test(name) ||
        text.includes(`${name}('`))
    );
  });
  if (missing.length) {
    const head = text.includes(COMMENT) ? [] : [COMMENT];
    text =
      text.slice(0, start) +
      [...head, ...missing].join('\n') +
      '\n' +
      text.slice(start);
  }
  return text;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const path = process.argv[2] ?? 'firestore.rules';
  writeFileSync(path, applyShorthands(readFileSync(path, 'utf8')));
}
