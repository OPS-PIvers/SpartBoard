import { describe, expect, it, vi } from 'vitest';
import {
  parseFreshserviceRequest,
  runFreshservice,
  type FreshserviceDeps,
  type FreshserviceSite,
} from './freshservice';

const ready: FreshserviceSite = {
  domain: 'orono.freshservice.com',
  folderId: '42',
};

const reply = (status: number, body: unknown) =>
  ({ status, json: () => Promise.resolve(body) }) as Response;

function deps(over: Partial<FreshserviceDeps> = {}) {
  const saved: { site?: FreshserviceSite; articleId?: number } = {};
  const d: FreshserviceDeps = {
    isAdmin: () => Promise.resolve(true),
    allowed: () => Promise.resolve(true),
    loadSite: () => Promise.resolve(ready),
    saveSite: (c) => {
      saved.site = c;
      return Promise.resolve();
    },
    loadApiKey: () => Promise.resolve('abcdefgh1234'),
    publishedTitle: () => Promise.resolve('Enable Markdown'),
    articleId: () => Promise.resolve(null),
    saveArticleId: (_s, id) => {
      saved.articleId = id;
      return Promise.resolve();
    },
    fetch: vi.fn(() => Promise.resolve(reply(201, { article: { id: 7 } }))),
    ...over,
  };
  return { d, saved };
}
const token = { email: 'admin@x.org' };
const send = { action: 'send' as const, setId: 'tour1', html: '<p>x</p>' };

describe('parseFreshserviceRequest', () => {
  it('cleans the address and checks the folder and key', () => {
    expect(
      parseFreshserviceRequest({
        action: 'save',
        domain: ' https://Orono.freshservice.com/a/ ',
        folderId: '42',
      })
    ).toEqual({
      action: 'save',
      domain: 'orono.freshservice.com',
      folderId: '42',
    });
    expect(() =>
      parseFreshserviceRequest({
        action: 'save',
        domain: 'evil.com',
        folderId: '1',
      })
    ).toThrow('freshservice.com');
    expect(() =>
      parseFreshserviceRequest({
        action: 'save',
        domain: 'a.freshservice.com',
        folderId: 'x',
      })
    ).toThrow('folder');
    expect(() =>
      parseFreshserviceRequest({ action: 'send', setId: '../x', html: 'a' })
    ).toThrow();
  });
});

describe('runFreshservice', () => {
  it('refuses a caller who is not an admin with the flag', async () => {
    const { d } = deps({ allowed: () => Promise.resolve(false) });
    await expect(runFreshservice(send, 'u', token, d)).rejects.toThrow(
      'not turned on'
    );
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it('never returns the key and saves only the site and folder', async () => {
    const { d, saved } = deps();
    expect(await runFreshservice({ action: 'status' }, 'u', token, d)).toEqual({
      domain: 'orono.freshservice.com',
      folderId: '42',
      hasKey: true,
    });
    await runFreshservice(
      { action: 'save', domain: 'new.freshservice.com', folderId: '9' },
      'u',
      token,
      d
    );
    expect(saved.site).toEqual({
      domain: 'new.freshservice.com',
      folderId: '9',
    });
  });

  it('does nothing until the site and the secret are both set up', async () => {
    for (const over of [
      { loadSite: () => Promise.resolve(null) },
      { loadApiKey: () => Promise.resolve(null) },
    ]) {
      const { d } = deps(over);
      expect(await runFreshservice(send, 'u', token, d)).toEqual({
        sent: false,
      });
      expect(d.fetch).not.toHaveBeenCalled();
    }
  });

  it('creates a draft article the first time and saves its id', async () => {
    const { d, saved } = deps();
    expect(await runFreshservice(send, 'u', token, d)).toEqual({
      sent: true,
      articleId: 7,
    });
    const [url, init] = vi.mocked(d.fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      'https://orono.freshservice.com/api/v2/solutions/articles'
    );
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('abcdefgh1234:X').toString('base64')}`
    );
    expect(JSON.parse(init.body as string)).toEqual({
      title: 'Enable Markdown',
      description: '<p>x</p>',
      folder_id: 42,
      article_type: 1,
      status: 1,
    });
    expect(saved.articleId).toBe(7);
  });

  it('updates the saved article, and makes it again when it was deleted', async () => {
    const { d } = deps({ articleId: () => Promise.resolve(7) });
    vi.mocked(d.fetch).mockResolvedValueOnce(
      reply(200, { article: { id: 7 } })
    );
    await runFreshservice(send, 'u', token, d);
    expect(vi.mocked(d.fetch).mock.calls[0][0]).toBe(
      'https://orono.freshservice.com/api/v2/solutions/articles/7'
    );
    expect((vi.mocked(d.fetch).mock.calls[0][1] as RequestInit).method).toBe(
      'PUT'
    );

    const gone = deps({ articleId: () => Promise.resolve(7) });
    vi.mocked(gone.d.fetch)
      .mockResolvedValueOnce(reply(404, {}))
      .mockResolvedValueOnce(reply(201, { article: { id: 8 } }));
    expect(await runFreshservice(send, 'u', token, gone.d)).toEqual({
      sent: true,
      articleId: 8,
    });
    expect(gone.saved.articleId).toBe(8);
  });

  it('refuses an unpublished tour and reports a bad key', async () => {
    const unpublished = deps({ publishedTitle: () => Promise.resolve(null) });
    await expect(
      runFreshservice(send, 'u', token, unpublished.d)
    ).rejects.toThrow('Publish');
    const badKey = deps();
    vi.mocked(badKey.d.fetch).mockResolvedValueOnce(reply(401, {}));
    await expect(runFreshservice(send, 'u', token, badKey.d)).rejects.toThrow(
      'API key'
    );
  });
});
