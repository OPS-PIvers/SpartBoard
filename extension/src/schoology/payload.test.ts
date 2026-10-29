import { describe, expect, it } from 'vitest';
import { collectPictures, inboxRequest, toBase64 } from './payload';
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
});
