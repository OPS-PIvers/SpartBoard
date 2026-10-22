// `/linked_collections/{linkId}`: name, board list and members of a Synced / View-Only collection share.

import { useCallback, useMemo } from 'react';
import {
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, isAuthBypass } from '@/config/firebase';
import { logError } from '@/utils/logError';
import type {
  LinkedCollection,
  LinkedCollectionBoard,
  LinkedCollectionMode,
  LinkedCollectionParticipant,
  LinkedCollectionSection,
} from '@/types';

export const LINKED_COLLECTIONS_PATH = 'linked_collections';
/** Mirrors the rules caps on `/linked_collections`. */
export const LINKED_COLLECTION_MAX_BOARDS = 200;
export const LINKED_COLLECTION_MAX_SECTIONS = 200;
export const LINKED_COLLECTION_MAX_PARTICIPANTS = 50;

export interface CreateLinkedCollectionInput {
  /** Chosen up front so the board shares can be stamped with it before the link exists. */
  linkId?: string;
  hostUid: string;
  hostName: string | null;
  mode: LinkedCollectionMode;
  name: string;
  color?: string;
  icon?: string;
  boards: LinkedCollectionBoard[];
  sections?: LinkedCollectionSection[];
}

/** Fields a Synced collaborator (or the host) may change. */
export type LinkedCollectionPatch = Partial<
  Pick<LinkedCollection, 'name' | 'color' | 'icon' | 'boards' | 'sections'>
>;

type Listener = (link: LinkedCollection | null) => void;

// In-memory store for auth-bypass (dev / E2E) mode, like useSharedCollection's.
class MockLinkedCollectionStore {
  private links = new Map<string, LinkedCollection>();
  private listeners = new Map<string, Set<Listener>>();

  get(linkId: string): LinkedCollection | null {
    const cached = this.links.get(linkId);
    if (cached) return cached;
    // Hydrate from sessionStorage so a link survives navigating to /share/collection/{id} (E2E).
    try {
      const raw = sessionStorage.getItem(`mock_linked_collection_${linkId}`);
      if (raw) {
        const link = { ...(JSON.parse(raw) as LinkedCollection), linkId };
        this.links.set(linkId, link);
        return link;
      }
    } catch {
      /* session storage unavailable: in-memory only */
    }
    return null;
  }

  set(link: LinkedCollection): void {
    this.links.set(link.linkId, link);
    try {
      sessionStorage.setItem(
        `mock_linked_collection_${link.linkId}`,
        JSON.stringify(link)
      );
    } catch {
      /* session storage unavailable: in-memory only */
    }
    this.listeners.get(link.linkId)?.forEach((cb) => cb(link));
  }

  subscribe(linkId: string, cb: Listener): () => void {
    const set = this.listeners.get(linkId) ?? new Set<Listener>();
    set.add(cb);
    this.listeners.set(linkId, set);
    cb(this.get(linkId));
    return () => {
      set.delete(cb);
    };
  }
}

const mockStore = new MockLinkedCollectionStore();

const withoutUndefined = <T extends object>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined)
  ) as T;

/** Throws when a list would break the rules caps, so the write fails with a clear message. */
const assertWithinCaps = (patch: LinkedCollectionPatch): void => {
  if (patch.boards && patch.boards.length > LINKED_COLLECTION_MAX_BOARDS) {
    throw new Error(
      `A shared collection holds at most ${LINKED_COLLECTION_MAX_BOARDS} boards`
    );
  }
  if (
    patch.sections &&
    patch.sections.length > LINKED_COLLECTION_MAX_SECTIONS
  ) {
    throw new Error(
      `A shared collection holds at most ${LINKED_COLLECTION_MAX_SECTIONS} sub-collections`
    );
  }
  if (patch.name !== undefined && !patch.name.trim()) {
    throw new Error('Collection name is required');
  }
};

const fromSnapshot = (
  linkId: string,
  data: Record<string, unknown> | undefined
): LinkedCollection | null =>
  data ? ({ ...data, linkId } as LinkedCollection) : null;

export const useLinkedCollection = () => {
  /** Host: write a new link doc and return its id. */
  const createLinkedCollection = useCallback(
    async (input: CreateLinkedCollectionInput): Promise<string> => {
      assertWithinCaps(input);
      const linkId = input.linkId ?? crypto.randomUUID();
      const now = Date.now();
      const link: LinkedCollection = withoutUndefined({
        linkId,
        hostUid: input.hostUid,
        hostName: input.hostName,
        mode: input.mode,
        name: input.name.trim().slice(0, 200),
        color: input.color,
        icon: input.icon,
        boards: input.boards,
        sections: input.sections,
        participants: {},
        createdAt: now,
        updatedAt: now,
        updatedBy: input.hostUid,
        ended: false,
      });
      if (isAuthBypass) {
        mockStore.set(link);
        return linkId;
      }
      const { linkId: _id, ...payload } = link;
      await setDoc(doc(db, LINKED_COLLECTIONS_PATH, linkId), payload);
      return linkId;
    },
    []
  );

  /** One-shot read for the import landing; `null` when the link is gone. */
  const loadLinkedCollection = useCallback(
    async (linkId: string): Promise<LinkedCollection | null> => {
      if (isAuthBypass) return mockStore.get(linkId);
      const snap = await getDoc(doc(db, LINKED_COLLECTIONS_PATH, linkId));
      return snap.exists() ? fromSnapshot(linkId, snap.data()) : null;
    },
    []
  );

  /** Live view of one link; the callback gets `null` once the doc is deleted. */
  const subscribeLinkedCollection = useCallback(
    (linkId: string, cb: Listener): (() => void) => {
      if (isAuthBypass) return mockStore.subscribe(linkId, cb);
      return onSnapshot(
        doc(db, LINKED_COLLECTIONS_PATH, linkId),
        (snap) => cb(snap.exists() ? fromSnapshot(linkId, snap.data()) : null),
        (err) => {
          logError('useLinkedCollection.subscribe', err, { linkId });
        }
      );
    },
    []
  );

  /** Host or Synced collaborator: change the name, look or board list. */
  const updateLinkedCollection = useCallback(
    async (
      linkId: string,
      uid: string,
      patch: LinkedCollectionPatch
    ): Promise<void> => {
      assertWithinCaps(patch);
      const update = withoutUndefined({
        ...patch,
        ...(patch.name !== undefined && {
          name: patch.name.trim().slice(0, 200),
        }),
        updatedAt: Date.now(),
        updatedBy: uid,
      });
      if (isAuthBypass) {
        const current = mockStore.get(linkId);
        if (current) mockStore.set({ ...current, ...update });
        return;
      }
      await updateDoc(doc(db, LINKED_COLLECTIONS_PATH, linkId), update);
    },
    []
  );

  /** Recipient: add themselves with the role the link's mode grants. */
  const joinLinkedCollection = useCallback(
    async (
      link: Pick<LinkedCollection, 'linkId' | 'mode'>,
      uid: string,
      name?: string
    ): Promise<void> => {
      const entry: LinkedCollectionParticipant = withoutUndefined({
        role: link.mode === 'synced' ? 'collaborator' : 'viewer',
        name: name?.slice(0, 100),
        joinedAt: Date.now(),
      });
      if (isAuthBypass) {
        const current = mockStore.get(link.linkId);
        if (current) {
          mockStore.set({
            ...current,
            participants: { ...current.participants, [uid]: entry },
          });
        }
        return;
      }
      await updateDoc(doc(db, LINKED_COLLECTIONS_PATH, link.linkId), {
        [`participants.${uid}`]: entry,
      });
    },
    []
  );

  /** Recipient: remove themselves. */
  const leaveLinkedCollection = useCallback(
    async (linkId: string, uid: string): Promise<void> => {
      if (isAuthBypass) {
        const current = mockStore.get(linkId);
        if (current) {
          const { [uid]: _gone, ...participants } = current.participants;
          mockStore.set({ ...current, participants });
        }
        return;
      }
      await updateDoc(doc(db, LINKED_COLLECTIONS_PATH, linkId), {
        [`participants.${uid}`]: deleteField(),
      });
    },
    []
  );

  /** Host: Stop sharing. Members keep their boards as their own copies. */
  const endLinkedCollection = useCallback(
    async (linkId: string, uid: string): Promise<void> => {
      const update = { ended: true, updatedAt: Date.now(), updatedBy: uid };
      if (isAuthBypass) {
        const current = mockStore.get(linkId);
        if (current) mockStore.set({ ...current, ...update });
        return;
      }
      await updateDoc(doc(db, LINKED_COLLECTIONS_PATH, linkId), update);
    },
    []
  );

  return useMemo(
    () => ({
      createLinkedCollection,
      loadLinkedCollection,
      subscribeLinkedCollection,
      updateLinkedCollection,
      joinLinkedCollection,
      leaveLinkedCollection,
      endLinkedCollection,
    }),
    [
      createLinkedCollection,
      loadLinkedCollection,
      subscribeLinkedCollection,
      updateLinkedCollection,
      joinLinkedCollection,
      leaveLinkedCollection,
      endLinkedCollection,
    ]
  );
};
