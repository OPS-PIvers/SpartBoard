import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  PlcAssessmentAggregate,
  PlcCommonAssessment,
  PlcMeeting,
} from '@/types';
import {
  buildMeetingExportRows,
  exportPlcMeeting,
  meetingExportTitle,
  type PlcMeetingExportContext,
} from '@/utils/plcMeetingExport';
import {
  actionItemsNeedingTodos,
  applyTodoBackLinks,
  buildTodoFromActionItem,
  captureAttendeeUids,
  MEETING_PRESENCE_FRESH_WINDOW_MS,
  sanitizeActionItemsForWrite,
} from '@/hooks/usePlcMeetings';

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeMeeting(overrides: Partial<PlcMeeting> = {}): PlcMeeting {
  return {
    id: 'm1',
    heldAt: 1_700_000_000_000,
    facilitatorUid: 'lead',
    attendeeUids: ['lead', 'teach2'],
    assessmentIds: ['a1'],
    decisions: [],
    actionItems: [],
    status: 'in-progress',
    createdBy: 'lead',
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

const CTX: PlcMeetingExportContext = {
  plcName: '6th Math',
  memberNamesByUid: {
    lead: 'Ada Lead',
    teach2: 'Bob Teach',
    teach3: 'Cy Three',
  },
  assessmentsById: {
    a1: {
      id: 'a1',
      title: 'Unit 4 CFA',
      kind: 'quiz',
      syncGroupId: 'grp-1',
      unitLabel: 'Unit 4',
      status: 'reviewing',
      createdBy: 'lead',
      createdAt: 1,
      updatedAt: 2,
    } satisfies PlcCommonAssessment,
  },
  aggregatesById: {
    a1: {
      assessmentId: 'a1',
      schemaVersion: 1,
      teacherCount: 3,
      studentCount: 60,
      teamAveragePercent: 72.4,
      perQuestion: [
        {
          questionId: 'q1',
          text: 'Add fractions',
          correctPercent: 90,
          points: 1,
        },
        { questionId: 'q2', text: 'Divide', correctPercent: 40, points: 1 },
        { questionId: 'q3', text: 'Multiply', correctPercent: 55, points: 1 },
      ],
      perTeacher: [],
      ranAt: 3,
    } satisfies PlcAssessmentAggregate,
  },
};

// ─── Attendee capture (§6.2 Save / §11) ─────────────────────────────────────

describe('captureAttendeeUids', () => {
  const NOW = 1_000_000;

  it('captures members whose heartbeat is within the freshness window', () => {
    const presence = [
      { uid: 'teach2', lastActiveAt: NOW - 10_000 },
      { uid: 'teach3', lastActiveAt: NOW - 5_000 },
    ];
    const result = captureAttendeeUids(presence, 'lead', NOW);
    // teach2 + teach3 fresh, plus the facilitator always included.
    expect(result).toEqual(['teach2', 'teach3', 'lead']);
  });

  it('excludes members whose heartbeat is older than the window', () => {
    const presence = [
      { uid: 'teach2', lastActiveAt: NOW - 10_000 },
      {
        uid: 'teach3',
        lastActiveAt: NOW - (MEETING_PRESENCE_FRESH_WINDOW_MS + 1),
      },
    ];
    const result = captureAttendeeUids(presence, 'lead', NOW);
    expect(result).toEqual(['teach2', 'lead']);
    expect(result).not.toContain('teach3');
  });

  it('always includes the facilitator even when their heartbeat is stale', () => {
    const presence = [
      {
        uid: 'lead',
        lastActiveAt: NOW - (MEETING_PRESENCE_FRESH_WINDOW_MS + 1),
      },
    ];
    expect(captureAttendeeUids(presence, 'lead', NOW)).toEqual(['lead']);
  });

  it('does not duplicate the facilitator when already present', () => {
    const presence = [{ uid: 'lead', lastActiveAt: NOW - 1_000 }];
    expect(captureAttendeeUids(presence, 'lead', NOW)).toEqual(['lead']);
  });

  it('treats a pending serverTimestamp (lastActiveAt<=0) as not present', () => {
    const presence = [
      { uid: 'teach2', lastActiveAt: 0 },
      { uid: 'teach3', lastActiveAt: NOW - 1_000 },
    ];
    expect(captureAttendeeUids(presence, 'lead', NOW)).toEqual([
      'teach3',
      'lead',
    ]);
  });

  it('de-duplicates repeated presence uids', () => {
    const presence = [
      { uid: 'teach2', lastActiveAt: NOW - 1_000 },
      { uid: 'teach2', lastActiveAt: NOW - 2_000 },
    ];
    expect(captureAttendeeUids(presence, 'lead', NOW)).toEqual([
      'teach2',
      'lead',
    ]);
  });
});

// ─── Action-item → to-do spawning (§6.2 Act / §3.9) ─────────────────────────

describe('actionItemsNeedingTodos', () => {
  it('selects only items with text and no existing todoId', () => {
    const items: PlcMeeting['actionItems'] = [
      { id: 'ai1', text: 'Reteach division' },
      { id: 'ai2', text: 'Already promoted', todoId: 'todo-x' },
      { id: 'ai3', text: '   ' }, // whitespace-only — skipped
      { id: 'ai4', text: 'Build exit ticket', assigneeUid: 'teach2' },
    ];
    const pending = actionItemsNeedingTodos(items);
    expect(pending.map((i) => i.id)).toEqual(['ai1', 'ai4']);
  });

  it('returns empty when every item is already promoted', () => {
    const items: PlcMeeting['actionItems'] = [
      { id: 'ai1', text: 'x', todoId: 't1' },
    ];
    expect(actionItemsNeedingTodos(items)).toEqual([]);
  });
});

describe('buildTodoFromActionItem', () => {
  it('projects text/assignee/due + meetingId provenance, trims text', () => {
    const item: PlcMeeting['actionItems'][number] = {
      id: 'ai4',
      text: '  Build exit ticket  ',
      assigneeUid: 'teach2',
      dueAt: 1_700_500_000_000,
    };
    const payload = buildTodoFromActionItem('todo-1', item, 'm1', 'lead');
    expect(payload).toEqual({
      id: 'todo-1',
      text: 'Build exit ticket',
      done: false,
      createdBy: 'lead',
      meetingId: 'm1',
      assigneeUid: 'teach2',
      dueAt: 1_700_500_000_000,
    });
    // createdAt is stamped by the writer, never by the pure builder.
    expect(payload).not.toHaveProperty('createdAt');
  });

  it('omits assignee/due when absent (schema-lock friendly)', () => {
    const item: PlcMeeting['actionItems'][number] = { id: 'ai1', text: 'x' };
    const payload = buildTodoFromActionItem('todo-2', item, 'm1', 'lead');
    expect(payload).not.toHaveProperty('assigneeUid');
    expect(payload).not.toHaveProperty('dueAt');
    expect(payload.meetingId).toBe('m1');
  });

  it('preserves an explicit null dueAt', () => {
    const item: PlcMeeting['actionItems'][number] = {
      id: 'ai1',
      text: 'x',
      dueAt: null,
    };
    const payload = buildTodoFromActionItem('todo-3', item, 'm1', 'lead');
    expect(payload.dueAt).toBeNull();
  });
});

describe('applyTodoBackLinks', () => {
  it('back-links the spawned todoId onto matching action items only', () => {
    const items: PlcMeeting['actionItems'] = [
      { id: 'ai1', text: 'a' },
      { id: 'ai2', text: 'b', todoId: 'existing' },
      { id: 'ai3', text: 'c' },
    ];
    const map = new Map([
      ['ai1', 'todo-1'],
      ['ai3', 'todo-3'],
    ]);
    const next = applyTodoBackLinks(items, map);
    expect(next).toEqual([
      { id: 'ai1', text: 'a', todoId: 'todo-1' },
      { id: 'ai2', text: 'b', todoId: 'existing' },
      { id: 'ai3', text: 'c', todoId: 'todo-3' },
    ]);
    // Immutable: original untouched.
    expect(items[0]).not.toHaveProperty('todoId');
  });

  it('end-to-end: needing → build → back-link is idempotent on re-run', () => {
    const items: PlcMeeting['actionItems'] = [
      { id: 'ai1', text: 'Reteach', assigneeUid: 'teach2', dueAt: 123 },
      { id: 'ai2', text: 'Done already', todoId: 't0' },
    ];
    // First pass: ai1 needs a todo; ai2 is skipped.
    const pending = actionItemsNeedingTodos(items);
    expect(pending.map((i) => i.id)).toEqual(['ai1']);
    const map = new Map(pending.map((i) => [i.id, `todo-for-${i.id}`]));
    const afterFirst = applyTodoBackLinks(items, map);
    expect(afterFirst.find((i) => i.id === 'ai1')?.todoId).toBe('todo-for-ai1');

    // Second pass over the back-linked items spawns nothing (idempotent).
    expect(actionItemsNeedingTodos(afterFirst)).toEqual([]);
  });
});

describe('sanitizeActionItemsForWrite', () => {
  it('drops undefined interior fields but keeps null dueAt', () => {
    const items: PlcMeeting['actionItems'] = [
      { id: 'ai1', text: 'x', assigneeUid: undefined, dueAt: null },
      { id: 'ai2', text: 'y', assigneeUid: 'u', dueAt: 5, todoId: 't' },
    ];
    const out = sanitizeActionItemsForWrite(items);
    expect(out[0]).toEqual({ id: 'ai1', text: 'x', dueAt: null });
    expect(out[1]).toEqual({
      id: 'ai2',
      text: 'y',
      assigneeUid: 'u',
      dueAt: 5,
      todoId: 't',
    });
  });
});

// ─── Export row builder ─────────────────────────────────────────────────────

describe('buildMeetingExportRows', () => {
  it('renders agenda, attendees, reviewed assessments, decisions, action items', () => {
    const meeting = makeMeeting({
      agenda: 'Review Unit 4 CFA',
      attendeeUids: ['lead', 'teach2'],
      decisions: [
        {
          id: 'd1',
          text: 'Reteach division',
          linkedDataCard: { assessmentId: 'a1', questionId: 'q2' },
        },
      ],
      actionItems: [
        {
          id: 'ai1',
          text: 'Build exit ticket',
          assigneeUid: 'teach2',
          dueAt: 1_700_500_000_000,
          todoId: 'todo-1',
        },
      ],
      notesBody: 'Strong consensus on reteach.',
    });
    const rows = buildMeetingExportRows(meeting, CTX);
    const flat = rows.map((r) => r.join('|'));

    // Header + facilitator name resolved.
    expect(flat[0]).toContain('6th Math — Meeting Record');
    expect(flat.some((r) => r.startsWith('Facilitator|Ada Lead'))).toBe(true);

    // Agenda.
    expect(flat).toContain('Review Unit 4 CFA');

    // Attendees by name, count header.
    expect(flat.some((r) => r.startsWith('Attendees|2'))).toBe(true);
    expect(flat).toContain('Ada Lead');
    expect(flat).toContain('Bob Teach');

    // Reviewed assessment row with anonymized aggregate summary.
    const assessmentRow = flat.find((r) => r.startsWith('Unit 4 CFA|'));
    expect(assessmentRow).toBeDefined();
    expect(assessmentRow).toContain('72%'); // rounded team avg
    expect(assessmentRow).toContain('3'); // teacherCount
    // Weakest question first (q2 @ 40% lowest).
    expect(assessmentRow).toContain('Divide (40%)');

    // Decision with linked data card.
    const decisionRow = flat.find((r) => r.startsWith('Reteach division|'));
    expect(decisionRow).toContain('Unit 4 CFA — Qq2');

    // Action item with assignee + to-do marker.
    const actionRow = flat.find((r) => r.startsWith('Build exit ticket|'));
    expect(actionRow).toContain('Bob Teach');
    expect(actionRow).toContain('Yes');

    // Notes section.
    expect(flat).toContain('Strong consensus on reteach.');
  });

  it('does not leak student names — only anonymized aggregate fields', () => {
    const meeting = makeMeeting({ assessmentIds: ['a1'] });
    const json = JSON.stringify(buildMeetingExportRows(meeting, CTX));
    // The aggregate fixture carries no perTeacher names; assert the report has
    // no per-student leakage vector (no "studentDisplayName" surface).
    expect(json).not.toContain('studentDisplayName');
  });

  it('handles a reviewed assessment with no aggregate yet', () => {
    const meeting = makeMeeting({ assessmentIds: ['a1'] });
    const ctxNoAgg: PlcMeetingExportContext = { ...CTX, aggregatesById: {} };
    const flat = buildMeetingExportRows(meeting, ctxNoAgg).map((r) =>
      r.join('|')
    );
    expect(flat.some((r) => r.includes('(no data yet)'))).toBe(true);
  });

  it('falls back to the uid when a member name is unknown', () => {
    const meeting = makeMeeting({ attendeeUids: ['ghost'], assessmentIds: [] });
    const flat = buildMeetingExportRows(meeting, CTX).map((r) => r.join('|'));
    expect(flat).toContain('ghost');
  });
});

describe('meetingExportTitle', () => {
  it('sanitizes disallowed Drive filename characters', () => {
    const title = meetingExportTitle(makeMeeting(), {
      ...CTX,
      plcName: 'A/B: Math?',
    });
    expect(title).not.toMatch(/[/\\:*?"<>|]/);
    expect(title).toContain('Meeting');
  });
});

// ─── Export network flow ────────────────────────────────────────────────────

describe('exportPlcMeeting', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetch(
    responses: Array<{
      ok?: boolean;
      status?: number;
      json?: () => Promise<unknown>;
      text?: () => Promise<string>;
      blob?: () => Promise<Blob>;
    }>
  ) {
    const spy = vi.spyOn(global, 'fetch');
    for (const r of responses) {
      spy.mockResolvedValueOnce({
        ok: r.ok ?? true,
        status: r.status ?? 200,
        statusText: '',
        json: r.json ?? (() => Promise.resolve({})),
        text: r.text ?? (() => Promise.resolve('')),
        blob: r.blob ?? (() => Promise.resolve(new Blob())),
        headers: new Headers(),
      } as Response);
    }
    return spy;
  }

  it('throws without an access token', async () => {
    await expect(exportPlcMeeting('', makeMeeting(), CTX)).rejects.toThrow(
      /Google access/i
    );
  });

  it('creates a sheet and returns its URL (sheet format)', async () => {
    const spy = mockFetch([
      {
        json: () =>
          Promise.resolve({
            spreadsheetId: 'sheet-123',
            spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-123',
          }),
      },
    ]);
    const result = await exportPlcMeeting('tok', makeMeeting(), CTX, 'sheet');
    expect(result.spreadsheetId).toBe('sheet-123');
    expect(result.sheetUrl).toContain('sheet-123');
    expect(result.pdfBlob).toBeUndefined();
    // One call: the create. PDF export not requested.
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0];
    expect(url as string).toBe('https://sheets.googleapis.com/v4/spreadsheets');
    expect((init as RequestInit).method).toBe('POST');
  });

  it('exports the created sheet to a PDF blob (pdf format)', async () => {
    const pdf = new Blob(['%PDF'], { type: 'application/pdf' });
    const spy = mockFetch([
      {
        json: () =>
          Promise.resolve({
            spreadsheetId: 'sheet-9',
            spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-9',
          }),
      },
      { blob: () => Promise.resolve(pdf) },
    ]);
    const result = await exportPlcMeeting('tok', makeMeeting(), CTX, 'pdf');
    expect(result.pdfBlob).toBe(pdf);
    expect(spy).toHaveBeenCalledTimes(2);
    const [exportUrl] = spy.mock.calls[1];
    expect(exportUrl as string).toContain(
      '/files/sheet-9/export?mimeType=application/pdf'
    );
  });

  it('surfaces an auth error on a 403 create', async () => {
    mockFetch([{ ok: false, status: 403, text: () => Promise.resolve('no') }]);
    await expect(
      exportPlcMeeting('tok', makeMeeting(), CTX, 'sheet')
    ).rejects.toThrow(/Google Sheets access/i);
  });

  it('throws when the PDF export fails', async () => {
    mockFetch([
      {
        json: () =>
          Promise.resolve({
            spreadsheetId: 'sheet-5',
            spreadsheetUrl: 'u',
          }),
      },
      { ok: false, status: 500, text: () => Promise.resolve('boom') },
    ]);
    await expect(
      exportPlcMeeting('tok', makeMeeting(), CTX, 'pdf')
    ).rejects.toThrow(/Failed to export the meeting record to PDF/i);
  });
});
