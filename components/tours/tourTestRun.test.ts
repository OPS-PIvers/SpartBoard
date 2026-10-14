import { describe, expect, it, vi } from 'vitest';

vi.mock('./tourState', () => ({ requestStartTour: vi.fn() }));

import {
  endTestRun,
  reportTestStep,
  startTestTour,
  testStepFound,
} from './tourTestRun';

describe('browser run results', () => {
  it('keeps a step found when its control closes after the click', () => {
    startTestTour({ set_id: 'r', steps: [] });
    reportTestStep({ index: 0, stepId: 'a', status: 'found' });
    reportTestStep({ index: 0, status: 'missing' });
    reportTestStep({ index: 1, stepId: 'b', status: 'missing' });
    expect(testStepFound(0)).toBe(true);
    expect(testStepFound(1)).toBe(false);
    endTestRun(true);
  });
});
