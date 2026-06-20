/**
 * Meeting-record export (§3.7, §4.0b, §6.2) — turns a `PlcMeeting` into a
 * Google Sheet (and optionally a PDF) for district accountability, reusing the
 * same Drive/Sheets fetch patterns the PLC shared-sheet provisioning
 * (`QuizDriveService.createPlcSheetAndShare`, the `sharedSheetUrl` path) already
 * uses. We deliberately do NOT add a new HTTP/auth abstraction: a meeting export
 * is the same "POST to the Sheets API with a Bearer token, then (for PDF) GET
 * the Drive `export?mimeType=application/pdf` endpoint" shape as the existing
 * exporters.
 *
 * The row-building is a PURE function (`buildMeetingExportRows`) so the report
 * layout — agenda, attendees, reviewed assessments (with anonymized aggregate
 * summaries), decisions, action items — unit-tests without any network. The
 * network wrapper (`exportPlcMeeting`) creates the spreadsheet and, for the PDF
 * format, exports it. Anonymized: the reviewed-assessment summaries come from
 * `PlcAssessmentAggregate` (team/per-class rollups, never student names).
 */

import type {
  PlcAssessmentAggregate,
  PlcCommonAssessment,
  PlcMeeting,
} from '@/types';

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const SHEETS_API_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

/** The export target: a shared Google Sheet, or that Sheet exported to PDF. */
export type PlcMeetingExportFormat = 'sheet' | 'pdf';

/**
 * Lookup context the row builder needs to render human-readable rows without a
 * Firestore join: member display names (by uid), the reviewed common
 * assessments (by id), and their anonymized aggregates (by assessment id).
 * Every map is optional-tolerant — a missing entry falls back to the raw id /
 * "(unknown)" so a partially-loaded context still produces a usable report.
 */
export interface PlcMeetingExportContext {
  /** PLC name, for the sheet/file title. */
  plcName: string;
  /** Member display name by uid (facilitator, attendees, assignees). */
  memberNamesByUid: Readonly<Record<string, string>>;
  /** Reviewed common assessments by id (title / unit / kind). */
  assessmentsById: Readonly<Record<string, PlcCommonAssessment>>;
  /** Anonymized aggregate rollups by assessment id (team avg, weak questions). */
  aggregatesById: Readonly<Record<string, PlcAssessmentAggregate>>;
}

/** Result of an export: the Sheet URL, plus the PDF blob when `format: 'pdf'`. */
export interface PlcMeetingExportResult {
  /** The created spreadsheet's URL (always returned). */
  sheetUrl: string;
  /** The created spreadsheet's id. */
  spreadsheetId: string;
  /** The exported PDF, present only when `format: 'pdf'` was requested. */
  pdfBlob?: Blob;
  /** Suggested download filename (no extension) — caller adds `.pdf`/none. */
  fileName: string;
}

/** Resolve a member's display name, falling back to the raw uid. */
function nameForUid(
  uid: string,
  memberNamesByUid: Readonly<Record<string, string>>
): string {
  const name = memberNamesByUid[uid];
  return name && name.trim() ? name.trim() : uid;
}

/** Format a ms timestamp as a locale date-time, or '—' when absent/pending. */
function formatTimestamp(ms: number | null | undefined): string {
  if (ms == null || ms <= 0 || !Number.isFinite(ms)) return '—';
  return new Date(ms).toLocaleString();
}

/** Sanitize a title for a Drive file name (Drive disallows `/ \ : * ? " < > |`). */
function sanitizeFileName(title: string): string {
  return title.replace(/[/\\:*?"<>|]/g, '_').trim() || 'PLC Meeting';
}

/**
 * Build the full sheet matrix (array of rows, each an array of cells) for a
 * meeting record. PURE — no network, no `Date.now()` ambiguity beyond
 * formatting the record's own timestamps. Sections, in order:
 *   1. Header (PLC name, held-at, facilitator, status)
 *   2. Agenda
 *   3. Attendees
 *   4. Reviewed assessments (with anonymized aggregate summary per assessment)
 *   5. Decisions (with linked data-card reference)
 *   6. Action items (assignee, due date, spawned-to-do marker)
 *   7. Notes body (if present)
 * A blank row separates sections. Every cell is a string (the Sheets/PDF write
 * path expects string cells).
 */
export function buildMeetingExportRows(
  meeting: PlcMeeting,
  ctx: PlcMeetingExportContext
): string[][] {
  const rows: string[][] = [];
  const blank = (): void => {
    rows.push([]);
  };

  // 1. Header
  rows.push([`${ctx.plcName} — Meeting Record`]);
  rows.push(['Held', formatTimestamp(meeting.heldAt)]);
  rows.push([
    'Facilitator',
    nameForUid(meeting.facilitatorUid, ctx.memberNamesByUid),
  ]);
  rows.push(['Status', meeting.status]);
  blank();

  // 2. Agenda
  rows.push(['Agenda']);
  rows.push([meeting.agenda?.trim() ? meeting.agenda.trim() : '(no agenda)']);
  blank();

  // 3. Attendees
  rows.push(['Attendees', `${meeting.attendeeUids.length}`]);
  if (meeting.attendeeUids.length === 0) {
    rows.push(['(none recorded)']);
  } else {
    for (const uid of meeting.attendeeUids) {
      rows.push([nameForUid(uid, ctx.memberNamesByUid)]);
    }
  }
  blank();

  // 4. Reviewed assessments + anonymized aggregate summary
  rows.push(['Reviewed Assessments', `${meeting.assessmentIds.length}`]);
  if (meeting.assessmentIds.length === 0) {
    rows.push(['(none reviewed)']);
  } else {
    rows.push([
      'Assessment',
      'Unit',
      'Type',
      'Team Avg %',
      'Teachers',
      'Students',
      'Weakest Questions (correct %)',
    ]);
    for (const assessmentId of meeting.assessmentIds) {
      const assessment = ctx.assessmentsById[assessmentId];
      const aggregate = ctx.aggregatesById[assessmentId];
      const title = assessment?.title?.trim()
        ? assessment.title.trim()
        : '(unknown)';
      const unit = assessment?.unitLabel?.trim()
        ? assessment.unitLabel.trim()
        : '';
      const kind = assessment?.kind ?? '';
      if (!aggregate) {
        rows.push([title, unit, kind, '—', '—', '—', '(no data yet)']);
        continue;
      }
      // Weakest questions: ascending by correctPercent, qid tie-break — same
      // ordering Shared Data uses (sharedDataSelectors.weakestQuestions). Top 3.
      const weakest = [...aggregate.perQuestion]
        .sort((a, b) => {
          if (a.correctPercent !== b.correctPercent) {
            return a.correctPercent - b.correctPercent;
          }
          return a.questionId.localeCompare(b.questionId);
        })
        .slice(0, 3)
        .map((q) => `${q.text} (${Math.round(q.correctPercent)}%)`)
        .join('; ');
      rows.push([
        title,
        unit,
        kind,
        `${Math.round(aggregate.teamAveragePercent)}%`,
        `${aggregate.teacherCount}`,
        `${aggregate.studentCount}`,
        weakest || '—',
      ]);
    }
  }
  blank();

  // 5. Decisions
  rows.push(['Decisions', `${meeting.decisions.length}`]);
  if (meeting.decisions.length === 0) {
    rows.push(['(none captured)']);
  } else {
    rows.push(['Decision', 'Linked Data Card']);
    for (const decision of meeting.decisions) {
      let linked = '';
      if (decision.linkedDataCard) {
        const linkedAssessment =
          ctx.assessmentsById[decision.linkedDataCard.assessmentId];
        const linkedTitle = linkedAssessment?.title?.trim()
          ? linkedAssessment.title.trim()
          : decision.linkedDataCard.assessmentId;
        linked = decision.linkedDataCard.questionId
          ? `${linkedTitle} — Q${decision.linkedDataCard.questionId}`
          : linkedTitle;
      }
      rows.push([decision.text, linked]);
    }
  }
  blank();

  // 6. Action items
  rows.push(['Action Items', `${meeting.actionItems.length}`]);
  if (meeting.actionItems.length === 0) {
    rows.push(['(none captured)']);
  } else {
    rows.push(['Action', 'Assignee', 'Due', 'To-do Created']);
    for (const item of meeting.actionItems) {
      const assignee = item.assigneeUid
        ? nameForUid(item.assigneeUid, ctx.memberNamesByUid)
        : '(unassigned)';
      const due = item.dueAt != null ? formatTimestamp(item.dueAt) : '—';
      rows.push([item.text, assignee, due, item.todoId ? 'Yes' : 'No']);
    }
  }

  // 7. Notes body (optional)
  if (meeting.notesBody?.trim()) {
    blank();
    rows.push(['Notes']);
    rows.push([meeting.notesBody.trim()]);
  }

  return rows;
}

/** Build the export file/sheet title for a meeting. */
export function meetingExportTitle(
  meeting: PlcMeeting,
  ctx: PlcMeetingExportContext
): string {
  const date = formatTimestamp(meeting.heldAt);
  return sanitizeFileName(`${ctx.plcName} — Meeting ${date}`);
}

/**
 * Export a meeting record to a Google Sheet (and, for `format: 'pdf'`, export
 * that Sheet to a PDF blob). Reuses the existing Drive/Sheets request shape:
 * a single `POST` to the Sheets API to create the spreadsheet with the built
 * rows, then (PDF only) a `GET` to the Drive `export?mimeType=application/pdf`
 * endpoint. `accessToken` is the caller's Google OAuth token (same
 * `googleAccessToken` from `useAuth()` the quiz/VA exporters use). Throws on a
 * non-OK API response so the caller can surface a toast.
 */
export async function exportPlcMeeting(
  accessToken: string,
  meeting: PlcMeeting,
  ctx: PlcMeetingExportContext,
  format: PlcMeetingExportFormat = 'sheet'
): Promise<PlcMeetingExportResult> {
  if (!accessToken) {
    throw new Error(
      'Google access is not granted. Sign in again to export the meeting record.'
    );
  }
  const jsonHeaders = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
  const title = meetingExportTitle(meeting, ctx);
  const rows = buildMeetingExportRows(meeting, ctx);

  // Create the spreadsheet with the meeting rows in one call (mirrors
  // QuizDriveService.exportResultsToSheet's solo-mode create).
  const createRes = await fetch(SHEETS_API_URL, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({
      properties: { title },
      sheets: [
        {
          properties: { title: 'Meeting' },
          data: [
            {
              startRow: 0,
              startColumn: 0,
              rowData: rows.map((row) => ({
                values: row.map((cell) => ({
                  userEnteredValue: { stringValue: cell },
                })),
              })),
            },
          ],
        },
      ],
    }),
  });
  if (!createRes.ok) {
    const body = await createRes.text().catch(() => '');
    if (createRes.status === 401 || createRes.status === 403) {
      throw new Error(
        'Google Sheets access is not granted. Sign in again to export the meeting record.'
      );
    }
    throw new Error(
      `Failed to create the meeting export sheet (${createRes.status}): ${body.slice(0, 200)}`
    );
  }
  const sheet = (await createRes.json()) as {
    spreadsheetId: string;
    spreadsheetUrl: string;
  };

  const result: PlcMeetingExportResult = {
    sheetUrl: sheet.spreadsheetUrl,
    spreadsheetId: sheet.spreadsheetId,
    fileName: title,
  };

  if (format === 'pdf') {
    // Export the freshly-created Sheet to PDF via the Drive export endpoint
    // (same shape as googleDriveService.exportFileText, mimeType swapped).
    const exportRes = await fetch(
      `${DRIVE_API_URL}/files/${sheet.spreadsheetId}/export?mimeType=application/pdf`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!exportRes.ok) {
      const body = await exportRes.text().catch(() => '');
      throw new Error(
        `Failed to export the meeting record to PDF (${exportRes.status}): ${body.slice(0, 200)}`
      );
    }
    result.pdfBlob = await exportRes.blob();
  }

  return result;
}
