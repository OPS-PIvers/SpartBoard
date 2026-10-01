import { describe, it, expect } from 'vitest';
import net from 'net';
import type { AddressInfo } from 'net';
import { createPinnedAgent, isBlockedIp } from './ssrfGuard';

type LookupFn = (
  hostname: string,
  options: { all?: boolean },
  cb: (err: Error | null, address: unknown, family?: number) => void
) => void;

function getLookup(): LookupFn {
  const agent = createPinnedAgent([{ address: '203.0.113.7', family: 4 }]);
  return (agent as unknown as { options: { lookup: LookupFn } }).options.lookup;
}

describe('createPinnedAgent lookup', () => {
  it('returns the address array when Node asks for all:true', () => {
    let result: unknown;
    getLookup()('example.com', { all: true }, (_e, addr) => {
      result = addr;
    });
    expect(result).toEqual([{ address: '203.0.113.7', family: 4 }]);
  });

  it('returns a single address for the classic lookup form', () => {
    let result: unknown[] = [];
    getLookup()('example.com', {}, (_e, addr, fam) => {
      result = [addr, fam];
    });
    expect(result).toEqual(['203.0.113.7', 4]);
  });

  it('lets a real socket connect through the pinned lookup', async () => {
    const server = net.createServer((s) => s.end('hi'));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as AddressInfo).port;
    const lookup = (
      createPinnedAgent([{ address: '127.0.0.1', family: 4 }]) as unknown as {
        options: { lookup: net.LookupFunction };
      }
    ).options.lookup;
    const data = await new Promise<string>((resolve, reject) => {
      const c = net.connect({ host: 'pinned.invalid', port, lookup });
      c.on('data', (d) => resolve(String(d)));
      c.on('error', reject);
    });
    server.close();
    expect(data).toBe('hi');
  });
});

describe('isBlockedIp embedded and reserved ranges', () => {
  it.each([
    '::ffff:7f00:1',
    '::ffff:127.0.0.1',
    '0:0:0:0:0:ffff:7f00:1',
    '::127.0.0.1',
    '::7f00:1',
    '64:ff9b::a9fe:a9fe',
    '64:ff9b::169.254.169.254',
    '2002:a9fe:a9fe::',
    '100.64.0.1',
    '100.127.255.254',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
  ])('blocks %s', (address) => {
    expect(isBlockedIp(address)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '100.63.255.255',
    '100.128.0.1',
    '198.20.0.1',
    '223.255.255.255',
    '2606:4700:4700::1111',
    '64:ff9b::808:808',
    '2002:808:808::',
  ])('allows %s', (address) => {
    expect(isBlockedIp(address)).toBe(false);
  });
});
