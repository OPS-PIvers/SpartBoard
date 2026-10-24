import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { callSpartBoard, type ApiDeps } from './spartboardApi';
import { LISTINGS } from './listings';

const reply = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status });

const deps = (responses: Response[], token: string | null = 't1') => {
  const fetchMock = vi.fn(() => Promise.resolve(responses.shift()!));
  const d: ApiDeps = {
    base: 'https://fn.example',
    getToken: vi.fn(() => Promise.resolve(token)),
    dropToken: vi.fn(() => Promise.resolve()),
    fetch: fetchMock,
  };
  return { d, fetchMock };
};

describe('callSpartBoard', () => {
  it('posts the body with the Google token as the bearer', async () => {
    const { d, fetchMock } = deps([reply(200, { tours: [] })]);
    const result = await callSpartBoard(d, 'webToursListV1', { a: 1 });
    expect(result).toEqual({ ok: true, value: { tours: [] } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://fn.example/webToursListV1');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer t1'
    );
  });

  it('drops a rejected token and tries once more', async () => {
    const { d, fetchMock } = deps([reply(401), reply(200, { ok: 1 })]);
    expect((await callSpartBoard(d, 'x', {})).ok).toBe(true);
    expect(d.dropToken).toHaveBeenCalledWith('t1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('says signed-out after a second rejection or with no token', async () => {
    expect(
      await callSpartBoard(deps([reply(401), reply(401)]).d, 'x', {})
    ).toEqual({ ok: false, why: 'signed-out' });
    expect(await callSpartBoard(deps([], null).d, 'x', {})).toEqual({
      ok: false,
      why: 'signed-out',
    });
  });

  it('names each refusal', async () => {
    const why = async (status: number) => {
      const r = await callSpartBoard(deps([reply(status)]).d, 'x', {});
      return r.ok ? null : r.why;
    };
    expect(await why(403)).toBe('no-access');
    expect(await why(503)).toBe('not-set-up');
    expect(await why(404)).toBe('not-found');
    expect(await why(500)).toBe('offline');
  });

  it('says offline when the request fails', async () => {
    const { d } = deps([]);
    d.fetch = () => Promise.reject(new Error('net'));
    expect(await callSpartBoard(d, 'x', {})).toEqual({
      ok: false,
      why: 'offline',
    });
  });
});

describe('OAuth clients', () => {
  it('match what the server accepts for each project', () => {
    const server = readFileSync(
      path.join(process.cwd(), 'functions/src/webTourExtension.ts'),
      'utf8'
    );
    const quoted = (project: string) =>
      new RegExp(`'?${project}'?:\\s*'([^']*)'`).exec(server)?.[1];
    expect(quoted('spartboard')).toBe(LISTINGS.prod.oauthClientId);
    expect(quoted('spartboard-dev')).toBe(LISTINGS.dev.oauthClientId);
  });

  it('point each listing at its own project', () => {
    expect(LISTINGS.prod.functionsBase).toContain('-spartboard.');
    expect(LISTINGS.dev.functionsBase).toContain('-spartboard-dev.');
  });
});
