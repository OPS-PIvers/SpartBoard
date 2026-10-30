// Unit tests for the pasted-URL import fetch (plan D17).

import { describe, it, expect, vi } from 'vitest';

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
vi.mock('./districtStaff', () => ({ isDistrictStaffToken: vi.fn() }));
vi.mock('./quizMediaArchive', () => ({ isGlobalFeatureGranted: vi.fn() }));
vi.mock('firebase-admin', () => ({ firestore: vi.fn() }));

const dnsLookup = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('dns', () => {
  const lookup = (...args: unknown[]): Promise<unknown> => dnsLookup(...args);
  return { default: { promises: { lookup } }, promises: { lookup } };
});

import {
  decodeHtmlBytes,
  fetchImportPage,
  fetchOnceGuarded,
  readCapped,
  htmlToPage,
  looksLikeSignInUrl,
  type FetchedResponse,
  type ImportPageDeps,
} from './importPageFetch';
import { isUrlBlocked } from './import/shared.gen';
import { Readable } from 'stream';

const html = (body: string, head = '<title>Cells</title>') =>
  `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

const ok = (body: string): FetchedResponse => ({
  status: 200,
  contentType: 'text/html; charset=utf-8',
  body,
});

function deps(
  responses: Record<string, FetchedResponse | Error>,
  blocked: string[] = []
): ImportPageDeps & { fetched: string[] } {
  const fetched: string[] = [];
  return {
    fetched,
    isBlocked: (url) => Promise.resolve(isUrlBlocked(url, blocked)),
    fetchOnce: (url) => {
      fetched.push(url.href);
      const r = responses[url.href];
      if (!r) return Promise.reject(new Error('no route'));
      return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
    },
  };
}

describe('htmlToPage', () => {
  it('reads the article with typed blocks and images', () => {
    const page = htmlToPage(
      html(
        `<nav>Home | About</nav>
         <article>
           <h2>Plant cells</h2>
           <p>Cells have a <b>wall</b> &amp; a membrane.</p>
           <ul><li>Chloroplast</li><li>Vacuole</li></ul>
           <blockquote><p>Life is cellular.</p></blockquote>
           <img src="/img/cell.png" alt="A plant cell">
           <img src="data:image/png;base64,xx">
         </article>
         <footer>Copyright</footer>`
      ),
      new URL('https://bio.example.org/cells')
    );
    expect(page.title).toBe('Cells');
    expect(page.platform).toBe('generic');
    expect(page.blocks).toEqual([
      { type: 'heading', level: 2, text: 'Plant cells' },
      { type: 'paragraph', text: 'Cells have a wall & a membrane.' },
      { type: 'listItem', text: 'Chloroplast' },
      { type: 'listItem', text: 'Vacuole' },
      { type: 'quote', text: 'Life is cellular.' },
    ]);
    expect(page.images).toEqual([
      { url: 'https://bio.example.org/img/cell.png', alt: 'A plant cell' },
    ]);
  });

  it('never reads form fields or their values', () => {
    const page = htmlToPage(
      html(
        `<main><p>Quiz intro</p>
         <form><label>Name</label><input value="Ada Lovelace"><textarea>my secret answer</textarea>
         <select><option selected>Period 3</option></select></form>
         <input type="hidden" value="token-123"></main>`
      ),
      new URL('https://example.org/q')
    );
    const text = JSON.stringify(page);
    expect(text).not.toMatch(/Ada Lovelace|secret answer|Period 3|token-123/);
    expect(page.blocks).toEqual([
      { type: 'paragraph', text: 'Quiz intro' },
      { type: 'paragraph', text: 'Name' },
    ]);
  });

  it('keeps form text out even when the markup is broken', () => {
    const page = htmlToPage(
      `<body><p>Keep</p><input value="a > SECRETVAL"><p title="x>ATTR">Shown</p>
       <textarea>TAREA secret after`,
      new URL('https://example.org/')
    );
    expect(JSON.stringify(page)).not.toMatch(/SECRETVAL|ATTR|TAREA|secret/);
    expect(page.blocks).toEqual([
      { type: 'paragraph', text: 'Keep' },
      { type: 'paragraph', text: 'Shown' },
    ]);
  });

  it('reads text after an apostrophe in an unquoted attribute', () => {
    const page = htmlToPage(
      "<body><p class=it's>One</p><p>Two</p></body>",
      new URL('https://example.org/')
    );
    expect(page.blocks.map((b) => ('text' in b ? b.text : ''))).toEqual([
      'One',
      'Two',
    ]);
  });

  it('reads past a script that compares with <', () => {
    const page = htmlToPage(
      '<body><script>for(var i=0;i<n;i++)f(i)</script><style>a<b{}</style><p>Real content</p></body>',
      new URL('https://example.org/')
    );
    expect(page.blocks).toEqual([{ type: 'paragraph', text: 'Real content' }]);
  });

  it('keeps content after a script on a page with İ', () => {
    const page = htmlToPage(
      '<body><p>İİİİ</p><script>x</script><p>after</p></body>',
      new URL('https://example.org/')
    );
    expect(page.blocks.map((b) => ('text' in b ? b.text : ''))).toEqual([
      'İİİİ',
      'after',
    ]);
  });

  it('keeps inline markup from splitting words', () => {
    const page = htmlToPage(
      '<p>Hello, <a href=x>world</a>. Sp<b>art</b>Board</p>',
      new URL('https://example.org/')
    );
    expect(page.blocks).toEqual([
      { type: 'paragraph', text: 'Hello, world. SpartBoard' },
    ]);
  });

  it('reads a page wrapped in one big form, without its fields', () => {
    const page = htmlToPage(
      '<body><form id=f><div><h1>Page</h1><p>Content</p><input value=SECRET><select><option>OPT</option></select></div></form></body>',
      new URL('https://example.org/')
    );
    expect(page.blocks).toEqual([
      { type: 'heading', level: 1, text: 'Page' },
      { type: 'paragraph', text: 'Content' },
    ]);
  });

  it('keeps an article headline and a page with no </head>', () => {
    expect(
      htmlToPage(
        '<article><header><h1>Title</h1></header><p>Body</p></article>',
        new URL('https://example.org/')
      ).blocks
    ).toEqual([
      { type: 'heading', level: 1, text: 'Title' },
      { type: 'paragraph', text: 'Body' },
    ]);
    expect(
      htmlToPage(
        '<html><head><title>T</title><p>Real</p>',
        new URL('https://example.org/')
      ).blocks
    ).toEqual([{ type: 'paragraph', text: 'Real' }]);
  });

  it('prefers the main content over a small teaser card', () => {
    const long = 'Long text. '.repeat(30);
    const page = htmlToPage(
      `<body><article><p>teaser</p></article><main><p>${long}</p><p>more</p></main></body>`,
      new URL('https://example.org/')
    );
    expect(page.blocks.map((b) => ('text' in b ? b.text : ''))).toEqual([
      long.trim(),
      'more',
    ]);
  });

  it('drops orphan options and treats form feed as space in tags', () => {
    const page = htmlToPage(
      '<body><option>OPT</option><input value=\f"a>LEAK"><p>after</p></body>',
      new URL('https://example.org/')
    );
    expect(JSON.stringify(page)).not.toMatch(/OPT|LEAK/);
  });

  it('drops scripts and styles and prefers og:title', () => {
    const page = htmlToPage(
      html(
        '<script>var x = "leak"</script><style>p{}</style><p>Body text</p>',
        '<meta property="og:title" content="OG name"><title>Tag</title>'
      ),
      new URL('https://example.org/')
    );
    expect(page.title).toBe('OG name');
    expect(page.blocks).toEqual([{ type: 'paragraph', text: 'Body text' }]);
  });
});

describe('hostile HTML stays linear', () => {
  const MB = 1_048_576;
  it.each([
    ['unclosed forms', '<form '],
    ['unclosed buttons', '<button x'],
    ['unclosed comments', '<!--'],
    ['unclosed images', '<img src=a '],
    ['unclosed meta quotes', '<meta "'],
    ['unclosed articles', '<article>'],
    ['unclosed inputs', '<input type=text '],
    ['stray brackets', '<'],
    ['stray brackets before digits', '<1'],
    ['stray brackets before space', '< a'],
    ['unclosed scripts', '<script>'],
    ['open quotes', '<p title="'],
    ['unclosed paragraphs', '<p '],
  ])('%s', (_label, unit) => {
    const body = unit.repeat(Math.floor(MB / unit.length));
    const started = performance.now();
    htmlToPage(`<p>Start</p>${body}`, new URL('https://example.org/'));
    expect(performance.now() - started).toBeLessThan(1_500);
  });

  it('still cuts an unclosed textarea to the end of the page', () => {
    const page = htmlToPage(
      '<body><p>Keep</p><textarea><p>Secret</p></body>',
      new URL('https://example.org/')
    );
    expect(page.blocks).toEqual([{ type: 'paragraph', text: 'Keep' }]);
  });
});

describe('fetchImportPage', () => {
  it('returns the page for a plain public URL', async () => {
    const d = deps({
      'https://example.org/a': ok(html('<p>Hello</p>')),
    });
    const result = await fetchImportPage('https://example.org/a', d);
    expect(result).toMatchObject({
      status: 'ok',
      page: { url: 'https://example.org/a', title: 'Cells' },
    });
  });

  it('never sends or returns credentials or a fragment', async () => {
    const d = deps({ 'https://example.org/a': ok(html('<p>Hi</p>')) });
    const result = await fetchImportPage('https://u:p@example.org/a#x', d);
    expect(d.fetched).toEqual(['https://example.org/a']);
    expect(result).toMatchObject({ page: { url: 'https://example.org/a' } });
  });

  it('says to use the extension for a pasted sign-in link', async () => {
    const d = deps({});
    expect(
      await fetchImportPage('https://accounts.google.com/signin', d)
    ).toEqual({ status: 'use-extension', reason: 'sign-in' });
    expect(d.fetched).toEqual([]);
  });

  it('reads a pasted page whose path only names a sign-in topic', async () => {
    const url = 'https://en.wikipedia.org/wiki/Login';
    const d = deps({
      [url]: ok(html('<p>A login is how people sign in.</p>')),
    });
    expect(await fetchImportPage(url, d)).toMatchObject({ status: 'ok' });
  });

  it('still catches a pasted login page by its form', async () => {
    const url = 'https://app.example.org/login';
    const d = deps({
      [url]: ok(html('<p>Welcome</p><form><input type="password"></form>')),
    });
    expect(await fetchImportPage(url, d)).toEqual({
      status: 'use-extension',
      reason: 'sign-in',
    });
  });

  it('drops pictures hosted on blocked sites', async () => {
    const d = deps(
      {
        'https://example.org/a': ok(
          html(
            '<p>Hi</p><img src="https://app.schoology.com/user/9/photo.png"><img src="/ok.png">'
          )
        ),
      },
      ['*.schoology.com/user/*']
    );
    expect(await fetchImportPage('https://example.org/a', d)).toMatchObject({
      page: { images: [{ url: 'https://example.org/ok.png' }] },
    });
  });

  it('upgrades http to https', async () => {
    const d = deps({ 'https://example.org/a': ok(html('<p>Hi</p>')) });
    await fetchImportPage('http://example.org/a', d);
    expect(d.fetched).toEqual(['https://example.org/a']);
  });

  it('refuses a blocked page without fetching it', async () => {
    const d = deps({}, ['*.infinitecampus.org']);
    const result = await fetchImportPage(
      'https://orono.infinitecampus.org/campus/grades',
      d
    );
    expect(result).toEqual({ status: 'blocked' });
    expect(d.fetched).toEqual([]);
  });

  it('refuses when a redirect lands on a blocked page', async () => {
    const d = deps(
      {
        'https://short.example/x': {
          status: 302,
          location: 'https://app.schoology.com/course/9/gradebook',
          contentType: '',
          body: '',
        },
      },
      ['*.schoology.com/course/*/gradebook*']
    );
    const result = await fetchImportPage('https://short.example/x', d);
    expect(result).toEqual({ status: 'blocked' });
    expect(d.fetched).toEqual(['https://short.example/x']);
  });

  it('refuses a percent-encoded blocked path', async () => {
    const d = deps({}, ['*.schoology.com/course/*/gradebook*']);
    expect(
      await fetchImportPage('https://app.schoology.com/course/1/gr%61debook', d)
    ).toEqual({ status: 'blocked' });
    expect(d.fetched).toEqual([]);
  });

  it('says to use the extension when redirected to a sign-in page', async () => {
    const d = deps({
      'https://docs.example.org/d/1': {
        status: 302,
        location: 'https://accounts.google.com/ServiceLogin?continue=x',
        contentType: '',
        body: '',
      },
    });
    expect(await fetchImportPage('https://docs.example.org/d/1', d)).toEqual({
      status: 'use-extension',
      reason: 'sign-in',
    });
  });

  it('says to use the extension for a login form page', async () => {
    const d = deps({
      'https://lms.example.org/c': ok(
        html('<p>Sign in</p><form><input type="password"></form>')
      ),
    });
    expect(await fetchImportPage('https://lms.example.org/c', d)).toEqual({
      status: 'use-extension',
      reason: 'sign-in',
    });
  });

  it.each([
    [401, 'sign-in'],
    [403, 'refused'],
    [429, 'refused'],
    [503, 'refused'],
  ])('maps HTTP %i to use-extension (%s)', async (status, reason) => {
    const d = deps({
      'https://example.org/a': { status, contentType: 'text/html', body: '' },
    });
    expect(await fetchImportPage('https://example.org/a', d)).toEqual({
      status: 'use-extension',
      reason,
    });
  });

  it('says to use the extension when the page is built by scripts', async () => {
    const d = deps({
      'https://spa.example.org/': ok(html('<div id="root"></div>')),
    });
    expect(await fetchImportPage('https://spa.example.org/', d)).toEqual({
      status: 'use-extension',
      reason: 'no-content',
    });
  });

  it('reports a file that is not a web page', async () => {
    const d = deps({
      'https://example.org/f.pdf': {
        status: 200,
        contentType: 'application/pdf',
        body: '%PDF',
      },
    });
    expect(await fetchImportPage('https://example.org/f.pdf', d)).toEqual({
      status: 'not-a-page',
      contentType: 'application/pdf',
    });
  });

  it('stops after too many redirects', async () => {
    const hop = (n: number): FetchedResponse => ({
      status: 301,
      location: `https://example.org/${n + 1}`,
      contentType: '',
      body: '',
    });
    const d = deps({
      'https://example.org/0': hop(0),
      'https://example.org/1': hop(1),
      'https://example.org/2': hop(2),
      'https://example.org/3': hop(3),
    });
    expect(await fetchImportPage('https://example.org/0', d)).toEqual({
      status: 'use-extension',
      reason: 'unreachable',
    });
  });

  it('refuses a redirect to plain http', async () => {
    const d = deps({
      'https://example.org/a': {
        status: 302,
        location: 'http://169.254.169.254/latest',
        contentType: '',
        body: '',
      },
    });
    expect(await fetchImportPage('https://example.org/a', d)).toEqual({
      status: 'use-extension',
      reason: 'unreachable',
    });
    expect(d.fetched).toEqual(['https://example.org/a']);
  });

  it('rejects non-web schemes', async () => {
    await expect(
      fetchImportPage('file:///etc/passwd', deps({}))
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(fetchImportPage('not a url', deps({}))).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });
});

describe('SSRF guard on the real fetch hop', () => {
  it('refuses a host that resolves to a private address', async () => {
    dnsLookup.mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }]);
    await expect(
      fetchOnceGuarded(new URL('https://intranet.example/'), 1_000)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('calls a name that does not resolve unreachable', async () => {
    dnsLookup.mockRejectedValueOnce(
      Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
    );
    expect(
      await fetchImportPage('https://exmaple.org/lesson', {
        isBlocked: () => Promise.resolve(false),
        fetchOnce: fetchOnceGuarded,
      })
    ).toEqual({ status: 'use-extension', reason: 'unreachable' });
  });
});

describe('readCapped', () => {
  it('cuts a long page at the cap instead of failing', async () => {
    const chunk = Buffer.alloc(400_000, 0x61);
    const body = await readCapped(Readable.from([chunk, chunk, chunk, chunk]));
    expect(body.length).toBe(1_048_576);
  });
});

describe('decodeHtmlBytes', () => {
  it('uses the header charset', () => {
    const bytes = Buffer.from([0x93, 0x43, 0x61, 0x66, 0xe9, 0x94]);
    expect(decodeHtmlBytes(bytes, 'text/html; charset=windows-1252')).toBe(
      '\u201cCaf\u00e9\u201d'
    );
  });

  it('falls back to a meta charset, then UTF-8', () => {
    const meta = Buffer.concat([
      Buffer.from('<meta charset="shift_jis"><p>'),
      Buffer.from([0x82, 0xa0]),
    ]);
    expect(decodeHtmlBytes(meta, 'text/html')).toBe(
      '<meta charset="shift_jis"><p>\u3042'
    );
    expect(decodeHtmlBytes(Buffer.from('Caf\u00e9'), 'text/html')).toBe(
      'Caf\u00e9'
    );
    expect(
      decodeHtmlBytes(Buffer.from('ok'), 'text/html; charset=nonsense')
    ).toBe('ok');
  });
});

describe('looksLikeSignInUrl', () => {
  it.each([
    'https://accounts.google.com/o/oauth2/auth',
    'https://app.example.org/login?next=/',
    'https://app.example.org/users/sign_in',
    'https://sso.example.org/saml/start',
  ])('treats %s as sign-in', (u) => {
    expect(looksLikeSignInUrl(new URL(u))).toBe(true);
  });

  it.each([
    'https://example.org/blog/logistics',
    'https://example.org/authors/ada',
  ])('does not treat %s as sign-in', (u) => {
    expect(looksLikeSignInUrl(new URL(u))).toBe(false);
  });
});
