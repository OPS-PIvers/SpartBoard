import { beforeEach, describe, expect, it } from 'vitest';
import { loadUnsent, saveUnsent, UNSENT_KEY, type PanelStep } from './unsent';

const store: Record<string, unknown> = {};

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      session: {
        get: (key: string) => Promise.resolve({ [key]: store[key] }),
        set: (o: Record<string, unknown>) => {
          Object.assign(store, o);
          return Promise.resolve();
        },
        remove: (key: string) => {
          delete store[key];
          return Promise.resolve();
        },
      },
    },
  };
});

const step = (id: string, extra: Partial<PanelStep> = {}): PanelStep => ({
  capture: {
    id,
    at: 1,
    target: null,
    viewport: { w: 100, h: 100 },
    urlPattern: 'https://docs.google.com/document/d/*/edit',
    action: 'click',
    locator: { role: 'button', name: 'Extensions' },
  },
  picture: null,
  blur: [],
  tip: '',
  note: '',
  pending: false,
  ...extra,
});

describe('unsent steps', () => {
  it('keeps pictures, blur boxes and tips across a reopen', async () => {
    const picture = new Blob([new Uint8Array([1, 2, 3])], {
      type: 'image/png',
    });
    const blur = [{ xPct: 1, yPct: 2, wPct: 3, hPct: 4 }];
    await saveUnsent({
      steps: [
        step('a', { picture, blur, tip: 'Open the menu', note: 'grades' }),
      ],
      fix: null,
    });
    const back = await loadUnsent();
    expect(back.fix).toBeNull();
    expect(back.steps).toHaveLength(1);
    expect(back.steps[0].tip).toBe('Open the menu');
    expect(back.steps[0].note).toBe('grades');
    expect(back.steps[0].blur).toEqual(blur);
    expect(new Uint8Array(await back.steps[0].picture!.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3])
    );
  });

  it('skips a step still decoding and clears once nothing is left', async () => {
    await saveUnsent({
      steps: [step('a'), step('b', { pending: true })],
      fix: null,
    });
    expect((await loadUnsent()).steps.map((s) => s.capture.id)).toEqual(['a']);
    await saveUnsent({ steps: [], fix: null });
    expect(store[UNSENT_KEY]).toBeUndefined();
  });

  it('lands saves in order', async () => {
    void saveUnsent({ steps: [step('a'), step('b')], fix: null });
    await saveUnsent({ steps: [step('b')], fix: step('f') });
    const back = await loadUnsent();
    expect(back.steps.map((s) => s.capture.id)).toEqual(['b']);
    expect(back.fix?.capture.id).toBe('f');
  });
});
