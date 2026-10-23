import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';

const store = vi.hoisted(() => ({
  saved: [] as GuidedLearningSet[],
  drafts: new Map<string, GuidedLearningSet>(),
}));
vi.mock('@/components/tours/webTours', () => ({
  loadWebTourDraft: (id: string) =>
    Promise.resolve(store.drafts.get(id) ?? null),
  saveWebTourDraft: (set: GuidedLearningSet) => {
    store.saved.push(set);
    return Promise.resolve();
  },
  uploadWebTourPicture: (setId: string) =>
    Promise.resolve(`web_tours/${setId}/p.jpg`),
  listWebTourDrafts: () =>
    Promise.resolve([
      { id: 'old', title: 'Old', updatedAt: 1 },
      { id: 'new', title: 'New', updatedAt: 5 },
    ]),
}));

import {
  appendRecordedSteps,
  intakeDraftFor,
  intakeDrafts,
} from './intakeSave';
import {
  parseIntakePageMessage,
  parseIntakePortMessage,
  stepForPage,
  type RecordedWebStep,
} from './recorderProtocol';

const step = (id: string, picture = false): RecordedWebStep => ({
  id,
  urlPattern: 'https://docs.google.com/document/d/*/edit',
  action: 'click',
  locator: { role: 'button', name: `Step ${id}` },
  ...(picture
    ? { picture: { dataUrl: 'data:image/jpeg;base64,AAAA', w: 10, h: 10 } }
    : {}),
});

beforeEach(() => {
  store.saved = [];
  store.drafts.clear();
});

describe('intake saving', () => {
  it('makes a new titled draft and finds no draft that is gone', async () => {
    const made = await intakeDraftFor({ kind: 'new', title: '  Apps Script ' });
    expect(made?.title).toBe('Apps Script');
    expect(store.saved).toHaveLength(1);
    expect(await intakeDraftFor({ kind: 'append', setId: 'gone' })).toBeNull();
  });

  it("saves a new draft's goal, scrubbed", async () => {
    const made = await intakeDraftFor({
      kind: 'new',
      title: 'T',
      goal: ' Grades for 4821937 ',
    });
    expect(made?.webGoal).toBe('Grades for •••');
    const bare = await intakeDraftFor({ kind: 'new', title: 'T', goal: ' ' });
    expect(bare && 'webGoal' in bare).toBe(false);
  });

  it('acks each step only after it is saved, and skips one sent again', async () => {
    const set = await intakeDraftFor({ kind: 'new', title: 'T' });
    if (!set) throw new Error('no draft');
    const acks: string[] = [];
    const after = await appendRecordedSteps(
      set,
      [step('a', true), step('b')],
      (id) => acks.push(`${id}@${store.saved.length}`)
    );
    expect(acks).toEqual(['a@2', 'b@3']);
    expect(after.steps.map((s) => s.id)).toEqual(['a', 'b']);
    expect(after.steps[0].web?.picture?.path).toBe(`web_tours/${set.id}/p.jpg`);
    const again = await appendRecordedSteps(after, [step('b')], (id) =>
      acks.push(id)
    );
    expect(again.steps).toHaveLength(2);
    expect(store.saved).toHaveLength(3);
    expect(acks.at(-1)).toBe('b');
  });

  it('lists drafts newest first', async () => {
    expect(await intakeDrafts()).toEqual([
      { setId: 'new', title: 'New' },
      { setId: 'old', title: 'Old' },
    ]);
  });
});

describe('intake messages', () => {
  it('accepts a save of up to ten steps and nothing malformed', () => {
    const save = {
      type: 'intake/save',
      jobId: 'job-1',
      target: { kind: 'new', title: 'T' },
      steps: [step('a')],
    };
    expect(parseIntakePortMessage(save)).toEqual(save);
    expect(
      parseIntakePortMessage({
        ...save,
        steps: Array.from({ length: 11 }, (_, i) => step(`s${i}`)),
      })
    ).toBeNull();
    expect(
      parseIntakePortMessage({
        ...save,
        target: { kind: 'append', setId: '../x' },
      })
    ).toBeNull();
    expect(parseIntakePortMessage({ ...save, jobId: 'a b' })).toBeNull();
    const noted = {
      ...save,
      target: { kind: 'new', title: 'T', goal: 'Grading' },
      steps: [{ ...step('a'), note: 'why' }],
    };
    expect(parseIntakePortMessage(noted)).toEqual(noted);
    expect(
      parseIntakePortMessage({
        ...save,
        target: { kind: 'new', title: 'T', goal: 'x'.repeat(501) },
      })
    ).toBeNull();
    expect(
      parseIntakePortMessage({
        ...save,
        steps: [{ ...step('a'), note: 'x'.repeat(501) }],
      })
    ).toBeNull();
    expect(parseIntakePortMessage({ type: 'intake/listDrafts' })).toEqual({
      type: 'intake/listDrafts',
    });
  });

  it('sends a note only to a page on protocol 5', () => {
    const noted = { ...step('a'), note: 'why' };
    expect(stepForPage(noted, 5)).toEqual(noted);
    expect(stepForPage(noted, 4)).toEqual(step('a'));
    expect(stepForPage(noted, 0)).toEqual(step('a'));
  });

  it('reads the page replies and drops extra fields', () => {
    expect(
      parseIntakePageMessage({
        type: 'intake/ready',
        drafts: [{ setId: 'd1', title: 'One', extra: 1 }],
      })
    ).toEqual({
      type: 'intake/ready',
      drafts: [{ setId: 'd1', title: 'One' }],
    });
    expect(
      parseIntakePageMessage({ type: 'intake/ack', jobId: 'j', stepId: 's' })
    ).toEqual({ type: 'intake/ack', jobId: 'j', stepId: 's' });
    expect(
      parseIntakePageMessage({ type: 'intake/ack', jobId: 'j' })
    ).toBeNull();
    expect(
      parseIntakePageMessage({ type: 'intake/created', jobId: 'j' })
    ).toBeNull();
  });
});
