import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import { ensureProtocol } from '@/utils/urlHelpers';
import { TRUSTED_EMBED_HOSTNAMES } from '@/components/widgets/Embed/trustedHostnames';

export type FramingVerdict =
  | { status: 'ok' }
  | { status: 'refused'; reason?: string }
  | { status: 'unknown' };

interface CompatibilityResult {
  isEmbeddable: boolean;
  reason?: string;
  uncertain?: boolean;
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
    allowListedHosts.some((h) => h.toLowerCase() === host)
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
  const full = ensureProtocol(url);
  let parsed: URL;
  try {
    parsed = new URL(full);
  } catch {
    return { status: 'refused' };
  }
  // An http page inside the https app is mixed content, which the browser never shows.
  if (parsed.protocol !== 'https:') return { status: 'refused' };
  if (isAllowListedEmbedHost(full, options.allowListedHosts)) {
    return { status: 'ok' };
  }
  try {
    const result = await (options.check ?? callCheckUrlCompatibility)(full);
    if (result.uncertain) return { status: 'unknown' };
    if (result.isEmbeddable) return { status: 'ok' };
    return { status: 'refused', reason: result.reason };
  } catch (err) {
    console.warn('[import] framing check failed', err);
    return { status: 'unknown' };
  }
}
