// The team's next meeting: an upcoming meeting note, else the next cadence date with a note still to create (T24).

import type { Plc, PlcNote } from '@/types';
import {
  MEETING_GRACE_MS,
  nextMeetingOccurrence,
  parseMeetingCadence,
} from '@/utils/plcMeetingCadence';

export type NextMeeting =
  | { kind: 'note'; note: PlcNote; meetingAt: number }
  | { kind: 'planned'; noteId: string; meetingAt: number };

/** Deterministic id so teammates opening the hub at once create one note, not two. */
export const plannedMeetingNoteId = (dateKey: string): string =>
  `meeting-${dateKey}`;

export function selectNextMeeting(
  plc: Pick<Plc, 'meetingCadence'>,
  notes: readonly PlcNote[],
  now: number
): NextMeeting | null {
  const floor = now - MEETING_GRACE_MS;
  let upcoming: PlcNote | null = null;
  for (const note of notes) {
    if (note.deletedAt != null || note.kind !== 'meeting') continue;
    if (note.meetingAt == null || note.meetingAt < floor) continue;
    if (!upcoming || note.meetingAt < (upcoming.meetingAt ?? 0))
      upcoming = note;
  }
  const cadence = parseMeetingCadence(plc.meetingCadence);
  const occ = cadence ? nextMeetingOccurrence(cadence, now) : null;
  if (upcoming && (!occ || (upcoming.meetingAt ?? 0) <= occ.start)) {
    return { kind: 'note', note: upcoming, meetingAt: upcoming.meetingAt ?? 0 };
  }
  if (!occ) return null;
  const noteId = plannedMeetingNoteId(occ.originalDate);
  const existing = notes.find((n) => n.id === noteId && n.deletedAt == null);
  if (existing) {
    return {
      kind: 'note',
      note: existing,
      meetingAt: existing.meetingAt ?? occ.start,
    };
  }
  return { kind: 'planned', noteId, meetingAt: occ.start };
}
