import { describe, expect, it, vi } from 'vitest';
import {
  ensureWorkFolder,
  namesManifest,
  scanFileName,
  uploadScanPage,
  workFolderName,
  type ScoredWorkDrive,
} from './scoredWorkDrive';

const drive = (): ScoredWorkDrive => ({
  getFolderPath: vi.fn(() => Promise.resolve('folder1')),
  uploadFileToFolderId: vi.fn((_f: Blob, name: string) =>
    Promise.resolve({ id: `id-${name}`, name })
  ),
  updateFileContent: vi.fn(),
  downloadFile: vi.fn(),
});

describe('scoredWorkDrive', () => {
  it('strips quotes from folder names so Drive queries stay safe', () => {
    expect(workFolderName(`Ann's "Essay"!`, 'abcdef123456')).toBe(
      'Anns Essay (abcdef12)'
    );
    expect(workFolderName('!!!', 'abcdef123456')).toBe('Worksheet (abcdef12)');
  });

  it('puts the folder under Data/Scored Work', async () => {
    const d = drive();
    await ensureWorkFolder(d, 'Essay', 'abcdef123456');
    expect(d.getFolderPath).toHaveBeenCalledWith(
      'Data/Scored Work/Essay (abcdef12)'
    );
  });

  it('names scans by seat and page and returns the Drive id', async () => {
    const d = drive();
    const id = await uploadScanPage(
      d,
      'folder1',
      7,
      2,
      new Blob(['x'], { type: 'image/webp' })
    );
    expect(scanFileName(7, 2, 'image/webp')).toBe('seat-007-p2.webp');
    expect(id).toBe('id-seat-007-p2.webp');
  });

  it('keeps names only in the manifest', () => {
    const m = namesManifest([
      { seat: 1, student: null, displayName: 'Lee, Ann', className: 'P1' },
    ]);
    expect(m['1']).toEqual({ name: 'Lee, Ann', className: 'P1' });
  });
});
