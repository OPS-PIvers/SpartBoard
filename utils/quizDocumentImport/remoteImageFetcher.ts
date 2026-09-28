// Copies an LMS export's linked picture through `fetchImportImage`, since browsers can't read most image hosts.

import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';
import type { RemoteImageFetcher } from './types';

interface FetchImportImageResult {
  contentType: string;
  data: string;
  bytes: number;
}

function base64ToBytes(data: string): Uint8Array<ArrayBuffer> {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const fetchImageThroughServer: RemoteImageFetcher = async (url) => {
  try {
    const call = httpsCallable<{ url: string }, FetchImportImageResult>(
      functions,
      'fetchImportImage'
    );
    const { data } = await call({ url });
    return {
      blob: new Blob([base64ToBytes(data.data)], { type: data.contentType }),
      contentType: data.contentType,
    };
  } catch (err) {
    console.warn('[quizDocumentImport] linked picture not copied', err);
    return null;
  }
};
