import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { convertToEmbedUrl, ensureProtocol } from '@/utils/urlHelpers';
import { TRUSTED_EMBED_HOSTNAMES } from '@/components/widgets/Embed/trustedHostnames';

export type FramingVerdict =
  | { status: 'ok' }
  | {
      status: 'refused';
      reason?: string;
      cause: 'blocked' | 'insecure' | 'invalid';
    }
  | { status: 'unknown' };

interface CompatibilityResult {
  isEmbeddable: boolean;
  reason?: string;
  uncertain?: boolean;
  headers?: { 'x-frame-options'?: string; 'content-security-policy'?: string };
}

// Hosts the Embed widget frames without asking the server, beyond the trusted provider list.
const EXTRA_EMBED_HOSTNAMES = ['carriderpro.com', 'www.carriderpro.com'];

/** The server's CSP test is coarse, so a refusal stands only for X-Frame-Options or a frame-ancestors that truly blocks us. */
function framingDefinitelyBlocked(result: CompatibilityResult): boolean {
  const headers = result.headers;
  if (!headers) return true;
  const xfo = (headers['x-frame-options'] ?? '').trim().toLowerCase();
  if (xfo === 'deny' || xfo === 'sameorigin') return true;
  const directive = (headers['content-security-policy'] ?? '')
    .toLowerCase()
    .split(';')
    .map((d) => d.trim().split(/\s+/))
    .find((parts) => parts[0] === 'frame-ancestors');
  if (!directive) return false;
  const sources = directive.slice(1);
  return sources.every((src) => src === "'none'" || src === "'self'");
}

export type CompatibilityCheck = (url: string) => Promise<CompatibilityResult>;

const callCheckUrlCompatibility: CompatibilityCheck = async (url) => {
  const call = httpsCallable<{ url: string }, CompatibilityResult>(
    functions,
    'checkUrlCompatibility'
  );
  return (await call({ url })).data;
};

/** True when the host is one the Embed widget always frames (Google, YouTube, Vimeo) or the building's admin allowlist. */
export function isAllowListedEmbedHost(
  url: string,
  allowListedHosts: readonly string[] = []
): boolean {
  let host: string;
  try {
    host = new URL(ensureProtocol(url)).hostname.toLowerCase();
  } catch {
    return false;
  }
  return (
    TRUSTED_EMBED_HOSTNAMES.includes(host) ||
    EXTRA_EMBED_HOSTNAMES.includes(host) ||
    allowListedHosts.some((h) => h.trim().toLowerCase() === host)
  );
}

/** Asks whether a page can be shown inside an Embed; only a definite refusal blocks placing it (D6). */
export async function checkReferenceFraming(
  url: string,
  options: {
    allowListedHosts?: readonly string[];
    check?: CompatibilityCheck;
  } = {}
): Promise<FramingVerdict> {
  // Check the address the Embed will actually load, so wrapped or http provider links pass like the widget's own check.
  const full = convertToEmbedUrl(ensureProtocol(url));
  let parsed: URL;
  try {
    parsed = new URL(full);
  } catch {
    return { status: 'refused', cause: 'invalid' };
  }
  // An http page inside the https app is mixed content, which the browser never shows.
  if (parsed.protocol !== 'https:') {
    return { status: 'refused', cause: 'insecure' };
  }
  if (isAllowListedEmbedHost(full, options.allowListedHosts)) {
    return { status: 'ok' };
  }
  try {
    const result = await (options.check ?? callCheckUrlCompatibility)(full);
    if (result.uncertain) return { status: 'unknown' };
    if (result.isEmbeddable) return { status: 'ok' };
    if (!framingDefinitelyBlocked(result)) return { status: 'unknown' };
    return { status: 'refused', cause: 'blocked', reason: result.reason };
  } catch (err) {
    console.warn('[import] framing check failed', err);
    return { status: 'unknown' };
  }
}
