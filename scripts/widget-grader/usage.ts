// Boards per widget type (R9), read-only: node scripts/widget-grader/usage.ts --project prod
// Writes only aggregate counts to docs/widget-rubric/usage.json; no ids, names or content leave the script.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import type { UsageFile } from './queue.ts';

const PROJECTS: Record<string, string> = {
  dev: 'spartboard-dev',
  prod: 'spartboard',
};
const PAGE_SIZE = 300;
const BOARD_PATH = /^users\/[^/]+\/dashboards\/[^/]+$/;

/** Adds one board's widget types to the counts; a type counts once per board. */
export function countBoard(
  counts: Record<string, number>,
  widgets: unknown
): void {
  if (!Array.isArray(widgets)) return;
  const types = new Set<string>();
  for (const w of widgets) {
    const type = (w as { type?: unknown } | null)?.type;
    if (typeof type === 'string' && type) types.add(type);
  }
  for (const t of types) counts[t] = (counts[t] ?? 0) + 1;
}

export function usageFile(
  project: string,
  boards: number,
  counts: Record<string, number>,
  now = new Date()
): UsageFile {
  const sorted: Record<string, number> = {};
  for (const t of Object.keys(counts).sort()) sorted[t] = counts[t];
  return { generatedAt: now.toISOString(), project, boards, counts: sorted };
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1].replace(/\\/g, '/');

if (isMain) {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = join(here, '..', '..');
  const args = process.argv.slice(2);
  const at = args.indexOf('--project');
  const project = PROJECTS[at >= 0 ? (args[at + 1] ?? '') : ''];
  if (!project) {
    console.error(
      'Usage: node scripts/widget-grader/usage.ts --project prod|dev'
    );
    process.exit(1);
  }
  const { initializeApp, cert, applicationDefault } =
    await import('firebase-admin/app');
  const { getFirestore, FieldPath } = await import('firebase-admin/firestore');
  const keyPath = join(root, 'scripts', 'service-account-key.json');
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
  const credential =
    project === 'spartboard'
      ? fromEnv
        ? cert(JSON.parse(fromEnv))
        : existsSync(keyPath)
          ? cert(JSON.parse(readFileSync(keyPath, 'utf8')))
          : null
      : applicationDefault();
  if (!credential) {
    console.error(
      'No prod credentials: set FIREBASE_SERVICE_ACCOUNT or add scripts/service-account-key.json'
    );
    process.exit(1);
  }
  initializeApp({ credential, projectId: project });
  const db = getFirestore();
  const counts: Record<string, number> = {};
  let boards = 0;
  let last: QueryDocumentSnapshot | null = null;
  for (;;) {
    let q = db
      .collectionGroup('dashboards')
      .orderBy(FieldPath.documentId())
      .select('widgets')
      .limit(PAGE_SIZE);
    if (last) q = q.startAfter(last);
    const page = await q.get();
    for (const doc of page.docs) {
      if (!BOARD_PATH.test(doc.ref.path)) continue;
      boards++;
      countBoard(counts, doc.get('widgets'));
    }
    if (page.size < PAGE_SIZE) break;
    last = page.docs[page.docs.length - 1];
    process.stdout.write(`\r${boards} boards`);
  }
  const out = join(root, 'docs', 'widget-rubric', 'usage.json');
  writeFileSync(
    out,
    `${JSON.stringify(usageFile(project, boards, counts), null, 2)}\n`
  );
  console.log(
    `\n${boards} boards, ${Object.keys(counts).length} widget types. Wrote ${out}`
  );
}
