/**
 * Link preview callable for Activity Wall "link" posts (P1-3).
 *
 * `fetchLinkPreview` fetches a URL server-side and returns OpenGraph/title
 * metadata for the client to render as a card. Follows the SSRF guards from
 * `embedProxy.ts` but with an open host list (any public host) instead of a
 * closed allowlist, plus DNS-resolution-based private-IP blocking so a
 * public hostname that resolves to an internal address is also rejected.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import dns from 'dns';
import axios from 'axios';
import { ALLOWED_ORIGINS } from './classlinkShared';
import './functionsInit';

const MAX_REDIRECTS = 2;
const MAX_RESPONSE_BYTES = 1_048_576;
const FETCH_TIMEOUT_MS = 5_000;
const RATE_LIMIT_MAX_CALLS = 30;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export interface LinkPreviewResult {
  title?: string;
  description?: string;
  image?: string;
  domain: string;
  videoId?: string;
}

// Best-effort per-instance rate limit — not shared across instances, but
// cheap and good enough to blunt abuse; documented as such.
const callCounts = new Map<string, number[]>();

function isRateLimited(uid: string, now: number): boolean {
  const calls = (callCounts.get(uid) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  calls.push(now);
  callCounts.set(uid, calls);
  return calls.length > RATE_LIMIT_MAX_CALLS;
}

// IP-literal / reserved-range blocks, mirrored from embedProxy.ts's
// checkUrlCompatibility, applied to every resolved address (not just the
// hostname string) since a public hostname can resolve to a private IP.
const BLOCKED_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^::$/,
  /^::ffff:127\./,
  /^::127\./,
  /^f[cd][0-9a-f]{2}:/i,
  /^fe[89ab][0-9a-f]:/i,
  /^fec[0-9a-f]:/i,
];

function isBlockedIp(address: string): boolean {
  return BLOCKED_IP_PATTERNS.some((pattern) => pattern.test(address));
}

async function assertPublicHost(hostname: string): Promise<void> {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower === 'metadata.google.internal') {
    throw new Error('Blocked host');
  }
  const results = await dns.promises.lookup(hostname, { all: true });
  if (results.length === 0) {
    throw new Error('Host did not resolve');
  }
  for (const { address } of results) {
    if (isBlockedIp(address)) {
      throw new Error('Host resolves to a private address');
    }
  }
}

function youtubeVideoId(parsedUrl: URL): string | null {
  const host = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'youtu.be') {
    const id = parsedUrl.pathname.slice(1);
    return id || null;
  }
  if (
    (host === 'youtube.com' || host === 'm.youtube.com') &&
    parsedUrl.pathname === '/watch'
  ) {
    return parsedUrl.searchParams.get('v');
  }
  return null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_m, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10))
    );
}

function extractMetaContent(html: string, propOrName: string): string | null {
  // Matches <meta property="og:title" content="..."> in either attribute
  // order, single or double quotes; case-insensitive on the property name.
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${propOrName}["'][^>]+content=["']([^"']*)["']`,
      'i'
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${propOrName}["']`,
      'i'
    ),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match) return decodeHtmlEntities(match[1]).trim();
  }
  return null;
}

function extractTitleTag(html: string): string | null {
  const match = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  return match ? decodeHtmlEntities(match[1]).trim() : null;
}

export const fetchLinkPreview = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 20,
    cors: ALLOWED_ORIGINS,
  },
  async (request): Promise<LinkPreviewResult> => {
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }
    if (isRateLimited(request.auth.uid, Date.now())) {
      throw new HttpsError(
        'resource-exhausted',
        'Too many link preview requests. Try again in a few minutes.'
      );
    }

    const data = request.data as { url?: unknown };
    if (typeof data?.url !== 'string' || data.url.length === 0) {
      throw new HttpsError('invalid-argument', 'A url string is required.');
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(data.url);
    } catch {
      throw new HttpsError('invalid-argument', 'Invalid URL provided.');
    }
    if (parsedUrl.protocol !== 'https:') {
      throw new HttpsError('invalid-argument', 'Only HTTPS URLs are allowed.');
    }

    const videoId = youtubeVideoId(parsedUrl);
    if (videoId) {
      return { domain: 'youtube.com', videoId };
    }

    let currentUrl = parsedUrl;
    let html = '';
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      if (currentUrl.protocol !== 'https:') {
        throw new HttpsError(
          'invalid-argument',
          'Only HTTPS URLs are allowed.'
        );
      }
      try {
        await assertPublicHost(currentUrl.hostname);
      } catch {
        throw new HttpsError(
          'invalid-argument',
          'URLs pointing to private or reserved hosts are not allowed.'
        );
      }

      let response;
      try {
        response = await axios.get<string>(currentUrl.toString(), {
          maxContentLength: MAX_RESPONSE_BYTES,
          maxBodyLength: MAX_RESPONSE_BYTES,
          maxRedirects: 0,
          timeout: FETCH_TIMEOUT_MS,
          responseType: 'text',
          validateStatus: (status) => status < 400,
          headers: { 'User-Agent': 'SpartBoardLinkPreview/1.0' },
        });
      } catch (error: unknown) {
        if (
          axios.isAxiosError(error) &&
          error.response &&
          error.response.status >= 300 &&
          error.response.status < 400
        ) {
          const location = error.response.headers?.location as
            | string
            | undefined;
          if (!location || hop === MAX_REDIRECTS) {
            throw new HttpsError('failed-precondition', 'Too many redirects.');
          }
          currentUrl = new URL(location, currentUrl);
          continue;
        }
        console.error('Link preview fetch error:', error);
        throw new HttpsError(
          'internal',
          error instanceof Error ? error.message : 'Failed to fetch URL.'
        );
      }

      const contentType = (
        (response.headers?.['content-type'] as string) || ''
      ).toLowerCase();
      if (!contentType.includes('text/html')) {
        throw new HttpsError(
          'invalid-argument',
          'URL did not return an HTML page.'
        );
      }
      html = response.data;
      break;
    }

    const title =
      extractMetaContent(html, 'og:title') ?? extractTitleTag(html) ?? '';
    const description = extractMetaContent(html, 'og:description') ?? '';
    const rawImage = extractMetaContent(html, 'og:image');
    let image: string | undefined;
    if (rawImage) {
      try {
        const imageUrl = new URL(rawImage, currentUrl);
        if (imageUrl.protocol === 'https:') {
          image = imageUrl.toString();
        }
      } catch {
        image = undefined;
      }
    }

    return {
      title: title || undefined,
      description: description || undefined,
      image,
      domain: currentUrl.hostname,
    };
  }
);
