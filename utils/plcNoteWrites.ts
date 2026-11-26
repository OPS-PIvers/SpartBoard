// Transactional note writes for blocks and pre-created meeting notes (TEAMS_REDESIGN T13, T14, T24).

import {
  deleteField,
  doc,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { Plc, PlcNoteBlock } from '@/types';
import { parseNoteBlocks, sanitizeBlocksForWrite } from '@/utils/plcNoteBlocks';
import { plcNotesMutate } from '@/utils/plcNotesWrite';

/** Read-modify-write of a note's blocks; retries re-run `fn` on fresh data so teammates' blocks survive. */
export async function mutateNoteBlocks(
  plcId: string,
  noteId: string,
  uid: string,
  fn: (blocks: PlcNoteBlock[]) => PlcNoteBlock[]
): Promise<void> {
  await plcNotesMutate(plcId, 'notes', noteId, (data) => {
    if (!data) throw new Error('Note not found');
    const fields: Record<string, unknown> = {
      blocks: sanitizeBlocksForWrite(fn(parseNoteBlocks(data.blocks))),
      lastEditedBy: uid,
      lastEditedAt: serverTimestamp(),
    };
    // A legacy note that never carried `version` must not gain one.
    if (typeof data.version === 'number') fields.version = data.version + 1;
    return { write: { op: 'update', fields }, result: undefined };
  });
}

export interface PlannedMeetingNote {
  id: string;
  title: string;
  body: string;
  blocks: PlcNoteBlock[];
  meetingAt: number;
}

export type EnsureMeetingNoteResult = 'created' | 'restored' | 'existing';

/** Creates the planned note once, or restores it from Trash; a live note is never overwritten. */
export async function ensureMeetingNote(
  plcId: string,
  uid: string,
  planned: PlannedMeetingNote
): Promise<EnsureMeetingNoteResult> {
  return plcNotesMutate<EnsureMeetingNoteResult>(
    plcId,
    'notes',
    planned.id,
    (data) => {
      if (data) {
        if (data.deletedAt == null) return { write: null, result: 'existing' };
        const fields: Record<string, unknown> = {
          deletedAt: null,
          meetingAt: planned.meetingAt,
          lastEditedBy: uid,
          lastEditedAt: serverTimestamp(),
        };
        if (typeof data.version === 'number') fields.version = data.version + 1;
        return { write: { op: 'update', fields }, result: 'restored' };
      }
      return {
        write: {
          op: 'create',
          fields: {
            id: planned.id,
            title: planned.title,
            body: planned.body,
            kind: 'meeting',
            meetingAt: planned.meetingAt,
            blocks: sanitizeBlocksForWrite(planned.blocks),
            actionItems: [],
            createdBy: uid,
            createdAt: serverTimestamp(),
            lastEditedBy: uid,
            lastEditedAt: serverTimestamp(),
            version: 0,
          },
        },
        result: 'created',
      };
    }
  );
}

/** Lead or co-lead: the team's own meeting-note template; null returns to the type default (T12). */
export async function saveTeamMeetingNoteTemplate(
  plc: Pick<Plc, 'id'>,
  markdown: string | null
): Promise<void> {
  await updateDoc(doc(db, 'plcs', plc.id), {
    meetingNoteTemplate: markdown ?? deleteField(),
    updatedAt: serverTimestamp(),
  });
}
