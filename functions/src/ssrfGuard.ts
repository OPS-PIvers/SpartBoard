// Shared SSRF guards for callables that fetch arbitrary public URLs server-side.
import dns from 'dns';
import https from 'https';

// Reserved-range blocks applied to every resolved address, since a public hostname can resolve to a private IP.
export const BLOCKED_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^::$/,
  /^f[cd][0-9a-f]{2}:/i,
  /^fe[89ab][0-9a-f]:/i,
  /^fec[0-9a-f]:/i,
];

// Unwraps an IPv4-mapped IPv6 address (dotted or hex form) to its embedded IPv4 so the IPv4 blocklist still applies.
export function normalizeAddress(address: string): string {
  const lower = address.toLowerCase();
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (dotted) return dotted[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.');
  }
  return address;
}

export function isBlockedIp(address: string): boolean {
  const normalized = normalizeAddress(address);
  return BLOCKED_IP_PATTERNS.some((pattern) => pattern.test(normalized));
}

export interface ResolvedAddress {
  address: string;
  family: number;
}

// Resolves once, validates every address, and returns them for pinning (avoids TOCTOU DNS rebinding).
export async function resolveAndValidateHost(
  hostname: string
): Promise<ResolvedAddress[]> {
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
  return results;
}

// Pins the connection to the already-validated addresses instead of letting axios/Node re-resolve DNS.
export function createPinnedAgent(addresses: ResolvedAddress[]): https.Agent {
  return new https.Agent({
    lookup: (
      _hostname: string,
      options: { all?: boolean } | undefined,
      callback: (
        err: NodeJS.ErrnoException | null,
        address: string | ResolvedAddress[],
        family?: number
      ) => void
    ) => {
      // Node's autoSelectFamily calls lookup with all:true and needs an array.
      if (options?.all) {
        callback(null, addresses);
        return;
      }
      const first = addresses[0];
      callback(null, first.address, first.family);
    },
  });
}
