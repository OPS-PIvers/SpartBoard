// E2 Help index: which widgets have a visible Help Center item, and which of those is a live tour. Read-only.
// node scripts/widget-grader/helpIndex.ts --project prod|dev [--out scripts/widget-grader/out/help-index.json]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HelpIndex } from './static/ecosystem.ts';

export interface HelpItemRow {
  kind?: unknown;
  visible?: unknown;
  widgetTypes?: unknown;
  setId?: unknown;
}

export interface TourSetRow {
  id: string;
  mode?: unknown;
  hasLiveTour?: unknown;
}

export const isLiveTourSet = (s: TourSetRow): boolean =>
  s.hasLiveTour === true || s.mode === 'tour';

export function buildHelpIndex(
  items: HelpItemRow[],
  sets: TourSetRow[]
): HelpIndex {
  const tours = new Set(sets.filter(isLiveTourSet).map((s) => s.id));
  const index: HelpIndex = {};
  for (const item of items) {
    if (item.visible !== true || !Array.isArray(item.widgetTypes)) continue;
    const tour =
      item.kind === 'guided-learning' &&
      typeof item.setId === 'string' &&
      tours.has(item.setId);
    for (const type of item.widgetTypes) {
      if (typeof type !== 'string') continue;
      const entry = (index[type] ??= { article: true, liveTour: false });
      entry.liveTour = Boolean(entry.liveTour) || tour;
    }
  }
  return index;
}

const PROJECTS: Record<string, string> = {
  dev: 'spartboard-dev',
  prod: 'spartboard',
};

async function main(argv: string[]): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = resolve(here, '../..');
  const arg = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const projectId = PROJECTS[arg('project') ?? ''];
  if (!projectId) {
    console.error('usage: helpIndex.ts --project prod|dev [--out <file>]');
    process.exit(2);
  }
  const out = resolve(
    root,
    arg('out') ?? 'scripts/widget-grader/out/help-index.json'
  );
  const { initializeApp, cert, applicationDefault } =
    await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  let credential = applicationDefault();
  if (projectId === 'spartboard') {
    const keyPath = join(root, 'scripts/service-account-key.json');
    const json =
      process.env.FIREBASE_SERVICE_ACCOUNT ??
      (existsSync(keyPath) ? readFileSync(keyPath, 'utf8') : null);
    if (!json) {
      console.error(
        'No prod credentials: set FIREBASE_SERVICE_ACCOUNT or add scripts/service-account-key.json'
      );
      process.exit(1);
    }
    credential = cert(JSON.parse(json) as Record<string, string>);
  }
  initializeApp({ credential, projectId });
  const db = getFirestore();
  const [items, sets] = await Promise.all([
    db.collection('help_resources').get(),
    db.collection('building_guided_learning').get(),
  ]);
  const index = buildHelpIndex(
    items.docs.map((d) => d.data() as HelpItemRow),
    sets.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<TourSetRow, 'id'>),
    }))
  );
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(index, null, 2)}\n`);
  console.log(
    `${Object.keys(index).length} widgets with Help items (${items.size} items read from ${projectId}) -> ${out}`
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main(process.argv.slice(2)).then(
    () => process.exit(0),
    (e: unknown) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
  );
