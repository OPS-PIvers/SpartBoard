// Server fetch of a pasted public URL for Import (plan D17): SSRF-guarded, obeys the Send block list.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import axios from 'axios';
import { ALLOWED_ORIGINS } from './classlinkShared';
import {
  createPinnedAgent,
  resolveAndValidateHost,
  type ResolvedAddress,
} from './ssrfGuard';
import { decodeHtmlEntities } from './linkPreview';
import { isDistrictStaffToken } from './districtStaff';
import { isGlobalFeatureGranted } from './quizMediaArchive';
import { isUrlBlocked, resolveBlockPatterns } from './sendBlockList';
import './functionsInit';
import { assertViewAsAllowed } from './viewAsGuard';

const FEATURE_ID = 'universal-import';
const BLOCK_LIST_DOC = 'import_send_block_list';
const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 1_048_576;
// Whole-call budget across redirect hops, under the 40 s function timeout.
const TOTAL_FETCH_MS = 25_000;
const FETCH_TIMEOUT_MS = 8_000;
// Under the importInboxV1 caps, so a fetched page can be sent on as-is.
const MAX_BLOCKS = 1_500;
const MAX_BLOCK_CHARS = 20_000;
const MAX_TEXT_CHARS = 200_000;
const MAX_IMAGES = 100;
const MAX_TITLE_CHARS = 500;
const RATE_LIMIT_MAX_CALLS = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

// Same shapes as ImportBlock / ImportImage in utils/import/contract.ts.
export type FetchedBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph' | 'listItem' | 'quote'; text: string };

/** An ImportSendRequest from the generic read, so Import treats it like a Send. */
export interface FetchedPage {
  url: string;
  title: string;
  platform: 'generic';
  selectionOnly: false;
  blocks: FetchedBlock[];
  images: { url: string; alt?: string }[];
}

// no-content: the page builds itself in the browser, so only the extension sees it.
export type UseExtensionReason =
  'sign-in' | 'refused' | 'unreachable' | 'no-content';

export type ImportPageFetchResult =
  | { status: 'ok'; page: FetchedPage }
  | { status: 'blocked' }
  | { status: 'not-a-page'; contentType: string }
  | { status: 'use-extension'; reason: UseExtensionReason };

export interface FetchedResponse {
  status: number;
  location?: string;
  contentType: string;
  body: string;
}

export interface ImportPageDeps {
  isBlocked: (url: string) => Promise<boolean>;
  // Resolves, validates and fetches one hop; throws on private hosts.
  fetchOnce: (url: URL) => Promise<FetchedResponse>;
}

const SIGN_IN_PATH =
  /(^|[/._-])(log[-_]?in|sign[-_]?in|sso|saml|oauth2?|auth(orize)?|cas)([/._?-]|$)/i;
const SIGN_IN_HOSTS = new Set([
  'accounts.google.com',
  'login.microsoftonline.com',
  'launchpad.classlink.com',
]);

/** True when a URL is a sign-in page rather than content. */
export function looksLikeSignInUrl(url: URL): boolean {
  return (
    SIGN_IN_HOSTS.has(url.hostname.toLowerCase()) ||
    SIGN_IN_PATH.test(url.pathname)
  );
}

// Elements whose contents never reach a page; forms go whole so no field value can leak.
const DROP_WITH_CONTENT = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'iframe',
  'object',
  'form',
  'textarea',
  'select',
  'button',
  'nav',
  'header',
  'footer',
  'aside',
  'head',
]);
// Void form fields carry values in attributes; they are skipped too.
const FORM_FIELDS = new Set(['input', 'option']);
const BLOCK_TAGS = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'div',
  'section',
  'article',
  'main',
  'li',
  'ul',
  'ol',
  'dl',
  'blockquote',
  'pre',
  'tr',
  'td',
  'th',
  'dt',
  'dd',
  'figure',
  'figcaption',
  'br',
  'hr',
  'table',
]);

interface TagToken {
  kind: 'tag';
  name: string;
  closing: boolean;
  raw: string;
  start: number;
  end: number;
}
type Token = TagToken | { kind: 'text'; text: string };

const TAG_NAME = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/y;

/**
 * One left-to-right pass over the HTML, so hostile markup costs linear time. Quotes are honoured only
 * after `=`, a tag with no `>` ends the page, and comments are skipped. Text never comes from attributes.
 */
function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  const len = html.length;
  let i = 0;
  while (i < len) {
    const lt = html.indexOf('<', i);
    if (lt < 0) {
      tokens.push({ kind: 'text', text: html.slice(i) });
      break;
    }
    if (lt > i) tokens.push({ kind: 'text', text: html.slice(i, lt) });
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end < 0 ? len : end + 3;
      continue;
    }
    TAG_NAME.lastIndex = lt;
    const m = TAG_NAME.exec(html);
    if (!m) {
      // A `<!doctype`, `<?xml` or stray `<`: skip to its `>` without reading it as text.
      const gt = html.indexOf('>', lt);
      if (html[lt + 1] === '!' || html[lt + 1] === '?') {
        i = gt < 0 ? len : gt + 1;
      } else {
        tokens.push({ kind: 'text', text: '<' });
        i = lt + 1;
      }
      continue;
    }
    let j = lt + m[0].length;
    let quote: string | null = null;
    let afterEquals = false;
    for (; j < len; j += 1) {
      const c = html[j];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '>') {
        break;
      } else if ((c === '"' || c === "'") && afterEquals) {
        quote = c;
      }
      if (c === '=') afterEquals = true;
      else if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r')
        afterEquals = false;
    }
    if (j >= len) break;
    tokens.push({
      kind: 'tag',
      name: m[2].toLowerCase(),
      closing: m[1] === '/',
      raw: html.slice(lt, j + 1),
      start: lt,
      end: j + 1,
    });
    i = j + 1;
  }
  return tokens;
}

const ATTR = /([^\s"'<>/=]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

/** Attributes of one tag token; its quotes are balanced by tokenize, so this stays linear. */
function attrsOf(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  const inner = raw.replace(/^<\/?[a-zA-Z][a-zA-Z0-9-]*/, '').replace(/>$/, '');
  for (const m of inner.matchAll(ATTR)) {
    const name = m[1].toLowerCase();
    if (!out.has(name))
      out.set(name, decodeHtmlEntities(m[2] ?? m[3] ?? m[4] ?? '').trim());
  }
  return out;
}

/** Tokens inside the first element of `tag`, matched by depth; null when there is none. */
function elementTokens(tokens: Token[], tag: string): Token[] | null {
  const open = tokens.findIndex(
    (t) => t.kind === 'tag' && t.name === tag && !t.closing
  );
  if (open < 0) return null;
  let depth = 1;
  for (let k = open + 1; k < tokens.length; k += 1) {
    const t = tokens[k];
    if (t.kind !== 'tag' || t.name !== tag) continue;
    depth += t.closing ? -1 : 1;
    if (depth === 0) return tokens.slice(open + 1, k);
  }
  return tokens.slice(open + 1);
}

interface Read {
  blocks: FetchedBlock[];
  images: FetchedPage['images'];
}

/** Reads blocks and images from tokens, skipping dropped elements (an unclosed one runs to the end). */
function readTokens(tokens: Token[], base: URL): Read {
  const blocks: FetchedBlock[] = [];
  const images: FetchedPage['images'] = [];
  const seen = new Set<string>();
  let total = 0;
  let quoteDepth = 0;
  let current: { type: FetchedBlock['type']; level: number } = {
    type: 'paragraph',
    level: 0,
  };
  let buffer: string[] = [];
  const flush = () => {
    const text = decodeHtmlEntities(buffer.join(' '))
      .replace(/\s+/g, ' ')
      .trim();
    buffer = [];
    const room = Math.min(MAX_BLOCK_CHARS, MAX_TEXT_CHARS - total);
    if (!text || room <= 0 || blocks.length >= MAX_BLOCKS) return;
    const kept = text.slice(0, room);
    total += kept.length;
    if (current.type === 'heading')
      blocks.push({ type: 'heading', level: current.level, text: kept });
    else
      blocks.push({
        type:
          current.type === 'paragraph' && quoteDepth > 0
            ? 'quote'
            : current.type,
        text: kept,
      });
  };
  const addImage = (raw: string) => {
    const attrs = attrsOf(raw);
    const src = attrs.get('src');
    if (!src || images.length >= MAX_IMAGES) return;
    let url: URL;
    try {
      url = new URL(src, base);
    } catch {
      return;
    }
    if (url.protocol !== 'https:' || seen.has(url.href)) return;
    if (url.href.length > 2_048) return;
    seen.add(url.href);
    const alt = attrs.get('alt')?.slice(0, 500);
    images.push(alt ? { url: url.href, alt } : { url: url.href });
  };

  let skip: string | null = null;
  let skipDepth = 0;
  for (const t of tokens) {
    if (skip !== null) {
      if (t.kind === 'tag' && t.name === skip) {
        skipDepth += t.closing ? -1 : 1;
        if (skipDepth === 0) skip = null;
      }
      continue;
    }
    if (t.kind === 'text') {
      buffer.push(t.text);
      continue;
    }
    if (DROP_WITH_CONTENT.has(t.name)) {
      if (!t.closing) {
        flush();
        skip = t.name;
        skipDepth = 1;
      }
      continue;
    }
    if (FORM_FIELDS.has(t.name)) continue;
    if (t.name === 'img') {
      if (!t.closing) addImage(t.raw);
      continue;
    }
    if (!BLOCK_TAGS.has(t.name)) continue;
    flush();
    if (t.name === 'blockquote') {
      quoteDepth = Math.max(0, quoteDepth + (t.closing ? -1 : 1));
      current = { type: 'paragraph', level: 0 };
    } else if (!t.closing && /^h[1-6]$/.test(t.name)) {
      current = { type: 'heading', level: Number(t.name[1]) };
    } else if (!t.closing && t.name === 'li') {
      current = { type: 'listItem', level: 0 };
    } else if (t.closing || t.name !== 'br') {
      current = { type: 'paragraph', level: 0 };
    }
  }
  flush();
  return { blocks, images };
}

function readTitle(tokens: Token[]): string {
  let title = '';
  for (let k = 0; k < tokens.length; k += 1) {
    const t = tokens[k];
    if (t.kind !== 'tag' || t.closing) continue;
    if (t.name === 'body') break;
    if (t.name === 'meta') {
      const attrs = attrsOf(t.raw);
      const key = (
        attrs.get('property') ??
        attrs.get('name') ??
        ''
      ).toLowerCase();
      const content = attrs.get('content');
      if (key === 'og:title' && content) return content;
    } else if (t.name === 'title' && !title) {
      const next = tokens[k + 1];
      if (next?.kind === 'text')
        title = decodeHtmlEntities(next.text).replace(/\s+/g, ' ').trim();
    }
  }
  return title;
}

const hasPasswordField = (tokens: Token[]): boolean =>
  tokens.some(
    (t) =>
      t.kind === 'tag' &&
      t.name === 'input' &&
      attrsOf(t.raw).get('type')?.toLowerCase() === 'password'
  );

/** The generic read of a fetched HTML page: title, main-content blocks and image URLs, never form values. */
export function htmlToPage(html: string, pageUrl: URL): FetchedPage {
  const tokens = tokenize(html);
  let read: Read = { blocks: [], images: [] };
  for (const tag of ['article', 'main', 'body']) {
    const inner = elementTokens(tokens, tag);
    if (!inner) continue;
    read = readTokens(inner, pageUrl);
    if (read.blocks.length > 0) break;
  }
  if (read.blocks.length === 0) read = readTokens(tokens, pageUrl);
  return {
    url: pageUrl.href,
    title: (readTitle(tokens) || pageUrl.hostname).slice(0, MAX_TITLE_CHARS),
    platform: 'generic',
    selectionOnly: false,
    blocks: read.blocks,
    images: read.images,
  };
}

/** True for a page whose only job is signing in: a password box and little else. */
export function looksLikeSignInPage(html: string, page: FetchedPage): boolean {
  const textLength = page.blocks.reduce(
    (n, b) => n + ('text' in b ? b.text.length : 0),
    0
  );
  return textLength < 600 && hasPasswordField(tokenize(html));
}

/** Follows redirects hop by hop, checking the block list and sign-in pages at every hop. */
export async function fetchImportPage(
  rawUrl: string,
  deps: ImportPageDeps
): Promise<ImportPageFetchResult> {
  let current: URL;
  try {
    current = new URL(rawUrl.trim());
  } catch {
    throw new HttpsError('invalid-argument', 'Invalid URL provided.');
  }
  if (current.protocol !== 'https:' && current.protocol !== 'http:')
    throw new HttpsError('invalid-argument', 'Only web addresses are allowed.');
  // Plain http is upgraded; the fetch itself is always https.
  if (current.protocol === 'http:') current.protocol = 'https:';
  const deadline = Date.now() + TOTAL_FETCH_MS;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    // Credentials and fragments never travel or come back.
    current.username = '';
    current.password = '';
    current.hash = '';
    if (await deps.isBlocked(current.href)) return { status: 'blocked' };
    if (looksLikeSignInUrl(current))
      return { status: 'use-extension', reason: 'sign-in' };
    if (Date.now() >= deadline)
      return { status: 'use-extension', reason: 'unreachable' };

    let response: FetchedResponse;
    try {
      response = await deps.fetchOnce(current);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      return { status: 'use-extension', reason: 'unreachable' };
    }

    if (response.status >= 300 && response.status < 400) {
      if (!response.location || hop === MAX_REDIRECTS)
        return { status: 'use-extension', reason: 'unreachable' };
      try {
        current = new URL(response.location, current);
      } catch {
        return { status: 'use-extension', reason: 'unreachable' };
      }
      if (current.protocol !== 'https:')
        return { status: 'use-extension', reason: 'unreachable' };
      continue;
    }
    if (response.status === 401 || response.status === 407)
      return { status: 'use-extension', reason: 'sign-in' };
    if (response.status >= 400)
      return { status: 'use-extension', reason: 'refused' };

    const contentType = response.contentType.toLowerCase();
    if (
      !contentType.includes('text/html') &&
      !contentType.includes('application/xhtml')
    )
      return {
        status: 'not-a-page',
        contentType: contentType.split(';')[0].trim(),
      };

    const page = htmlToPage(response.body, current);
    if (looksLikeSignInPage(response.body, page))
      return { status: 'use-extension', reason: 'sign-in' };
    if (page.blocks.length === 0 && page.images.length === 0)
      return { status: 'use-extension', reason: 'no-content' };
    return { status: 'ok', page };
  }
  return { status: 'use-extension', reason: 'unreachable' };
}

async function fetchOnceGuarded(url: URL): Promise<FetchedResponse> {
  let addresses: ResolvedAddress[];
  try {
    addresses = await resolveAndValidateHost(url.hostname);
  } catch {
    throw new HttpsError(
      'invalid-argument',
      'That address points to a private or reserved host.'
    );
  }
  const response = await axios.get<string>(url.href, {
    maxContentLength: MAX_RESPONSE_BYTES,
    maxBodyLength: MAX_RESPONSE_BYTES,
    maxRedirects: 0,
    timeout: FETCH_TIMEOUT_MS,
    // A total cap per hop; `timeout` alone resets on every slow byte.
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    responseType: 'text',
    validateStatus: () => true,
    headers: {
      'User-Agent': 'SpartBoardImport/1.0',
      Accept: 'text/html,application/xhtml+xml',
    },
    httpsAgent: createPinnedAgent(addresses),
  });
  const location = response.headers?.location as string | undefined;
  return {
    status: response.status,
    location,
    contentType: (response.headers?.['content-type'] as string) || '',
    body: typeof response.data === 'string' ? response.data : '',
  };
}

const callTimes = new Map<string, number[]>();

function isRateLimited(uid: string, now: number): boolean {
  const recent = (callTimes.get(uid) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  if (recent.length >= RATE_LIMIT_MAX_CALLS) {
    callTimes.set(uid, recent);
    return true;
  }
  recent.push(now);
  callTimes.set(uid, recent);
  if (callTimes.size > 5_000) {
    const oldest = callTimes.keys().next().value;
    if (oldest !== undefined) callTimes.delete(oldest);
  }
  return false;
}

export const fetchImportPageV1 = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 40,
    // The rate limit is per instance, so few instances keep it meaningful.
    maxInstances: 5,
    cors: ALLOWED_ORIGINS,
  },
  async (request): Promise<ImportPageFetchResult> => {
    assertViewAsAllowed(request, { read: true });
    if (!request.auth)
      throw new HttpsError('unauthenticated', 'Sign in to import a page.');
    const db = admin.firestore();
    const token = request.auth.token;
    const staff = await isDistrictStaffToken(db, token);
    const granted =
      staff &&
      (await isGlobalFeatureGranted(
        db,
        FEATURE_ID,
        token.email ?? null,
        request.auth.uid
      ));
    if (!granted)
      throw new HttpsError('permission-denied', 'Import is not turned on.');
    const url = (request.data as { url?: unknown } | null)?.url;
    if (typeof url !== 'string' || !url || url.length > 2_048)
      throw new HttpsError('invalid-argument', 'A url string is required.');
    if (isRateLimited(request.auth.uid, Date.now()))
      throw new HttpsError(
        'resource-exhausted',
        'Too many pages imported. Try again in a few minutes.'
      );

    const blockSnap = await db
      .collection('admin_settings')
      .doc(BLOCK_LIST_DOC)
      .get();
    const patterns = resolveBlockPatterns(blockSnap.data());
    return fetchImportPage(url, {
      isBlocked: (u) => Promise.resolve(isUrlBlocked(u, patterns)),
      fetchOnce: fetchOnceGuarded,
    });
  }
);
