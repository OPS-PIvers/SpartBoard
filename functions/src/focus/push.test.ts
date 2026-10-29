import { createECDH, createPublicKey, verify } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  parseVapidPrivateKey,
  pushAudience,
  vapidJwt,
  wakeFocusStudents,
  type FocusPushDeps,
} from './push';
import { createMemoryFirestore } from './testFirestore';

const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
const PRIVATE = ecdh.getPrivateKey().toString('base64url');
const PUBLIC = ecdh.getPublicKey().toString('base64url');
const KEY = parseVapidPrivateKey(PRIVATE);
const NOW = Date.UTC(2026, 9, 29, 15, 0, 0);
const FCM = 'https://fcm.googleapis.com/fcm/send/abc:def';

function deps(
  respond: (url: string) => Response | Promise<Response>,
  key = KEY
): FocusPushDeps & { calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  return {
    calls,
    now: () => NOW,
    vapidKey: () => Promise.resolve(key),
    fetch: (url, init) => {
      const href = url as string;
      calls.push({ url: href, init: init ?? {} });
      return Promise.resolve(respond(href));
    },
  };
}

async function seed(subs: Record<string, unknown>) {
  const db = createMemoryFirestore();
  for (const [uid, data] of Object.entries(subs))
    await db.doc(`focus_push_subscriptions/${uid}`).set(data as object);
  return db;
}

describe('VAPID key', () => {
  it('derives the public key the extension subscribes with', () => {
    expect(KEY?.publicKey).toBe(PUBLIC);
  });

  it('refuses anything but a 32-byte base64url scalar', () => {
    expect(parseVapidPrivateKey('')).toBeNull();
    expect(parseVapidPrivateKey('not a key!')).toBeNull();
    expect(
      parseVapidPrivateKey(Buffer.alloc(31, 1).toString('base64url'))
    ).toBeNull();
    expect(parseVapidPrivateKey(`${PRIVATE}\n`)?.publicKey).toBe(PUBLIC);
  });

  it('signs an RFC 8292 JWT that verifies with the public key', () => {
    const jwt = vapidJwt(KEY!, 'https://fcm.googleapis.com', NOW);
    const [h, c, sig] = jwt.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({
      typ: 'JWT',
      alg: 'ES256',
    });
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString()) as {
      aud: string;
      exp: number;
      sub: string;
    };
    expect(claims.aud).toBe('https://fcm.googleapis.com');
    expect(claims.exp).toBe(NOW / 1000 + 12 * 3600);
    expect(claims.sub).toMatch(/^https:\/\//);
    const point = Buffer.from(PUBLIC, 'base64url');
    const pub = createPublicKey({
      key: {
        kty: 'EC',
        crv: 'P-256',
        x: point.subarray(1, 33).toString('base64url'),
        y: point.subarray(33).toString('base64url'),
      },
      format: 'jwk',
    });
    expect(
      verify(
        'sha256',
        Buffer.from(`${h}.${c}`),
        { key: pub, dsaEncoding: 'ieee-p1363' },
        Buffer.from(sig, 'base64url')
      )
    ).toBe(true);
  });
});

describe('pushAudience', () => {
  it("accepts only Chrome's push service over https", () => {
    expect(pushAudience(FCM)).toBe('https://fcm.googleapis.com');
    expect(pushAudience('https://android.googleapis.com/gcm/send/x')).toBe(
      'https://android.googleapis.com'
    );
    for (const bad of [
      'http://fcm.googleapis.com/x',
      'https://fcm.googleapis.com:8443/x',
      'https://user@fcm.googleapis.com/x',
      'https://fcm.googleapis.com.evil.com/x',
      'https://metadata.google.internal/x',
      'nope',
      42,
      null,
    ])
      expect(pushAudience(bad)).toBeNull();
  });
});

describe('wakeFocusStudents', () => {
  it('sends a data-free push to each subscribed student once', async () => {
    const db = await seed({
      a: { endpoint: FCM },
      b: { endpoint: `${FCM}2` },
      evil: { endpoint: 'https://evil.example/x' },
    });
    const d = deps(() => new Response(null, { status: 201 }));
    expect(
      await wakeFocusStudents(db, ['a', 'b', 'a', 'evil', 'none'], d)
    ).toEqual({ sent: 2, dropped: 0, failed: 0 });
    expect(d.calls.map((c) => c.url).sort()).toEqual([FCM, `${FCM}2`]);
    const { init } = d.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
    const headers = init.headers as Record<string, string>;
    expect(headers.TTL).toBe('60');
    expect(headers.Authorization).toMatch(
      new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${PUBLIC}$`)
    );
  });

  it('drops subscriptions the push service says are gone', async () => {
    const db = await seed({ a: { endpoint: FCM }, b: { endpoint: `${FCM}2` } });
    const d = deps(
      (url) => new Response(null, { status: url === FCM ? 410 : 404 })
    );
    expect(await wakeFocusStudents(db, ['a', 'b'], d)).toMatchObject({
      dropped: 2,
    });
    expect(db.dump().has('focus_push_subscriptions/a')).toBe(false);
    expect(db.dump().has('focus_push_subscriptions/b')).toBe(false);
  });

  it('keeps a subscription that changed while the send was out', async () => {
    const db = await seed({ a: { endpoint: FCM } });
    const d = deps(async () => {
      await db.doc('focus_push_subscriptions/a').set({ endpoint: `${FCM}new` });
      return new Response(null, { status: 410 });
    });
    await wakeFocusStudents(db, ['a'], d);
    expect(db.dump().get('focus_push_subscriptions/a')).toEqual({
      endpoint: `${FCM}new`,
    });
  });

  it('keeps subscriptions on other failures and never throws', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const db = await seed({ a: { endpoint: FCM }, b: { endpoint: `${FCM}2` } });
    const d = deps((url) => {
      if (url === FCM) throw new Error('network');
      return new Response(null, { status: 403 });
    });
    expect(await wakeFocusStudents(db, ['a', 'b'], d)).toEqual({
      sent: 0,
      dropped: 0,
      failed: 2,
    });
    expect(db.dump().size).toBe(2);
    log.mockRestore();
  });

  it('sends nothing without a VAPID key', async () => {
    const db = await seed({ a: { endpoint: FCM } });
    const d = deps(() => new Response(null, { status: 201 }), null);
    expect(await wakeFocusStudents(db, ['a'], d)).toEqual({
      sent: 0,
      dropped: 0,
      failed: 0,
    });
    expect(d.calls).toHaveLength(0);
  });

  it('swallows a failing key or Firestore read', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const db = await seed({});
    const d = deps(() => new Response(null, { status: 201 }));
    d.vapidKey = () => Promise.reject(new Error('boom'));
    await expect(wakeFocusStudents(db, ['a'], d)).resolves.toMatchObject({
      failed: 1,
    });
    err.mockRestore();
    log.mockRestore();
  });
});

describe('wake deadline', () => {
  it('returns within its deadline when the push service hangs', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const db = await seed({ a: { endpoint: FCM } });
    const d = deps(() => new Response(null, { status: 201 }));
    d.fetch = (_url, init) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new Error('x')))
      );
    const started = Date.now();
    expect((await wakeFocusStudents(db, ['a'], d)).sent).toBe(0);
    expect(Date.now() - started).toBeLessThan(4_500);
    log.mockRestore();
  }, 10_000);

  it('refuses redirects', async () => {
    const db = await seed({ a: { endpoint: FCM } });
    const d = deps(() => new Response(null, { status: 201 }));
    await wakeFocusStudents(db, ['a'], d);
    expect(d.calls[0].init.redirect).toBe('error');
  });
});
