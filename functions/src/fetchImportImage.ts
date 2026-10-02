// Copies an externally hosted image for the Quiz question-bank importer, which the browser can't fetch due to CORS.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import axios from 'axios';
import { ALLOWED_ORIGINS } from './classlinkShared';
import {
  createPinnedAgent,
  resolveAndValidateHost,
  type ResolvedAddress,
} from './ssrfGuard';
import './functionsInit';
import { assertViewAsAllowed } from './viewAsGuard';

const MAX_URL_LENGTH = 2048;
const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;
const RATE_LIMIT_MAX_CALLS = 300;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ENTRIES = 5_000;
const GLOBAL_RATE_LIMIT_MAX_CALLS = 3_000;

// SVG is deliberately excluded: it can carry script.
const ALLOWED_CONTENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
]);

export type ImportImageContentType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/gif'
  | 'image/webp';

export interface FetchImportImageResult {
  contentType: ImportImageContentType;
  data: string;
  bytes: number;
}

// Best-effort per-instance rate limit, not shared across instances.
const callCounts = new Map<string, number[]>();
let globalCallTimes: number[] = [];

function isRateLimited(uid: string, now: number): boolean {
  globalCallTimes = globalCallTimes.filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  // Rejected calls don't count, so a blocked caller can't keep the window full.
  if (globalCallTimes.length >= GLOBAL_RATE_LIMIT_MAX_CALLS) {
    return true;
  }

  const calls = (callCounts.get(uid) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  callCounts.set(uid, calls);
  for (const [key, times] of callCounts) {
    if (key !== uid && times.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) {
      callCounts.delete(key);
    }
  }
  while (callCounts.size > RATE_LIMIT_MAX_ENTRIES) {
    const oldestKey = callCounts.keys().next().value;
    if (oldestKey === undefined) break;
    callCounts.delete(oldestKey);
  }
  if (calls.length >= RATE_LIMIT_MAX_CALLS) {
    return true;
  }
  globalCallTimes.push(now);
  calls.push(now);
  return false;
}

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

export function sniffImageType(buf: Buffer): ImportImageContentType | null {
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  // "GIF87a" / "GIF89a"
  if (
    startsWith(buf, [0x47, 0x49, 0x46, 0x38]) &&
    (buf[4] === 0x37 || buf[4] === 0x39) &&
    buf[5] === 0x61
  ) {
    return 'image/gif';
  }
  // "RIFF" .... "WEBP"
  if (
    startsWith(buf, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp';
  }
  return null;
}

function isTooLargeError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  return /maxContentLength|maxBodyLength/i.test(error.message ?? '');
}

/** Fetches a public https image through the SSRF guard; errors are HttpsErrors with readable messages. */
export async function downloadPublicImage(
  rawUrl: string
): Promise<{ contentType: ImportImageContentType; body: Buffer }> {
  let currentUrl: URL;
  try {
    currentUrl = new URL(rawUrl);
  } catch {
    throw new HttpsError('invalid-argument', 'Invalid URL provided.');
  }

  let body: Buffer | null = null;
  let headerType = '';
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (currentUrl.protocol !== 'https:') {
      throw new HttpsError('invalid-argument', 'Only HTTPS URLs are allowed.');
    }
    let addresses: ResolvedAddress[];
    try {
      addresses = await resolveAndValidateHost(currentUrl.hostname);
    } catch {
      throw new HttpsError(
        'invalid-argument',
        'URLs pointing to private or reserved hosts are not allowed.'
      );
    }

    let response;
    try {
      response = await axios.get<ArrayBuffer>(currentUrl.toString(), {
        maxContentLength: MAX_RESPONSE_BYTES,
        maxBodyLength: MAX_RESPONSE_BYTES,
        maxRedirects: 0,
        timeout: FETCH_TIMEOUT_MS,
        responseType: 'arraybuffer',
        // Only 2xx resolves; 3xx rejects with error.response so redirects are handled below.
        validateStatus: (status) => status < 300,
        headers: { 'User-Agent': 'SpartBoardImageImport/1.0' },
        httpsAgent: createPinnedAgent(addresses),
      });
    } catch (error: unknown) {
      if (
        axios.isAxiosError(error) &&
        error.response &&
        error.response.status >= 300 &&
        error.response.status < 400
      ) {
        const location = error.response.headers?.location as string | undefined;
        if (!location || hop === MAX_REDIRECTS) {
          throw new HttpsError('failed-precondition', 'Too many redirects.');
        }
        try {
          currentUrl = new URL(location, currentUrl);
        } catch {
          throw new HttpsError('failed-precondition', 'Invalid redirect.');
        }
        continue;
      }
      if (isTooLargeError(error)) {
        throw new HttpsError('failed-precondition', 'Image is too large.');
      }
      console.error('Import image fetch error:', error);
      throw new HttpsError('internal', 'Failed to fetch image.');
    }

    const rawType = (response.headers?.['content-type'] as string) || '';
    headerType = rawType.split(';')[0].trim().toLowerCase();
    body = Buffer.from(response.data);
    break;
  }

  if (!body) {
    throw new HttpsError('internal', 'Failed to fetch image.');
  }
  if (!ALLOWED_CONTENT_TYPES.has(headerType)) {
    console.error('Import image rejected content-type:', headerType);
    throw new HttpsError(
      'invalid-argument',
      'URL did not return a supported image.'
    );
  }
  if (body.length > MAX_RESPONSE_BYTES) {
    throw new HttpsError('failed-precondition', 'Image is too large.');
  }
  const sniffed = sniffImageType(body);
  if (!sniffed) {
    console.error('Import image failed magic-byte check:', headerType);
    throw new HttpsError(
      'invalid-argument',
      'URL did not return a supported image.'
    );
  }

  return { contentType: sniffed, body };
}

export const fetchImportImage = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    cors: ALLOWED_ORIGINS,
  },
  async (request): Promise<FetchImportImageResult> => {
    assertViewAsAllowed(request, { read: true });
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }
    if (request.auth.token?.firebase?.sign_in_provider === 'anonymous') {
      throw new HttpsError(
        'permission-denied',
        'Image import is not available for this account.'
      );
    }
    if (isRateLimited(request.auth.uid, Date.now())) {
      throw new HttpsError(
        'resource-exhausted',
        'Too many image import requests. Try again in a few minutes.'
      );
    }

    const data = request.data as { url?: unknown };
    if (typeof data?.url !== 'string' || data.url.length === 0) {
      throw new HttpsError('invalid-argument', 'A url string is required.');
    }
    if (data.url.length > MAX_URL_LENGTH) {
      throw new HttpsError('invalid-argument', 'URL is too long.');
    }

    const { contentType, body } = await downloadPublicImage(data.url);
    return {
      contentType,
      data: body.toString('base64'),
      bytes: body.length,
    };
  }
);
