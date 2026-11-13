import { describe, expect, it, vi } from 'vitest';
import { createUpdateCheck } from './updateCheck';
import { createExternalHandler } from './handler';

const ORIGIN = 'https://spartboard.web.app';
const top = { origin: ORIGIN, frameId: 0 } as chrome.runtime.MessageSender;

const checkWith = (result: Promise<{ status: string }>) => {
  const reload = vi.fn();
  const check = createUpdateCheck({
    requestUpdateCheck: () => result,
    reload,
    later: (fn) => fn(),
  });
  return { check, reload };
};

describe('createUpdateCheck', () => {
  it('reloads into a found update after answering', async () => {
    const { check, reload } = checkWith(
      Promise.resolve({ status: 'update_available' })
    );
    await expect(check()).resolves.toBe('available');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('says none or throttled without reloading', async () => {
    for (const [status, want] of [
      ['no_update', 'none'],
      ['throttled', 'throttled'],
    ] as const) {
      const { check, reload } = checkWith(Promise.resolve({ status }));
      await expect(check()).resolves.toBe(want);
      expect(reload).not.toHaveBeenCalled();
    }
  });

  it('treats a failed check as throttled', async () => {
    const { check, reload } = checkWith(Promise.reject(new Error('nope')));
    await expect(check()).resolves.toBe('throttled');
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('extension/update message', () => {
  const handlerFor = (profile: 'staff' | 'other') =>
    createExternalHandler({
      origins: [ORIGIN],
      version: '0.1.0',
      getProfile: () => Promise.resolve(profile),
      checkForUpdate: () => Promise.resolve('none'),
    });

  it('answers a staff profile with the check result', async () => {
    await expect(
      handlerFor('staff')({ type: 'extension/update' }, top)
    ).resolves.toEqual({ ok: true, update: 'none' });
  });

  it('refuses a non-staff profile and extra fields', async () => {
    await expect(
      handlerFor('other')({ type: 'extension/update' }, top)
    ).resolves.toEqual({ ok: false, error: 'refused' });
    await expect(
      handlerFor('staff')({ type: 'extension/update', force: true }, top)
    ).resolves.toEqual({ ok: false, error: 'invalid' });
  });
});
