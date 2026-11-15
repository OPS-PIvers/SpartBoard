import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { Plc } from '@/types';
import type { MemberRecord } from '@/types/organization';
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

export interface OrgSharer {
  name: string;
  email: string;
}

/** Org staff member whose server-linked uid matches; email is the rule-pinned doc id. */
export async function lookupOrgSharer(
  orgId: string,
  uid: string
): Promise<OrgSharer | null> {
  const snap = await getDocs(
    query(
      collection(db, 'organizations', orgId, 'members'),
      where('uid', '==', uid),
      limit(1)
    )
  );
  const d = snap.docs[0];
  if (!d) return null;
  const m = d.data() as Partial<MemberRecord>;
  const live = ['active', 'invited'].includes(m.status ?? 'active');
  if (!live || m.roleId === 'student') return null;
  const name = (m.name ?? '').trim();
  return { name: name.length > 0 ? name : d.id, email: d.id };
}

/** Resolves the sharer from org staff records or the importer's PLC rosters; never from the share doc. */
export function describeSharer(
  authorUid: string,
  currentUid: string,
  plcs: Plc[],
  orgSharer: OrgSharer | null,
  nameOnly = false
): string {
  if (authorUid && authorUid === currentUid) return 'You';
  let plcName: string | undefined;
  let fromPlc: OrgSharer | null = null;
  for (const plc of plcs) {
    const m = getPlcMembers(plc).find((x) => x.uid === authorUid);
    if (!m) continue;
    plcName = plc.name;
    fromPlc = { name: m.displayName || m.email, email: m.email };
    break;
  }
  const who = orgSharer ?? fromPlc;
  if (!who) return 'Someone outside your organization';
  if (nameOnly) return who.name;
  return `${who.name} (${who.email})${plcName ? ` via ${plcName}` : ''}`;
}
