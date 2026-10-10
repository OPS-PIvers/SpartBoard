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
  /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./,
  /^198\.1[89]\./,
  /^192\.0\.[02]\./,
  /^198\.51\.100\./,
  /^203\.0\.113\./,
  /^(22[4-9]|2[3-5][0-9])\./,
  /^::1$/,
  /^::$/,
  /^f[cd][0-9a-f]{2}:/i,
  /^fe[89ab][0-9a-f]:/i,
  /^fec[0-9a-f]:/i,
];

// Parses any IPv6 text form (compressed, expanded, dotted tail) into eight 16-bit groups, or null.
function parseIPv6(address: string): number[] | null {
  let text = address.toLowerCase().split('%')[0];
  const tail = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (tail) {
    const o = tail.slice(1).map(Number);
    if (o.some((n) => n > 255)) return null;
    text =
      text.slice(0, tail.index) +
      ((o[0] << 8) | o[1]).toString(16) +
      ':' +
      ((o[2] << 8) | o[3]).toString(16);
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const toGroups = (part: string) => (part === '' ? [] : part.split(':'));
  const head = toGroups(halves[0]);
  const rest = halves.length === 2 ? toGroups(halves[1]) : [];
  const fill = 8 - head.length - rest.length;
  if (halves.length === 2 ? fill < 1 : fill !== 0) return null;
  const groups = [
    ...head,
    ...Array<string>(halves.length === 2 ? fill : 0).fill('0'),
    ...rest,
  ];
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

const v4 = (hi: number, lo: number) =>
  [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.');

// Unwraps IPv6 forms that embed an IPv4 (mapped, compatible, NAT64, 6to4) so the IPv4 blocklist still applies.
export function normalizeAddress(address: string): string {
  const g = parseIPv6(address);
  if (!g) return address;
  const zeros = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (zeros(5) && g[5] === 0xffff) return v4(g[6], g[7]);
  if (zeros(7) && g[7] <= 1) return g[7] ? '::1' : '::';
  if (zeros(6)) return v4(g[6], g[7]);
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0))
    return v4(g[6], g[7]);
  if (g[0] === 0x2002) return v4(g[1], g[2]);
  return address;
}

// Non-global IPv6 blocks matched on parsed groups: multicast, local-use NAT64, Teredo, documentation.
function isReservedIpv6(address: string): boolean {
  const g = parseIPv6(address);
  if (!g) return false;
  if (g[0] >> 8 === 0xff) return true;
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return true;
  if (g[0] === 0x2001 && (g[1] === 0 || g[1] === 0xdb8)) return true;
  return false;
}

export function isBlockedIp(address: string): boolean {
  const normalized = normalizeAddress(address);
  if (isReservedIpv6(normalized)) return true;
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
