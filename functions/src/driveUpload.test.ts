import { describe, it, expect, vi } from 'vitest';
import { createDriveUploader, escapeDriveQueryValue } from './driveUpload';

interface FakeFolder {
  id: string;
  name: string;
  parent: string | null;
  createdAt: number;
}

/** A tiny in-memory Drive: folder list/create, file create/upload, delete. */
function makeFakeDrive() {
  const folders: FakeFolder[] = [];
  const files: Array<{ id: string; name: string; parent: string }> = [];
  let clock = 0;
  let seq = 0;
  const json = (body: unknown, status = 200) =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  const fetchImpl = vi.fn(async (input: string, init?: RequestInit) => {
    // Yield so concurrent callers genuinely interleave.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const url = new URL(input);
    const method = init?.method ?? 'GET';
    if (method === 'GET' && url.pathname.endsWith('/files')) {
      const q = url.searchParams.get('q') ?? '';
      const name = /name = '((?:[^'\\]|\\.)*)'/.exec(q)?.[1] ?? '';
      const parent = /'([^']+)' in parents/.exec(q)?.[1] ?? null;
      const matches = folders
        .filter((f) => f.name === name && f.parent === parent)
        .sort((a, b) => a.createdAt - b.createdAt);
      return json({ files: matches.map((f) => ({ id: f.id, name: f.name })) });
    }
    if (method === 'POST' && url.pathname.endsWith('/files')) {
      const body = JSON.parse(init?.body as string) as {
        name: string;
        mimeType?: string;
        parents?: string[];
      };
      const id = `id-${++seq}`;
      if (body.mimeType === 'application/vnd.google-apps.folder') {
        folders.push({
          id,
          name: body.name,
          parent: body.parents?.[0] ?? null,
          createdAt: ++clock,
        });
      } else {
        files.push({ id, name: body.name, parent: body.parents?.[0] ?? '' });
      }
      return json({ id });
    }
    if (method === 'PATCH') return json({});
    if (method === 'DELETE')
      return Promise.resolve(new Response(null, { status: 404 }));
    return json({}, 500);
  });
  return { folders, files, fetchImpl };
}

describe('createDriveUploader', () => {
  it('escapes quotes and backslashes in query values', () => {
    expect(escapeDriveQueryValue("Bob's \\ quiz")).toBe("Bob\\'s \\\\ quiz");
  });

  it('files an upload under SpartBoard/{folderPath}', async () => {
    const drive = makeFakeDrive();
    const uploader = createDriveUploader(drive.fetchImpl);
    const file = await uploader.uploadBlob(
      'tok',
      Buffer.from('x'),
      'image/webp',
      'A__Q1.webp',
      'Quiz Responses/Unit 3'
    );
    expect(drive.folders.map((f) => f.name)).toEqual([
      'SpartBoard',
      'Quiz Responses',
      'Unit 3',
    ]);
    const unit = drive.folders.find((f) => f.name === 'Unit 3');
    expect(drive.files).toEqual([
      { id: file.id, name: 'A__Q1.webp', parent: unit?.id },
    ]);
  });

  it('creates one folder when parallel archives for one teacher race', async () => {
    const drive = makeFakeDrive();
    const uploader = createDriveUploader(drive.fetchImpl);
    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        uploader.uploadBlob(
          `token-${i}`,
          Buffer.from('x'),
          'image/webp',
          `S${i}__Q1.webp`,
          'Quiz Responses/Unit 3',
          'teacher-1'
        )
      )
    );
    expect(drive.folders).toHaveLength(3);
    const unit = drive.folders.find((f) => f.name === 'Unit 3');
    expect(drive.files.every((f) => f.parent === unit?.id)).toBe(true);
  });

  it('adopts the oldest folder when another instance created one in the gap', async () => {
    const drive = makeFakeDrive();
    // Two instances: separate uploaders share nothing in memory.
    const a = createDriveUploader(drive.fetchImpl);
    const b = createDriveUploader(drive.fetchImpl);
    const [fa, fb] = await Promise.all([
      a.getOrCreateFolder('tok-a', 'Quiz Responses', 'root-1'),
      b.getOrCreateFolder('tok-b', 'Quiz Responses', 'root-1'),
    ]);
    expect(fa).toBe(fb);
    const oldest = drive.folders
      .filter((f) => f.name === 'Quiz Responses')
      .sort((x, y) => x.createdAt - y.createdAt)[0];
    expect(fa).toBe(oldest?.id);
  });

  it('reuses an existing folder without creating another', async () => {
    const drive = makeFakeDrive();
    const uploader = createDriveUploader(drive.fetchImpl);
    const first = await uploader.getOrCreateFolder('tok', 'SpartBoard');
    const second = await uploader.getOrCreateFolder('tok', 'SpartBoard');
    expect(second).toBe(first);
    expect(drive.folders).toHaveLength(1);
  });

  it('treats an already-absent file as deleted', async () => {
    const drive = makeFakeDrive();
    const uploader = createDriveUploader(drive.fetchImpl);
    await expect(uploader.deleteFile('tok', 'gone')).resolves.toBeUndefined();
  });
});
