import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  PublishError,
  readCredentials,
  storeVersion,
  uploadAndPublish,
  type Credentials,
} from './webStore';

const creds: Credentials = {
  CWS_CLIENT_ID: 'client',
  CWS_CLIENT_SECRET: 'secret',
  CWS_REFRESH_TOKEN: 'refresh',
  CWS_PUBLISHER_ID: 'pub-1',
};
const itemId = 'abcdefghijklmnopabcdefghijklmnop';

/** A fake fetch that answers each call in turn and records what was asked. */
function fakeFetch(replies: { status?: number; body: unknown }[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const impl = (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const reply = replies.shift();
    if (!reply) throw new Error(`unexpected call to ${url}`);
    return Promise.resolve(
      new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 })
    );
  };
  return { calls, impl: impl as typeof fetch };
}

const run = (
  replies: { status?: number; body: unknown }[],
  version = '0.2.0'
) => {
  const f = fakeFetch(replies);
  const promise = uploadAndPublish({
    creds,
    itemId,
    zip: new Uint8Array([1, 2, 3]),
    version,
    fetchImpl: f.impl,
    sleep: () => Promise.resolve(),
    log: () => undefined,
  });
  return { calls: f.calls, promise };
};

describe('readCredentials', () => {
  it('names every missing secret and the environment to add it to', () => {
    expect(() =>
      readCredentials(
        { CWS_CLIENT_ID: 'x', CWS_REFRESH_TOKEN: ' ' },
        'chrome-web-store-dev'
      )
    ).toThrow(
      'add CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN, CWS_PUBLISHER_ID as secrets of the "chrome-web-store-dev" GitHub environment'
    );
  });

  it('returns trimmed values when all are set', () => {
    expect(
      readCredentials({ ...creds, CWS_PUBLISHER_ID: ' pub-1\n' }, 'e')
    ).toEqual(creds);
  });
});

describe('uploadAndPublish', () => {
  it('uploads, then publishes the same item', async () => {
    const { calls, promise } = run([
      { body: { access_token: 'tok' } },
      { body: { uploadState: 'SUCCEEDED', crxVersion: '0.2.0' } },
      { body: { state: 'PENDING_REVIEW' } },
    ]);
    await expect(promise).resolves.toBe('PENDING_REVIEW');
    expect(calls.map((c) => c.url)).toEqual([
      'https://oauth2.googleapis.com/token',
      `https://chromewebstore.googleapis.com/upload/v2/publishers/pub-1/items/${itemId}:upload`,
      `https://chromewebstore.googleapis.com/v2/publishers/pub-1/items/${itemId}:publish`,
    ]);
    expect(calls[1].init?.headers).toMatchObject({
      Authorization: 'Bearer tok',
    });
  });

  it('waits for an upload that is still processing', async () => {
    const { calls, promise } = run([
      { body: { access_token: 'tok' } },
      { body: { uploadState: 'IN_PROGRESS' } },
      { body: { lastAsyncUploadState: 'IN_PROGRESS' } },
      { body: { lastAsyncUploadState: 'SUCCEEDED' } },
      { body: { state: 'PENDING_REVIEW' } },
    ]);
    await expect(promise).resolves.toBe('PENDING_REVIEW');
    expect(calls.filter((c) => c.url.endsWith(':fetchStatus'))).toHaveLength(2);
  });

  it('never publishes when the upload fails', async () => {
    const { calls, promise } = run([
      { body: { access_token: 'tok' } },
      { body: { uploadState: 'FAILED' } },
    ]);
    await expect(promise).rejects.toThrow('did not accept the package');
    expect(calls.some((c) => c.url.endsWith(':publish'))).toBe(false);
  });

  it('refuses a package whose version is not the one being released', async () => {
    const { promise } = run([
      { body: { access_token: 'tok' } },
      { body: { uploadState: 'SUCCEEDED', crxVersion: '0.1.9' } },
    ]);
    await expect(promise).rejects.toThrow('expected 0.2.0');
  });

  it('reports an HTTP error with its status', async () => {
    const { promise } = run([
      { status: 400, body: { error: 'invalid_grant' } },
    ]);
    await expect(promise).rejects.toThrow(
      'Getting a Web Store token failed (HTTP 400)'
    );
  });

  it('rejects an item ID that is not an extension ID', async () => {
    const f = fakeFetch([]);
    await expect(
      uploadAndPublish({
        creds,
        itemId: 'not-an-id',
        zip: new Uint8Array(),
        version: '1',
        fetchImpl: f.impl,
      })
    ).rejects.toBeInstanceOf(PublishError);
    expect(f.calls).toHaveLength(0);
  });
});

describe('compareVersions', () => {
  it('compares each part as a number', () => {
    expect(compareVersions('0.1.23', '0.1.9')).toBeGreaterThan(0);
    expect(compareVersions('0.1.23', '0.1.23')).toBe(0);
    expect(compareVersions('0.1', '0.1.0')).toBe(0);
    expect(compareVersions('0.1.19', '0.2')).toBeLessThan(0);
  });
});

describe('storeVersion', () => {
  const channel = (crxVersion: string) => ({
    distributionChannels: [{ deployPercentage: 100, crxVersion }],
  });

  it('takes the higher of the published and submitted versions', async () => {
    const f = fakeFetch([
      { body: { access_token: 'tok' } },
      {
        body: {
          publishedItemRevisionStatus: channel('0.1.19'),
          submittedItemRevisionStatus: channel('0.1.23'),
        },
      },
    ]);
    await expect(
      storeVersion({ creds, itemId, fetchImpl: f.impl })
    ).resolves.toBe('0.1.23');
    expect(f.calls[1].url).toContain(
      `/v2/publishers/pub-1/items/${itemId}:fetchStatus`
    );
  });

  it('returns undefined when the item reports no version', async () => {
    const f = fakeFetch([{ body: { access_token: 'tok' } }, { body: {} }]);
    await expect(
      storeVersion({ creds, itemId, fetchImpl: f.impl })
    ).resolves.toBeUndefined();
  });

  it('fails when the status call fails', async () => {
    const f = fakeFetch([
      { body: { access_token: 'tok' } },
      { status: 403, body: { error: 'denied' } },
    ]);
    await expect(
      storeVersion({ creds, itemId, fetchImpl: f.impl })
    ).rejects.toThrow('Reading the listing failed (HTTP 403)');
  });
});
