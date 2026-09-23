import { getBlob, ref } from 'firebase/storage';
import { storage } from '@/config/firebase';
import { driveIdFromSlideUrl, storagePathFromSlideUrl } from './slideMedia';

export interface SlideDrive {
  downloadFile: (fileId: string) => Promise<Blob>;
}

/** Downloads a slide's bytes without an `<img>`, so the canvas it's drawn on stays exportable. */
export async function fetchSlideBlob(
  url: string,
  drive: SlideDrive | null
): Promise<Blob> {
  const driveId = driveIdFromSlideUrl(url);
  if (driveId) {
    if (!drive) throw new Error('Connect Google Drive to edit this slide.');
    return drive.downloadFile(driveId);
  }
  if (storagePathFromSlideUrl(url)) return getBlob(ref(storage, url));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download the slide (${res.status}).`);
  return res.blob();
}
