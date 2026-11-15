import { describe, expect, it } from 'vitest';
import {
  buildPage,
  embedJson,
  readState,
  type ReviewState,
} from '../../scripts/widget-grader/grading/review.ts';

const state: ReviewState = {
  weekId: '2026-11-16',
  candidates: [
    {
      id: 'clock-V2',
      widgetType: 'clock',
      widgetName: 'Clock',
      dimension: 'V2',
      branch: 'claude/widget-loop-clock-v2-2026-11-16',
      summary: 'Digits fill the widget at small sizes </script><b>x</b>',
      gains: [{ criterionId: 'V2', before: 1, after: 3 }],
      shots: [{ caption: 'Small', before: 'data:a', after: 'data:b' }],
    },
  ],
  decisions: { 'clock-V2': { choice: 'skip', note: 'not now' } },
  sentAt: null,
};

describe('review page', () => {
  it('round trips its state through the page', () => {
    expect(readState(buildPage(state))).toEqual(state);
  });

  it('escapes < so embedded text cannot close the state script', () => {
    expect(embedJson({ s: '</script>' })).not.toContain('<');
    const page = buildPage(state);
    expect(page.match(/<\/script>/g)).toHaveLength(2);
  });

  it('throws on a page with no state', () => {
    expect(() => readState('<p>hi</p>')).toThrow('No review state');
  });
});
