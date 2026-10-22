import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordedWebStep } from '@/components/tours/web/recorderProtocol';
import { createIntake } from './intake';

const ORIGIN = 'https://spartboard.web.app';
type Fn = (msg?: unknown) => void;

const step = (id: string): RecordedWebStep => ({
  id,
  urlPattern: 'https://docs.google.com/*',
  action: 'click',
  locator: { name: id },
});

let store: Record<string, unknown>;
const tabs = {
  create: vi.fn(() => Promise.resolve({ id: 9 })),
  remove: vi.fn(() => Promise.resolve()),
  update: vi.fn(() => Promise.resolve()),
  query: () => Promise.resolve([]),
};

const fakePort = () => {
  const onMessage: Fn[] = [];
  const posted: Array<Record<string, unknown>> = [];
  const port = {
    sender: { url: `${ORIGIN}/web-tour-intake`, tab: { id: 9, windowId: 2 } },
    postMessage: (m: Record<string, unknown>) => posted.push(m),
    disconnect: vi.fn(),
    onMessage: { addListener: (fn: Fn) => onMessage.push(fn) },
    onDisconnect: { addListener: vi.fn() },
  };
  const reply = async (msg: unknown) => {
    onMessage.forEach((fn) => fn(msg));
    await new Promise((r) => setTimeout(r, 0));
  };
  return { port: port as unknown as chrome.runtime.Port, posted, reply };
};

beforeEach(() => {
  store = {};
  vi.clearAllMocks();
  (globalThis as { chrome?: unknown }).chrome = {
    storage: {
      session: {
        get: (k: string) => Promise.resolve({ [k]: store[k] }),
        set: (o: Record<string, unknown>) => {
          Object.assign(store, o);
          return Promise.resolve();
        },
        remove: (k: string) => {
          delete store[k];
          return Promise.resolve();
        },
      },
    },
    tabs,
    windows: { update: vi.fn(() => Promise.resolve()) },
  };
});

describe('intake', () => {
  it('opens a background tab, makes the new draft once, then appends the rest', async () => {
    const intake = createIntake([ORIGIN], () => undefined);
    const steps = Array.from({ length: 12 }, (_, i) => step(`s${i}`));
    const jobId = await intake.save({ kind: 'new', title: 'T' }, 'T', steps);
    expect(jobId).toBeTruthy();
    expect(tabs.create).toHaveBeenCalledWith({
      url: `${ORIGIN}/web-tour-intake`,
      active: false,
    });
    const p = fakePort();
    intake.handlePort(p.port);
    await p.reply({ type: 'intake/ready', drafts: [] });
    expect(p.posted).toHaveLength(1);
    expect(p.posted[0]).toMatchObject({ target: { kind: 'new', title: 'T' } });
    expect(p.posted[0].steps).toHaveLength(10);
    // A second ready before created must not make a second draft.
    await p.reply({ type: 'intake/ready', drafts: [] });
    expect(p.posted).toHaveLength(1);
    await p.reply({ type: 'intake/created', jobId, setId: 'd1' });
    expect(p.posted.slice(1).map((m) => m.target)).toEqual([
      { kind: 'append', setId: 'd1' },
      { kind: 'append', setId: 'd1' },
    ]);
    for (const s of steps)
      await p.reply({ type: 'intake/ack', jobId, stepId: s.id });
    const status = await intake.status();
    expect(status.pending).toBe(0);
    expect(status.saved).toEqual({ setId: 'd1', title: 'T', origin: ORIGIN });
    expect(tabs.remove).toHaveBeenCalledWith(9);
  });

  it('sends the newer clues only to an intake tab that said it reviews them', async () => {
    const rich: RecordedWebStep = {
      ...step('s1'),
      locator: { name: 's1', heading: 'Home', attrs: { href: '/x' } },
    };
    const intake = createIntake([ORIGIN], () => undefined);
    await intake.save({ kind: 'append', setId: 'd1' }, 'T', [rich]);
    const old = fakePort();
    intake.handlePort(old.port);
    await old.reply({ type: 'intake/ready', drafts: [] });
    expect(old.posted[0].steps).toEqual([{ ...rich, locator: { name: 's1' } }]);
    const current = fakePort();
    intake.handlePort(current.port);
    await current.reply({ type: 'intake/ready', drafts: [], protocol: 4 });
    expect(current.posted[0].steps).toEqual([rich]);
  });

  it('keeps a failed job until Try again, and brings the tab forward to sign in', async () => {
    const intake = createIntake([ORIGIN], () => undefined);
    const jobId = await intake.save({ kind: 'append', setId: 'd2' }, 'Two', [
      step('a'),
    ]);
    const p = fakePort();
    intake.handlePort(p.port);
    await p.reply({ type: 'intake/signin' });
    expect((await intake.status()).phase).toBe('signin');
    expect(tabs.update).toHaveBeenCalledWith(9, { active: true });
    await p.reply({ type: 'intake/ready', drafts: [] });
    await p.reply({ type: 'intake/failed', jobId });
    expect(await intake.status()).toMatchObject({ failed: true, pending: 1 });
    await intake.retry();
    expect(p.posted.at(-1)).toMatchObject({
      jobId,
      target: { kind: 'append', setId: 'd2' },
    });
    expect((await intake.status()).failed).toBe(false);
  });

  it('ignores replies from a port that was replaced', async () => {
    const intake = createIntake([ORIGIN], () => undefined);
    const jobId = await intake.save({ kind: 'append', setId: 'd3' }, '', [
      step('a'),
    ]);
    const old = fakePort();
    intake.handlePort(old.port);
    intake.handlePort(fakePort().port);
    await old.reply({ type: 'intake/ack', jobId, stepId: 'a' });
    expect((await intake.status()).pending).toBe(1);
  });
});
