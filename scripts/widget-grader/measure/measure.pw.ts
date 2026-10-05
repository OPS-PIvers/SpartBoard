// Grader sweep: one test per widget type. Configure with GRADER_TYPES, GRADER_FIXTURES and GRADER_OUT (see run.ts).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import {
  UNSUPPORTED_FIXTURES,
  WIDGET_FIXTURES,
} from '../../../components/dev/widgetGrader/fixtures';
import type { FixtureName } from '../types';
import { resolveWidgetFiles } from '../widgetFiles';
import { chunkBytes, distSize, loadManifest } from './chunks';
import { loadThresholds, PARTIAL_COVERAGE, REPO_ROOT } from './constants';
import { measureExtras } from './extras';
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
// Gate runs (CI) skip the renders that only feed criteria.
const gatesOnly = process.env.GRADER_GATES_ONLY === '1';
const manifest = gatesOnly ? null : loadManifest(REPO_ROOT);
const entries = manifest ? resolveWidgetFiles(REPO_ROOT) : {};

test.describe('widget grader', () => {
  for (const type of types) {
    test(type, async ({ page }) => {
      try {
        const started = Date.now();
        const measurements = await measureWidget(page, type, {
          outDir,
          thresholds: loadThresholds(),
          fixtures: fixtures.length ? fixtures : ALL_FIXTURES,
          sharedText: sharedRosterText(type),
          gatesOnly,
        });
        if (process.env.GRADER_TRACE)
          console.log(
            `${type} base ${((Date.now() - started) / 1000).toFixed(1)}s`
          );
        if (
          !gatesOnly &&
          (fixtures.length === 0 || fixtures.includes('typical'))
        ) {
          const g4 = measurements.find((m) => m.gate === 'G4' && !m.size);
          const entry = entries[type]?.entry;
          measurements.push(
            ...(await measureExtras(page, type, {
              chunkBytes:
                manifest && entry
                  ? chunkBytes(manifest, entry, distSize(REPO_ROOT))
                  : null,
              g4Pass: g4 ? (g4.pass ?? null) : null,
              partial: PARTIAL_COVERAGE[type],
            }))
          );
        }
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
