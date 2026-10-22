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
      protocol: 1,
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
    await expect(handle({ type: 'web-tour/start' }, top)).resolves.toEqual({
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
