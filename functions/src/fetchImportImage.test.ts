// Unit tests for the fetchImportImage callable.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
vi.mock('./classlinkShared', () => ({
  ALLOWED_ORIGINS: ['https://example.com'],
}));

const dnsLookup = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('dns', () => {
  const lookup = (...args: unknown[]): Promise<unknown> => dnsLookup(...args);
  return { default: { promises: { lookup } }, promises: { lookup } };
});

const axiosGet = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('axios', () => ({
  default: {
    get: (...args: unknown[]): Promise<unknown> => axiosGet(...args),
    isAxiosError: (err: unknown): err is { response?: unknown } =>
      !!err && typeof err === 'object' && 'isAxiosError' in err,
  },
}));

function makeRedirectError(status: number, location: string) {
  return {
    isAxiosError: true,
    message: `Request failed with status code ${status}`,
    response: { status, headers: { location } },
  };
}

import { fetchImportImage } from './fetchImportImage';

type Handler = (request: {
  auth: {
    uid: string;
    token?: { firebase?: { sign_in_provider?: string } };
  } | null;
  data: unknown;
}) => Promise<unknown>;

const call = fetchImportImage as unknown as Handler;

const AUTH = { uid: 'teacher-1' };
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02, 0x03,
]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const IMG_URL = 'https://lh4.googleusercontent.com/abc123';

function imageResponse(body: Buffer, contentType: string) {
  return { data: body, headers: { 'content-type': contentType } };
}

beforeEach(() => {
  vi.clearAllMocks();
  dnsLookup.mockResolvedValue([{ address: '142.250.1.1', family: 4 }]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('fetchImportImage', () => {
  it('rejects unauthenticated calls', async () => {
    await expect(
      call({ auth: null, data: { url: IMG_URL } })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('rejects anonymous (student) sign-ins', async () => {
    await expect(
      call({
        auth: {
          uid: 'anon',
          token: { firebase: { sign_in_provider: 'anonymous' } },
        },
        data: { url: IMG_URL },
      })
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('rejects non-https URLs', async () => {
    await expect(
      call({ auth: AUTH, data: { url: 'http://example.com/a.png' } })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('rejects overlong URLs', async () => {
    await expect(
      call({
        auth: AUTH,
        data: { url: `https://example.com/${'a'.repeat(2100)}` },
      })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(dnsLookup).not.toHaveBeenCalled();
  });

  it('rejects a hostname that resolves to a private IP', async () => {
    dnsLookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
    await expect(
      call({ auth: AUTH, data: { url: 'https://internal.example.com/a.png' } })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it('re-validates the host of a redirect target', async () => {
    dnsLookup
      .mockResolvedValueOnce([{ address: '142.250.1.1', family: 4 }])
      .mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }]);
    axiosGet.mockRejectedValueOnce(
      makeRedirectError(302, 'https://evil.example.com/meta')
    );
    await expect(
      call({ auth: AUTH, data: { url: IMG_URL } })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(axiosGet).toHaveBeenCalledTimes(1);
    expect(dnsLookup).toHaveBeenCalledTimes(2);
  });

  it('rejects a redirect to a non-https URL', async () => {
    axiosGet.mockRejectedValueOnce(
      makeRedirectError(301, 'http://example.com/a.png')
    );
    await expect(
      call({ auth: AUTH, data: { url: IMG_URL } })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(axiosGet).toHaveBeenCalledTimes(1);
  });

  it('follows a redirect to an image', async () => {
    axiosGet
      .mockRejectedValueOnce(
        makeRedirectError(302, 'https://cdn.example.com/final.png')
      )
      .mockResolvedValueOnce(imageResponse(PNG, 'image/png'));
    const result = await call({ auth: AUTH, data: { url: IMG_URL } });
    expect(result).toMatchObject({ contentType: 'image/png' });
    expect(axiosGet).toHaveBeenCalledTimes(2);
  });

  it('gives up after too many redirects', async () => {
    axiosGet.mockRejectedValue(
      makeRedirectError(302, 'https://example.com/next')
    );
    await expect(
      call({ auth: AUTH, data: { url: IMG_URL } })
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(axiosGet).toHaveBeenCalledTimes(4);
  });

  it('rejects SVG content', async () => {
    axiosGet.mockResolvedValue(
      imageResponse(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
        'image/svg+xml'
      )
    );
    await expect(
      call({ auth: AUTH, data: { url: IMG_URL } })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects non-image content', async () => {
    axiosGet.mockResolvedValue(
      imageResponse(Buffer.from('<html></html>'), 'text/html')
    );
    await expect(
      call({ auth: AUTH, data: { url: IMG_URL } })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects a body whose magic bytes are not a supported image', async () => {
    axiosGet.mockResolvedValue(
      imageResponse(Buffer.from('<script>alert(1)</script>'), 'image/png')
    );
    await expect(
      call({ auth: AUTH, data: { url: IMG_URL } })
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('returns base64 data with the sniffed content type', async () => {
    axiosGet.mockResolvedValue(imageResponse(JPEG, 'image/png; charset=x'));
    const result = await call({ auth: AUTH, data: { url: IMG_URL } });
    expect(result).toEqual({
      contentType: 'image/jpeg',
      data: JPEG.toString('base64'),
      bytes: JPEG.length,
    });
    const options = axiosGet.mock.calls[0][1] as {
      responseType: string;
      maxRedirects: number;
      maxContentLength: number;
      httpsAgent: { options: { lookup: (...a: unknown[]) => void } };
    };
    expect(options.responseType).toBe('arraybuffer');
    expect(options.maxRedirects).toBe(0);
    expect(options.maxContentLength).toBe(8 * 1024 * 1024);
    const lookupCallback = vi.fn();
    options.httpsAgent.options.lookup('x', {}, lookupCallback);
    expect(lookupCallback).toHaveBeenCalledWith(null, '142.250.1.1', 4);
  });

  it('surfaces an oversize response as a too-large error', async () => {
    axiosGet.mockRejectedValue({
      isAxiosError: true,
      message: 'maxContentLength size of 8388608 exceeded',
    });
    await expect(
      call({ auth: AUTH, data: { url: IMG_URL } })
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      message: 'Image is too large.',
    });
  });

  it('returns a generic message when the fetch fails', async () => {
    axiosGet.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:443'));
    await expect(
      call({ auth: AUTH, data: { url: IMG_URL } })
    ).rejects.toMatchObject({
      code: 'internal',
      message: 'Failed to fetch image.',
    });
  });

  it('rate-limits a uid after 300 calls in the window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000_000_000);
    axiosGet.mockResolvedValue(imageResponse(PNG, 'image/png'));
    for (let i = 0; i < 300; i += 1) {
      await call({ auth: { uid: 'bulk-importer' }, data: { url: IMG_URL } });
    }
    await expect(
      call({ auth: { uid: 'bulk-importer' }, data: { url: IMG_URL } })
    ).rejects.toMatchObject({ code: 'resource-exhausted' });
    await expect(
      call({ auth: { uid: 'other-teacher' }, data: { url: IMG_URL } })
    ).resolves.toBeTruthy();
  });
});
