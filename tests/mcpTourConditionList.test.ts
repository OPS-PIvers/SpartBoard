import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOUR_DONE_FACTS, TOUR_FACTS } from '@/config/tourConditions';
import { ALL_GLOBAL_FEATURES } from '@/config/featureDefaults';
import {
  TOUR_CONDITION_FACTS,
  TOUR_CONDITION_DONE_FACTS,
  TOUR_CONDITION_FEATURES,
} from '@/functions/src/mcp/tourConditionList';
import { writeGenerated } from './helpers/writeGenerated';

const FILE = resolve(process.cwd(), 'functions/src/mcp/tourConditionList.ts');

const expected = () => ({
  facts: Object.entries(TOUR_FACTS).map(([id, label]) => ({ id, label })),
  done: [...TOUR_DONE_FACTS],
  features: [...ALL_GLOBAL_FEATURES].sort(),
});

describe('connector tour condition list', () => {
  it('matches config/tourConditions.ts (UPDATE_TOUR_ANCHOR_LIST=1 rewrites it)', async () => {
    const want = expected();
    if (process.env.UPDATE_TOUR_ANCHOR_LIST) {
      await writeGenerated(
        FILE,
        `// Generated from config/tourConditions.ts by tests/mcpTourConditionList.test.ts; rerun it with UPDATE_TOUR_ANCHOR_LIST=1.\nexport const TOUR_CONDITION_FACTS: ReadonlyArray<{ id: string; label: string }> = ${JSON.stringify(want.facts, null, 2)};\n\nexport const TOUR_CONDITION_DONE_FACTS: readonly string[] = ${JSON.stringify(want.done, null, 2)};\n\nexport const TOUR_CONDITION_FEATURES: readonly string[] = ${JSON.stringify(want.features, null, 2)};\n`
      );
      return;
    }
    expect({
      facts: TOUR_CONDITION_FACTS,
      done: TOUR_CONDITION_DONE_FACTS,
      features: TOUR_CONDITION_FEATURES,
    }).toEqual(want);
  });
});
