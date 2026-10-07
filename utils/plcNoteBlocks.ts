// Note Data, Decision and agenda blocks: parsing, write sanitizing and team rollups (TEAMS_REDESIGN T13, T14, T24).

import type {
  PlcActionItem,
  PlcDoc,
  PlcNote,
  PlcNoteBlock,
  PlcNoteDecisionBlock,
  PlcNoteDecisionLink,
} from '@/types';

/** Firestore rules cap a note's blocks at this many. */
export const MAX_NOTE_BLOCKS = 100;
const MAX_BLOCK_TEXT = 2000;
const MAX_SECTION = 200;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const optNum = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

function parseLink(raw: unknown): PlcNoteDecisionLink | null {
  if (!isRecord(raw)) return null;
  if (
    raw.kind === 'question' &&
    typeof raw.assessmentId === 'string' &&
    typeof raw.questionId === 'string'
  ) {
    return {
      kind: 'question',
      assessmentId: raw.assessmentId,
      questionId: raw.questionId,
    };
  }
  if (raw.kind === 'target' && typeof raw.targetId === 'string') {
    return { kind: 'target', targetId: raw.targetId };
  }
  return null;
}

/** Tolerant read; malformed entries are dropped, unknown kinds too. */
export function parseNoteBlocks(raw: unknown): PlcNoteBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: PlcNoteBlock[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id) continue;
    if (seen.has(entry.id)) continue;
    const base = {
      id: entry.id,
      section: str(entry.section),
      createdBy: str(entry.createdBy),
      createdAt: num(entry.createdAt),
    };
    if (entry.kind === 'data') {
      out.push({
        ...base,
        kind: 'data',
        assessmentId:
          typeof entry.assessmentId === 'string' ? entry.assessmentId : null,
      });
    } else if (entry.kind === 'decision') {
      out.push({
        ...base,
        kind: 'decision',
        text: str(entry.text),
        status: entry.status === 'decided' ? 'decided' : 'open',
        decidedAt: optNum(entry.decidedAt),
        revisitAt: optNum(entry.revisitAt),
        link: parseLink(entry.link),
      });
    } else if (entry.kind === 'agenda') {
      out.push({ ...base, kind: 'agenda', text: str(entry.text) });
    } else {
      continue;
    }
    seen.add(entry.id);
  }
  return out;
}

/** Plain maps with no undefined values, trimmed to the rules cap. */
export function sanitizeBlocksForWrite(
  blocks: readonly PlcNoteBlock[]
): Record<string, unknown>[] {
  return blocks.slice(0, MAX_NOTE_BLOCKS).map((b) => {
    const base: Record<string, unknown> = {
      id: b.id,
      kind: b.kind,
      section: b.section.slice(0, MAX_SECTION),
      createdBy: b.createdBy,
      createdAt: b.createdAt,
    };
    if (b.kind === 'data') {
      base.assessmentId = b.assessmentId;
    } else if (b.kind === 'decision') {
      base.text = b.text.slice(0, MAX_BLOCK_TEXT);
      base.status = b.status;
      base.decidedAt = b.decidedAt ?? null;
      base.revisitAt = b.revisitAt ?? null;
      base.link = b.link ? { ...b.link } : null;
    } else {
      base.text = b.text.slice(0, MAX_BLOCK_TEXT);
    }
    return base;
  });
}

export const newBlockId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export interface DecisionView {
  note: PlcNote;
  block: PlcNoteDecisionBlock;
}

/** Open decisions across live notes, soonest revisit first, then newest. */
export function selectOpenDecisions(notes: readonly PlcNote[]): DecisionView[] {
  const out: DecisionView[] = [];
  for (const note of notes) {
    if (note.deletedAt != null) continue;
    for (const block of note.blocks ?? []) {
      if (block.kind === 'decision' && block.status === 'open') {
        if (block.text.trim()) out.push({ note, block });
      }
    }
  }
  return out.sort(byRevisitThenNewest);
}

/** Decided decisions with a revisit date still ahead (or today), soonest first. */
export function selectDecisionsToRevisit(
  notes: readonly PlcNote[],
  now: number
): DecisionView[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const out: DecisionView[] = [];
  for (const note of notes) {
    if (note.deletedAt != null) continue;
    for (const block of note.blocks ?? []) {
      if (
        block.kind === 'decision' &&
        block.status === 'decided' &&
        block.revisitAt != null &&
        block.revisitAt >= today.getTime() &&
        block.text.trim()
      ) {
        out.push({ note, block });
      }
    }
  }
  return out.sort(byRevisitThenNewest);
}

function byRevisitThenNewest(a: DecisionView, b: DecisionView): number {
  const ar = a.block.revisitAt ?? Number.POSITIVE_INFINITY;
  const br = b.block.revisitAt ?? Number.POSITIVE_INFINITY;
  if (ar !== br) return ar - br;
  return b.block.createdAt - a.block.createdAt;
}

export interface TeamActionItemView {
  source: { kind: 'note'; note: PlcNote } | { kind: 'doc'; doc: PlcDoc };
  item: PlcActionItem;
}

/** Every open action item on live notes and linked docs, soonest due first, undated last. */
export function selectOpenActionItems(
  notes: readonly PlcNote[],
  docs: readonly PlcDoc[] = []
): TeamActionItemView[] {
  const out: TeamActionItemView[] = [];
  for (const note of notes) {
    if (note.deletedAt != null) continue;
    for (const item of note.actionItems ?? []) {
      if (!item.done && item.text.trim()) {
        out.push({ source: { kind: 'note', note }, item });
      }
    }
  }
  for (const doc of docs) {
    if (doc.deletedAt != null) continue;
    for (const item of doc.actionItems ?? []) {
      if (!item.done && item.text.trim()) {
        out.push({ source: { kind: 'doc', doc }, item });
      }
    }
  }
  return out.sort((a, b) => {
    const ad = a.item.dueAt ?? Number.POSITIVE_INFINITY;
    const bd = b.item.dueAt ?? Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    return a.item.createdAt - b.item.createdAt;
  });
}

/** Open action items assigned to one member, notes and docs together (T14 "My items"). */
export function selectMemberActionItems(
  notes: readonly PlcNote[],
  docs: readonly PlcDoc[],
  uid: string | null
): TeamActionItemView[] {
  if (!uid) return [];
  return selectOpenActionItems(notes, docs).filter(
    (v) => v.item.assigneeUid === uid
  );
}
