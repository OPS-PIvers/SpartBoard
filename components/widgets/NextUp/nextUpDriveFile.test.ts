import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertNextUpQueueFile,
  isNextUpQueueFile,
  resetNextUpQueueFileCache,
} from './nextUpDriveFile';

describe('isNextUpQueueFile', () => {
  beforeEach(() => resetNextUpQueueFileCache());

  it('checks the NextUp folder once per owned file', async () => {
    const drive = { isInAppFolder: vi.fn().mockResolvedValue(true) };
    expect(await isNextUpQueueFile(drive, 'queueFileId123')).toBe(true);
    expect(await isNextUpQueueFile(drive, 'queueFileId123')).toBe(true);
    expect(drive.isInAppFolder).toHaveBeenCalledTimes(1);
    expect(drive.isInAppFolder).toHaveBeenCalledWith('queueFileId123', [
      'NextUp',
    ]);
  });

  it('rejects a foreign file and checks it again next time', async () => {
    const drive = { isInAppFolder: vi.fn().mockResolvedValue(false) };
    await expect(
      assertNextUpQueueFile(drive, 'rosterFileId123')
    ).rejects.toThrow();
    await expect(
      assertNextUpQueueFile(drive, 'rosterFileId123')
    ).rejects.toThrow();
    expect(drive.isInAppFolder).toHaveBeenCalledTimes(2);
  });
});

describe('isNextUpQueueFile per account', () => {
  it('checks again for a different Drive connection', async () => {
    const first = { isInAppFolder: vi.fn().mockResolvedValue(true) };
    const second = { isInAppFolder: vi.fn().mockResolvedValue(false) };
    expect(await isNextUpQueueFile(first, 'sharedFileId12')).toBe(true);
    expect(await isNextUpQueueFile(second, 'sharedFileId12')).toBe(false);
  });
});
