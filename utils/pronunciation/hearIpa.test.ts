import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/config/firebase', () => ({ functions: {} }));
vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

import { hearIpa } from './hearIpa';

const play = vi.fn(() => Promise.resolve());
class FakeAudio {
  src = '';
  play = play;
  pause = vi.fn();
}

vi.stubGlobal('Audio', FakeAudio);
URL.createObjectURL = vi.fn(() => 'blob:ipa');

afterEach(() => vi.clearAllMocks());

describe('hearIpa', () => {
  it('plays the voiced IPA and reuses it on the next press', async () => {
    const call = vi.fn(() => Promise.resolve({ audio: 'AQID' }));
    const input = {
      dialect: 'en-US' as const,
      ipa: ' ˈɡɔldʒi ',
      term: 'Golgi',
    };
    expect(await hearIpa(input, call)).toBe(true);
    expect(await hearIpa(input, call)).toBe(true);
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith({ ...input, ipa: 'ˈɡɔldʒi' });
    expect(play).toHaveBeenCalledTimes(4);
  });

  it('returns false and tries again next time when the voice fails', async () => {
    const call = vi
      .fn()
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValueOnce({ audio: 'AQID' });
    const input = { dialect: 'es-419' as const, ipa: 'ˈpero', term: 'perro' };
    expect(await hearIpa(input, call)).toBe(false);
    expect(await hearIpa(input, call)).toBe(true);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('treats a press cut off by a newer one as played', async () => {
    let finish: (v: { audio: string }) => void = () => undefined;
    const slow = vi.fn(
      () => new Promise<{ audio: string }>((resolve) => (finish = resolve))
    );
    const first = hearIpa({ dialect: 'de-DE', ipa: 'a', term: 'a' }, slow);
    const second = hearIpa({ dialect: 'de-DE', ipa: 'b', term: 'b' }, () =>
      Promise.resolve({ audio: 'AQID' })
    );
    finish({ audio: 'AQID' });
    expect(await first).toBe(true);
    expect(await second).toBe(true);
  });
});
