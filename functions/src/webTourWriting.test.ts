// Write with Claude for web tours: request parsing, the prompt, response caps and gating.
import { describe, it, expect, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: vi.fn(),
  storage: vi.fn(),
}));
vi.mock('firebase-functions/v2/https', () => {
  class FakeHttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return { onCall: (_o: unknown, h: unknown) => h, HttpsError: FakeHttpsError };
});
vi.mock('./functionsInit', () => ({}));
vi.mock('./classlinkShared', () => ({ ALLOWED_ORIGINS: [] }));
vi.mock('./aiGeneration', () => ({
  recordAiUsage: vi.fn(),
  resolveCallerIsAdmin: vi.fn(),
}));
vi.mock('./aiRouter', () => ({
  generateAi: vi.fn(),
  AiUnavailableError: class AiUnavailableError extends Error {},
}));
vi.mock('./mcp/glTools', () => ({ MAX_SLIDE_BYTES: 3_500_000 }));

import { AiUnavailableError } from './aiRouter';
import {
  buildWritingParts,
  parseWritingRequest,
  parseWritingResponse,
  runWebTourWriting,
  type StoredWebTour,
  type WritingDeps,
  type WritingRequest,
} from './webTourWriting';

const tour = (): StoredWebTour => ({
  title: 'Post a grade',
  surface: 'web',
  webGoal: 'How to post a grade in Schoology',
  steps: [
    {
      id: 'a',
      label: 'Click Gradebook',
      text: '',
      web: {
        urlPattern: 'https://orono.schoology.com/course/*',
        action: 'click',
        note: 'start here every time',
        picture: { path: 'web_tour_pictures/set1/a.jpg' },
        locator: {
          role: 'link',
          name: 'Gradebook',
          heading: 'Course',
          pageTitle: 'Biology | Schoology',
          css: 'nav > a:nth-child(3)',
        },
      },
    },
    {
      id: 'b',
      label: 'Save the grade',
      text: 'Saves it.',
      web: {
        urlPattern: 'https://orono.schoology.com/course/*/grades',
        action: 'click',
        picture: { path: 'web_tour_pictures/other/b.jpg' },
        locator: { role: 'button', name: 'Save' },
      },
    },
  ],
});

const req = (
  steps: WritingRequest['steps'] = [{ id: 'a', fields: ['title', 'tip'] }]
): WritingRequest => ({ setId: 'set1', steps });

describe('parseWritingRequest', () => {
  it('keeps the set id and each step with title, tip or both', () => {
    expect(
      parseWritingRequest({
        setId: 'set1',
        steps: [{ id: 'a', fields: ['tip', 'title'] }],
      })
    ).toEqual(req());
  });

  it('refuses bad ids, repeats, unknown fields and too many steps', () => {
    const ok = { id: 'a', fields: ['tip'] };
    for (const bad of [
      { setId: '../x', steps: [ok] },
      { setId: 'set1', steps: [] },
      { setId: 'set1', steps: [ok, ok] },
      { setId: 'set1', steps: [{ id: 'a', fields: ['label'] }] },
      { setId: 'set1', steps: [{ id: 'a', fields: [] }] },
      {
        setId: 'set1',
        steps: Array.from({ length: 13 }, (_, i) => ({
          id: `s${i}`,
          fields: ['tip'],
        })),
      },
    ])
      expect(() => parseWritingRequest(bad)).toThrow();
  });
});

describe('buildWritingParts', () => {
  it('sends the goal, every step with its clues and notes, and pictures of the steps to write', () => {
    const parts = buildWritingParts(
      tour(),
      req(),
      new Map([['a', { mimeType: 'image/jpeg', data: 'AAAA' }]])
    );
    const text = parts[0].text ?? '';
    expect(text).toContain('Goal: How to post a grade in Schoology');
    expect(text).toContain('Step 1 (id a) - write: title, tip');
    expect(text).toContain('Page title: Biology | Schoology');
    expect(text).toContain('Nearby heading: Course');
    expect(text).toContain("Admin's note: start here every time");
    expect(text).toContain('Step 2 (id b)\n');
    expect(text).toContain('Current tip: Saves it.');
    expect(text).not.toContain('nth-child');
    expect(text).toContain('The picture is, in order: step 1 (id a).');
    expect(parts.slice(1)).toEqual([
      { text: 'Picture for step 1 (id a):' },
      { inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } },
    ]);
  });

  it("names the pictures' steps in order up front, since Claude reads media before text", () => {
    const picture = { mimeType: 'image/jpeg', data: 'AAAA' };
    const parts = buildWritingParts(
      tour(),
      req([
        { id: 'a', fields: ['tip'] },
        { id: 'b', fields: ['tip'] },
      ]),
      new Map([
        ['b', picture],
        ['a', picture],
      ])
    );
    expect(parts[0].text).toContain(
      'The 2 pictures are, in order: step 1 (id a), step 2 (id b).'
    );
    expect(parts.filter((p) => p.inlineData)).toHaveLength(2);
  });
});

describe('parseWritingResponse', () => {
  it('keeps only requested fields, capped, and a question in place of words', () => {
    const r = req([
      { id: 'a', fields: ['title'] },
      { id: 'b', fields: ['tip'] },
    ]);
    const out = parseWritingResponse(
      JSON.stringify({
        steps: [
          { id: 'a', title: `Open ${'word '.repeat(60)}`, tip: 'not asked' },
          { id: 'b', tip: 'x', question: 'Which class is this?' },
          { id: 'zzz', title: 'unknown step' },
        ],
      }),
      r
    );
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe('a');
    expect(out[0].tip).toBeUndefined();
    expect(out[0].title?.length).toBeLessThanOrEqual(200);
    expect(out[1]).toEqual({ id: 'b', question: 'Which class is this?' });
  });

  it('caps tips at 500 characters and drops text with student data', () => {
    const out = parseWritingResponse(
      JSON.stringify({
        steps: [
          { id: 'a', title: 'Email jane@school.org', tip: 'a '.repeat(400) },
        ],
      }),
      req()
    );
    expect(out[0].title).toBeUndefined();
    expect(out[0].tip?.length).toBeLessThanOrEqual(500);
  });
});

describe('runWebTourWriting', () => {
  const deps = (over: Partial<WritingDeps> = {}): WritingDeps => ({
    isAdmin: () => Promise.resolve(true),
    allowed: () => Promise.resolve(true),
    loadTour: () => Promise.resolve(tour()),
    loadPicture: vi.fn(() =>
      Promise.resolve({ mimeType: 'image/jpeg', data: 'AAAA' })
    ),
    record: vi.fn(() => Promise.resolve(undefined)),
    generate: vi.fn(() =>
      Promise.resolve(
        JSON.stringify({ steps: [{ id: 'a', title: 'Open the gradebook' }] })
      )
    ),
    ...over,
  });

  it('refuses a teacher and an admin without the flag', async () => {
    await expect(
      runWebTourWriting(
        req(),
        'u',
        {},
        deps({ isAdmin: () => Promise.resolve(false) })
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      runWebTourWriting(
        req(),
        'u',
        {},
        deps({ allowed: () => Promise.resolve(false) })
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('refuses a step not in the tour and a set that is not a web tour', async () => {
    await expect(
      runWebTourWriting(req([{ id: 'nope', fields: ['tip'] }]), 'u', {}, deps())
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(
      runWebTourWriting(
        req(),
        'u',
        {},
        deps({
          loadTour: () => Promise.resolve({ ...tour(), surface: undefined }),
        })
      )
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it("reads only pictures in the tour's own folder, then writes", async () => {
    const d = deps();
    const result = await runWebTourWriting(
      req([
        { id: 'a', fields: ['title'] },
        { id: 'b', fields: ['tip'] },
      ]),
      'u',
      {},
      d
    );
    expect(d.loadPicture).toHaveBeenCalledTimes(1);
    expect(d.loadPicture).toHaveBeenCalledWith('web_tour_pictures/set1/a.jpg');
    expect(d.record).toHaveBeenCalled();
    expect(result).toEqual({
      steps: [{ id: 'a', title: 'Open the gradebook' }],
    });
  });

  it('turns a model failure into one plain error', async () => {
    await expect(
      runWebTourWriting(
        req(),
        'u',
        {},
        deps({
          generate: () => Promise.reject(new Error('boom')),
        })
      )
    ).rejects.toMatchObject({ code: 'internal' });
  });

  it('says plainly when Claude is unavailable, with no other model', async () => {
    await expect(
      runWebTourWriting(
        req(),
        'u',
        {},
        deps({
          generate: () =>
            Promise.reject(
              new AiUnavailableError('The Claude API key is not set.')
            ),
        })
      )
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: 'The Claude API key is not set.',
    });
  });
});
