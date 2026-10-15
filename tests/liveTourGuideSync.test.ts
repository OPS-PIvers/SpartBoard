import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIVE_TOUR_GUIDE } from '@/functions/src/mcp/liveTourGuide';
import { dryRunTour } from '@/functions/src/mcp/tourDryRun';
import { OPEN_TOOLS_LABEL } from '@/functions/src/mcp/glLiveTour';

const GUIDE = resolve(process.cwd(), 'docs/live-tours/AUTHORING.md');
const SERVED = resolve(process.cwd(), 'functions/src/mcp/liveTourGuide.ts');
const text = readFileSync(GUIDE, 'utf8').replace(/\r\n/g, '\n');

interface Example {
  tour_widgets?: string[];
  materials?: unknown[];
  use_teacher_board?: boolean;
  steps: {
    id: string;
    label?: string;
    text?: string;
    tour: { anchor: string; action: string };
  }[];
}

const examples = [...text.matchAll(/```json tour-example\n([\s\S]*?)```/g)].map(
  (m) => JSON.parse(m[1]) as Example
);

describe('live tour authoring guide', () => {
  it('serves docs/live-tours/AUTHORING.md as written (UPDATE_TOUR_ANCHOR_LIST=1 rewrites it)', () => {
    if (process.env.UPDATE_TOUR_ANCHOR_LIST) {
      writeFileSync(
        SERVED,
        `// Generated from docs/live-tours/AUTHORING.md by tests/liveTourGuideSync.test.ts; rerun it with UPDATE_TOUR_ANCHOR_LIST=1.\nexport const LIVE_TOUR_GUIDE: string = ${JSON.stringify(text)};\n`
      );
      return;
    }
    expect(LIVE_TOUR_GUIDE).toBe(text);
  });

  it('has examples that pass the connector dry run without errors or warnings', () => {
    expect(examples.length).toBeGreaterThan(0);
    for (const example of examples) {
      const report = dryRunTour(
        example.steps,
        {
          widgets: example.tour_widgets ?? [],
          materials: example.materials,
          useTeacherBoard: example.use_teacher_board,
        },
        { bookends: 'error' }
      );
      expect(report).toEqual({ errors: [], warnings: [] });
    }
  });

  it("inserts Open Tools under the Dock button's English name", () => {
    const en = JSON.parse(
      readFileSync(resolve(process.cwd(), 'locales/en.json'), 'utf8')
    ) as { sidebar: { header: { openTools: string } } };
    expect(OPEN_TOOLS_LABEL).toBe(en.sidebar.header.openTools);
    expect(text).toContain(`**${OPEN_TOOLS_LABEL}**`);
  });
});
