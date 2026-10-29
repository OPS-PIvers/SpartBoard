import { describe, expect, it } from 'vitest';
import {
  MAX_PICTURES,
  collectPictures,
  inboxRequest,
  sniffPicture,
  toBase64,
} from './payload';
import type { SchoologyRead } from './readResult';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const origin = 'https://orono.schoology.com';

describe('collectPictures', () => {
  it("copies Schoology's own pictures and skips the rest", async () => {
    const asked: string[] = [];
    const get = (url: string) => {
      asked.push(url);
      if (url.endsWith('/missing'))
        return Promise.resolve(new Response('', { status: 404 }));
      if (url.endsWith('/vector'))
        return Promise.resolve(
          new Response('<svg/>', {
            headers: { 'Content-Type': 'image/svg+xml' },
          })
        );
      return Promise.resolve(
        new Response(PNG, { headers: { 'Content-Type': 'image/png' } })
      );
    };
    const pictures = await collectPictures(
      [
        `${origin}/file_download/a`,
        'https://elsewhere.test/b.png',
        `${origin}/missing`,
        `${origin}/vector`,
      ],
      get,
      origin
    );
    expect(pictures).toEqual([
      {
        id: `${origin}/file_download/a`,
        mime: 'image/png',
        name: 'Picture 1',
        data: toBase64(PNG),
      },
    ]);
    expect(asked).not.toContain('https://elsewhere.test/b.png');
  });
});

describe('picture checks the server repeats', () => {
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  const WEBP = new Uint8Array(
    [...'RIFF']
      .map((c) => c.charCodeAt(0))
      .concat(
        [0, 0, 0, 0],
        [...'WEBP'].map((c) => c.charCodeAt(0))
      )
  );

  it('takes the type from the bytes, not the label', async () => {
    expect(sniffPicture(WEBP)).toBe('image/webp');
    expect(sniffPicture(new Uint8Array())).toBeNull();
    const labelled = (body: Uint8Array<ArrayBuffer>) => () =>
      Promise.resolve(
        new Response(body, { headers: { 'Content-Type': 'image/jpeg' } })
      );
    const [webp] = await collectPictures(
      [`${origin}/a`],
      labelled(WEBP),
      origin
    );
    expect(webp.mime).toBe('image/webp');
    expect(
      await collectPictures([`${origin}/b`], labelled(new Uint8Array()), origin)
    ).toEqual([]);
    expect(
      await collectPictures(
        [`${origin}/c`],
        labelled(new Uint8Array([1, 2, 3])),
        origin
      )
    ).toEqual([]);
  });

  it("stops at the server's picture count", async () => {
    const urls = Array.from(
      { length: MAX_PICTURES + 5 },
      (_, i) => `${origin}/p${i}`
    );
    const pictures = await collectPictures(
      urls,
      () => Promise.resolve(new Response(JPEG)),
      origin
    );
    expect(pictures).toHaveLength(MAX_PICTURES);
  });
});

describe('inboxRequest', () => {
  it('carries the source, the course folder and the read quiz', () => {
    const read: SchoologyRead = {
      quiz: { title: 'Unit 1', questions: [], images: [], warnings: ['w'] },
      imageUrls: [],
      unsupported: [3],
      settings: { attempts: 2 },
    };
    expect(
      inboxRequest(
        { kind: 'assessment', itemId: '4', sectionId: '9', title: 'Unit 1' },
        read,
        'Biology',
        [],
        `${origin}/course/9/assessments/4`
      )
    ).toEqual({
      source: {
        kind: 'assessment',
        itemId: '4',
        sectionId: '9',
        url: `${origin}/course/9/assessments/4`,
      },
      folderPath: ['Biology'],
      quiz: { title: 'Unit 1', questions: [], warnings: ['w'] },
      unsupported: [3],
      settings: { attempts: 2 },
      pictures: [],
    });
  });

  it('files a Resources bank under its own trail and keeps its collection', () => {
    const read: SchoologyRead = {
      quiz: { title: 'Bank', questions: [], images: [], warnings: [] },
      imageUrls: [],
      unsupported: [],
      settings: {},
      folderPath: [
        'MCAs',
        ' ',
        'x'.repeat(250),
        ...Array<string>(12).fill('Deep'),
      ],
    };
    const request = inboxRequest(
      {
        kind: 'questionBank',
        bank: 'classic',
        itemId: '55',
        collectionId: '7',
        title: 'Bank',
      },
      read,
      null,
      [],
      `${origin}/resources/my/7?f=55`
    );
    expect(request.source).toEqual({
      kind: 'questionBank',
      itemId: '55',
      collectionId: '7',
      url: `${origin}/resources/my/7?f=55`,
    });
    expect(request.folderPath).toHaveLength(10);
    expect(request.folderPath[0]).toBe('MCAs');
    expect(request.folderPath[1]).toHaveLength(200);
  });
});
