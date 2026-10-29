import { describe, expect, it, vi } from 'vitest';
import type {
  FocusActiveSession,
  FocusPushSubscription,
  FocusReportRequest,
  FocusStatusRequest,
} from '@/utils/focus/contract';
import type { ApiResult } from '../spartboardApi';
import {
  createFocusClient,
  PUSH_RESEND_MS,
  type FocusClientDeps,
  type PushSent,
} from './focusClient';
import type { FocusLocalState } from './focusState';

const session: FocusActiveSession = {
  sessionId: 's1',
  teacherName: 'Ms. Rivera',
  level: 'monitor',
  sites: [{ host: 'desmos.com', path: '' }],
  endsAt: 30 * 60_000,
  released: false,
  showLiveSite: false,
};

const PUSH = {
  endpoint: 'https://push.example/1',
  keys: { p256dh: 'p', auth: 'a' },
};

function setup(over: Partial<FocusClientDeps> = {}) {
  let state: FocusLocalState | undefined;
  let pushSent: PushSent | undefined;
  let now = 0;
  let url: string | undefined = 'https://www.desmos.com/calculator';
  let fullscreen = true;
  let statusReply: ApiResult<unknown> = {
    ok: true,
    value: { session, serverNow: 0 },
  };
  let reportReply: ApiResult<unknown> = {
    ok: true,
    value: { ok: true, active: true },
  };
  const statusCalls: FocusStatusRequest[] = [];
  const reports: FocusReportRequest[] = [];
  const deps = {
    origins: ['https://spartboard.web.app'],
    protocol: 9,
    email: vi.fn(() => Promise.resolve('kid@students.orono.k12.mn.us')),
    status: vi.fn((body: FocusStatusRequest) => {
      statusCalls.push(body);
      return Promise.resolve(statusReply);
    }),
    report: vi.fn((body: FocusReportRequest) => {
      reports.push(body);
      return Promise.resolve(reportReply);
    }),
    load: () => Promise.resolve(state),
    save: (s: FocusLocalState | null) => {
      state = s ?? undefined;
      return Promise.resolve();
    },
    pushSubscription: vi.fn(() =>
      Promise.resolve<FocusPushSubscription | null>(null)
    ),
    loadPushSent: () => Promise.resolve(pushSent),
    savePushSent: (s: PushSent) => {
      pushSent = s;
      return Promise.resolve();
    },
    activeUrl: () => Promise.resolve(url),
    activeFullscreen: () => Promise.resolve(fullscreen),
    enforce: vi.fn((_s: FocusLocalState | null | undefined) =>
      Promise.resolve()
    ),
    openFocusPage: vi.fn(() => Promise.resolve()),
    setBadge: vi.fn((_text: string) => Promise.resolve()),
    setTicking: vi.fn((_on: boolean) => Promise.resolve()),
    now: () => now,
    ...over,
  } satisfies FocusClientDeps;
  return {
    deps,
    client: createFocusClient(deps),
    statusCalls,
    reports,
    state: () => state,
    pushSent: () => pushSent,
    setNow: (t: number) => {
      now = t;
    },
    setUrl: (u: string | undefined) => {
      url = u;
    },
    setFullscreen: (f: boolean) => {
      fullscreen = f;
    },
    setStatus: (r: ApiResult<unknown>) => {
      statusReply = r;
    },
    setReport: (r: ApiResult<unknown>) => {
      reportReply = r;
    },
  };
}

describe('createFocusClient check', () => {
  it('never calls SpartBoard for a staff profile', async () => {
    const t = setup({
      email: () => Promise.resolve('teacher@orono.k12.mn.us'),
    });
    await t.client.check();
    expect(t.deps.status).not.toHaveBeenCalled();
    expect(t.state()).toBeUndefined();
  });

  it('stores a new session, opens the focus page once, reports and counts down', async () => {
    const t = setup();
    await t.client.check();
    expect(t.statusCalls).toEqual([{ protocol: 9 }]);
    expect(t.state()?.session).toEqual(session);
    expect(t.deps.openFocusPage).toHaveBeenCalledTimes(1);
    expect(t.deps.setBadge).toHaveBeenLastCalledWith('30m');
    expect(t.deps.setTicking).toHaveBeenLastCalledWith(true);
    expect(t.reports).toEqual([
      {
        sessionId: 's1',
        protocol: 9,
        status: 'on-task',
        blockedTries: 0,
        host: null,
      },
    ]);
    await t.client.check();
    expect(t.deps.openFocusPage).toHaveBeenCalledTimes(1);
  });

  it('keeps time on the server clock', async () => {
    const t = setup();
    t.setStatus({ ok: true, value: { session, serverNow: 10 * 60_000 } });
    await t.client.check();
    expect(t.deps.setBadge).toHaveBeenLastCalledWith('20m');
  });

  it('clears the session when the server has none or refuses the profile', async () => {
    const t = setup();
    await t.client.check();
    t.setStatus({ ok: true, value: { session: null, serverNow: 0 } });
    await t.client.check();
    expect(t.state()).toBeUndefined();
    expect(t.deps.setBadge).toHaveBeenLastCalledWith('');
    expect(t.deps.setTicking).toHaveBeenLastCalledWith(false);

    await t.client.check();
    t.setStatus({ ok: true, value: { session, serverNow: 0 } });
    await t.client.check();
    t.setStatus({ ok: false, why: 'no-access' });
    await t.client.check();
    expect(t.state()).toBeUndefined();
  });

  it('holds the session while offline until its own end', async () => {
    const t = setup();
    await t.client.check();
    t.setStatus({ ok: false, why: 'offline' });
    await t.client.check();
    expect(t.state()?.session.sessionId).toBe('s1');
    t.setStatus({ ok: true, value: 'garbage' });
    await t.client.check();
    expect(t.state()?.session.sessionId).toBe('s1');
  });

  it('stops for a released student without opening the page', async () => {
    const t = setup();
    t.setStatus({
      ok: true,
      value: { session: { ...session, released: true }, serverNow: 0 },
    });
    await t.client.check();
    expect(t.deps.openFocusPage).not.toHaveBeenCalled();
    expect(t.reports).toEqual([]);
    expect(t.deps.setBadge).toHaveBeenLastCalledWith('');
  });

  it('sends the push subscription once, then again a day later', async () => {
    const t = setup({ pushSubscription: () => Promise.resolve(PUSH) });
    await t.client.check();
    expect(t.statusCalls[0]).toEqual({ protocol: 9, push: PUSH });
    expect(t.pushSent()).toEqual({ endpoint: PUSH.endpoint, at: 0 });
    await t.client.check();
    expect(t.statusCalls[1]).toEqual({ protocol: 9 });
    t.setNow(PUSH_RESEND_MS);
    t.setStatus({
      ok: true,
      value: { session: null, serverNow: PUSH_RESEND_MS },
    });
    await t.client.check();
    expect(t.statusCalls[2]).toEqual({ protocol: 9, push: PUSH });
  });

  it('does not mark the subscription sent when the call fails', async () => {
    const t = setup({ pushSubscription: () => Promise.resolve(PUSH) });
    t.setStatus({ ok: false, why: 'offline' });
    await t.client.check();
    expect(t.pushSent()).toBeUndefined();
  });
});

describe('createFocusClient reports', () => {
  it('reports a change at once and the same status at most once a minute', async () => {
    const t = setup();
    await t.client.check();
    expect(t.reports).toHaveLength(1);
    await t.client.observe();
    expect(t.reports).toHaveLength(1);
    t.setUrl('https://games.example/');
    t.setNow(5_000);
    await t.client.observe();
    expect(t.reports.at(-1)?.status).toBe('away');
    t.setNow(30_000);
    await t.client.observe();
    expect(t.reports).toHaveLength(2);
    t.setNow(65_000);
    await t.client.tick();
    expect(t.reports).toHaveLength(3);
  });

  it('includes the domain only while the live-site switch is on', async () => {
    const t = setup();
    t.setStatus({
      ok: true,
      value: { session: { ...session, showLiveSite: true }, serverNow: 0 },
    });
    await t.client.check();
    expect(t.reports[0].host).toBe('www.desmos.com');
  });

  it('checks again when the server says the session is over', async () => {
    const t = setup();
    await t.client.check();
    t.setReport({ ok: true, value: { ok: true, active: false } });
    t.setStatus({ ok: true, value: { session: null, serverNow: 0 } });
    t.setUrl('https://games.example/');
    await t.client.observe();
    expect(t.deps.status).toHaveBeenCalledTimes(2);
    expect(t.state()).toBeUndefined();
  });

  it('retries a failed report on the next event', async () => {
    const t = setup();
    t.setReport({ ok: false, why: 'offline' });
    await t.client.check();
    t.setReport({ ok: true, value: { ok: true, active: true } });
    await t.client.observe();
    expect(t.reports).toHaveLength(2);
  });

  it('checks once the time runs out on the tick', async () => {
    const t = setup();
    await t.client.check();
    t.setStatus({ ok: true, value: { session: null, serverNow: 0 } });
    t.setNow(session.endsAt);
    await t.client.tick();
    expect(t.deps.status).toHaveBeenCalledTimes(2);
    expect(t.state()).toBeUndefined();
  });

  it('runs one step at a time', async () => {
    const t = setup();
    await Promise.all([t.client.check(), t.client.check(), t.client.observe()]);
    expect(t.deps.openFocusPage).toHaveBeenCalledTimes(1);
    expect(t.reports).toHaveLength(1);
  });
});

describe('createFocusClient review fixes', () => {
  it('reports on the next minute tick despite a few ms of alarm drift', async () => {
    const t = setup();
    await t.client.check();
    t.setNow(59_990);
    await t.client.tick();
    expect(t.reports).toHaveLength(2);
  });

  it('reports a site change at once while the live-site switch is on', async () => {
    const t = setup();
    t.setStatus({
      ok: true,
      value: { session: { ...session, showLiveSite: true }, serverNow: 0 },
    });
    await t.client.check();
    t.setUrl('https://desmos.com/other');
    t.setNow(1_000);
    await t.client.observe();
    expect(t.reports.map((r) => r.host)).toEqual([
      'www.desmos.com',
      'desmos.com',
    ]);
  });

  it('holds a live session through a token hiccup but stops when refused', async () => {
    const t = setup();
    await t.client.check();
    t.setStatus({ ok: false, why: 'signed-out' });
    await t.client.check();
    expect(t.state()?.session.sessionId).toBe('s1');
    t.setStatus({ ok: false, why: 'no-access' });
    await t.client.check();
    expect(t.state()).toBeUndefined();
  });

  it('does not loop when status and report disagree', async () => {
    const t = setup();
    t.setReport({ ok: true, value: { ok: true, active: false } });
    await t.client.check();
    expect(t.deps.status).toHaveBeenCalledTimes(1);
  });
});

describe('createFocusClient enforcement (FS7)', () => {
  it('hands every state change to enforcement, including the end', async () => {
    const t = setup();
    await t.client.check();
    expect(t.deps.enforce).toHaveBeenLastCalledWith(
      expect.objectContaining({ session })
    );
    t.setStatus({ ok: true, value: { session: null, serverNow: 0 } });
    await t.client.check();
    expect(t.deps.enforce).toHaveBeenLastCalledWith(null);
  });

  it('keeps the badge and reports going when enforcement fails', async () => {
    const t = setup({ enforce: () => Promise.reject(new Error('no rules')) });
    await t.client.check();
    expect(t.deps.setBadge).toHaveBeenLastCalledWith('30m');
    expect(t.reports).toHaveLength(1);
  });

  it('counts blocked tries and reports a new one after the burst gap', async () => {
    const t = setup();
    await t.client.check();
    t.setNow(1_000);
    await t.client.blocked();
    expect(t.state()?.blockedTries).toBe(1);
    expect(t.reports).toHaveLength(1);
    t.setNow(6_000);
    await t.client.observe();
    expect(t.reports.at(-1)?.blockedTries).toBe(1);
    expect(t.reports).toHaveLength(2);
    await t.client.observe();
    expect(t.reports).toHaveLength(2);
  });

  it('ignores a blocked try once the session no longer holds the student', async () => {
    const t = setup();
    await t.client.blocked();
    expect(t.state()).toBeUndefined();
  });

  it('starts a new session at zero tries', async () => {
    const t = setup();
    await t.client.check();
    await t.client.blocked();
    t.setStatus({
      ok: true,
      value: { session: { ...session, sessionId: 's2' }, serverNow: 0 },
    });
    await t.client.check();
    expect(t.state()?.blockedTries).toBe(0);
    expect(t.reports.at(-1)).toMatchObject({
      sessionId: 's2',
      blockedTries: 0,
    });
  });

  it('counts time outside fullscreen as away at Lock only', async () => {
    const t = setup();
    t.setFullscreen(false);
    await t.client.check();
    expect(t.reports.at(-1)?.status).toBe('on-task');
    t.setStatus({
      ok: true,
      value: { session: { ...session, level: 'lock' }, serverNow: 0 },
    });
    t.setNow(1_000);
    await t.client.check();
    expect(t.reports.at(-1)?.status).toBe('away');
    t.setFullscreen(true);
    t.setNow(2_000);
    await t.client.observe();
    expect(t.reports.at(-1)?.status).toBe('on-task');
  });
});
