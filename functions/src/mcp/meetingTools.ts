// PLC meeting tools: list recorded meetings, read a transcript, write a notes draft for review (MR-D21).
import * as admin from 'firebase-admin';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MEETING_AI_FEATURE_ID, PAGE_SIZE } from './config';
import {
  ToolError,
  logActivity,
  reserveWrite,
  type ToolContext,
} from './activity';
import { CREATES, READ_ONLY, iso, run } from './toolKit';
import {
  MAX_NOTE_ITEMS,
  MAX_NOTE_ITEM_CHARS,
  buildDraftActionItems,
  parseSummaryResponse,
  sectionsToMarkdown,
  transcriptToPromptText,
  type GroupMember,
  type MeetingNotesSections,
  type TranscriptSegment,
} from '../plcMeetingNotesAi';

type Data = Record<string, unknown>;
type Firestore = admin.firestore.Firestore;

const MAX_GROUPS = 20;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

const millis = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v instanceof admin.firestore.Timestamp) return v.toMillis();
  return null;
};

/** Mirrors `plcMember` in firestore.rules. */
export function canReadPlc(plc: Data | undefined, uid: string): boolean {
  return Array.isArray(plc?.memberUids) && plc.memberUids.includes(uid);
}

/** Mirrors `plcCanEditContent` in firestore.rules: members except viewers. */
export function canEditPlc(plc: Data | undefined, uid: string): boolean {
  if (!plc) return false;
  const entry = ((plc.members ?? {}) as Record<string, Data | undefined>)[uid];
  if (entry) return entry.role !== 'viewer' && entry.status !== 'removed';
  return canReadPlc(plc, uid);
}

function activeMembers(plc: Data | undefined): GroupMember[] {
  const members = (plc?.members ?? {}) as Record<string, Data | undefined>;
  return Object.entries(members)
    .filter(([, m]) => m && m.status !== 'removed')
    .map(([uid, m]) => ({ uid, name: str(m?.displayName).trim() }))
    .filter((m) => m.name);
}

export type DraftState =
  | 'none'
  | 'waiting_for_review'
  | 'inserted'
  | 'dismissed';

export function draftState(rec: Data): DraftState {
  if (!rec.draft) return 'none';
  if (!rec.draftResolvedAt) return 'waiting_for_review';
  return rec.draftResolution === 'inserted' ? 'inserted' : 'dismissed';
}

/** Why Claude can't write a draft for this recording, or null when it can (MR-D21). */
export function draftBlocker(rec: Data | undefined): string | null {
  if (!rec) return 'That recording no longer exists.';
  if (draftState(rec) === 'waiting_for_review') {
    return 'Notes for this recording are already waiting for review in SpartBoard. Ask an editor to insert or dismiss them first.';
  }
  const status = str(rec.status);
  if (status === 'queued' || status === 'transcribing') {
    return 'SpartBoard is making notes for this recording right now. Try again once that finishes.';
  }
  if (rec.hasTranscript !== true) {
    return 'This recording has no transcript yet, so there is nothing to write notes from.';
  }
  return null;
}

export function summarizeRecording(
  id: string,
  rec: Data,
  group: { id: string; name: string },
  noteTitle: string
) {
  const draft = rec.draft as Data | null | undefined;
  return {
    recording_id: id,
    group_id: group.id,
    group_name: group.name,
    note_id: str(rec.noteId),
    note_title: noteTitle,
    recorded_at: iso(millis(rec.createdAt)),
    duration_minutes: Math.round(Number(rec.durationMs ?? 0) / 6000) / 10,
    status: str(rec.status),
    has_transcript: rec.hasTranscript === true,
    notes_draft: draftState(rec),
    notes_draft_source:
      draft && (draft.source === 'claude' || draft.source === 'gemini')
        ? draft.source
        : null,
  };
}

function readSegments(raw: unknown): TranscriptSegment[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((s): s is Data => Boolean(s) && typeof s === 'object')
    .map((s) => ({
      speaker: Number(s.speaker) || 0,
      startMs: Number(s.startMs) || 0,
      text: str(s.text),
    }))
    .filter((s) => s.text);
}

const noteItems = z
  .array(z.string().min(1).max(MAX_NOTE_ITEM_CHARS))
  .max(MAX_NOTE_ITEMS);

const draftInput = {
  group_id: z.string().min(1).max(200),
  recording_id: z.string().min(1).max(200),
  agenda: noteItems.default([]).describe('Topics the meeting covered.'),
  discussion: noteItems
    .default([])
    .describe('Main points raised, one per item.'),
  decisions: noteItems.default([]).describe('What the group agreed on.'),
  action_items: z
    .array(
      z.object({
        text: z.string().min(1).max(MAX_NOTE_ITEM_CHARS),
        owner: z
          .string()
          .max(120)
          .optional()
          .describe(
            'Name of the person who took it on, as said in the meeting. Leave out when unclear.'
          ),
      })
    )
    .max(MAX_NOTE_ITEMS)
    .default([]),
};

export interface DraftArgs {
  agenda: string[];
  discussion: string[];
  decisions: string[];
  action_items: { text: string; owner?: string }[];
}

/** The same draft shape Gemini writes, cleaned by the same parser (plan: "Draft shape"). */
export function buildClaudeDraft(
  args: DraftArgs,
  plc: Data | undefined,
  uid: string,
  now: number,
  newId: () => string
) {
  const sections: MeetingNotesSections = parseSummaryResponse(
    JSON.stringify({
      agenda: args.agenda,
      discussion: args.discussion,
      decisions: args.decisions,
      actionItems: args.action_items.map((a) => ({
        text: a.text,
        owner: a.owner ?? null,
      })),
    })
  );
  const markdown = sectionsToMarkdown(sections);
  const actionItems = buildDraftActionItems(
    sections,
    activeMembers(plc),
    newId
  );
  if (!markdown && actionItems.length === 0) {
    throw new ToolError('The notes are empty. Add at least one item.');
  }
  return {
    markdown,
    actionItems,
    generatedAt: now,
    generatedBy: uid,
    source: 'claude' as const,
  };
}

async function assertAccess(ctx: ToolContext): Promise<void> {
  const { isGlobalFeatureGranted } = await import('../quizMediaArchive');
  if (
    !(await isGlobalFeatureGranted(
      ctx.db,
      MEETING_AI_FEATURE_ID,
      ctx.email,
      ctx.uid
    ))
  ) {
    throw new ToolError(
      'Meeting notes through Claude are not turned on for this account yet.'
    );
  }
}

async function loadGroup(
  db: Firestore,
  groupId: string,
  uid: string
): Promise<Data> {
  const plc = (await db.collection('plcs').doc(groupId).get()).data();
  if (!canReadPlc(plc, uid)) {
    throw new ToolError(
      `Group ${groupId} was not found. Use list_group_meetings to find a group id.`
    );
  }
  return plc as Data;
}

const recordingRef = (db: Firestore, groupId: string, recordingId: string) =>
  db.collection('plcs').doc(groupId).collection('recordings').doc(recordingId);

export function registerMeetingTools(
  server: McpServer,
  ctx: ToolContext
): void {
  server.registerTool(
    'list_group_meetings',
    {
      description:
        "Lists recent recorded meetings in the teacher's groups (PLCs), newest first, with each one's note and whether it has a transcript or notes waiting for review. Pass group_id to see one group.",
      inputSchema: { group_id: z.string().min(1).max(200).optional() },
      annotations: READ_ONLY,
    },
    async ({ group_id }) =>
      run('list_group_meetings', ctx, async () => {
        await assertAccess(ctx);
        let groups: { id: string; data: Data }[];
        if (group_id) {
          groups = [
            { id: group_id, data: await loadGroup(ctx.db, group_id, ctx.uid) },
          ];
        } else {
          const snap = await ctx.db
            .collection('plcs')
            .where('memberUids', 'array-contains', ctx.uid)
            .limit(MAX_GROUPS)
            .get();
          groups = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
        }
        const perGroup = await Promise.all(
          groups.map(async (g) => {
            const snap = await ctx.db
              .collection('plcs')
              .doc(g.id)
              .collection('recordings')
              .orderBy('createdAt', 'desc')
              .limit(PAGE_SIZE)
              .get();
            return snap.docs.map((d) => ({
              group: g,
              id: d.id,
              rec: d.data(),
            }));
          })
        );
        const newest = perGroup
          .flat()
          .sort(
            (a, b) =>
              (millis(b.rec.createdAt) ?? 0) - (millis(a.rec.createdAt) ?? 0)
          )
          .slice(0, PAGE_SIZE);
        const noteRefs = newest.map((m) =>
          ctx.db.doc(`plcs/${m.group.id}/notes/${str(m.rec.noteId) || '_'}`)
        );
        const notes = noteRefs.length ? await ctx.db.getAll(...noteRefs) : [];
        const meetings = newest.flatMap((m, i) => {
          const note = notes[i]?.data();
          if (!note || note.deletedAt != null) return [];
          return [
            summarizeRecording(
              m.id,
              m.rec,
              { id: m.group.id, name: str(m.group.data.name) },
              str(note.title)
            ),
          ];
        });
        return {
          groups: groups.map((g) => ({
            group_id: g.id,
            name: str(g.data.name),
            can_edit: canEditPlc(g.data, ctx.uid),
          })),
          meetings,
        };
      })
  );

  server.registerTool(
    'get_meeting_transcript',
    {
      description:
        "Reads a recorded meeting's transcript as timed lines labelled Speaker 1, Speaker 2 and so on. Speakers are not named in the transcript.",
      inputSchema: {
        group_id: z.string().min(1).max(200),
        recording_id: z.string().min(1).max(200),
      },
      annotations: READ_ONLY,
    },
    async ({ group_id, recording_id }) =>
      run('get_meeting_transcript', ctx, async () => {
        await assertAccess(ctx);
        const plc = await loadGroup(ctx.db, group_id, ctx.uid);
        const rec = (
          await recordingRef(ctx.db, group_id, recording_id).get()
        ).data();
        if (!rec) {
          throw new ToolError(
            `Recording ${recording_id} was not found in that group.`
          );
        }
        if (rec.hasTranscript !== true) {
          throw new ToolError('This recording has no transcript yet.');
        }
        const transcript = (
          await recordingRef(ctx.db, group_id, recording_id)
            .collection('transcript')
            .doc('main')
            .get()
        ).data();
        const segments = readSegments(transcript?.segments);
        return {
          recording_id,
          group_name: str(plc.name),
          recorded_at: iso(millis(rec.createdAt)),
          speaker_count: new Set(segments.map((s) => s.speaker)).size,
          group_members: activeMembers(plc).map((m) => m.name),
          notes_draft: draftState(rec),
          transcript: transcriptToPromptText(segments),
        };
      })
  );

  server.registerTool(
    'write_meeting_notes_draft',
    {
      description:
        'Saves meeting notes for a recording as a draft that a group editor reviews in SpartBoard before inserting it into the note. Never edits the note itself. Refused when a draft is already waiting for review. Read the transcript first; write short plain bullets, and give action item owners only when the meeting named them.',
      inputSchema: draftInput,
      annotations: CREATES,
    },
    async (args) =>
      run('write_meeting_notes_draft', ctx, async () => {
        await assertAccess(ctx);
        const plc = await loadGroup(ctx.db, args.group_id, ctx.uid);
        if (!canEditPlc(plc, ctx.uid)) {
          throw new ToolError(
            'Only editors of this group can write meeting notes.'
          );
        }
        const ref = recordingRef(ctx.db, args.group_id, args.recording_id);
        const blocked = draftBlocker((await ref.get()).data());
        if (blocked) throw new ToolError(blocked);
        await reserveWrite(ctx);
        const now = Date.now();
        const draft = buildClaudeDraft(
          args,
          plc,
          ctx.uid,
          now,
          () => ctx.db.collection('_').doc().id
        );
        const noteTitle = await ctx.db.runTransaction(async (tx) => {
          const cur = (await tx.get(ref)).data();
          const stillBlocked = draftBlocker(cur);
          if (stillBlocked) throw new ToolError(stillBlocked);
          const note = (
            await tx.get(
              ctx.db.doc(
                `plcs/${args.group_id}/notes/${str(cur?.noteId) || '_'}`
              )
            )
          ).data();
          if (!note || note.deletedAt != null) {
            throw new ToolError('The note for this recording is in the trash.');
          }
          tx.update(ref, {
            draft,
            draftResolvedAt: null,
            draftResolution: null,
            draftResolvedBy: null,
          });
          return str(note.title);
        });
        const batch = ctx.db.batch();
        logActivity(ctx, batch, {
          action: 'create',
          itemType: 'meeting_notes',
          itemId: `${args.group_id}/${args.recording_id}`,
          title: noteTitle || 'Meeting notes',
        });
        await batch.commit();
        return {
          recording_id: args.recording_id,
          note_title: noteTitle,
          action_items: draft.actionItems.length,
          next_step:
            'An editor of the group opens the note in SpartBoard, reviews the draft, then inserts or dismisses it.',
        };
      })
  );
}
