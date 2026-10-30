import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config/firebase', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

import { checkReferenceFraming, isAllowListedEmbedHost } from './framingCheck';

describe('checkReferenceFraming', () => {
  it('refuses when the server says the site blocks framing', async () => {
    const check = vi.fn().mockResolvedValue({
      isEmbeddable: false,
      reason: 'X-Frame-Options: DENY',
    });
    await expect(
      checkReferenceFraming('https://news.example.com/a', { check })
    ).resolves.toEqual({
      status: 'refused',
      cause: 'blocked',
      reason: 'X-Frame-Options: DENY',
    });
  });

  it('allows a page the server can frame', async () => {
    const check = vi.fn().mockResolvedValue({ isEmbeddable: true });
    await expect(
      checkReferenceFraming('example.com/page', { check })
    ).resolves.toEqual({ status: 'ok' });
    expect(check).toHaveBeenCalledWith('https://example.com/page');
  });

  it('treats an unreachable probe or a call error as unknown, never refused', async () => {
    const uncertain = vi
      .fn()
      .mockResolvedValue({ isEmbeddable: false, uncertain: true });
    await expect(
      checkReferenceFraming('https://a.example.com', { check: uncertain })
    ).resolves.toEqual({ status: 'unknown' });
    const failing = vi.fn().mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(
      checkReferenceFraming('https://a.example.com', { check: failing })
    ).resolves.toEqual({ status: 'unknown' });
  });

  it('skips the server for Google, YouTube and admin-allowlisted hosts', async () => {
    const check = vi.fn();
    await expect(
      checkReferenceFraming('https://docs.google.com/presentation/d/x/edit', {
        check,
      })
    ).resolves.toEqual({ status: 'ok' });
    await expect(
      checkReferenceFraming('https://Tools.District.org/x', {
        check,
        allowListedHosts: ['tools.district.org'],
      })
    ).resolves.toEqual({ status: 'ok' });
    expect(check).not.toHaveBeenCalled();
  });

  it('refuses plain http pages, which the browser blocks inside the app', async () => {
    const check = vi.fn();
    await expect(
      checkReferenceFraming('http://old.example.com', { check })
    ).resolves.toEqual({ status: 'refused', cause: 'insecure' });
    await expect(
      checkReferenceFraming('javascript:alert(1)', { check })
    ).resolves.toEqual({ status: 'refused', cause: 'invalid' });
    expect(check).not.toHaveBeenCalled();
  });
});

describe('isAllowListedEmbedHost', () => {
  it('matches whole hostnames only', () => {
    expect(isAllowListedEmbedHost('https://youtube.com.evil.example/x')).toBe(
      false
    );
    expect(isAllowListedEmbedHost('not a url at all')).toBe(false);
  });
});
