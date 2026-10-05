// Grader sweep: one test per widget type. Configure with GRADER_TYPES, GRADER_FIXTURES and GRADER_OUT (see run.ts).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import {
  UNSUPPORTED_FIXTURES,
  WIDGET_FIXTURES,
} from '../../../components/dev/widgetGrader/fixtures';
import type { FixtureName } from '../types';
import { loadThresholds, REPO_ROOT } from './constants';
import { HarnessUnsupported, measureWidget } from './measureWidget';

const ALL_FIXTURES: FixtureName[] = ['empty', 'typical', 'stress'];
const requested = (process.env.GRADER_TYPES ?? '').split(',').filter(Boolean);
const types = Object.keys(WIDGET_FIXTURES)
  .filter((t) => !(t in UNSUPPORTED_FIXTURES))
  .filter((t) => requested.length === 0 || requested.includes(t))
  .sort();
const fixtures = (process.env.GRADER_FIXTURES ?? '')
  .split(',')
  .filter((f): f is FixtureName => (ALL_FIXTURES as string[]).includes(f));
// The harness gives every instance the board's rosters, so their names aren't a G4 leak.
const sharedRosterText = (type: string): string =>
  (WIDGET_FIXTURES[type as keyof typeof WIDGET_FIXTURES]?.typical.rosters ?? [])
    .flatMap((r) => [
      r.name,
      ...r.students.flatMap((st) => [st.firstName, st.lastName]),
    ])
    .join(' ');
const outDir =
  process.env.GRADER_OUT ?? join(REPO_ROOT, 'scripts/widget-grader/out/adhoc');

test.describe('widget grader', () => {
  for (const type of types) {
    test(type, async ({ page }) => {
      try {
        const measurements = await measureWidget(page, type, {
          outDir,
          thresholds: loadThresholds(),
          fixtures: fixtures.length ? fixtures : ALL_FIXTURES,
          sharedText: sharedRosterText(type),
        });
        const dir = join(outDir, 'measurements');
        mkdirSync(dir, { recursive: true });
        writeFileSync(
          join(dir, `${type}.json`),
          `${JSON.stringify(measurements, null, 2)}\n`
        );
      } catch (err) {
        if (err instanceof HarnessUnsupported) test.skip(true, err.message);
        throw err;
      }
    });
  }
});
