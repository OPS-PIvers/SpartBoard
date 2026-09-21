/**
 * Storing one imported picture in Drive. The interesting case is the gap
 * between the two calls it takes: a file that uploaded but could not be
 * shared is a picture no student can open, and its id never reaches
 * `attachDocumentImages`, so nothing else can clean it up.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  STIMULUS_FOLDER,
  driveStimulusUploader,
  type StimulusDrive,
} from '@/utils/quizDocumentImport/driveStimulusUploader';
import type { ExtractedImage } from '@/utils/quizDocumentImport/types';

const image: ExtractedImage = {
  id: 'img-1',
  blob: new Blob(['PNGDATA']),
  contentType: 'image/png',
  name: 'image 1.png',
};

function drive(over: Partial<StimulusDrive> = {}): StimulusDrive {
  return {
    uploadFile: vi.fn(() => Promise.resolve({ id: 'drive-1' })),
    makePublic: vi.fn(() => Promise.resolve()),
    deleteFile: vi.fn(() => Promise.resolve()),
    ...over,
  };
}

describe('driveStimulusUploader', () => {
  it('uploads into the stimulus folder and shares with anyone', async () => {
    const d = drive();
    const result = await driveStimulusUploader(d).upload(image);

    expect(d.uploadFile).toHaveBeenCalledWith(
      expect.any(File),
      expect.stringContaining('stimulus-'),
      STIMULUS_FOLDER
    );
    // undefined domain is what forces type:'anyone'; a domain grant would
    // lock out anonymous students.
    expect(d.makePublic).toHaveBeenCalledWith('drive-1', undefined);
    expect(result).toEqual({
      driveFileId: 'drive-1',
      url: 'https://drive.google.com/file/d/drive-1/view',
    });
  });

  it('sanitises the name it stores the picture under', async () => {
    const d = drive();
    await driveStimulusUploader(d).upload(image);
    const [file, storedName] = vi.mocked(d.uploadFile).mock.calls[0];
    expect((file as File).name).toBe('image_1.png');
    expect(storedName).toContain('image_1.png');
  });

  it('deletes the file it just uploaded when sharing fails', async () => {
    const d = drive({
      makePublic: vi.fn(() => Promise.reject(new Error('Quota exceeded.'))),
    });

    await expect(driveStimulusUploader(d).upload(image)).rejects.toThrow(
      'Quota exceeded.'
    );

    // Its id never reaches the caller, so nothing else could remove it — an
    // unshared file no student could open would sit in the teacher's Drive.
    expect(d.deleteFile).toHaveBeenCalledWith('drive-1');
  });

  it('still reports the sharing failure when the cleanup also fails', async () => {
    const d = drive({
      makePublic: vi.fn(() => Promise.reject(new Error('Quota exceeded.'))),
      deleteFile: vi.fn(() => Promise.reject(new Error('Delete denied.'))),
    });

    await expect(driveStimulusUploader(d).upload(image)).rejects.toThrow(
      'Quota exceeded.'
    );
  });

  it('does not try to delete anything when the upload itself fails', async () => {
    const d = drive({
      uploadFile: vi.fn(() => Promise.reject(new Error('Network down.'))),
    });

    await expect(driveStimulusUploader(d).upload(image)).rejects.toThrow(
      'Network down.'
    );
    expect(d.deleteFile).not.toHaveBeenCalled();
  });

  it('removes a file by id for the batch rollback', async () => {
    const d = drive();
    await driveStimulusUploader(d).remove('drive-9');
    expect(d.deleteFile).toHaveBeenCalledWith('drive-9');
  });
});
