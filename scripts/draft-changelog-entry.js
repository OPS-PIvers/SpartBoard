#!/usr/bin/env node
/**
 * Drafts a "What's New" changelog entry from recent git commits and prints it
 * to stdout. The output is intentionally a *draft* — paste it into
 * public/changelog.json and rewrite every bullet before committing. The rules
 * are in docs/DEV_WORKFLOW.md ("How to write a release note"); commit subjects
 * are never publishable as written.
 *
 * Usage:
 *   pnpm changelog:draft                       # since the last entry's date
 *   pnpm changelog:draft --since 2026-05-01    # since an explicit date
 *
 * Also prints a placeholder widget note for every widget changed since origin/main.
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { changedWidgetTypes } from './checkReleaseWidgetNotes.ts';
import { resolveWidgetFiles } from './widget-grader/widgetFiles.ts';

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

let rawLog = '';
try {
  rawLog = execSync(`git log ${sinceArg} --pretty=format:'%s' --no-merges`, {
    encoding: 'utf8',
  }).trim();
} catch (err) {
  console.warn(
    `git log failed (${err.message}); emitting an empty draft so you can fill it in by hand.`
  );
}

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
const skipped = [];
for (const line of lines) {
  const type = classify(line);
  if (!type) {
    skipped.push(line);
    continue;
  }
  highlights.push({
    type,
    text: stripPrefix(line) + ' [TODO: rewrite for users]',
  });
}

if (skipped.length > 0) {
  // Surface skipped commits on stderr so devs can spot commits that didn't
  // match a conventional prefix (e.g. capitalized subjects, plain merges).
  // Keeps stdout pure JSON so it can be piped/redirected cleanly.
  console.warn(
    `\nSkipped ${skipped.length} commit(s) with no recognized prefix:`
  );
  for (const s of skipped) console.warn(`  - ${s}`);
  console.warn('');
}

const today = new Date().toISOString().slice(0, 10);
const versionGuess = today.replace(/-/g, '.');

const drafted =
  highlights.length > 0
    ? highlights
    : [{ type: 'improvement', text: 'TODO: describe what changed for users.' }];

// Mirrors GROUP_ORDER in WhatsNewModal so a draft spanning several commit types
// gets one overview section per type rather than filing them all under the first.
const OVERVIEW_TYPE_ORDER = ['feature', 'improvement', 'fix'];

// Matches the shape WhatsNewModal renders: `overview` is the summary every user
// sees, `details` is the "Read full update" disclosure. Both are user-facing.
const draftEntry = {
  version: versionGuess,
  date: today,
  title: 'TODO: short release title',
  overview: OVERVIEW_TYPE_ORDER.filter((type) =>
    drafted.some((h) => h.type === type)
  ).map((type) => ({
    type,
    subtitle: 'TODO: the area this touches, e.g. Quizzes',
    items: drafted
      .filter((h) => h.type === type)
      .map((h) => ({ text: h.text })),
  })),
  details: drafted,
};

process.stdout.write(
  `// Draft entry — paste at the top of public/changelog.json entries[].\n` +
    `// Rewrite every bullet first: see "How to write a release note" in docs/DEV_WORKFLOW.md.\n` +
    `// Sourced from ${lines.length} commit(s)` +
    (since ? ` since ${since}` : ' (no prior entry — last 50 commits)') +
    `.\n` +
    JSON.stringify(draftEntry, null, 2) +
    '\n'
);

// One placeholder note per widget whose files changed since the last release.
let widgetTypes = [];
try {
  const changed = execSync('git diff --name-only origin/main...HEAD', {
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);
  widgetTypes = changedWidgetTypes(
    changed,
    resolveWidgetFiles(path.resolve(__dirname, '..'))
  );
} catch (err) {
  console.warn(`Could not list changed widgets (${err.message}).`);
}
if (widgetTypes.length > 0) {
  const notes = widgetTypes.map((widget) => ({
    id: `${today}-${widget}`,
    widget,
    date: today,
    text: 'TODO: one or two sentences on what teachers will notice, or delete this note',
    feature: 'TODO: the flag gating this change, or delete this line',
  }));
  process.stdout.write(
    `\n// Widget notes — add to the top-level "widgetNotes" array, or put "no-widget-note: <widget> <why>" in the release PR.\n` +
      JSON.stringify(notes, null, 2) +
      '\n'
  );
}
