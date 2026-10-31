// Server fetch of a pasted public URL for Import (plan D17): SSRF-guarded, obeys the Send block list.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from './firebaseAdmin';
import axios from 'axios';
import type { Readable } from 'stream';
import { ALLOWED_ORIGINS } from './classlinkShared';
import {
  createPinnedAgent,
  resolveAndValidateHost,
  type ResolvedAddress,
} from './ssrfGuard';
import { decodeHtmlEntities } from './htmlEntities';
import { isDistrictStaffToken } from './districtStaff';
import { isGlobalFeatureGranted } from './quizMediaArchive';
import {
  IMPORT_SEND_BLOCK_LIST_DOC,
  UNIVERSAL_IMPORT_FEATURE,
  isUrlBlocked,
  resolveBlockPatterns,
} from './import/shared.gen';
import './functionsInit';
import { assertViewAsAllowed } from './viewAsGuard';

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
  fetchOnce: (url: URL, timeoutMs: number) => Promise<FetchedResponse>;
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
  'textarea',
  'select',
  'option',
  'datalist',
  'button',
  'nav',
  'header',
  'footer',
  'aside',
  'head',
  'title',
]);
// Kept inside an article or main, where they hold its headline and byline.
const PAGE_CHROME = new Set(['header', 'footer']);
// Their bodies are raw text in HTML, so a `<` inside them never starts a tag.
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp']);
const MAX_TOKENS = 300_000;
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

// One linear pass; quotes only after =, comments skipped, no text from attributes.
function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  const len = html.length;
  let lower: string | null = null;
  let i = 0;
  while (i < len && tokens.length < MAX_TOKENS) {
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
      // A `<!doctype` or `<?xml` is skipped to its `>`; a stray `<` is text.
      if (html[lt + 1] === '!' || html[lt + 1] === '?') {
        const gt = html.indexOf('>', lt);
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
      else if (!/\s/.test(c)) afterEquals = false;
    }
    if (j >= len) break;
    const name = m[2].toLowerCase();
    const closing = m[1] === '/';
    tokens.push({
      kind: 'tag',
      name,
      closing,
      raw: html.slice(lt, j + 1),
      start: lt,
      end: j + 1,
    });
    i = j + 1;
    if (!closing && RAW_TEXT.has(name)) {
      // ASCII only, so indices still line up with `html` (`İ` lower-cases to two units).
      lower ??= html.replace(/[A-Z]+/g, (c) => c.toLowerCase());
      const close = lower.indexOf(`</${name}`, i);
      const end = close < 0 ? len : close;
      if (end > i) tokens.push({ kind: 'text', text: html.slice(i, end) });
      i = end;
    }
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

/** Tokens inside each outermost `tag` element, matched by depth; an unclosed one runs to the end. */
function elementsOf(tokens: Token[], tag: string): Token[][] {
  const found: Token[][] = [];
  let open = -1;
  let depth = 0;
  for (let k = 0; k < tokens.length; k += 1) {
    const t = tokens[k];
    if (t.kind !== 'tag' || t.name !== tag) continue;
    if (!t.closing) {
      if (depth === 0) open = k;
      depth += 1;
    } else if (depth > 0) {
      depth -= 1;
      if (depth === 0) found.push(tokens.slice(open + 1, k));
    }
  }
  if (depth > 0) found.push(tokens.slice(open + 1));
  return found;
}

const textLength = (blocks: FetchedBlock[]): number =>
  blocks.reduce((n, b) => n + ('text' in b ? b.text.length : 0), 0);

interface Read {
  blocks: FetchedBlock[];
  images: FetchedPage['images'];
}

/** Reads blocks and images from tokens, skipping dropped elements (an unclosed one runs to the end). */
function readTokens(tokens: Token[], base: URL, inContent: boolean): Read {
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
    const text = decodeHtmlEntities(buffer.join(''))
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
      // `</head>` is optional, so the body or any block tag ends the head.
      const headEnds =
        skip === 'head' &&
        t.kind === 'tag' &&
        !t.closing &&
        (t.name === 'body' || BLOCK_TAGS.has(t.name));
      if (!headEnds) {
        if (t.kind === 'tag' && t.name === skip) {
          skipDepth += t.closing ? -1 : 1;
          if (skipDepth === 0) skip = null;
        }
        continue;
      }
      skip = null;
    }
    if (t.kind === 'text') {
      buffer.push(t.text);
      continue;
    }
    if (
      DROP_WITH_CONTENT.has(t.name) &&
      !(inContent && PAGE_CHROME.has(t.name))
    ) {
      if (!t.closing) {
        flush();
        skip = t.name;
        skipDepth = 1;
      }
      continue;
    }
    // Field values live in attributes, which are never read; form labels stay.
    if (t.name === 'input') continue;
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
  // The article or main with the most text, unless it is a small card on a bigger page.
  let best: Read = { blocks: [], images: [] };
  for (const tag of ['article', 'main'])
    for (const inner of elementsOf(tokens, tag)) {
      const read = readTokens(inner, pageUrl, true);
      if (textLength(read.blocks) > textLength(best.blocks)) best = read;
    }
  const whole = readTokens(
    elementsOf(tokens, 'body')[0] ?? tokens,
    pageUrl,
    false
  );
  const read =
    textLength(best.blocks) >= Math.min(500, textLength(whole.blocks) / 3)
      ? best
      : whole;
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
  return textLength(page.blocks) < 600 && hasPasswordField(tokenize(html));
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
    // A pasted path like /wiki/Login is content; only redirects are judged by path.
    if (
      hop === 0
        ? SIGN_IN_HOSTS.has(current.hostname)
        : looksLikeSignInUrl(current)
    )
      return { status: 'use-extension', reason: 'sign-in' };
    if (Date.now() >= deadline)
      return { status: 'use-extension', reason: 'unreachable' };

    let response: FetchedResponse;
    try {
      response = await deps.fetchOnce(
        current,
        Math.max(1, Math.min(FETCH_TIMEOUT_MS, deadline - Date.now()))
      );
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
    // Pictures hosted on blocked sites stay out, as importInboxV1 does.
    const images: FetchedPage['images'] = [];
    for (const image of page.images)
      if (!(await deps.isBlocked(image.url))) images.push(image);
    return { status: 'ok', page: { ...page, images } };
  }
  return { status: 'use-extension', reason: 'unreachable' };
}

export async function fetchOnceGuarded(
  url: URL,
  timeoutMs: number
): Promise<FetchedResponse> {
  const signal = AbortSignal.timeout(timeoutMs);
  const aborted = new Promise<never>((_, reject) =>
    signal.addEventListener('abort', () => reject(new Error('timeout')))
  );
  aborted.catch(() => undefined);
  let addresses: ResolvedAddress[];
  try {
    addresses = await Promise.race([
      resolveAndValidateHost(url.hostname),
      aborted,
    ]);
  } catch (error) {
    // Only a private or blocked host is the caller's error; a dead or slow name is unreachable.
    const message = error instanceof Error ? error.message : '';
    if (signal.aborted || !/private|Blocked host/.test(message)) throw error;
    throw new HttpsError(
      'invalid-argument',
      'That address points to a private or reserved host.'
    );
  }
  const response = await axios.get<Readable>(url.href, {
    maxRedirects: 0,
    timeout: FETCH_TIMEOUT_MS,
    // A total cap per hop; `timeout` alone resets on every slow byte.
    signal,
    responseType: 'stream',
    validateStatus: () => true,
    headers: {
      'User-Agent': 'SpartBoardImport/1.0',
      Accept: 'text/html,application/xhtml+xml',
    },
    httpsAgent: createPinnedAgent(addresses),
  });
  const location = response.headers?.location as string | undefined;
  const contentType = (response.headers?.['content-type'] as string) || '';
  const wanted = response.status < 300 && /html/i.test(contentType);
  return {
    status: response.status,
    location,
    contentType,
    body: wanted
      ? decodeHtmlBytes(await readCapped(response.data), contentType)
      : (response.data.destroy(), ''),
  };
}

// Reads up to the byte cap and drops the rest, so a long page is cut rather than lost.
export async function readCapped(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    chunks.push(buf.subarray(0, MAX_RESPONSE_BYTES - size));
    size += buf.length;
    if (size >= MAX_RESPONSE_BYTES) {
      stream.destroy();
      break;
    }
  }
  return Buffer.concat(chunks);
}

const CHARSET = /charset\s*=\s*["']?([\w.:-]+)/i;

/** Decodes page bytes with the header or meta charset, falling back to UTF-8. */
export function decodeHtmlBytes(
  bytes: Uint8Array,
  contentType: string
): string {
  let label = 'utf-8';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) label = 'utf-16be';
  else if (bytes[0] === 0xff && bytes[1] === 0xfe) label = 'utf-16le';
  else {
    const head = Buffer.from(bytes.subarray(0, 1024)).toString('latin1');
    const meta = /<meta\b[^>]*charset\s*=\s*["']?([\w.:-]+)/i.exec(head);
    label = CHARSET.exec(contentType)?.[1] ?? meta?.[1] ?? label;
  }
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
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
    const staff =
      (await isDistrictStaffToken(db, token)) ||
      (token.email_verified === true &&
        !!token.email &&
        (await db.collection('admins').doc(token.email).get()).exists);
    const granted =
      staff &&
      (await isGlobalFeatureGranted(
        db,
        UNIVERSAL_IMPORT_FEATURE,
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
      .doc(IMPORT_SEND_BLOCK_LIST_DOC)
      .get();
    const patterns = resolveBlockPatterns(blockSnap.data());
    return fetchImportPage(url, {
      isBlocked: (u) => Promise.resolve(isUrlBlocked(u, patterns)),
      fetchOnce: fetchOnceGuarded,
    });
  }
);
