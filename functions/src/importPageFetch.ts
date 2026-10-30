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
import {
  decodeHtmlEntities,
  extractMetaContent,
  extractTitleTag,
} from './linkPreview';
import { isDistrictStaffToken } from './districtStaff';
import { isGlobalFeatureGranted } from './quizMediaArchive';
import { isUrlBlocked, resolveBlockPatterns } from './sendBlockList';
import './functionsInit';
import { assertViewAsAllowed } from './viewAsGuard';

const FEATURE_ID = 'universal-import';
const BLOCK_LIST_DOC = 'import_send_block_list';
const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 2_097_152;
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

/** True when a redirect target is a sign-in page rather than content. */
export function looksLikeSignInUrl(url: URL): boolean {
  return (
    SIGN_IN_HOSTS.has(url.hostname.toLowerCase()) ||
    SIGN_IN_PATH.test(url.pathname)
  );
}

// Elements whose contents never reach a Source; forms go whole so no field value can leak.
const DROP_WITH_CONTENT = [
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
];
const BLOCK_TAG =
  /<(\/?)(h[1-6]|p|div|section|article|main|li|ul|ol|dl|blockquote|pre|tr|td|th|dt|dd|figure|figcaption|br|hr|table)\b[^>]*>/gi;

function stripElements(html: string): string {
  let out = html.replace(/<!--[\s\S]*?-->/g, ' ');
  for (const tag of DROP_WITH_CONTENT) {
    out = out.replace(
      new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'),
      ' '
    );
  }
  // Void form fields carry values in attributes; drop them too.
  return out.replace(/<(?:input|option)\b[^>]*>/gi, ' ');
}

function pickRegion(html: string): string {
  for (const tag of ['article', 'main', 'body']) {
    const match = new RegExp(
      `<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`,
      'i'
    ).exec(html);
    if (match && match[1].replace(/<[^>]*>/g, '').trim()) return match[1];
  }
  return html;
}

const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(
    `\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i'
  ).exec(tag);
  return m ? decodeHtmlEntities(m[1] ?? m[2] ?? m[3] ?? '').trim() : null;
};

function extractImages(region: string, base: URL): FetchedPage['images'] {
  const images: FetchedPage['images'] = [];
  const seen = new Set<string>();
  for (const [tag] of region.matchAll(/<img\b[^>]*>/gi)) {
    const raw = attr(tag, 'src');
    if (!raw) continue;
    let url: URL;
    try {
      url = new URL(raw, base);
    } catch {
      continue;
    }
    if (url.protocol !== 'https:' || seen.has(url.href)) continue;
    if (url.href.length > 2_048) continue;
    seen.add(url.href);
    const alt = attr(tag, 'alt')?.slice(0, 500);
    images.push(alt ? { url: url.href, alt } : { url: url.href });
    if (images.length >= MAX_IMAGES) break;
  }
  return images;
}

const cleanText = (html: string): string =>
  decodeHtmlEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

/** Splits the region at block tags; headings, list items and quotes keep their type. */
function extractBlocks(region: string): FetchedBlock[] {
  const blocks: FetchedBlock[] = [];
  let total = 0;
  let quoteDepth = 0;
  let current: { type: FetchedBlock['type']; level: number } = {
    type: 'paragraph',
    level: 0,
  };
  const flush = (chunk: string) => {
    const text = cleanText(chunk);
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
  let last = 0;
  for (const m of region.matchAll(BLOCK_TAG)) {
    flush(region.slice(last, m.index));
    last = (m.index ?? 0) + m[0].length;
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (tag === 'blockquote') {
      quoteDepth = Math.max(0, quoteDepth + (closing ? -1 : 1));
      current = { type: 'paragraph', level: 0 };
    } else if (!closing && /^h[1-6]$/.test(tag)) {
      current = { type: 'heading', level: Number(tag[1]) };
    } else if (!closing && tag === 'li') {
      current = { type: 'listItem', level: 0 };
    } else if (closing || tag !== 'br') {
      current = { type: 'paragraph', level: 0 };
    }
  }
  flush(region.slice(last));
  return blocks;
}

/** The generic read of a fetched HTML page: title, main-content blocks and image URLs, never form values. */
export function htmlToPage(html: string, pageUrl: URL): FetchedPage {
  const title =
    extractMetaContent(html, 'og:title') ?? extractTitleTag(html) ?? '';
  const region = pickRegion(stripElements(html));
  return {
    url: pageUrl.href,
    title: (title || pageUrl.hostname).slice(0, MAX_TITLE_CHARS),
    platform: 'generic',
    selectionOnly: false,
    blocks: extractBlocks(region),
    images: extractImages(region, pageUrl),
  };
}

const hasPasswordField = (html: string): boolean =>
  /<input\b[^>]*type\s*=\s*["']?password/i.test(html);

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

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (await deps.isBlocked(current.href)) return { status: 'blocked' };
    if (hop > 0 && looksLikeSignInUrl(current))
      return { status: 'use-extension', reason: 'sign-in' };

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
    const textLength = page.blocks.reduce(
      (n, b) => n + ('text' in b ? b.text.length : 0),
      0
    );
    if (hasPasswordField(response.body) && textLength < 600)
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
  { memory: '256MiB', timeoutSeconds: 40, cors: ALLOWED_ORIGINS },
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
    if (isRateLimited(request.auth.uid, Date.now()))
      throw new HttpsError(
        'resource-exhausted',
        'Too many pages imported. Try again in a few minutes.'
      );
    const url = (request.data as { url?: unknown } | null)?.url;
    if (typeof url !== 'string' || !url || url.length > 2_048)
      throw new HttpsError('invalid-argument', 'A url string is required.');

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
