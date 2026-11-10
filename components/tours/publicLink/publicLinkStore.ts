import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { getBytes, getMetadata, ref } from 'firebase/storage';
import { db, storage } from '@/config/firebase';
import type { GuidedLearningSet } from '@/types';
import { logError } from '@/utils/logError';
import {
  PUBLIC_LINKS_DOC,
  PUBLIC_LINKS_SUBCOLLECTION,
  newPublicToken,
  type PublicLinkRecord,
  type PublicTourKind,
} from './publicLinkModel';

/** Public-link states the dummy backend can't reach, set by screenshot scripts and harness pages. */
export interface PublicLinkDevSeed {
  /** Treat the viewer as an admin (default true) or as an author who isn't one. */
  admin?: boolean;
  /** The record per tour id; writes update it in place. */
  records?: Record<string, PublicLinkRecord | null>;
  /** The published copy per tour id, for the second confirm and the status. */
  published?: Record<string, GuidedLearningSet | null>;
  /** Step pictures by Storage path, standing in for Storage reads. */
  pictures?: Record<string, Blob>;
}

declare global {
  interface Window {
    __publicLinkDevSeed?: PublicLinkDevSeed;
  }
}

/** Dev builds only; always null in production. */
export const publicLinkDevSeed = (): PublicLinkDevSeed | null =>
  import.meta.env.DEV && typeof window !== 'undefined'
    ? (window.__publicLinkDevSeed ?? null)
    : null;

/** The largest picture the confirm reads, as the serving function does. */
const MAX_PICTURE_BYTES = 8 * 1024 * 1024;

/** A picture's bytes and the Storage object generation they belong to. */
export interface ConfirmedPicture {
  path: string;
  generation: string;
  bytes: ArrayBuffer;
}

/** Reads a picture for the confirm and the generation of exactly those bytes; null when it isn't in this project's Storage. */
export async function readConfirmedPicture(
  source: string
): Promise<ConfirmedPicture | null> {
  const seed = publicLinkDevSeed();
  if (seed) {
    const blob = seed.pictures?.[source];
    return blob
      ? { path: source, generation: '1', bytes: await blob.arrayBuffer() }
      : null;
  }
  let file: ReturnType<typeof ref>;
  try {
    file = ref(storage, source);
  } catch {
    return null;
  }
  if (file.bucket !== storage.app.options.storageBucket) return null;
  const before = await getMetadata(file);
  const bytes = await getBytes(file, MAX_PICTURE_BYTES);
  const after = await getMetadata(file);
  // Replaced while it loaded: what was shown may not be what would be confirmed.
  if (before.generation !== after.generation)
    throw new Error('The picture changed while it loaded');
  return { path: file.fullPath, generation: after.generation, bytes };
}

const linkRef = (setId: string) =>
  doc(db, PUBLIC_LINKS_DOC, PUBLIC_LINKS_SUBCOLLECTION, setId);

const seedListeners = new Map<
  string,
  Set<(r: PublicLinkRecord | null) => void>
>();

const seedWrite = (
  seed: PublicLinkDevSeed,
  setId: string,
  r: PublicLinkRecord | null
) => {
  seed.records = { ...seed.records, [setId]: r };
  seedListeners.get(setId)?.forEach((fn) => fn(r));
};

const parse = (v: unknown): PublicLinkRecord | null => {
  const r = v as Partial<PublicLinkRecord> | undefined;
  return r &&
    typeof r.token === 'string' &&
    typeof r.fingerprint === 'string' &&
    (r.kind === 'web' || r.kind === 'live')
    ? (r as PublicLinkRecord)
    : null;
};

/** Watches a tour's public-link record until the returned cleanup runs. Admins only (rules). */
export function watchPublicLink(
  setId: string,
  onChange: (record: PublicLinkRecord | null) => void,
  onError: () => void
): () => void {
  const seed = publicLinkDevSeed();
  if (seed) {
    const set = seedListeners.get(setId) ?? new Set();
    set.add(onChange);
    seedListeners.set(setId, set);
    onChange(seed.records?.[setId] ?? null);
    return () => set.delete(onChange);
  }
  return onSnapshot(
    linkRef(setId),
    (snap) => onChange(snap.exists() ? parse(snap.data()) : null),
    (err) => {
      logError('watchPublicLink', err, { setId });
      onError();
    }
  );
}

/** Makes the tour public for the pictures the admin just confirmed; a link switched off by a picture change keeps its address. */
export async function turnOnPublicLink(
  setId: string,
  confirmed: {
    fingerprint: string;
    kind: PublicTourKind;
    pictures: Record<string, string>;
    email: string;
    previous: PublicLinkRecord | null;
  }
): Promise<PublicLinkRecord> {
  const record: PublicLinkRecord = {
    token: confirmed.previous?.token ?? newPublicToken(),
    fingerprint: confirmed.fingerprint,
    kind: confirmed.kind,
    pictures: confirmed.pictures,
    confirmedBy: confirmed.email.toLowerCase(),
    confirmedAt: Date.now(),
  };
  const seed = publicLinkDevSeed();
  if (seed) seedWrite(seed, setId, record);
  else await setDoc(linkRef(setId), record);
  return record;
}

/** Switches the link off at once; the record keeps its token, so turning it on again keeps the address. */
export async function turnOffPublicLink(setId: string): Promise<void> {
  const off = { reason: 'admin' as const, at: Date.now() };
  const seed = publicLinkDevSeed();
  if (seed) {
    const current = seed.records?.[setId];
    if (current) seedWrite(seed, setId, { ...current, off });
  } else await updateDoc(linkRef(setId), { off });
}
