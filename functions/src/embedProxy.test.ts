// SSRF regression tests for checkUrlCompatibility.
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
vi.mock('./functionsInit', () => ({}));
vi.mock('./classlinkShared', () => ({ ALLOWED_ORIGINS: [] }));
vi.mock('./viewAsGuard', () => ({ assertViewAsAllowed: () => undefined }));

const dnsLookup = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('dns', () => {
  const lookup = (...args: unknown[]): Promise<unknown> => dnsLookup(...args);
  return { default: { promises: { lookup } }, promises: { lookup } };
});

const axiosHead = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('axios', () => ({
  default: {
    head: (...args: unknown[]): Promise<unknown> => axiosHead(...args),
    isAxiosError: () => false,
  },
}));

import { checkUrlCompatibility } from './embedProxy';

const call = checkUrlCompatibility as unknown as (req: {
  auth: { uid: string };
  data: { url: string };
}) => Promise<unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  dnsLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  axiosHead.mockResolvedValue({ headers: {} });
});

describe('checkUrlCompatibility DNS SSRF guard', () => {
  it('rejects a public hostname that resolves to a private IP', async () => {
    dnsLookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    await expect(
      call({ auth: { uid: 'u' }, data: { url: 'https://evil.example.com/' } })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(axiosHead).not.toHaveBeenCalled();
  });

  it('pins the probe to the validated addresses', async () => {
    await call({ auth: { uid: 'u' }, data: { url: 'https://example.com/' } });
    expect(axiosHead).toHaveBeenCalledWith(
      'https://example.com/',
      expect.objectContaining({ httpsAgent: expect.any(Object) as unknown })
    );
  });
});
