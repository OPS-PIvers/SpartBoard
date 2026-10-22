import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const run = (view: unknown) => {
  const dir = mkdtempSync(join(tmpdir(), 'run-live-tour-'));
  const file = join(dir, 'tour.json');
  writeFileSync(file, JSON.stringify(view));
  return spawnSync(
    process.execPath,
    ['scripts/run-live-tour.mjs', file, '--out', join(dir, 'out')],
    { encoding: 'utf8', timeout: 30_000 }
  );
};

describe('run-live-tour', () => {
  it('refuses a web tour before opening a browser', () => {
    const marked = run({ set_id: 't1', surface: 'web', steps: [] });
    expect(marked.status).toBe(2);
    expect(marked.stderr).toMatch(/web tour/);
    const byStep = run({
      set_id: 't1',
      steps: [{ id: 'a', web: { urlPattern: 'https://example.org/*' } }],
    });
    expect(byStep.status).toBe(2);
    expect(byStep.stderr).toMatch(/web tour/);
  });
});
