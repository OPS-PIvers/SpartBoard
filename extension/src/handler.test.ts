import { describe, expect, it, vi } from 'vitest';
import type { ExtensionProfile } from '@/components/tours/web/extensionProtocol';
import { createExternalHandler } from './handler';

const ORIGIN = 'https://spartboard.web.app';
const top = { origin: ORIGIN, frameId: 0 } as chrome.runtime.MessageSender;

const handlerWith = (profile: ExtensionProfile) => {
  const getProfile = vi.fn(() => Promise.resolve(profile));
  return {
    getProfile,
    handle: createExternalHandler({
      origins: [ORIGIN],
      version: '0.1.0',
      getProfile,
    }),
  };
};

describe('createExternalHandler', () => {
  it('answers ping with the protocol, version and profile', async () => {
    const { handle } = handlerWith('none');
    await expect(handle({ type: 'ping' }, top)).resolves.toEqual({
      ok: true,
      protocol: 10,
      version: '0.1.0',
      profile: 'none',
    });
  });

  it('gives an untrusted sender nothing and never reads the profile', async () => {
    const { handle, getProfile } = handlerWith('staff');
    await expect(
      handle({ type: 'ping' }, { origin: 'https://evil.example', frameId: 0 })
    ).resolves.toBeNull();
    await expect(
      handle({ type: 'ping' }, { origin: ORIGIN, frameId: 1 })
    ).resolves.toBeNull();
    expect(getProfile).not.toHaveBeenCalled();
  });

  it('reports unknown types and malformed messages', async () => {
    const { handle } = handlerWith('staff');
    await expect(handle({ type: 'focus/start' }, top)).resolves.toEqual({
      ok: false,
      error: 'unsupported',
    });
    await expect(handle({ type: 'ping', extra: 1 }, top)).resolves.toEqual({
      ok: false,
      error: 'invalid',
    });
    await expect(handle('ping', top)).resolves.toEqual({
      ok: false,
      error: 'invalid',
    });
  });
});

describe('web-tour/start', () => {
  const start = {
    type: 'web-tour/start',
    startUrl: 'https://a.example/',
    stepIndex: 0,
    tour: {
      setId: 's',
      version: 1,
      title: 'T',
      steps: [
        {
          id: 'a',
          web: {
            urlPattern: 'https://a.example/',
            action: 'click',
            locator: { role: 'button', name: 'Go' },
          },
        },
      ],
    },
  };

  it('starts playback for a staff profile and replies with the tab', async () => {
    const startWebTour = vi.fn(() => Promise.resolve(12));
    const handle = createExternalHandler({
      origins: [ORIGIN],
      version: '0.1.0',
      getProfile: () => Promise.resolve('staff'),
      startWebTour,
    });
    await expect(handle(start, top)).resolves.toEqual({ ok: true, tabId: 12 });
    expect(startWebTour).toHaveBeenCalledWith(start);
  });

  it('refuses a student or signed-out profile without opening anything', async () => {
    for (const profile of ['other', 'none'] as const) {
      const startWebTour = vi.fn(() => Promise.resolve(12));
      const handle = createExternalHandler({
        origins: [ORIGIN],
        version: '0.1.0',
        getProfile: () => Promise.resolve(profile),
        startWebTour,
      });
      await expect(handle(start, top)).resolves.toEqual({
        ok: false,
        error: 'refused',
      });
      expect(startWebTour).not.toHaveBeenCalled();
    }
  });
  it('starts a check run the same way, for staff only (protocol 6)', async () => {
    const check = { ...start, type: 'web-tour/check', runId: 'r1' };
    for (const [profile, reply] of [
      ['staff', { ok: true, tabId: 12 }],
      ['other', { ok: false, error: 'refused' }],
    ] as const) {
      const startWebTour = vi.fn(() => Promise.resolve(12));
      const handle = createExternalHandler({
        origins: [ORIGIN],
        version: '0.1.0',
        getProfile: () => Promise.resolve(profile),
        startWebTour,
      });
      await expect(handle(check, top)).resolves.toEqual(reply);
      expect(startWebTour).toHaveBeenCalledTimes(profile === 'staff' ? 1 : 0);
    }
  });
});

describe('web-tour/open (protocol 8)', () => {
  const openWith = (profile: ExtensionProfile, result: number | null = 12) => {
    const openWebTour = vi.fn(() => Promise.resolve(result));
    const handle = createExternalHandler({
      origins: [ORIGIN],
      version: '0.1.13',
      getProfile: () => Promise.resolve(profile),
      openWebTour,
    });
    return { handle, openWebTour };
  };

  it('opens the tour by id for a staff profile', async () => {
    const { handle, openWebTour } = openWith('staff');
    await expect(
      handle({ type: 'web-tour/open', setId: 'set-1' }, top)
    ).resolves.toEqual({ ok: true, tabId: 12 });
    expect(openWebTour).toHaveBeenCalledWith('set-1');
  });

  it("says unavailable when the tour couldn't be loaded, so the page hands it over", async () => {
    const { handle } = openWith('staff', null);
    await expect(
      handle({ type: 'web-tour/open', setId: 'set-1' }, top)
    ).resolves.toEqual({ ok: false, error: 'unavailable' });
  });

  it('refuses other profiles and malformed ids without loading anything', async () => {
    const student = openWith('other');
    await expect(
      student.handle({ type: 'web-tour/open', setId: 'set-1' }, top)
    ).resolves.toEqual({ ok: false, error: 'refused' });
    expect(student.openWebTour).not.toHaveBeenCalled();
    const staff = openWith('staff');
    await expect(
      staff.handle({ type: 'web-tour/open', setId: '../x' }, top)
    ).resolves.toEqual({ ok: false, error: 'invalid' });
    expect(staff.openWebTour).not.toHaveBeenCalled();
  });
});
