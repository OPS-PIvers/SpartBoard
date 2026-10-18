#!/usr/bin/env node
// Shortens bound names in firestore.rules for release, proven equivalent by Firebase's own compiler.
// Usage: node scripts/minifyRules.mjs [path] [--write] [--map <file>]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findEmulatorJar } from './rulesAst/emulatorJar.mjs';
import { stripRulesComments } from './stripRulesComments.mjs';

// Lexer keywords (FirebaseRulesLexer.VOCABULARY) and globals a bound name must never shadow or become.
const RESERVED = new Set(
  (
    'allow arguments break case continue default deny do each else extends false for function goto ' +
    'if import in is let match not null package return rules_version service switch then true var while ' +
    'bool bytes cloud create debug delete duration error exists existsAfter firestore float get getAfter ' +
    'hashing int latlng list map maps math number path read request resource sets string timestamp ' +
    'update write'
  ).split(' ')
);

const TOKEN = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|[A-Za-z_]\w*/g;

function boundNames(source) {
  const names = new Set();
  for (const m of source.matchAll(/\bfunction\s+(\w+)\s*\(([^)]*)\)/g)) {
    names.add(m[1]);
    for (const p of m[2].split(',')) if (p.trim()) names.add(p.trim());
  }
  for (const m of source.matchAll(/\blet\s+(\w+)\s*=/g)) names.add(m[1]);
  for (const m of source.matchAll(/\{\s*(\w+)\s*(?:=\s*\*\*\s*)?\}/g)) names.add(m[1]);
  for (const n of names) if (RESERVED.has(n)) names.delete(n);
  return names;
}

// A bare identifier is a reference; after '.' it is a field or method, after '/' a path segment.
function isReference(source, index) {
  let i = index - 1;
  while (i >= 0 && /[ \t]/.test(source[i])) i--;
  return source[i] !== '.' && source[index - 1] !== '/';
}

function* shortNames(taken) {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  for (let len = 1; ; len++) {
    const total = letters.length ** len;
    for (let n = 0; n < total; n++) {
      let s = '';
      for (let k = n, i = 0; i < len; i++, k = Math.floor(k / letters.length)) {
        s = letters[k % letters.length] + s;
      }
      if (!taken.has(s) && !RESERVED.has(s)) yield s;
    }
  }
}

export function minifyRules(stripped) {
  const bound = boundNames(stripped);
  const counts = new Map();
  const taken = new Set();
  for (const m of stripped.matchAll(TOKEN)) {
    if (!/^[A-Za-z_]/.test(m[0])) {
      for (const w of m[0].matchAll(/\w+/g)) taken.add(w[0]);
      continue;
    }
    taken.add(m[0]);
    if (bound.has(m[0]) && isReference(stripped, m.index)) {
      counts.set(m[0], (counts.get(m[0]) ?? 0) + 1);
    }
  }
  const byUse = [...counts].sort(
    ([a, x], [b, y]) => y * b.length - x * a.length || a.localeCompare(b)
  );
  const names = shortNames(taken);
  const map = new Map();
  for (const [original] of byUse) {
    const short = names.next().value;
    if (short.length < original.length) map.set(original, short);
  }
  const text = stripped.replace(TOKEN, (tok, offset) =>
    map.has(tok) && isReference(stripped, offset) ? map.get(tok) : tok
  );
  return { text, map };
}

export function formatNameMap(map) {
  return [...map].map(([original, short]) => `${short} ${original}\n`).join('');
}

// Throws unless <after> compiles to <before>'s AST with only the mapped bound names changed.
export function proveRenamed(before, after, map) {
  const jar = findEmulatorJar();
  if (!jar) {
    throw new Error(
      'cannot prove minified rules: needs `java` (JDK 21) and the Firestore emulator jar ' +
        '(`pnpm exec firebase setup:emulators:firestore`). Set RULES_MINIFY=0 to release unminified.'
    );
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'rules-minify-'));
  const files = ['before.rules', 'after.rules', 'names.txt'].map((f) => path.join(dir, f));
  writeFileSync(files[0], before);
  writeFileSync(files[1], after);
  writeFileSync(files[2], formatNameMap(map));
  const tool = path.join(path.dirname(fileURLToPath(import.meta.url)), 'rulesAst', 'RulesAst.java');
  try {
    return execFileSync('java', ['-cp', jar, tool, 'renamed', ...files], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .trim()
      .split('\n')
      .pop();
  } catch (err) {
    throw new Error(`minified rules are not equivalent to the source:\n${err.stdout ?? ''}${err.stderr ?? err}`);
  }
}

// Strip, minify and prove; the text that ships. A header comment costs source bytes only.
export function releaseRulesText(source, { label = 'working tree' } = {}) {
  const stripped = stripRulesComments(source);
  const { text, map } = minifyRules(stripped);
  const proof = proveRenamed(stripped, text, map);
  const header = `// Minified for release from ${label}; ${map.size} names shortened, see the rules name map artifact.\n`;
  return { text: header + text, map, proof };
}

function main() {
  const args = process.argv.slice(2);
  const mapAt = args.indexOf('--map');
  const mapFile = mapAt >= 0 ? args[mapAt + 1] : null;
  const file = args.find((a, i) => !a.startsWith('--') && i !== mapAt + 1) ?? 'firestore.rules';
  const target = path.resolve(file);
  const source = readFileSync(target, 'utf8');
  const { text, map, proof } = releaseRulesText(source, {
    label: process.env.GITHUB_SHA?.slice(0, 12) ?? 'working tree',
  });
  console.log(`${file}: ${proof}`);
  if (mapFile) writeFileSync(mapFile, formatNameMap(map));
  if (args.includes('--write')) {
    writeFileSync(target, text);
    console.log(`${file}: minified in place, ${Buffer.byteLength(source)} -> ${Buffer.byteLength(text)} bytes`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
