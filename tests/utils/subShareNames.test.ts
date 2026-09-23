import { describe, it, expect, vi, type Mock } from 'vitest';
import {
  driveQueueReader,
  extractSubShareNames,
  parseSubShareNames,
  subShareNamesIsEmpty,
  subShareNeedsQueueReads,
  withSubShareQueues,
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

// A Next Up queue is a list of student names, so it travels in the names file
// rather than in the share's broadly readable content (plan §3.4).
describe('withSubShareQueues', () => {
  const queueBoard = (id: string, config: Record<string, unknown>): Dashboard =>
    ({
      id,
      name: id,
      widgets: [{ id: `${id}-q`, type: 'nextUp', config }],
    }) as unknown as Dashboard;

  const live = (fileId: string) => ({
    isActive: true,
    activeDriveFileId: fileId,
    sessionName: 'Help Queue',
  });

  const items = [{ id: 'q1', name: 'Ada', status: 'active', joinedAt: 1 }];

  it('lays each live queue over its own widget', async () => {
    const board = queueBoard('b1', live('queue-file'));
    const readQueue = vi.fn().mockResolvedValue(items);

    const { names, unreadable } = await withSubShareQueues(
      extractSubShareNames([board]),
      [board],
      readQueue
    );

    expect(readQueue).toHaveBeenCalledWith('queue-file');
    expect(names.boards.b1['b1-q']).toEqual({ subShareQueue: items });
    expect(unreadable).toEqual([]);
    expect(subShareNamesIsEmpty(names)).toBe(false);
  });

  it('keeps the names already on the board beside the queue', async () => {
    const board = {
      ...queueBoard('b1', live('queue-file')),
      widgets: [
        { id: 'b1-q', type: 'nextUp', config: live('queue-file') },
        { id: 'b1-r', type: 'random', config: { firstNames: 'Cass' } },
      ],
    } as unknown as Dashboard;

    const { names } = await withSubShareQueues(
      extractSubShareNames([board]),
      [board],
      () => Promise.resolve(items)
    );

    expect(names.boards.b1['b1-r']).toEqual({ firstNames: 'Cass' });
    expect(names.boards.b1['b1-q']).toEqual({ subShareQueue: items });
  });

  it('reads nothing for a widget with no session running', async () => {
    const board = queueBoard('b1', {
      isActive: false,
      activeDriveFileId: 'queue-file',
    });
    const readQueue = vi.fn();

    const { names } = await withSubShareQueues(
      extractSubShareNames([board]),
      [board],
      readQueue
    );

    expect(readQueue).not.toHaveBeenCalled();
    expect(names.boards).toEqual({});
    expect(subShareNeedsQueueReads([board])).toBe(false);
  });

  // The sub gets the board with an empty queue, and the teacher is told which.
  it('names the queue it could not read', async () => {
    const board = queueBoard('b1', live('queue-file'));

    const { names, unreadable } = await withSubShareQueues(
      extractSubShareNames([board]),
      [board],
      () => Promise.reject(new Error('404'))
    );

    expect(unreadable).toEqual(['Help Queue']);
    expect(names.boards).toEqual({});
  });

  it('names the queue when the teacher has no Drive connection', async () => {
    const board = queueBoard('b1', live('queue-file'));

    const { unreadable } = await withSubShareQueues(
      extractSubShareNames([board]),
      [board],
      undefined
    );

    expect(unreadable).toEqual(['Help Queue']);
  });

  it('reports a queue file that is not a list', async () => {
    const board = queueBoard('b1', live('queue-file'));

    const { unreadable } = await withSubShareQueues(
      extractSubShareNames([board]),
      [board],
      () => Promise.resolve({ nope: true })
    );

    expect(unreadable).toEqual(['Help Queue']);
  });
});

describe('driveQueueReader', () => {
  it('is absent without a Drive connection', () => {
    expect(driveQueueReader(null)).toBeUndefined();
  });

  it('reads the queue file as JSON', async () => {
    const downloadFile = vi.fn().mockResolvedValue({
      text: () => Promise.resolve('[{"id":"q1","name":"Ada"}]'),
    });

    const read = driveQueueReader({ downloadFile } as never);

    expect(await read?.('queue-file')).toEqual([{ id: 'q1', name: 'Ada' }]);
  });
});
