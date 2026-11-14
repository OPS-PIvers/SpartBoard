import { beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({ getDoc: vi.fn(), doc: vi.fn() }));
vi.mock('firebase/firestore', () => fs);
vi.mock('@/config/firebase', () => ({ db: {} }));

import {
  assertNextUpQueueFile,
  isNextUpQueueFile,
  nextUpSessionId,
  resetNextUpQueueFileCache,
} from './nextUpDriveFile';

const SESSION = 'me_w1';
const sessionNames = (fileId: string | null) =>
  fs.getDoc.mockResolvedValue({
    exists: () => fileId !== null,
    data: () => ({ activeDriveFileId: fileId }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  resetNextUpQueueFileCache();
  sessionNames('queueFileId123');
});

describe('nextUpSessionId', () => {
  it('is [uid]_[widgetId] with the widget id sanitized', () => {
    expect(nextUpSessionId('me', 'w/1')).toBe('me_w1');
  });
});

describe('isNextUpQueueFile', () => {
  it('checks the session record and NextUp folder once per bound file', async () => {
    const drive = { isInAppFolder: vi.fn().mockResolvedValue(true) };
    expect(await isNextUpQueueFile(drive, 'queueFileId123', SESSION)).toBe(
      true
    );
    expect(await isNextUpQueueFile(drive, 'queueFileId123', SESSION)).toBe(
      true
    );
    expect(drive.isInAppFolder).toHaveBeenCalledTimes(1);
    expect(fs.getDoc).toHaveBeenCalledTimes(1);
    expect(drive.isInAppFolder).toHaveBeenCalledWith('queueFileId123', [
      'NextUp',
    ]);
  });

  it('rejects a foreign file and checks it again next time', async () => {
    sessionNames('rosterFileId123');
    const drive = { isInAppFolder: vi.fn().mockResolvedValue(false) };
    await expect(
      assertNextUpQueueFile(drive, 'rosterFileId123', SESSION)
    ).rejects.toThrow();
    await expect(
      assertNextUpQueueFile(drive, 'rosterFileId123', SESSION)
    ).rejects.toThrow();
    expect(drive.isInAppFolder).toHaveBeenCalledTimes(2);
  });

  it('rejects another of the owner’s queue files the widget was retargeted to', async () => {
    const drive = { isInAppFolder: vi.fn().mockResolvedValue(true) };
    await expect(
      assertNextUpQueueFile(drive, 'otherQueueFile12', SESSION)
    ).rejects.toThrow();
  });

  it('rejects any file when the widget has no session record', async () => {
    sessionNames(null);
    const drive = { isInAppFolder: vi.fn().mockResolvedValue(true) };
    expect(await isNextUpQueueFile(drive, 'queueFileId123', SESSION)).toBe(
      false
    );
  });
});

describe('isNextUpQueueFile per account', () => {
  it('checks again for a different Drive connection', async () => {
    const first = { isInAppFolder: vi.fn().mockResolvedValue(true) };
    const second = { isInAppFolder: vi.fn().mockResolvedValue(false) };
    expect(await isNextUpQueueFile(first, 'queueFileId123', SESSION)).toBe(
      true
    );
    expect(await isNextUpQueueFile(second, 'queueFileId123', SESSION)).toBe(
      false
    );
  });
});
