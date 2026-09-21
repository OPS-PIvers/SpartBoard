/**
 * Client view of the delegated-printing callables
 * (docs/plans/PLC_DELEGATED_PAPER_PRINTING.md §5).
 *
 * Every field is server-derived, including membership and the seat map — the
 * picker renders what it is handed and sends back selections, never a batch.
 */

import { useEffect, useState } from 'react';
import { httpsCallable, type FunctionsError } from 'firebase/functions';
import { functions } from '@/config/firebase';
import type { PaperBatch, PaperSheetStimulus } from '@/types';
import type { PaperSheetPlan } from '@/utils/paperSheetPlan';
import type { PaperTestQuestion } from '@/utils/paperTestPrint';
import { logError } from '@/utils/logError';

/** Name only. The server drops `pin` and `email` before responding (D5). */
export interface TeammatePrintStudent {
  id: string;
  firstName: string;
  lastName: string;
}

export interface TeammatePrintRoster {
  id: string;
  name: string;
  studentCount: number;
  students: TeammatePrintStudent[];
  /** `'no-drive-access'` | `'drive-read-failed'` — names are unavailable. */
  loadError?: string;
}

export interface TeammatePrintQuiz {
  id: string;
  title: string;
  questions: unknown[];
  stimuli?: unknown[];
  /** What the owner put beside the bubbles; drawn only if they shared it (D6). */
  paperSheetStimuli?: PaperSheetStimulus[];
  language?: string;
}

export interface TeammatePrintBatchSummary {
  id: string;
  createdAt: number;
  sheetCount: number;
  printedByName: string | null;
}

export interface TeammatePrintContext {
  targetUid: string;
  targetName: string;
  hasCopy: boolean;
  quizId: string | null;
  driveReachable: boolean;
  contentSource: 'drive' | 'synced-group';
  quiz: TeammatePrintQuiz;
  rosters: TeammatePrintRoster[];
  existingBatches: TeammatePrintBatchSummary[];
  blocked: 'no-copy-no-drive' | null;
}

export interface TeammatePrintContextRequest {
  plcId: string;
  targetUid: string;
  plcQuizId: string;
}

export interface TeammatePrintContextState {
  context: TeammatePrintContext | null;
  loading: boolean;
  error: string | null;
}

export interface TeammatePrintSelection {
  rosterId: string;
  /** Empty for a class whose names the server could not read — it prints unnamed. */
  studentIds: string[];
}

export interface CreateTeammatePaperBatchRequest {
  plcId: string;
  targetUid: string;
  plcQuizId: string;
  selections: TeammatePrintSelection[];
  spareCount: number;
}

export interface CreateTeammatePaperBatchResult {
  batch: PaperBatch;
  sheets: PaperSheetPlan[];
  quizTitle: string;
  printedForTeacherName: string;
  testPaper: PaperTestQuestion[];
  /** The server had to create their copy of the quiz to bind the batch to (D9). */
  createdCopy: boolean;
}

export interface WithdrawTeammatePaperBatchRequest {
  plcId: string;
  targetUid: string;
  plcQuizId: string;
  batchId: string;
}

export async function fetchTeammatePrintContext(
  request: TeammatePrintContextRequest
): Promise<TeammatePrintContext> {
  const call = httpsCallable<TeammatePrintContextRequest, TeammatePrintContext>(
    functions,
    'getTeammatePrintContextV1'
  );
  return (await call(request)).data;
}

/** Writes the batch into the teammate's account and returns the stack to print. */
export async function createTeammatePaperBatch(
  request: CreateTeammatePaperBatchRequest
): Promise<CreateTeammatePaperBatchResult> {
  const call = httpsCallable<
    CreateTeammatePaperBatchRequest,
    CreateTeammatePaperBatchResult
  >(functions, 'createTeammatePaperBatchV1');
  return (await call(request)).data;
}

/** Takes back a stack the caller printed, while nothing has been scanned (D22). */
export async function withdrawTeammatePaperBatch(
  request: WithdrawTeammatePaperBatchRequest
): Promise<void> {
  const call = httpsCallable<WithdrawTeammatePaperBatchRequest, unknown>(
    functions,
    'withdrawTeammatePaperBatchV1'
  );
  await call(request);
}

/** One settled fetch, tagged with the request it answered. */
interface SettledContext {
  key: string;
  context: TeammatePrintContext | null;
  error: string | null;
}

/**
 * Loads the context for one teammate. `targetUid` of `null` is the picker's
 * idle state — nothing is fetched until a teacher is chosen.
 *
 * `loading` is derived, not stored: a result tagged with a different request
 * than the one on screen is simply not this request's answer, so switching
 * teammates cannot show the previous one's classes.
 */
export function useTeammatePrintContext(
  plcId: string,
  plcQuizId: string,
  targetUid: string | null
): TeammatePrintContextState {
  const [settled, setSettled] = useState<SettledContext | null>(null);
  const key = `${plcId}|${plcQuizId}|${targetUid ?? ''}`;

  useEffect(() => {
    if (!targetUid) return;
    let active = true;
    fetchTeammatePrintContext({ plcId, targetUid, plcQuizId })
      .then((context) => {
        if (active) setSettled({ key, context, error: null });
      })
      .catch((err: unknown) => {
        logError('useTeammatePrintContext', err, { plcId, plcQuizId });
        if (!active) return;
        setSettled({
          key,
          context: null,
          error:
            (err as FunctionsError)?.message ??
            'Could not load that teacher\u2019s classes.',
        });
      });
    return () => {
      active = false;
    };
  }, [key, plcId, plcQuizId, targetUid]);

  const current = settled?.key === key ? settled : null;
  return {
    context: current?.context ?? null,
    error: current?.error ?? null,
    loading: targetUid !== null && current === null,
  };
}

/** What the server needs to rebuild this selection against their real rosters. */
export function buildPrintSelections(
  rosters: readonly TeammatePrintRoster[],
  selectedRosterIds: ReadonlySet<string>,
  excludedStudentIds: ReadonlySet<string>
): TeammatePrintSelection[] {
  return rosters
    .filter((r) => selectedRosterIds.has(r.id))
    .map((roster) => ({
      rosterId: roster.id,
      studentIds: roster.students
        .filter((s) => !excludedStudentIds.has(s.id))
        .map((s) => s.id),
    }));
}

/** Sheets a selection would print, so the picker can size the stack. */
export function countSelectedSheets(
  rosters: readonly TeammatePrintRoster[],
  selectedRosterIds: ReadonlySet<string>,
  excludedStudentIds: ReadonlySet<string>
): number {
  return rosters
    .filter((r) => selectedRosterIds.has(r.id))
    .reduce((total, roster) => {
      if (roster.students.length === 0) return total + roster.studentCount;
      return (
        total +
        roster.students.filter((s) => !excludedStudentIds.has(s.id)).length
      );
    }, 0);
}
