import { describe, expect, it, vi } from 'vitest';
import { createSchoologyWorker, type SchoologyWorkerDeps } from './worker';
import { sendOutcome } from './sendOutcome';
import { SchoologyReadError } from './readResult';

const QUIZ_URL =
  'https://orono.schoology.com/assignment/5/assessment_questions';

function setup(over: Partial<SchoologyWorkerDeps> = {}) {
  let stored: { enabled: boolean; at: number } | undefined;
  const deps: SchoologyWorkerDeps = {
    origins: ['https://spartboard.web.app'],
    isStaff: () => Promise.resolve(true),
    status: vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        value: { enabled: true, hasAccount: true },
      })
    ),
    send: vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        value: { questions: 3, pictures: 1 },
      })
    ),
    loadStatus: () => Promise.resolve(stored),
    saveStatus: (s) => {
      stored = s;
      return Promise.resolve();
    },
    inject: vi.fn(() => Promise.resolve()),
    boardTabs: () => Promise.resolve([]),
    focus: vi.fn(() => Promise.resolve()),
    askForReview: vi.fn(() => Promise.resolve()),
    openTab: vi.fn(() => Promise.resolve()),
    now: () => 1_000_000,
    ...over,
  };
  return { deps, worker: createSchoologyWorker(deps) };
}

describe('Schoology worker', () => {
  it('injects the button on quiz pages only, asking the server once', async () => {
    const { deps, worker } = setup();
    await worker.navigated(1, 0, QUIZ_URL);
    await worker.navigated(1, 0, QUIZ_URL);
    await worker.navigated(1, 0, 'https://orono.schoology.com/home');
    await worker.navigated(1, 3, QUIZ_URL);
    expect(deps.inject).toHaveBeenCalledTimes(2);
    expect(deps.status).toHaveBeenCalledOnce();
  });

  it('shows nothing without the flag or outside a staff profile', async () => {
    const off = setup({
      status: () =>
        Promise.resolve({
          ok: true as const,
          value: { enabled: false, hasAccount: true },
        }),
    });
    await off.worker.navigated(1, 0, QUIZ_URL);
    expect(off.deps.inject).not.toHaveBeenCalled();
    const student = setup({ isStaff: () => Promise.resolve(false) });
    await student.worker.navigated(1, 0, QUIZ_URL);
    expect(student.deps.status).not.toHaveBeenCalled();
    expect(student.deps.inject).not.toHaveBeenCalled();
  });

  it('sends only for Schoology pages', async () => {
    const { deps, worker } = setup();
    const msg = { type: 'schoology/send', request: { quiz: {} } };
    await expect(worker.message(msg, QUIZ_URL)).resolves.toEqual({
      ok: true,
      questions: 3,
      pictures: 1,
    });
    await expect(
      worker.message(msg, 'https://evil.test/assignment/5')
    ).resolves.toEqual({ ok: false, why: 'no-access' });
    expect(deps.send).toHaveBeenCalledOnce();
    expect(worker.message({ type: 'tours/list' }, QUIZ_URL)).toBeNull();
  });

  it('focuses an open board and asks it for the review instead of reloading', async () => {
    const tab = { id: 7, windowId: 2 };
    const { deps, worker } = setup({ boardTabs: () => Promise.resolve([tab]) });
    await worker.message({ type: 'schoology/open' }, QUIZ_URL);
    expect(deps.focus).toHaveBeenCalledWith(tab);
    expect(deps.askForReview).toHaveBeenCalledWith(7);
    expect(deps.openTab).not.toHaveBeenCalled();
  });

  it('opens a new tab on the review when no board is open', async () => {
    const { deps, worker } = setup();
    await worker.openReview();
    expect(deps.openTab).toHaveBeenCalledWith(
      'https://spartboard.web.app/?schoologyImport=1'
    );
  });
});

describe('sendOutcome', () => {
  it("prefers the server's wording, then a plain reason", () => {
    expect(sendOutcome({ ok: true, questions: 1, pictures: 0 })).toEqual({
      ok: true,
      text: 'Sent 1 question.',
    });
    expect(
      sendOutcome({ ok: false, why: 'no-access', message: 'Review first.' })
    ).toEqual({ ok: false, text: 'Review first.' });
    expect(sendOutcome({ ok: false, why: 'offline' }).text).toMatch(
      /reach SpartBoard/
    );
    expect(
      sendOutcome(new SchoologyReadError('no questions were found.')).text
    ).toBe("Couldn't read this quiz: no questions were found.");
  });
});
