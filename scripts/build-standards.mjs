#!/usr/bin/env node
/**
 * Build config/standards/<set>.json from a standards CSV.
 *
 * Input columns (header row required, extra columns ignored):
 *   Grade, Strand, Anchor Standard, Code, Benchmark
 * Output: a StandardBenchmark[] (see types.ts) minus `searchText`, wrapped in
 * a header that records the source and revision. The admin "Seed standards"
 * action writes each row to standards_catalog/{id} with id = `${set}:${code}`.
 *
 * Usage: node scripts/build-standards.mjs <set> <subject> <csv> <revision> [--normalize-csv]
 *   e.g. node scripts/build-standards.mjs mn-ela-2020 ela config/standards/MN_ELA_Standards.csv "February 2024 (Corrected)"
 * --normalize-csv rewrites the CSV in place as UTF-8 with only the five columns
 * (Excel exports pad thousands of empty columns).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const COLUMNS = ['Grade', 'Strand', 'Anchor Standard', 'Code', 'Benchmark'];

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvField(value) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// Normalize typographic characters and whitespace from Word/Excel exports.
export function cleanText(value) {
  return value
    .replace(/ /g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/–/g, '-')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim();
}

export function normalizeGrade(value) {
  const g = cleanText(value).toUpperCase().replace(/\s+/g, '');
  if (g === 'K' || g === 'KINDERGARTEN') return 'K';
  return g;
}

export function buildBenchmarks(rows, set, subject) {
  const header = rows[0].map((h) => cleanText(h));
  const idx = COLUMNS.map((c) => header.indexOf(c));
  const missing = COLUMNS.filter((_, i) => idx[i] < 0);
  if (missing.length)
    throw new Error(`CSV missing columns: ${missing.join(', ')}`);
  const seen = new Set();
  const out = [];
  for (const raw of rows.slice(1)) {
    const [grade, strand, standard, code, text] = idx.map((i) =>
      cleanText(raw[i] ?? '')
    );
    if (!code || !text || !grade) continue; // blank or trailer rows
    if (seen.has(code)) throw new Error(`duplicate code ${code}`);
    seen.add(code);
    out.push({
      id: `${set}:${code}`,
      set,
      subject,
      code,
      grade: normalizeGrade(grade),
      strand,
      standard,
      text,
    });
  }
  return out;
}

// Excel exports are Windows-1252; the normalized file is UTF-8.
function decodeCsv(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(
      bytes
    );
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function main() {
  const args = process.argv.slice(2);
  const normalize = args.includes('--normalize-csv');
  const [set, subject, csvPath, revision] = args.filter(
    (a) => !a.startsWith('--')
  );
  if (!set || !subject || !csvPath || !revision) {
    console.error(
      'usage: build-standards.mjs <set> <subject> <csv> <revision> [--normalize-csv]'
    );
    process.exit(1);
  }
  const bytes = readFileSync(csvPath);
  const text = decodeCsv(bytes);
  const rows = parseCsv(text);
  const benchmarks = buildBenchmarks(rows, set, subject);

  if (normalize) {
    const header = rows[0].map((h) => cleanText(h));
    const idx = COLUMNS.map((c) => header.indexOf(c));
    const lines = [COLUMNS.join(',')];
    for (const raw of rows.slice(1)) {
      const cells = idx.map((i) => cleanText(raw[i] ?? ''));
      if (cells.every((c) => !c)) continue;
      lines.push(cells.map(csvField).join(','));
    }
    writeFileSync(csvPath, lines.join('\n') + '\n', 'utf8');
  }

  const outPath = path.join(path.dirname(csvPath), `${set}.json`);
  const doc = {
    set,
    subject,
    source: path.basename(csvPath),
    revision,
    count: benchmarks.length,
    benchmarks,
  };
  writeFileSync(outPath, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  console.log(`${outPath}: ${benchmarks.length} benchmarks`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename)
) {
  main();
}
