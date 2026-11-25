import { describe, expect, it, vi } from 'vitest';
import {
  parseFreshserviceRequest,
  runFreshservice,
  type ArticleRecord,
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
  const saved: {
    site?: FreshserviceSite;
    articleId?: number;
    record?: ArticleRecord;
  } = {};
  const d: FreshserviceDeps = {
    isAdmin: () => Promise.resolve(true),
    allowed: () => Promise.resolve(true),
    isAuthor: () => Promise.resolve(false),
    loadSite: () => Promise.resolve(ready),
    saveSite: (c) => {
      saved.site = c;
      return Promise.resolve();
    },
    loadApiKey: () => Promise.resolve('abcdefgh1234'),
    publishedTitle: () => Promise.resolve('Enable Markdown'),
    article: () => Promise.resolve(null),
    saveArticle: (_s, record) => {
      saved.articleId = record.articleId;
      saved.record = record;
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
    const { d } = deps({ article: () => Promise.resolve({ articleId: 7 }) });
    vi.mocked(d.fetch).mockResolvedValueOnce(
      reply(200, { article: { id: 7 } })
    );
    await runFreshservice(send, 'u', token, d);
    expect(vi.mocked(d.fetch).mock.calls[0][0]).toBe(
      'https://orono.freshservice.com/api/v2/solutions/articles/7'
    );
    const put = vi.mocked(d.fetch).mock.calls[0][1] as RequestInit;
    expect(put.method).toBe('PUT');
    expect(put.redirect).toBe('error');
    expect(JSON.parse(put.body as string)).toMatchObject({ folder_id: 42 });

    const gone = deps({ article: () => Promise.resolve({ articleId: 7 }) });
    vi.mocked(gone.d.fetch)
      .mockResolvedValueOnce(reply(404, {}))
      .mockResolvedValueOnce(reply(201, { article: { id: 8 } }));
    expect(await runFreshservice(send, 'u', token, gone.d)).toEqual({
      sent: true,
      articleId: 8,
    });
    expect(gone.saved.articleId).toBe(8);
  });

  it('records the address and FreshService status on every send', async () => {
    const { d, saved } = deps({
      article: () => Promise.resolve({ articleId: 7, folderId: '77' }),
    });
    vi.mocked(d.fetch).mockResolvedValueOnce(
      reply(200, { article: { id: 7, status: 2 } })
    );
    await runFreshservice(send, 'u', token, d);
    expect(saved.record).toEqual({
      articleId: 7,
      folderId: '77',
      status: 2,
      url: 'https://orono.freshservice.com/a/solutions/articles/7',
    });
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

  it("logs FreshService's reason when it refuses the key", async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const refused = deps();
    vi.mocked(refused.d.fetch).mockResolvedValueOnce(
      reply(403, { code: 'access_denied', message: 'Not authorized.' })
    );
    await expect(runFreshservice(send, 'u', token, refused.d)).rejects.toThrow(
      'API key'
    );
    expect(logged).toHaveBeenCalledWith(
      '[freshserviceV1] send refused',
      expect.objectContaining({ status: 403, code: 'access_denied' })
    );
    logged.mockRestore();
  });

  it('sends the chosen folder, tags and keywords and reuses them on the next publish', async () => {
    const { d, saved } = deps();
    const options = {
      folderId: '77',
      tags: ['Schoology'],
      keywords: ['embed'],
    };
    await runFreshservice({ ...send, options }, 'u', token, d);
    const post = vi.mocked(d.fetch).mock.calls[0][1] as RequestInit;
    expect(JSON.parse(post.body as string)).toMatchObject({
      folder_id: 77,
      tags: ['Schoology'],
      keywords: ['embed'],
      status: 1,
    });
    expect(saved.record).toEqual({
      articleId: 7,
      ...options,
      status: 1,
      url: 'https://orono.freshservice.com/a/solutions/articles/7',
    });

    const again = deps({
      article: () => Promise.resolve({ articleId: 7, ...options }),
    });
    await runFreshservice(send, 'u', token, again.d);
    const put = vi.mocked(again.d.fetch).mock.calls[0][1] as RequestInit;
    expect(put.method).toBe('PUT');
    expect(JSON.parse(put.body as string)).toEqual({
      title: 'Enable Markdown',
      description: '<p>x</p>',
      folder_id: 77,
      tags: ['Schoology'],
      keywords: ['embed'],
    });
  });

  it('leaves tags alone on an article nobody labelled here', async () => {
    const { d } = deps({ article: () => Promise.resolve({ articleId: 7 }) });
    await runFreshservice(send, 'u', token, d);
    const body = JSON.parse(
      (vi.mocked(d.fetch).mock.calls[0][1] as RequestInit).body as string
    ) as Record<string, unknown>;
    expect(body).not.toHaveProperty('tags');
    expect(body).not.toHaveProperty('keywords');
  });

  it('lists categories with their folders and what the tour last used', async () => {
    const { d } = deps({
      article: () =>
        Promise.resolve({ articleId: 7, folderId: '11', tags: ['a'] }),
    });
    vi.mocked(d.fetch)
      .mockResolvedValueOnce(
        reply(200, { categories: [{ id: 1, name: 'Knowledge Base' }] })
      )
      .mockResolvedValueOnce(
        reply(200, {
          folders: [{ id: 11, name: 'General', visibility: 2 }, { id: 'x' }],
        })
      );
    expect(
      await runFreshservice(
        { action: 'catalog', setId: 'tour1' },
        'u',
        token,
        d
      )
    ).toEqual({
      ready: true,
      defaultFolderId: '42',
      saved: { folderId: '11', tags: ['a'], keywords: [] },
      categories: [
        {
          id: '1',
          name: 'Knowledge Base',
          folders: [{ id: '11', name: 'General', visibility: 2 }],
        },
      ],
    });
    const urls = vi.mocked(d.fetch).mock.calls.map((c) => c[0]);
    expect(urls).toEqual([
      'https://orono.freshservice.com/api/v2/solutions/categories?per_page=100&page=1',
      'https://orono.freshservice.com/api/v2/solutions/folders?category_id=1&per_page=100&page=1',
    ]);
    expect(
      (vi.mocked(d.fetch).mock.calls[0][1] as RequestInit).body
    ).toBeUndefined();
  });

  it('creates a folder with its visibility and a category by name', async () => {
    const { d } = deps();
    vi.mocked(d.fetch)
      .mockResolvedValueOnce(reply(201, { folder: { id: 55 } }))
      .mockResolvedValueOnce(reply(201, { category: { id: 66 } }))
      .mockResolvedValueOnce(reply(409, {}));
    expect(
      await runFreshservice(
        {
          action: 'createFolder',
          categoryId: '3',
          name: 'Schoology',
          visibility: 2,
        },
        'u',
        token,
        d
      )
    ).toEqual({ id: '55' });
    const [url, init] = vi.mocked(d.fetch).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://orono.freshservice.com/api/v2/solutions/folders');
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'Schoology',
      category_id: 3,
      visibility: 2,
    });
    expect(
      await runFreshservice(
        { action: 'createCategory', name: 'Teacher guides' },
        'u',
        token,
        d
      )
    ).toEqual({ id: '66' });
    await expect(
      runFreshservice({ action: 'createCategory', name: 'Dup' }, 'u', token, d)
    ).rejects.toThrow('already be in use');
  });

  it('checks the new requests', () => {
    expect(
      parseFreshserviceRequest({
        action: 'send',
        setId: 'tour1',
        html: '<p>x</p>',
        options: {
          folderId: '9',
          tags: [' Google ', 'google', ''],
          keywords: ['sign  in'],
        },
      })
    ).toMatchObject({
      options: { folderId: '9', tags: ['Google'], keywords: ['sign in'] },
    });
    expect(() =>
      parseFreshserviceRequest({
        action: 'send',
        setId: 'tour1',
        html: 'a',
        options: { folderId: 'x' },
      })
    ).toThrow('folder');
    expect(() =>
      parseFreshserviceRequest({
        action: 'send',
        setId: 'tour1',
        html: 'a',
        options: { folderId: '9', tags: ['x'.repeat(33)] },
      })
    ).toThrow('32');
    expect(() =>
      parseFreshserviceRequest({
        action: 'createFolder',
        categoryId: '3',
        name: 'A',
        visibility: 4,
      })
    ).toThrow('see the folder');
    expect(() =>
      parseFreshserviceRequest({ action: 'createCategory', name: ' ' })
    ).toThrow('name');
  });

  it('lets a tour author send and file articles but not change the settings', async () => {
    const author = {
      isAdmin: () => Promise.resolve(false),
      allowed: () => Promise.resolve(false),
      isAuthor: () => Promise.resolve(true),
    };
    const { d, saved } = deps(author);
    expect(await runFreshservice(send, 'u', token, d)).toEqual({
      sent: true,
      articleId: 7,
    });
    expect(await runFreshservice({ action: 'status' }, 'u', token, d)).toEqual({
      domain: 'orono.freshservice.com',
      folderId: '42',
      hasKey: true,
    });
    await expect(
      runFreshservice(
        { action: 'save', domain: 'new.freshservice.com', folderId: '9' },
        'u',
        token,
        d
      )
    ).rejects.toThrow('Only an admin');
    expect(saved.site).toBeUndefined();
    const stranger = deps({
      ...author,
      isAuthor: () => Promise.resolve(false),
    });
    await expect(runFreshservice(send, 'u', token, stranger.d)).rejects.toThrow(
      'not turned on'
    );
  });
});
