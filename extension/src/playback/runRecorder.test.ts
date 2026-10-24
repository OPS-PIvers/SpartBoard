import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TourRun } from '@/components/tours/tourRunLog';
import { createRunRecorder } from './runRecorder';

const recorder = () => {
  const store = new Map<string, unknown>();
  const sent: TourRun[] = [];
  const r = createRunRecorder({
    load: <T>(k: string) => Promise.resolve(store.get(k) as T | undefined),
    save: (e) => {
      for (const [k, v] of Object.entries(e)) store.set(k, structuredClone(v));
      return Promise.resolve();
    },
    remove: (keys) => {
      keys.forEach((k) => store.delete(k));
      return Promise.resolve();
    },
    send: (_setId, run) => {
      sent.push(structuredClone(run));
      return Promise.resolve();
    },
  });
  return { r, store, sent };
};

const locators = { a: { role: 'button', name: 'Save' } };

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('createRunRecorder', () => {
  it('records a run the extension opened: start, steps and done', async () => {
    const { r, sent, store } = recorder();
    await r.begin('set1', 1700, locators);
    expect(sent.at(-1)).toMatchObject({ v: 1700, furthest: 0, done: false });
    expect(store.has('wt:run:set1')).toBe(true);
    await r.onPost({
      type: 'web-tour/step',
      setId: 'set1',
      stepIndex: 1,
      stepId: 'b',
      match: 'none',
    });
    await r.onPost({ type: 'web-tour/done', setId: 'set1' });
    expect(sent.at(-1)).toMatchObject({
      furthest: 1,
      done: true,
      misses: ['b'],
      surface: 'web',
    });
    expect(store.has('wt:run:set1')).toBe(false);
  });

  it('records where the learner left', async () => {
    const { r, sent } = recorder();
    await r.begin('set1', 1700, locators);
    await r.onPost({ type: 'web-tour/exit', setId: 'set1', stepIndex: 2 });
    expect(sent.at(-1)).toMatchObject({ done: false, exit: 2 });
  });

  it('continues a run after the worker restarts', async () => {
    const first = recorder();
    await first.r.begin('set1', 1700, locators);
    const second = createRunRecorder({
      load: <T>(k: string) =>
        Promise.resolve(first.store.get(k) as T | undefined),
      save: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      send: (_s, run) => {
        first.sent.push(run);
        return Promise.resolve();
      },
    });
    await second.onPost({ type: 'web-tour/done', setId: 'set1' });
    expect(first.sent.at(-1)).toMatchObject({ v: 1700, done: true });
  });

  it("ignores tours it didn't open and check runs", async () => {
    const { r, sent } = recorder();
    await r.onPost({ type: 'web-tour/done', setId: 'other' });
    await r.begin('set1', 1700, locators);
    const count = sent.length;
    await r.onPost({
      type: 'web-tour/check-end',
      setId: 'set1',
      runId: 'r1',
      stepIndex: 0,
      done: true,
    });
    await r.onPost({
      type: 'web-tour/suggest',
      setId: 'set1',
      stepIndex: 0,
      stepId: 'a',
      locator: { role: 'button', name: 'Keep' },
      runId: 'r1',
    });
    expect(sent.length).toBe(count);
  });

  it('stops recording a tour that was handed over another way', async () => {
    const { r, sent } = recorder();
    await r.begin('set1', 1700, locators);
    await r.forget('set1');
    const count = sent.length;
    await r.onPost({ type: 'web-tour/done', setId: 'set1' });
    expect(sent.length).toBe(count);
  });
});
