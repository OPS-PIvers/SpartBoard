import { describe, expect, it, vi } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  parseDetailsRequest,
  parseDetailsResponse,
  runHelpDetails,
  tourFacts,
  type DetailsDeps,
} from './helpCenterDetails';

const item = {
  kind: 'guided-learning',
  setId: 'set-1',
  orgId: 'orono',
  title: 'Old title',
  description: '',
  categoryId: 'boards-widgets',
  widgetTypes: ['clock'],
};
const set = {
  steps: [
    {
      label: 'Open it',
      text: 'Click **Open Tools**.',
      tour: { anchor: 'dock.open-tools' },
    },
  ],
  tourSetup: { widgets: ['clock'] },
};
const categories = [
  { id: 'boards-widgets', name: 'Boards & widgets' },
  { id: 'quizzes-activities', name: 'Quizzes & activities' },
];
const token = { email: 'a@x.org', email_verified: true };

const deps = (over: Partial<DetailsDeps> = {}): DetailsDeps => ({
  isAdmin: vi.fn(() => Promise.resolve(true)),
  canWriteItem: vi.fn(() => Promise.resolve(true)),
  flagsOn: vi.fn(() => Promise.resolve(true)),
  loadItem: vi.fn(() => Promise.resolve(item)),
  loadSet: vi.fn(() => Promise.resolve(set)),
  loadCategories: vi.fn(() => Promise.resolve(categories)),
  charge: vi.fn(() => Promise.resolve(['doc-1'])),
  refund: vi.fn(() => Promise.resolve(undefined)),
  generate: vi.fn(() =>
    Promise.resolve(
      JSON.stringify({
        title: 'Show the time',
        description: 'Put a clock on your board.',
        categoryId: 'quizzes-activities',
        audience: 'teachers',
        widgetTypes: ['clock', 'time-tool'],
      })
    )
  ),
  ...over,
});

const req = parseDetailsRequest({
  itemId: 'item-1',
  audiences: ['subs', 'bogus'],
  widgets: [
    { id: 'clock', label: 'Clock' },
    { id: 'time-tool', label: 'Timer' },
    { id: 'nope', label: 'Nope' },
  ],
});

describe('parseDetailsRequest', () => {
  it('keeps teachers, known audiences and known widgets', () => {
    expect(req.audiences).toEqual(['teachers', 'subs']);
    expect(req.widgets.map((w) => w.id)).toEqual(['clock', 'time-tool']);
  });
  it('refuses a path in the id', () => {
    expect(() => parseDetailsRequest({ itemId: 'a/b' })).toThrow(HttpsError);
  });
});

describe('runHelpDetails', () => {
  it('returns the generated fields', async () => {
    const d = deps();
    await expect(runHelpDetails(req, 'u1', token, d)).resolves.toEqual({
      title: 'Show the time',
      description: 'Put a clock on your board.',
      categoryId: 'quizzes-activities',
      audience: 'teachers',
      widgetTypes: ['clock', 'time-tool'],
    });
    expect(d.charge).toHaveBeenCalledOnce();
  });

  it('refuses a non-admin before charging', async () => {
    const d = deps({ isAdmin: vi.fn(() => Promise.resolve(false)) });
    await expect(runHelpDetails(req, 'u1', token, d)).rejects.toThrow(
      /not turned on/
    );
    expect(d.charge).not.toHaveBeenCalled();
  });

  it('refuses when the flag is off', async () => {
    const d = deps({ flagsOn: vi.fn(() => Promise.resolve(false)) });
    await expect(runHelpDetails(req, 'u1', token, d)).rejects.toThrow(
      /not turned on/
    );
  });

  it("refuses another organization's item", async () => {
    const d = deps({ canWriteItem: vi.fn(() => Promise.resolve(false)) });
    await expect(runHelpDetails(req, 'u1', token, d)).rejects.toThrow(
      /can't change/
    );
    expect(d.charge).not.toHaveBeenCalled();
  });

  it('refuses an item with no tour', async () => {
    const d = deps({
      loadItem: vi.fn(() => Promise.resolve({ ...item, setId: null })),
    });
    await expect(runHelpDetails(req, 'u1', token, d)).rejects.toThrow(
      /not found/
    );
  });

  it('gives the charge back when the model fails', async () => {
    const d = deps({
      generate: vi.fn(() => Promise.reject(new Error('boom'))),
    });
    await expect(runHelpDetails(req, 'u1', token, d)).rejects.toThrow(
      /couldn't fill/
    );
    expect(d.refund).toHaveBeenCalledWith(['doc-1']);
  });

  it('passes the daily limit error through', async () => {
    const d = deps({
      charge: vi.fn(() =>
        Promise.reject(new HttpsError('resource-exhausted', 'limit'))
      ),
    });
    await expect(runHelpDetails(req, 'u1', token, d)).rejects.toThrow('limit');
    expect(d.generate).not.toHaveBeenCalled();
  });
});

describe('parseDetailsResponse', () => {
  const facts = tourFacts(item, set);
  it('falls back to current values for anything not allowed', () => {
    const out = parseDetailsResponse(
      JSON.stringify({
        title: '',
        description: 'New words.',
        categoryId: 'made-up',
        audience: 'students',
        widgetTypes: ['nope', 'clock', 'clock'],
      }),
      facts,
      categories.map((c) => c.id),
      req
    );
    expect(out).toEqual({
      title: 'Old title',
      description: 'New words.',
      categoryId: 'boards-widgets',
      audience: 'teachers',
      widgetTypes: ['clock'],
    });
  });
});
