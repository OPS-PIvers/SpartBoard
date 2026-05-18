#!/usr/bin/env node
/**
 * Drafts a "What's New" changelog entry from recent git commits and prints it
 * to stdout. The output is intentionally a *draft* — paste it into
 * public/changelog.json and rewrite the highlight text in user-friendly
 * language before committing.
 *
 * Usage:
 *   pnpm changelog:draft                       # since the last entry's date
 *   pnpm changelog:draft -- --since 2026-05-01 # since an explicit date
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = path.resolve(__dirname, '../public');
const changelogPath = path.join(publicDir, 'changelog.json');

const args = process.argv.slice(2);
const sinceIdx = args.indexOf('--since');
const sinceOverride = sinceIdx >= 0 ? args[sinceIdx + 1] : null;

const readLastEntryDate = () => {
  if (!fs.existsSync(changelogPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(changelogPath, 'utf8'));
    return parsed?.entries?.[0]?.date ?? null;
  } catch {
    return null;
  }
};

const since = sinceOverride ?? readLastEntryDate();
const sinceArg = since ? `--since=${since}` : '--max-count=50';

const rawLog = execSync(
  `git log ${sinceArg} --pretty=format:'%s' --no-merges`,
  { encoding: 'utf8' }
).trim();

const lines = rawLog ? rawLog.split('\n') : [];

const classify = (subject) => {
  // Strip surrounding quotes that some shells leave behind.
  const s = subject.replace(/^['"]|['"]$/g, '').trim();
  if (/^feat(\(|:)/i.test(s)) return 'feature';
  if (/^fix(\(|:)/i.test(s)) return 'fix';
  if (/^(perf|refactor|harden|audit)(\(|:)/i.test(s)) return 'improvement';
  if (/^(docs|chore|test|style|ci|build)(\(|:)/i.test(s)) return null;
  return null;
};

const stripPrefix = (subject) =>
  subject
    .replace(/^['"]|['"]$/g, '')
    .replace(/^[a-z]+(\([^)]+\))?:\s*/i, '')
    .replace(/\s*\(#\d+\)$/, '')
    .trim();

const highlights = [];
for (const line of lines) {
  const type = classify(line);
  if (!type) continue;
  highlights.push({
    type,
    text: stripPrefix(line) + ' [TODO: rewrite for users]',
  });
}

const today = new Date().toISOString().slice(0, 10);
const versionGuess = today.replace(/-/g, '.');

const draftEntry = {
  version: versionGuess,
  date: today,
  title: 'TODO: short release title',
  highlights:
    highlights.length > 0
      ? highlights
      : [
          {
            type: 'improvement',
            text: 'TODO: describe what changed for users.',
          },
        ],
};

process.stdout.write(
  `// Draft entry — paste at the top of public/changelog.json entries[] and polish the text.\n` +
    `// Sourced from ${lines.length} commit(s)` +
    (since ? ` since ${since}` : ' (no prior entry — last 50 commits)') +
    `.\n` +
    JSON.stringify(draftEntry, null, 2) +
    '\n'
);
