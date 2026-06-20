/**
 * External-content proxy + iframe-embeddability checker (F12 split out of the
 * old monolithic `index.ts`).
 *
 *  - `fetchExternalProxy`    — allowlisted server-side fetch for the weather /
 *                              lunch-menu widgets (CORS-bypass proxy).
 *  - `checkUrlCompatibility` — HEAD-probes a URL to decide whether it can be
 *                              embedded in an iframe (X-Frame-Options / CSP).
 *
 * Both carry SSRF guards (allowlist / blocklist + `maxRedirects: 0`); see the
 * inline comments, which are load-bearing security documentation.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import axios from 'axios';
import { ALLOWED_ORIGINS } from './classlinkShared';
import './functionsInit';

export const fetchExternalProxy = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 30,
    cors: ALLOWED_ORIGINS,
  },
  async (request) => {
    const data = request.data as { url: string };
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }

    try {
      const parsedUrl = new URL(data.url);
      if (
        parsedUrl.protocol !== 'https:' ||
        (parsedUrl.hostname !== 'api.openweathermap.org' &&
          parsedUrl.hostname !== 'owc.enterprise.earthnetworks.com' &&
          parsedUrl.hostname !== 'orono.api.nutrislice.com')
      ) {
        throw new Error('Invalid host or protocol');
      }
    } catch {
      throw new HttpsError(
        'invalid-argument',
        'Invalid proxy URL. Only https://api.openweathermap.org, https://owc.enterprise.earthnetworks.com, and https://orono.api.nutrislice.com are allowed.'
      );
    }

    // 1 MB cap on upstream responses. Audit item #6 — without this a
    // misbehaving upstream could buffer an arbitrary-sized body into the
    // 128MiB function instance and OOM us. We pass both maxContentLength
    // and maxBodyLength so the limit is enforced regardless of whether
    // upstream advertises Content-Length or streams chunked.
    const MAX_RESPONSE_BYTES = 1_048_576;

    try {
      const response = await axios.get<unknown>(data.url, {
        maxContentLength: MAX_RESPONSE_BYTES,
        maxBodyLength: MAX_RESPONSE_BYTES,
        // SSRF guard: the allowlist check above only validates the
        // initial URL. Axios follows up to 5 redirects by default, so
        // an allowlisted host could 302 to an arbitrary off-allowlist
        // host and we'd happily proxy the response. Disabling redirects
        // forces 3xx to surface as a request error and keeps the
        // allowlist load-bearing.
        maxRedirects: 0,
      });
      return response.data;
    } catch (error: unknown) {
      console.error('External Proxy Error:', error);
      // Translate axios's size-limit message into an explicit
      // resource-exhausted HttpsError so the client can distinguish "the
      // upstream is too chatty" from a generic network blip. Gating on
      // `axios.isAxiosError` matches the pattern used elsewhere in this
      // file and avoids matching on unrelated errors that happen to
      // contain "maxContentLength" in their message.
      if (
        axios.isAxiosError(error) &&
        /maxContentLength|maxBodyLength/i.test(error.message ?? '')
      ) {
        throw new HttpsError(
          'resource-exhausted',
          `Upstream response exceeded the ${MAX_RESPONSE_BYTES / 1024} KB proxy limit.`
        );
      }
      const msg =
        error instanceof Error ? error.message : 'External fetch failed';
      throw new HttpsError('internal', msg);
    }
  }
);

export const checkUrlCompatibility = onCall(
  {
    memory: '256MiB',
    timeoutSeconds: 20,
    cors: ALLOWED_ORIGINS,
  },
  async (request) => {
    const data = request.data as { url: string };
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'The function must be called while authenticated.'
      );
    }

    // Validate URL to prevent SSRF
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(data.url);
    } catch {
      throw new HttpsError('invalid-argument', 'Invalid URL provided.');
    }

    if (parsedUrl.protocol !== 'https:') {
      throw new HttpsError('invalid-argument', 'Only HTTPS URLs are allowed.');
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    // Block private/reserved IP ranges and metadata endpoints.
    //
    // IPv4 patterns cover RFC 1918 and link-local ranges; IPv6 patterns cover:
    //   - Any ::-prefixed address — loopback ::1, unspecified ::,
    //     IPv4-mapped ::ffff:127.0.0.1, IPv4-compatible ::127.0.0.1.
    //     Globally routable IPv6 lives in 2000::/3, so :: is always reserved.
    //   - ULA  fc00::/7  (fc** and fd** prefixes — RFC 4193 private range)
    //   - Link-local  fe80::/10 (fe80 through febf — never routes globally)
    //   - Site-local  fec0::/10 (fec0 through feff — deprecated by RFC 3879
    //     but still private/non-routable, so blocked to be safe)
    //
    // Regex note: Node wraps IPv6 hostnames in brackets, e.g. `[::1]`.
    // The patterns below match the bracketed form as returned by URL.hostname.
    const blockedPatterns = [
      /^localhost$/,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
      /^169\.254\./,
      /^0\./,
      /^metadata\./,
      /metadata\.google\.internal/,
      // Any IPv6 address starting with :: — loopback (::1), unspecified (::),
      // IPv4-mapped (::ffff:127.0.0.1) and IPv4-compatible (::127.0.0.1).
      // Globally routable IPv6 is allocated from 2000::/3, so every ::-prefixed
      // address is reserved, local, or private and must be blocked.
      /^\[::/,
      // ULA (fc00::/7 — fc** and fd** prefixes)
      /^\[f[cd]/,
      // Link-local (fe80::/10 — fe8x through febx) and site-local
      // (fec0::/10 — fecx through fefx, deprecated by RFC 3879 but private).
      /^\[fe[89a-f]/,
    ];
    if (blockedPatterns.some((pattern) => pattern.test(hostname))) {
      throw new HttpsError(
        'invalid-argument',
        'URLs pointing to private or reserved IP ranges are not allowed.'
      );
    }

    try {
      const response = await axios.head(data.url, {
        timeout: 10000,
        // SSRF guard: the blocklist check above only validates the initial URL.
        // Without this, axios would follow up to 5 redirects by default, so a
        // public host could 302 to a private/internal IP (e.g. the GCP metadata
        // endpoint at 169.254.169.254) and bypass the check entirely — the same
        // vulnerability that was already fixed in fetchExternalProxy.
        maxRedirects: 0,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      const xFrameOptions = (
        (response.headers['x-frame-options'] as string) || ''
      ).toLowerCase();
      const csp = (
        (response.headers['content-security-policy'] as string) || ''
      ).toLowerCase();

      let isEmbeddable = true;
      let reason = '';

      if (xFrameOptions === 'deny' || xFrameOptions === 'sameorigin') {
        isEmbeddable = false;
        reason = `Site specifies 'X-Frame-Options: ${xFrameOptions.toUpperCase()}'.`;
      } else if (csp.includes('frame-ancestors')) {
        // Very basic check - if frame-ancestors is present and doesn't explicitly allow all or the current origin
        // In a real scenario, we'd need to parse the CSP properly, but 'self' or 'none' are the most common blocks.
        if (csp.includes("'self'") || csp.includes("'none'")) {
          isEmbeddable = false;
          reason =
            'Site has a strict Content Security Policy (frame-ancestors).';
        }
      }

      return {
        isEmbeddable,
        reason,
        headers: {
          'x-frame-options': xFrameOptions,
          'content-security-policy': csp,
        },
      };
    } catch (error: unknown) {
      console.error('Compatibility Check Error:', error);
      // Some sites block HEAD requests or have other issues
      return {
        isEmbeddable: true, // Assume okay if we can't check, but we'll flag the error
        error: error instanceof Error ? error.message : 'Failed to check site',
        uncertain: true,
      };
    }
  }
);
