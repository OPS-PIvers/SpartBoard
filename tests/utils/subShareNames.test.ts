import { describe, it, expect, vi, type Mock } from 'vitest';
import {
  extractSubShareNames,
  parseSubShareNames,
  subShareNamesIsEmpty,
  writeSubShareNamesFile,
  type NamesFileDrive,
} from '@/utils/subShareNames';
import type { Dashboard } from '@/types';

const board = (id: string, config: Record<string, unknown>): Dashboard =>
  ({
    id,
    name: id,
    widgets: [{ id: `${id}-w1`, type: 'random', config }],
  }) as unknown as Dashboard;

interface DriveMocks {
  uploadFile: Mock;
  updateFileContent: Mock;
  listFilePermissions: Mock;
  grantUserReaderPermission: Mock;
}

function drive(
  overrides: Partial<DriveMocks> = {}
): DriveMocks & NamesFileDrive {
  return {
    uploadFile: vi.fn().mockResolvedValue({ id: 'names-file' }),
    updateFileContent: vi.fn().mockResolvedValue(undefined),
    listFilePermissions: vi.fn().mockResolvedValue([]),
    grantUserReaderPermission: vi.fn().mockResolvedValue('perm-1'),
    ...overrides,
  } as DriveMocks & NamesFileDrive;
}

// jsdom's Blob has no text(); read it the way the roster suite does.
function bodyOf(blob: Blob): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(JSON.parse(reader.result as string));
    reader.onerror = () =>
      reject(reader.error ?? new Error('blob read failed'));
    reader.readAsText(blob);
  });
}

describe('extractSubShareNames', () => {
  it('keys each board’s names by board id', () => {
    const names = extractSubShareNames([
      board('b1', { firstNames: 'Alice\nBob' }),
      board('b2', { names: ['Cass'] }),
    ]);

    expect(Object.keys(names.boards)).toEqual(['b1', 'b2']);
    expect(names.boards.b1['b1-w1']).toEqual({ firstNames: 'Alice\nBob' });
    expect(names.boards.b2['b2-w1']).toEqual({ names: ['Cass'] });
  });

  it('omits a board whose widgets hold no names', () => {
    const names = extractSubShareNames([
      board('b1', { mode: 'pick', firstNames: '' }),
    ]);

    expect(names.boards).toEqual({});
    expect(subShareNamesIsEmpty(names)).toBe(true);
  });
});

describe('parseSubShareNames', () => {
  it('reads a file this app wrote', () => {
    const file = extractSubShareNames([board('b1', { firstNames: 'Alice' })]);

    expect(parseSubShareNames(JSON.parse(JSON.stringify(file)))).toEqual(file);
  });

  // A sub whose file is missing, stale or half-written should still get the
  // board, as they do on a share with no names at all.
  it.each([null, 'nonsense', 42, {}, { boards: 'nope' }])(
    'reads %s as no names rather than throwing',
    (body) => {
      expect(parseSubShareNames(body)).toEqual({ version: 1, boards: {} });
    }
  );
});

describe('writeSubShareNamesFile', () => {
  const names = extractSubShareNames([board('b1', { firstNames: 'Alice' })]);

  it('uploads the file and grants every named sub', async () => {
    const d = drive();

    const write = await writeSubShareNamesFile({
      drive: d,
      shareId: 'share-1',
      names,
      emails: ['sub@orono.k12.mn.us'],
    });

    expect(write).toEqual({
      driveFileId: 'names-file',
      driveGrants: [
        {
          email: 'sub@orono.k12.mn.us',
          fileId: 'names-file',
          permissionId: 'perm-1',
        },
      ],
      failedEmails: [],
    });
    const [blob, name, folder] = d.uploadFile.mock.calls[0] as [
      Blob,
      string,
      string,
    ];
    expect(name).toBe('share-1-names.json');
    expect(folder).toBe('Data/SubShares');
    expect(await bodyOf(blob)).toEqual(names);
  });

  it('rewrites the share’s existing file rather than making a second one', async () => {
    const d = drive();

    await writeSubShareNamesFile({
      drive: d,
      shareId: 'share-1',
      names,
      emails: [],
      existingFileId: 'names-file',
    });

    expect(d.uploadFile).not.toHaveBeenCalled();
    expect(d.updateFileContent).toHaveBeenCalledTimes(1);
    const [fileId, blob] = d.updateFileContent.mock.calls[0] as [string, Blob];
    expect(fileId).toBe('names-file');
    expect(await bodyOf(blob)).toEqual(names);
  });

  it('names the subs a grant did not land for', async () => {
    const d = drive({
      grantUserReaderPermission: vi
        .fn()
        .mockRejectedValue(new Error('no access')),
    });

    const write = await writeSubShareNamesFile({
      drive: d,
      shareId: 'share-1',
      names,
      emails: ['sub@orono.k12.mn.us'],
    });

    expect(write?.failedEmails).toEqual(['sub@orono.k12.mn.us']);
    expect(write?.driveGrants).toEqual([]);
  });

  // Nothing to grant on, so the caller must not stamp a file id on the share.
  it('reports nothing when the upload fails', async () => {
    const d = drive({
      uploadFile: vi.fn().mockRejectedValue(new Error('drive down')),
    });

    expect(
      await writeSubShareNamesFile({
        drive: d,
        shareId: 'share-1',
        names,
        emails: ['sub@orono.k12.mn.us'],
      })
    ).toBeNull();
  });

  it('reports nothing when the teacher has no Drive connection', async () => {
    expect(
      await writeSubShareNamesFile({
        drive: null,
        shareId: 'share-1',
        names,
        emails: ['sub@orono.k12.mn.us'],
      })
    ).toBeNull();
  });
});
