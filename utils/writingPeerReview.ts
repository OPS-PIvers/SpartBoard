// Writing peer review: groups of two (or three) students, each reading the next one's writing.
import type { WritingPeerAccess } from '@/types';
import { lastFirst } from '@/utils/studentName';

/** A group lists student uids; each reviews the next, and the last reviews the first. */
export type PeerGroup = string[];

export interface PeerEdge {
  reviewerUid: string;
  authorUid: string;
}

export const PEER_GROUP_MAX = 3;

export const PEER_ACCESS_LEVELS: readonly WritingPeerAccess[] = [
  'view',
  'comment',
  'edit',
];

/** Each student in a group reviews the next one: a pair reviews each other, three go in a round. */
export function peerEdges(groups: readonly PeerGroup[]): PeerEdge[] {
  const edges: PeerEdge[] = [];
  for (const g of groups) {
    if (g.length < 2) continue;
    g.forEach((reviewerUid, i) =>
      edges.push({ reviewerUid, authorUid: g[(i + 1) % g.length] })
    );
  }
  return edges;
}

/** Drops empty and single groups and any uid seen twice, keeping the first place it appears. */
export function normalizeGroups(groups: readonly PeerGroup[]): PeerGroup[] {
  const seen = new Set<string>();
  const out: PeerGroup[] = [];
  for (const g of groups) {
    const kept = g.filter((uid) => uid && !seen.has(uid));
    kept.forEach((uid) => seen.add(uid));
    if (kept.length >= 2) out.push(kept.slice(0, PEER_GROUP_MAX));
  }
  return out;
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Pairs `uids` at random; an odd one out joins the last pair as a group of three.
 * `keep` groups stay as they are and their students are not paired again.
 */
export function pairAtRandom(
  uids: readonly string[],
  keep: readonly PeerGroup[] = [],
  random: () => number = Math.random
): PeerGroup[] {
  const kept = normalizeGroups(keep);
  const taken = new Set(kept.flat());
  const rest = shuffled(
    uids.filter((u) => !taken.has(u)),
    random
  );
  const fresh: PeerGroup[] = [];
  for (let i = 0; i + 1 < rest.length; i += 2)
    fresh.push([rest[i], rest[i + 1]]);
  if (rest.length % 2 === 1) {
    const last = rest[rest.length - 1];
    if (fresh.length > 0) fresh[fresh.length - 1].push(last);
    else {
      const open = kept.find((g) => g.length < PEER_GROUP_MAX);
      if (open) open.push(last);
    }
  }
  return [...kept, ...fresh];
}

/** Puts `a` with `b`: joins b's group when it has room, otherwise makes a new pair. */
export function pairWith(
  groups: readonly PeerGroup[],
  a: string,
  b: string
): PeerGroup[] {
  if (a === b) return normalizeGroups(groups);
  const without = unpair(groups, a);
  const target = without.find((g) => g.includes(b));
  if (target && target.length < PEER_GROUP_MAX)
    return without.map((g) => (g === target ? [...g, a] : g));
  return normalizeGroups([...unpair(without, b), [a, b]]);
}

/** Takes `uid` out of its group; a group left with one student is dropped. */
export function unpair(groups: readonly PeerGroup[], uid: string): PeerGroup[] {
  return normalizeGroups(groups.map((g) => g.filter((u) => u !== uid)));
}

/** Whose writing `uid` reads, and who reads theirs. */
export function peerLinksFor(
  groups: readonly PeerGroup[],
  uid: string
): { reviews: string | null; reviewedBy: string | null } {
  const edges = peerEdges(groups);
  return {
    reviews: edges.find((e) => e.reviewerUid === uid)?.authorUid ?? null,
    reviewedBy: edges.find((e) => e.authorUid === uid)?.reviewerUid ?? null,
  };
}

/** "Last, First", or whichever part there is; sorted by last name. */
export function peerStudentList(
  uids: readonly string[],
  names: ReadonlyMap<string, { givenName: string; familyName: string }>
): { uid: string; name: string }[] {
  return [...new Set(uids)]
    .map((uid) => {
      const n = names.get(uid);
      const name = lastFirst(n);
      return { uid, name };
    })
    .filter((s) => s.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}
