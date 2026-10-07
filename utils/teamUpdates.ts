/** Team updates and calendar helpers (docs/plans/TEAMS_REDESIGN.md T26–T28). */

import type { Plc, PlcMember, PlcUpdate, PlcUpdateAck } from '@/types';
import { getPlcMembers, tsToMillis } from '@/utils/plc';

export const UPDATE_TITLE_MAX = 200;
export const UPDATE_BODY_MAX = 5000;
export const LATEST_UPDATES_COUNT = 4;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// Mirrors plcCalendarFieldOk in firestore.rules.
const CALENDAR_EMBED_RE =
  /^https:\/\/calendar\.google\.com\/calendar\/(u\/[0-9]+\/)?embed\?.+$/;
const ATTACHMENT_RE = /^https:\/\/(drive|docs)\.google\.com\/.+$/;
const LINK_RE = /^https:\/\/.+$/;
const URL_MAX = 2000;

const matchesUrl = (re: RegExp, v: unknown): v is string =>
  typeof v === 'string' && v.length <= URL_MAX && re.test(v);

export const isCalendarEmbedUrl = (v: unknown): v is string =>
  matchesUrl(CALENDAR_EMBED_RE, v);

/** Agenda view unless the lead's link already picks a mode. */
export function calendarAgendaUrl(url: string): string {
  return /[?&]mode=/.test(url) ? url : `${url}&mode=AGENDA`;
}

/** Accepts the embed URL or Google's whole `<iframe src="…">` snippet; null when neither is a calendar embed. */
export function normalizeCalendarEmbedInput(raw: string): string | null {
  const trimmed = raw.trim();
  const src = /src\s*=\s*["']([^"']+)["']/i.exec(trimmed)?.[1] ?? trimmed;
  const url = src.replace(/&amp;/g, '&').trim();
  return isCalendarEmbedUrl(url) ? url : null;
}

export const isUpdateLinkUrl = (v: unknown): v is string =>
  matchesUrl(LINK_RE, v);

export const isUpdateAttachmentUrl = (v: unknown): v is string =>
  matchesUrl(ATTACHMENT_RE, v);

export function parsePlcUpdate(
  id: string,
  data: Record<string, unknown>
): PlcUpdate | null {
  if (typeof data.title !== 'string' || typeof data.authorUid !== 'string') {
    return null;
  }
  const reactions: Record<string, true> = {};
  if (isRecord(data.reactions)) {
    for (const [uid, v] of Object.entries(data.reactions)) {
      if (v === true) reactions[uid] = true;
    }
  }
  const att = data.attachment;
  return {
    id,
    title: data.title,
    body: typeof data.body === 'string' ? data.body : '',
    ...(isUpdateLinkUrl(data.linkUrl) ? { linkUrl: data.linkUrl } : {}),
    ...(isRecord(att) &&
    typeof att.name === 'string' &&
    isUpdateAttachmentUrl(att.url)
      ? { attachment: { name: att.name, url: att.url } }
      : {}),
    requiresAck: data.requiresAck === true,
    inDigest: data.inDigest === true,
    pinned: data.pinned === true,
    reactions,
    authorUid: data.authorUid,
    authorName: typeof data.authorName === 'string' ? data.authorName : '',
    createdAt: tsToMillis(data.createdAt),
    updatedAt: tsToMillis(data.updatedAt),
  };
}

export function parsePlcUpdateAck(
  id: string,
  data: Record<string, unknown>
): PlcUpdateAck {
  return {
    uid: typeof data.uid === 'string' ? data.uid : id,
    name: typeof data.name === 'string' ? data.name : '',
    ackedAt: tsToMillis(data.ackedAt),
  };
}

/** Newest first; a pending serverTimestamp (0) sorts as newest. */
export function sortUpdates(updates: PlcUpdate[]): PlcUpdate[] {
  const key = (u: PlcUpdate) => (u.createdAt === 0 ? Infinity : u.createdAt);
  return [...updates].sort((a, b) => key(b) - key(a));
}

/** The hero's default for Building (T6): the newest pinned update, else the newest update. */
export function pickHeroUpdate(
  updates: PlcUpdate[],
  pinnedId?: string
): PlcUpdate | null {
  if (pinnedId) return updates.find((u) => u.id === pinnedId) ?? null;
  const sorted = sortUpdates(updates);
  return sorted.find((u) => u.pinned) ?? sorted[0] ?? null;
}

export type UpdatesFilter = 'all' | 'ack' | 'pinned';

export function filterUpdates(
  updates: PlcUpdate[],
  filter: UpdatesFilter
): PlcUpdate[] {
  if (filter === 'ack') return updates.filter((u) => u.requiresAck);
  if (filter === 'pinned') return updates.filter((u) => u.pinned);
  return updates;
}

/** First line is the title, the rest is the body (the compose box is a single field). */
export function splitComposeText(text: string): {
  title: string;
  body: string;
} {
  const trimmed = text.trim();
  const nl = trimmed.indexOf('\n');
  const first = nl === -1 ? trimmed : trimmed.slice(0, nl);
  const rest = nl === -1 ? '' : trimmed.slice(nl + 1).trim();
  if (first.length <= UPDATE_TITLE_MAX) {
    return { title: first.trim(), body: rest.slice(0, UPDATE_BODY_MAX) };
  }
  return {
    title: first.slice(0, UPDATE_TITLE_MAX).trim(),
    body: trimmed.slice(0, UPDATE_BODY_MAX),
  };
}

export interface AckRoster {
  acknowledged: { uid: string; name: string; ackedAt: number }[];
  notYet: { uid: string; name: string }[];
  total: number;
}

const memberName = (m: PlcMember) => m.displayName || m.email || m.uid;

/** Everyone on the team except the author is expected to acknowledge. */
export function buildAckRoster(
  plc: Plc,
  update: PlcUpdate,
  acks: PlcUpdateAck[]
): AckRoster {
  const members = getPlcMembers(plc).filter((m) => m.uid !== update.authorUid);
  const byUid = new Map(acks.map((a) => [a.uid, a]));
  const acknowledged: AckRoster['acknowledged'] = [];
  const notYet: AckRoster['notYet'] = [];
  for (const m of members) {
    const ack = byUid.get(m.uid);
    if (ack) {
      acknowledged.push({
        uid: m.uid,
        name: ack.name || memberName(m),
        ackedAt: ack.ackedAt,
      });
    } else {
      notYet.push({ uid: m.uid, name: memberName(m) });
    }
  }
  acknowledged.sort((a, b) => a.ackedAt - b.ackedAt);
  notYet.sort((a, b) => a.name.localeCompare(b.name));
  return { acknowledged, notYet, total: members.length };
}
