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
  fetchImportPage,
  htmlToPage,
  looksLikeSignInUrl,
  type FetchedResponse,
  type ImportPageDeps,
} from './importPageFetch';
import { isUrlBlocked } from './sendBlockList';

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
    expect(page.blocks).toEqual([{ type: 'paragraph', text: 'Quiz intro' }]);
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
    ['open quotes', '<p title="'],
    ['unclosed paragraphs', '<p '],
  ])('%s', (_label, unit) => {
    const body = unit.repeat(Math.floor(MB / unit.length));
    const started = performance.now();
    htmlToPage(`<p>Start</p>${body}`, new URL('https://example.org/'));
    expect(performance.now() - started).toBeLessThan(1_500);
  });

  it('still cuts an unclosed form to the end of the page', () => {
    const page = htmlToPage(
      '<body><p>Keep</p><form><p>Secret</p></body>',
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
  it('rejects a host that resolves to a private address', async () => {
    dnsLookup.mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }]);
    const { fetchImportPageV1 } = await import('./importPageFetch');
    expect(fetchImportPageV1).toBeDefined();
    const { resolveAndValidateHost } = await import('./ssrfGuard');
    await expect(resolveAndValidateHost('intranet.example')).rejects.toThrow();
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
