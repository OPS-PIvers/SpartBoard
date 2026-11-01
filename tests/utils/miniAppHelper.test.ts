// The injected `window.SpartBoard` helper (docs/plans/shipped/MINI_APP_RESULTS.md D2, D3), run in jsdom as the frame.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MSG_BLOCK_CONTEXT_MENU,
  RESULT_VALIDATOR_SOURCE,
  injectContextMenuGuard,
  injectMiniAppHelper,
  miniAppHelperSource,
} from '@/utils/miniAppHelper';

interface Helper {
  version: number;
  submit: (result: unknown) => Promise<unknown>;
  onInit: (cb: (init: unknown) => void) => void;
}

const win = window as unknown as { SpartBoard?: Helper };
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const loadValidator = new Function(
  `return (${RESULT_VALIDATOR_SOURCE});`
) as () => (r: unknown) => string | null;
const validate = loadValidator();
const helper = (): Helper => {
  if (!win.SpartBoard) throw new Error('helper not installed');
  return win.SpartBoard;
};

let posted: { data: Record<string, unknown> }[];

const fromHost = (data: unknown) =>
  window.dispatchEvent(new MessageEvent('message', { source: window, data }));

beforeEach(() => {
  delete win.SpartBoard;
  document.head.innerHTML = '';
  document.body.innerHTML = '<button data-spart-submit>Submit</button>';
  posted = [];
  // In jsdom the frame's parent is the window itself.
  vi.spyOn(window, 'postMessage').mockImplementation((data: unknown) => {
    posted.push({ data: data as Record<string, unknown> });
  });
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  (new Function(miniAppHelperSource()) as () => void)();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const submitHidden = () =>
  Array.from(document.querySelectorAll('style')).some((s) =>
    s.textContent?.includes('[data-spart-submit]{display:none')
  );
const button = () =>
  document.querySelector('[data-spart-submit]') as HTMLButtonElement;

describe('window.SpartBoard', () => {
  it('hides submit controls until INIT enables submissions', () => {
    expect(helper().version).toBe(1);
    expect(submitHidden()).toBe(true);
    fromHost({
      type: 'SPART_MINIAPP_INIT',
      payload: { submissionsEnabled: true },
    });
    expect(submitHidden()).toBe(false);
    fromHost({
      type: 'SPART_MINIAPP_INIT',
      payload: { submissionsEnabled: false },
    });
    expect(submitHidden()).toBe(true);
  });

  it('hands INIT to onInit callbacks, including late ones', () => {
    const early = vi.fn();
    helper().onInit(early);
    fromHost({
      type: 'SPART_MINIAPP_INIT',
      payload: { submissionsEnabled: true, timeMultiplier: 2 },
    });
    const late = vi.fn();
    helper().onInit(late);
    expect(early).toHaveBeenCalledWith({
      submissionsEnabled: true,
      timeMultiplier: 2,
    });
    expect(late).toHaveBeenCalledWith({
      submissionsEnabled: true,
      timeMultiplier: 2,
    });
  });

  it('rejects when submissions are off', async () => {
    await expect(helper().submit({ items: [] })).rejects.toMatchObject({
      code: 'submissions-off',
    });
    expect(posted).toHaveLength(0);
  });

  it('rejects a bad shape without posting', async () => {
    fromHost({
      type: 'SPART_MINIAPP_INIT',
      payload: { submissionsEnabled: true },
    });
    await expect(
      helper().submit({ items: [{ id: 'a' }, { id: 'a' }] })
    ).rejects.toMatchObject({ code: 'invalid-result' });
    expect(posted).toHaveLength(0);
  });

  it('resolves only after the host confirms, disabling Submit meanwhile', async () => {
    fromHost({
      type: 'SPART_MINIAPP_INIT',
      payload: { submissionsEnabled: true, attemptsLeft: 2 },
    });
    let settled = false;
    const promise = helper().submit({ items: [{ id: 'q1', answer: 'B' }] });
    void promise.then(() => (settled = true));
    expect(posted[0].data).toMatchObject({
      type: 'SPART_MINIAPP_SUBMIT',
      payload: { items: [{ id: 'q1', answer: 'B' }] },
    });
    expect(button().disabled).toBe(true);
    await expect(helper().submit({})).rejects.toMatchObject({ code: 'busy' });
    await Promise.resolve();
    expect(settled).toBe(false);

    fromHost({
      type: 'SPART_MINIAPP_SUBMIT_RESULT',
      requestId: posted[0].data.requestId,
      ok: true,
      result: { attempt: 1, attemptsLeft: 1, score: 1, maxScore: 1 },
    });
    await expect(promise).resolves.toEqual({
      attempt: 1,
      attemptsLeft: 1,
      score: 1,
      maxScore: 1,
    });
    expect(button().disabled).toBe(false);
  });

  it('disables Submit and rejects once the last attempt is used', async () => {
    fromHost({
      type: 'SPART_MINIAPP_INIT',
      payload: { submissionsEnabled: true, attemptsLeft: 1 },
    });
    const promise = helper().submit({});
    fromHost({
      type: 'SPART_MINIAPP_SUBMIT_RESULT',
      requestId: posted[0].data.requestId,
      ok: true,
      result: { attempt: 1, attemptsLeft: 0 },
    });
    await promise;
    expect(button().disabled).toBe(true);
    await expect(helper().submit({})).rejects.toMatchObject({
      code: 'attempts-exhausted',
    });
  });

  it('rejects with the host error code', async () => {
    fromHost({
      type: 'SPART_MINIAPP_INIT',
      payload: { submissionsEnabled: true },
    });
    const promise = helper().submit({});
    fromHost({
      type: 'SPART_MINIAPP_SUBMIT_RESULT',
      requestId: posted[0].data.requestId,
      ok: false,
      error: { code: 'closed', message: 'This assignment is closed.' },
    });
    await expect(promise).rejects.toMatchObject({
      code: 'closed',
      message: 'This assignment is closed.',
    });
  });

  it('ignores messages that do not come from the host', () => {
    window.dispatchEvent(
      new MessageEvent('message', {
        source: null,
        data: {
          type: 'SPART_MINIAPP_INIT',
          payload: { submissionsEnabled: true },
        },
      })
    );
    expect(submitHidden()).toBe(true);
  });
});

describe('result validator', () => {
  it.each([
    [
      {
        items: [{ id: 'q1', answer: 1, correct: true, points: 2 }],
        score: 2,
        maxScore: 2,
      },
      null,
    ],
    [{}, null],
    ['done', 'The result must be an object.'],
    [{ items: {} }, 'items must be a list.'],
    [{ items: [{ answer: 1 }] }, 'Each item needs an id.'],
    [
      { items: [{ id: 'a', correct: 1 }] },
      'Item a: correct must be true or false.',
    ],
    [{ maxScore: 0 }, 'maxScore must be a number above 0.'],
    [{ data: [] }, 'data must be an object.'],
    [{ data: { x: 'y'.repeat(20_001) } }, 'The result is larger than 20 KB.'],
  ])('%j -> %s', (result, expected) => {
    expect(validate(result)).toBe(expected);
  });
});

describe('injectMiniAppHelper', () => {
  it.each([
    [
      '<!DOCTYPE html><html><head></head></html>',
      '<!DOCTYPE html><html><head><script',
    ],
    ['<html lang="en"><body>x</body></html>', '<html lang="en"><script'],
    ['<!doctype html><body>x</body>', '<!doctype html><script'],
    ['<div>x</div>', '<script'],
  ])('places the helper early in %s', (html, prefix) => {
    expect(injectMiniAppHelper(html).startsWith(prefix)).toBe(true);
  });
});

describe('context menu guard', () => {
  const runGuard = () => {
    const html = injectContextMenuGuard(
      '<html><head></head><body></body></html>'
    );
    const src = /<script data-spart-menu-guard="1">([\s\S]*?)<\/script>/.exec(
      html
    )?.[1];
    if (!src) throw new Error('guard not injected');
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const run = new Function(src) as () => void;
    run();
  };
  const rightClick = () =>
    document.body.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    );
  const fromParent = (enabled: boolean) =>
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window.parent,
        data: { type: MSG_BLOCK_CONTEXT_MENU, enabled },
      })
    );

  it('blocks the menu only while the host has it switched on', () => {
    runGuard();
    expect(rightClick()).toBe(true);
    fromParent(true);
    expect(rightClick()).toBe(false);
    fromParent(false);
    expect(rightClick()).toBe(true);
  });
});
