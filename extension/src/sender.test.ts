import { describe, expect, it } from 'vitest';
import { LISTINGS } from './listings';
import { isTrustedSender } from './sender';

const prod = LISTINGS.prod.origins;
const dev = LISTINGS.dev.origins;
const from = (origin: string | undefined, frameId: number | null = 0) =>
  ({
    origin,
    frameId: frameId ?? undefined,
    url: origin ? `${origin}/` : undefined,
  }) as chrome.runtime.MessageSender;

describe('isTrustedSender', () => {
  it('accepts a top frame on a listed origin', () => {
    expect(isTrustedSender(from('https://spartboard.web.app'), prod)).toBe(
      true
    );
    expect(isTrustedSender(from('http://localhost:3004'), dev)).toBe(true);
  });

  it('refuses frames other than the top one', () => {
    expect(isTrustedSender(from('https://spartboard.web.app', 3), prod)).toBe(
      false
    );
    expect(
      isTrustedSender(from('https://spartboard.web.app', null), prod)
    ).toBe(false);
  });

  it.each([
    'https://spartboard.web.app.evil.example',
    'https://evil.spartboard.web.app',
    'http://spartboard.web.app',
    'https://spartboard.web.app:8443',
    'https://spartboard--preview-abc.web.app',
    'https://spartboard-dev.web.app',
    'http://localhost:3000',
    'null',
    'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
  ])('refuses %s on the prod listing', (origin) => {
    expect(isTrustedSender(from(origin), prod)).toBe(false);
  });

  it('refuses a sender with no origin', () => {
    expect(isTrustedSender(from(undefined), dev)).toBe(false);
  });

  it('keeps localhost and dev hosts off the prod listing', () => {
    expect(prod).toEqual([
      'https://spartboard.web.app',
      'https://spartboard.firebaseapp.com',
    ]);
    expect(dev.some((o) => prod.includes(o))).toBe(false);
  });
});
