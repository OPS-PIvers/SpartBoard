import { createContext, useContext, useEffect, useState } from 'react';
import { loadWebTourPicture } from '@/components/tours/webTours';
import { webTourEditorDevSeed } from './webEditorDevSeed';

// One download per picture while the editor is open, shared by the stage, the outline and the publish check.
export const PictureCache = createContext<Map<string, Promise<Blob>> | null>(
  null
);

export function usePictureBlob(path: string | undefined): {
  blob: Blob | null;
  failed: boolean;
} {
  const cache = useContext(PictureCache);
  const [state, setState] = useState<{
    path?: string;
    blob: Blob | null;
    failed: boolean;
  }>({ blob: null, failed: false });
  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    let pending = cache?.get(path);
    if (!pending) {
      // A dev seed answers from its own pictures; a path it lacks fails as a missing file would.
      const seeded = webTourEditorDevSeed()?.pictures;
      pending = seeded
        ? seeded[path]
          ? Promise.resolve(seeded[path])
          : Promise.reject(new Error('No such picture'))
        : loadWebTourPicture(path).then((bytes) => new Blob([bytes]));
      cache?.set(path, pending);
    }
    pending
      .then((blob) => !cancelled && setState({ path, blob, failed: false }))
      .catch(() => {
        cache?.delete(path);
        if (!cancelled) setState({ path, blob: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [cache, path]);
  return state.path === path && path ? state : { blob: null, failed: false };
}
