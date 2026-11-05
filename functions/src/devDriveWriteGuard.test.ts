import { describe, expect, it, vi } from 'vitest';
// Same cases as utils/devDriveWriteGuard.test.ts; the two guards must agree.
import {
  DevProdDriveWriteError,
  installDevDriveWriteGuard,
  writeTargetFileId,
} from './devDriveWriteGuard';

const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const AUTH = { headers: { Authorization: 'Bearer t' } };

// Drive tree: prodFile in SpartBoard/Quizzes, devFile in SpartBoard Dev/Quizzes.
const TREE: Record<
  string,
  {
    name: string;
    parents?: string[];
    trashed?: boolean;
    properties?: Record<string, string>;
  }
> = {
  prodFile: { name: 'Quiz.abc.quiz.json', parents: ['prodQuizzes'] },
  prodQuizzes: { name: 'Quizzes', parents: ['prodRoot'] },
  prodRoot: { name: 'SpartBoard', parents: ['root'] },
  devFile: { name: 'Quiz.abc.quiz.json', parents: ['devQuizzes'] },
  devQuizzes: { name: 'Quizzes', parents: ['devRoot'] },
  devRoot: { name: 'SpartBoard Dev', parents: ['root'] },
  root: { name: 'My Drive' },
  plainSheet: { name: 'Results', parents: ['root'] },
  markedSheet: {
    name: 'Results',
    parents: ['root'],
    properties: { spartboardDevFile: 'true' },
  },
  markedShared: {
    name: 'Results',
    properties: { spartboardDevFile: 'true' },
  },
  markedTrashed: {
    name: 'Results',
    parents: ['root'],
    trashed: true,
    properties: { spartboardDevFile: 'true' },
  },
};

function setup(metaStatus = 200, markStatus = 200) {
  const calls: { url: string; method: string; body?: string }[] = [];
  const fetchMock = vi.fn((input: string, init?: RequestInit) => {
    const url = input;
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body as string | undefined });
    if (
      method === 'GET' &&
      url.includes('fields=name,parents,trashed,properties')
    ) {
      const id = decodeURIComponent(url.split('/files/')[1].split('?')[0]);
      const meta = TREE[id];
      if (metaStatus !== 200 || !meta) {
        return Promise.resolve(new Response('{}', { status: metaStatus }));
      }
      return Promise.resolve(Response.json(meta));
    }
    if (method === 'PATCH' && url.includes('fields=id')) {
      return Promise.resolve(Response.json({}, { status: markStatus }));
    }
    if (method === 'POST' && url.endsWith('/v4/spreadsheets')) {
      return Promise.resolve(Response.json({ spreadsheetId: 'newSheet' }));
    }
    if (method === 'POST') {
      return Promise.resolve(Response.json({ id: 'newFile' }));
    }
    return Promise.resolve(Response.json({ ok: true }));
  });
  const target = { fetch: fetchMock as unknown as typeof fetch };
  installDevDriveWriteGuard(target, 'SpartBoard Dev');
  const writes = () => calls.filter((c) => c.method !== 'GET');
  return { target, writes, calls };
}

describe('writeTargetFileId', () => {
  it('finds the file a write changes', () => {
    expect(writeTargetFileId(`${DRIVE}/abc123`)).toBe('abc123');
    expect(writeTargetFileId(`${UPLOAD}/abc123?uploadType=media`)).toBe(
      'abc123'
    );
    expect(writeTargetFileId(`${DRIVE}/abc123/permissions`)).toBe('abc123');
    expect(
      writeTargetFileId(
        'https://sheets.googleapis.com/v4/spreadsheets/sheet1:batchUpdate'
      )
    ).toBe('sheet1');
    expect(
      writeTargetFileId(
        'https://sheets.googleapis.com/v4/spreadsheets/sheet1/values/A1:append'
      )
    ).toBe('sheet1');
  });

  it('treats creates and copies as new files', () => {
    expect(writeTargetFileId(DRIVE)).toBeNull();
    expect(writeTargetFileId(`${UPLOAD}?uploadType=multipart`)).toBeNull();
    expect(writeTargetFileId(`${DRIVE}/abc123/copy`)).toBeNull();
    expect(
      writeTargetFileId('https://sheets.googleapis.com/v4/spreadsheets')
    ).toBeNull();
  });
});

describe('installDevDriveWriteGuard', () => {
  it('passes reads of prod files through', async () => {
    const { target, calls } = setup();
    await target.fetch(`${DRIVE}/prodFile?alt=media`, AUTH);
    expect(calls).toHaveLength(1);
  });

  it('refuses content, delete and sharing writes to a prod file', async () => {
    const { target, writes } = setup();
    for (const [url, method] of [
      [`${UPLOAD}/prodFile?uploadType=media`, 'PATCH'],
      [`${DRIVE}/prodFile`, 'DELETE'],
      [`${DRIVE}/prodFile/permissions`, 'POST'],
      [`${DRIVE}/prodRoot`, 'PATCH'],
    ]) {
      await expect(target.fetch(url, { ...AUTH, method })).rejects.toThrow(
        DevProdDriveWriteError
      );
    }
    expect(writes()).toEqual([]);
  });

  it('allows writes to files inside the dev folder', async () => {
    const { target, writes } = setup();
    await target.fetch(`${UPLOAD}/devFile?uploadType=media`, {
      ...AUTH,
      method: 'PATCH',
    });
    await target.fetch(`${DRIVE}/devFile`, { ...AUTH, method: 'DELETE' });
    expect(writes().map((w) => w.method)).toEqual(['PATCH', 'DELETE']);
  });

  it('allows writes to a file this tab created anywhere', async () => {
    const { target, writes, calls } = setup();
    await target.fetch(DRIVE, { ...AUTH, method: 'POST', body: '{}' });
    const before = calls.length;
    await target.fetch(`${UPLOAD}/newFile?uploadType=media`, {
      ...AUTH,
      method: 'PATCH',
    });
    expect(calls.length).toBe(before + 1);
    expect(writes().map((w) => w.method)).toEqual(['POST', 'PATCH']);
  });

  it('refuses when Drive cannot say where the file is, and asks again next time', async () => {
    const { target, calls } = setup(500);
    await expect(
      target.fetch(`${DRIVE}/devFile`, { ...AUTH, method: 'DELETE' })
    ).rejects.toThrow(DevProdDriveWriteError);
    const metaCalls = calls.length;
    await expect(
      target.fetch(`${DRIVE}/devFile`, { ...AUTH, method: 'DELETE' })
    ).rejects.toThrow(DevProdDriveWriteError);
    expect(calls.length).toBeGreaterThan(metaCalls);
  });

  it('leaves other Google APIs alone', async () => {
    const { target, writes } = setup();
    await target.fetch(
      'https://classroom.googleapis.com/v1/courses/1/courseWork',
      {
        ...AUTH,
        method: 'POST',
      }
    );
    expect(writes()).toHaveLength(1);
  });
});

describe('files the Sheets, Docs and Slides APIs create', () => {
  const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
  const createSheet = (target: { fetch: typeof fetch }) =>
    target.fetch(SHEETS, { ...AUTH, method: 'POST', body: '{}' });

  it('marks a new sheet as dev-made', async () => {
    const { target, calls } = setup();
    await createSheet(target);
    const mark = calls.find((c) => c.method === 'PATCH');
    expect(mark?.url).toContain(`${DRIVE}/newSheet`);
    expect(JSON.parse(mark?.body ?? '{}')).toEqual({
      properties: { spartboardDevFile: 'true' },
    });
  });

  it('does not mark a file Drive itself created', async () => {
    const { target, writes } = setup();
    await target.fetch(DRIVE, { ...AUTH, method: 'POST', body: '{}' });
    expect(writes().map((w) => w.method)).toEqual(['POST']);
  });

  it('still returns the new sheet when marking it fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { target } = setup(200, 500);
    const res = await createSheet(target);
    await expect(res.json()).resolves.toEqual({ spreadsheetId: 'newSheet' });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('allows a marked file after a reload, in My Drive or shared without parents', async () => {
    const { target, writes } = setup();
    for (const id of ['markedSheet', 'markedShared']) {
      await target.fetch(`${SHEETS}/${id}/values/A1:append`, {
        ...AUTH,
        method: 'POST',
      });
    }
    expect(writes()).toHaveLength(2);
  });

  it('refuses an unmarked sheet and a trashed marked one', async () => {
    const { target, writes } = setup();
    for (const id of ['plainSheet', 'markedTrashed']) {
      await expect(
        target.fetch(`${SHEETS}/${id}/values/A1:append`, {
          ...AUTH,
          method: 'POST',
        })
      ).rejects.toThrow(DevProdDriveWriteError);
    }
    expect(writes()).toEqual([]);
  });
});

describe('metadata 401', () => {
  it('passes the write through so the caller sees the expired token', async () => {
    const { target, writes } = setup(401);
    await target.fetch(`${DRIVE}/prodFile`, { ...AUTH, method: 'DELETE' });
    expect(writes()).toHaveLength(1);
  });
});
