// Release PR check: every widget whose files changed needs a new widget note or a `no-widget-note:` line in the PR body.
// node scripts/checkReleaseWidgetNotes.ts --base origin/main   (PR body in $PR_BODY)

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveWidgetFiles,
  type WidgetFiles,
} from './widget-grader/widgetFiles.ts';

const CHANGELOG = 'public/changelog.json';

/** Widget types owning a changed file; shared window and config files name no widget. */
export function changedWidgetTypes(
  changed: string[],
  files: Record<string, WidgetFiles>
): string[] {
  const types = new Set<string>();
  for (const path of changed) {
    if (/\.(test|spec)\.tsx?$/.test(path)) continue;
    for (const w of Object.values(files)) {
      const owned =
        (w.folder !== null && path.startsWith(`${w.folder}/`)) ||
        path === w.entry ||
        w.frontFace.includes(path) ||
        w.settings.includes(path);
      if (owned) types.add(w.type);
    }
  }
  return [...types].sort();
}

/** Note ids from a changelog.json source, keyed by widget type. */
export function noteIdsByWidget(
  source: string | null
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  if (!source) return out;
  const parsed: unknown = JSON.parse(source);
  const notes =
    typeof parsed === 'object' && parsed !== null && 'widgetNotes' in parsed
      ? parsed.widgetNotes
      : [];
  if (!Array.isArray(notes)) return out;
  for (const n of notes) {
    if (typeof n?.id !== 'string' || typeof n?.widget !== 'string') continue;
    if (!out.has(n.widget)) out.set(n.widget, new Set());
    out.get(n.widget)?.add(n.id);
  }
  return out;
}

/** Widget types the PR body excuses with `no-widget-note: <type> <why>`; a reason is required. */
export function excusedTypes(body: string): Set<string> {
  const out = new Set<string>();
  for (const m of body.matchAll(
    /^[\s>*-]*`?no-widget-note:\s*([A-Za-z0-9-]+)\b[\s:,–—-]*(\S.*)$/gim
  )) {
    out.add(m[1]);
  }
  return out;
}

export function missingNotes(
  changedTypes: string[],
  baseNotes: Map<string, Set<string>>,
  headNotes: Map<string, Set<string>>,
  excused: Set<string>
): string[] {
  return changedTypes.filter((type) => {
    if (excused.has(type)) return false;
    const before = baseNotes.get(type) ?? new Set();
    return ![...(headNotes.get(type) ?? [])].some((id) => !before.has(id));
  });
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1].replace(/\\/g, '/');

if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const args = process.argv.slice(2);
  const at = args.indexOf('--base');
  const base = (at >= 0 && args[at + 1]) || 'origin/main';
  const git = (...a: string[]) =>
    execFileSync('git', a, { cwd: root, encoding: 'utf8' });
  const changed = git('diff', '--name-only', `${base}...HEAD`)
    .split('\n')
    .filter(Boolean);
  const types = changedWidgetTypes(changed, resolveWidgetFiles(root));
  let baseSource: string | null = null;
  try {
    baseSource = git('show', `${base}:${CHANGELOG}`);
  } catch {
    baseSource = null;
  }
  const missing = missingNotes(
    types,
    noteIdsByWidget(baseSource),
    noteIdsByWidget(readFileSync(join(root, CHANGELOG), 'utf8')),
    excusedTypes(process.env.PR_BODY ?? '')
  );

  const lines = [
    `Widgets changed in this release: ${types.join(', ') || 'none'}.`,
    missing.length
      ? [
          `Missing a widget note: ${missing.join(', ')}.`,
          '',
          `For each one, add a note to "widgetNotes" in ${CHANGELOG} (give it "feature" when a flag still gates the change),`,
          'or add a line to the PR description saying why teachers will not notice, e.g.',
          `  no-widget-note: ${missing[0]} internal refactor, nothing on screen changed`,
          'See "Widget notes" in docs/DEV_WORKFLOW.md.',
        ].join('\n')
      : 'Every changed widget has a new note or a no-widget-note line.',
  ];
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Widget notes\n\n\`\`\`\n${lines.join('\n')}\n\`\`\`\n`
    );
  }
  if (missing.length) process.exit(1);
}
