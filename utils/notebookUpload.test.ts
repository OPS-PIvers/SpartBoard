import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import * as firestore from 'firebase/firestore';
import { uploadParsedNotebook } from './notebookUpload';
import { ParsedNotebook } from './notebookParser';

vi.mock('firebase/firestore');
vi.mock('@/config/firebase', () => ({ db: {} }));

const parsed = (overrides: Partial<ParsedNotebook> = {}): ParsedNotebook => ({
  title: 'Lesson',
  pages: [
    { blob: new Blob(['p0'], { type: 'image/svg+xml' }), extension: 'svg' },
  ],
  assets: [{ blob: new Blob(['a0'], { type: 'image/png' }), extension: 'png' }],
  ...overrides,
});

describe('uploadParsedNotebook', () => {
  const uploadFile = vi.fn();
  const deleteFile = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    (firestore.doc as unknown as Mock).mockReturnValue('doc-ref');
    uploadFile.mockResolvedValue('http://example.com/file');
    deleteFile.mockResolvedValue(undefined);
  });

  it('uploads pages and assets and writes the notebook doc', async () => {
    const notebook = await uploadParsedNotebook(
      'uid-1',
      parsed({ hiddenPages: [0] }),
      { uploadFile, deleteFile }
    );

    expect(uploadFile).toHaveBeenCalledTimes(2);
    expect(notebook.pagePaths[0]).toBe(
      `users/uid-1/notebooks/${notebook.id}/page0.svg`
    );
    expect(notebook.hiddenPages).toEqual([0]);
    expect(firestore.setDoc).toHaveBeenCalledWith(
      'doc-ref',
      expect.objectContaining({ title: 'Lesson' })
    );
  });

  it('omits optional fields that are empty', async () => {
    const notebook = await uploadParsedNotebook('uid-1', parsed(), {
      uploadFile,
      deleteFile,
    });

    expect(notebook).not.toHaveProperty('sections');
    expect(notebook).not.toHaveProperty('objectLinks');
    expect(notebook).not.toHaveProperty('hiddenPages');
  });

  it('deletes uploaded blobs when the Firestore write fails', async () => {
    (firestore.setDoc as unknown as Mock).mockRejectedValue(
      new Error('permission denied')
    );

    await expect(
      uploadParsedNotebook('uid-1', parsed(), { uploadFile, deleteFile })
    ).rejects.toThrow('permission denied');

    expect(deleteFile).toHaveBeenCalledTimes(2);
  });
});
