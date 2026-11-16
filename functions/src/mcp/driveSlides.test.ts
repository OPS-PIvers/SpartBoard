import { afterEach, describe, expect, it, vi } from 'vitest';
import { slideImageFolder, uploadSlideImage } from './drive';

interface Call {
  url: string;
  method: string;
  body: string;
}

const stubDrive = (shareStatus = 200) => {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit = {}) => {
      const body =
        init.body instanceof Uint8Array
          ? Buffer.from(init.body).toString('latin1')
          : typeof init.body === 'string'
            ? init.body
            : '';
      calls.push({ url, method: init.method ?? 'GET', body });
      const json = (data: unknown, status = 200) =>
        Promise.resolve(new Response(JSON.stringify(data), { status }));
      if (url.includes('/files?q=')) {
        const name = /name = '([^']+)'/.exec(decodeURIComponent(url))?.[1];
        return json({ files: [{ id: `folder-${name}` }] });
      }
      if (url.includes('uploadType=multipart')) return json({ id: 'slide-1' });
      if (url.endsWith('/permissions')) return json({}, shareStatus);
      return json({});
    })
  );
  return calls;
};

afterEach(() => vi.unstubAllGlobals());

describe('uploadSlideImage', () => {
  it("saves a marked slide in the teacher's HotspotImages folder, viewable by link", async () => {
    const calls = stubDrive();
    const folder = await slideImageFolder('tok');
    const id = await uploadSlideImage(
      'tok',
      folder,
      Buffer.from('PNGDATA'),
      'image/png',
      'hotspot-1.png'
    );
    expect(id).toBe('slide-1');
    const upload = calls.find((c) => c.url.includes('uploadType=multipart'));
    expect(upload?.body).toContain('"parents":["folder-HotspotImages"]');
    expect(upload?.body).toContain('"spartboardGlSlide":"1"');
    expect(upload?.body).toContain('Content-Type: image/png');
    expect(upload?.body).toContain('PNGDATA');
    const share = calls.find((c) => c.url.endsWith('/permissions'));
    expect(JSON.parse(share?.body ?? '{}')).toEqual({
      role: 'reader',
      type: 'anyone',
    });
  });

  it('trashes the file when sharing throws, not only when it is refused', async () => {
    const calls = stubDrive();
    const base = fetch as unknown as (
      u: string,
      i?: RequestInit
    ) => Promise<Response>;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) =>
        url.endsWith('/permissions')
          ? Promise.reject(new Error('timeout'))
          : base(url, init)
      )
    );
    await expect(
      uploadSlideImage('tok', 'f', Buffer.from('x'), 'image/png', 'a.png')
    ).rejects.toThrow(/timeout/);
    expect(
      calls.some(
        (c) => c.method === 'PATCH' && c.body.includes('"trashed":true')
      )
    ).toBe(true);
  });

  it('trashes the file when it cannot be shared', async () => {
    const calls = stubDrive(403);
    await expect(
      uploadSlideImage('tok', 'f', Buffer.from('x'), 'image/png', 'a.png')
    ).rejects.toThrow(/share/);
    expect(
      calls.some(
        (c) => c.method === 'PATCH' && c.body.includes('"trashed":true')
      )
    ).toBe(true);
  });
});
