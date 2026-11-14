import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { Plc } from '@/types';
import { getPlcMembers } from '@/utils/plc';

export interface ShareHeader {
  title: string;
  /** Rule-enforced equal to the creator's uid, so trustworthy. */
  originalAuthor: string;
}

/** Reads only the title and author of a share doc for the import confirmation. */
export async function peekShareHeader(
  collectionName: string,
  shareId: string
): Promise<ShareHeader> {
  const snap = await getDoc(doc(db, collectionName, shareId));
  if (!snap.exists()) throw new Error('Shared item not found.');
  const data = snap.data() as { title?: unknown; originalAuthor?: unknown };
  return {
    title:
      typeof data.title === 'string' && data.title.trim()
        ? data.title.trim()
        : 'Untitled',
    originalAuthor:
      typeof data.originalAuthor === 'string' ? data.originalAuthor : '',
  };
}

/** Resolves the sharer from the importer's own PLC rosters; never from the share doc. */
export function describeSharer(
  authorUid: string,
  currentUid: string,
  plcs: Plc[]
): string {
  if (authorUid && authorUid === currentUid) return 'You';
  for (const plc of plcs) {
    const m = getPlcMembers(plc).find((x) => x.uid === authorUid);
    if (m) return `${m.displayName || m.email} (${m.email}) via ${plc.name}`;
  }
  return `Unknown account${authorUid ? ` (ID ${authorUid.slice(0, 6)}…)` : ''}, not in any of your groups`;
}
