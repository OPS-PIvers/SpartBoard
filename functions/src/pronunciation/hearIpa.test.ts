import { describe, expect, it, vi } from 'vitest';

vi.mock('firebase-functions/v2/https', () => {
  class FakeHttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    onCall: (_opts: unknown, handler: unknown) => handler,
    HttpsError: FakeHttpsError,
  };
});
vi.mock('../functionsInit', () => ({}));
vi.mock('../classlinkShared', () => ({ ALLOWED_ORIGINS: [] }));
vi.mock('../firebaseAdmin', () => ({ firestore: () => ({}) }));

import {
  buildIpaSsml,
  hearIpaAudio,
  IPA_VOICES,
  parseHearIpaInput,
} from './hearIpa';

describe('hearIpa', () => {
  it('wraps the term in an IPA phoneme tag without dictionary marks', () => {
    expect(
      buildIpaSsml({
        dialect: 'en-US',
        ipa: '/ˈɡɔl.dʒi ˌæpəˈreɪtəs/',
        term: 'Golgi & <apparatus>',
      })
    ).toBe(
      '<speak><phoneme alphabet="ipa" ph="ˈɡɔldʒi ˌæpəˈreɪtəs">Golgi &amp; &lt;apparatus&gt;</phoneme></speak>'
    );
  });

  it('escapes quotes in the IPA', () => {
    expect(buildIpaSsml({ dialect: 'en-US', ipa: 'a"b', term: 'x' })).toContain(
      'ph="a&quot;b"'
    );
  });

  it.each([
    ['a non-object', 'x'],
    ['an unknown dialect', { dialect: 'fr-FR', ipa: 'a', term: 'a' }],
    ['blank IPA', { dialect: 'en-US', ipa: ' / ', term: 'a' }],
    ['long IPA', { dialect: 'en-US', ipa: 'a'.repeat(201), term: 'a' }],
    ['a non-string term', { dialect: 'en-US', ipa: 'a', term: 3 }],
  ])('rejects %s', (_label, raw) => {
    expect(() => parseHearIpaInput(raw)).toThrow();
  });

  it('reads with the dialect voice and returns base64 audio', async () => {
    const synth = vi.fn(() => Promise.resolve(new Uint8Array([1, 2, 3])));
    const out = await hearIpaAudio(
      { dialect: 'es-419', ipa: 'pero', term: 'perro' },
      synth
    );
    expect(synth).toHaveBeenCalledWith(
      IPA_VOICES['es-419'],
      expect.any(String)
    );
    expect(out.audio).toBe('AQID');
  });

  it('fails when no audio comes back', async () => {
    await expect(
      hearIpaAudio({ dialect: 'en-US', ipa: 'a', term: 'a' }, () =>
        Promise.resolve(null)
      )
    ).rejects.toThrow();
  });
});
