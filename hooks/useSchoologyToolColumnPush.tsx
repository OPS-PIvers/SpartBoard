import React, { useLayoutEffect, useRef, useState } from 'react';
import { functions } from '@/config/firebase';
import { ToolColumnPushDialog } from '@/components/schoology/ToolColumnPushDialog';
import { logError } from '@/utils/logError';
import { ltiPushErrorMessage } from '@/utils/ltiGradePush';
import {
  fetchToolColumnCategories,
  formatToolColumnPushToast,
  pushToolColumn,
  type ToolColumnCategoriesData,
  type ToolColumnGradeEntry,
  type ToolColumnKind,
} from '@/utils/schoologyToolColumns';

/** Sessions with a push running, shared so a Retry can't overlap another push of the same session. */
const inFlight = new Set<string>();

/** Epoch ms as the teacher's local YYYY-MM-DD. */
export const localDateString = (ms: number): string => {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Close time read locally; a date-only due date (UTC midnight) read as its UTC date; then the day it ended; else today. */
export const startingDueDate = (
  closeAt: number | null | undefined,
  dueAt: number | null | undefined,
  endedAt?: number | null
): string => {
  if (closeAt) return localDateString(closeAt);
  if (dueAt) {
    return dueAt % 86_400_000 === 0
      ? new Date(dueAt).toISOString().slice(0, 10)
      : localDateString(dueAt);
  }
  return localDateString(endedAt ?? Date.now());
};

export interface ToolColumnPayload {
  maxPoints: number;
  /** With `finalScores` set this is a preview for the dialog; the server builds what is sent. */
  grades: ToolColumnGradeEntry[];
  /** AB-389: push the gradebook final scores, built on the server. */
  finalScores?: { includeMissing: boolean; scopeUids?: string[] };
}

/** The callable request for a payload; `only` limits a Retry to those students. */
export function toolColumnRequestFields(
  payload: ToolColumnPayload,
  only: ReadonlySet<string> | null
): {
  maxPoints: number;
  grades: ToolColumnGradeEntry[];
  source?: 'final-scores';
  includeMissing?: boolean;
  missingWithoutWork?: string[];
  onlyUids?: string[];
  scopeUids?: string[];
} {
  if (!payload.finalScores) {
    return {
      maxPoints: payload.maxPoints,
      grades: only
        ? payload.grades.filter((g) => only.has(g.pseudonymUid))
        : payload.grades,
    };
  }
  return {
    maxPoints: payload.maxPoints,
    grades: [],
    source: 'final-scores',
    includeMissing: payload.finalScores.includeMissing,
    missingWithoutWork: payload.grades
      .filter((g) => 'missing' in g)
      .map((g) => g.pseudonymUid),
    ...(only ? { onlyUids: [...only] } : {}),
    ...(payload.finalScores.scopeUids
      ? { scopeUids: payload.finalScores.scopeUids }
      : {}),
  };
}

interface Options {
  sessionId: string | null | undefined;
  kind: ToolColumnKind;
  title: string;
  /** The assignment's close and due times (epoch ms), the starting due date for a new column. */
  closeAt?: number | null;
  dueAt?: number | null;
  /** When the session ended; a Manual assignment due when ended starts on that day. */
  endedAt?: number | null;
  /** Builds the scores (and Missing entries) at click time; null stops quietly after the caller explains why. */
  buildPayload: () => Promise<ToolColumnPayload | null>;
  /** `retry` resends only the grades that didn't go through; the caller keeps the message up until dismissed. */
  onDone: (message: string, ok: boolean, retry?: () => void) => void;
}

/** Explicit "Push to Schoology" for a tool column: confirm and pick categories when needed, then push. */
export function useSchoologyToolColumnPush({
  sessionId,
  kind,
  title,
  closeAt,
  dueAt,
  endedAt,
  buildPayload,
  onDone,
}: Options): {
  start: () => Promise<void>;
  busy: boolean;
  dialog: React.ReactNode;
} {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{
    data: ToolColumnCategoriesData;
    payload: ToolColumnPayload;
    dueDate?: string;
  } | null>(null);

  // Retry may run after the view closes, so it reads the latest scores and skips the dialog.
  const latest = useRef({ buildPayload, onDone });
  useLayoutEffect(() => {
    latest.current = { buildPayload, onDone };
  });

  const run = async (
    payload: ToolColumnPayload,
    categories: Record<string, string>,
    dueDate: string | null = null,
    only: ReadonlySet<string> | null = null
  ) => {
    if (!sessionId || inFlight.has(sessionId)) return;
    inFlight.add(sessionId);
    setBusy(true);
    const report = (m: string, ok: boolean, retry?: () => void) =>
      latest.current.onDone(m, ok, retry);
    // Resends these students with the scores as they are when Retry is tapped.
    const retryOf = (uids: ReadonlySet<string>) => async () => {
      let fresh: ToolColumnPayload | null = null;
      try {
        fresh = await latest.current.buildPayload();
      } catch (err) {
        logError('schoologyToolColumn.retry', err, { sessionId });
      }
      const base = fresh ?? payload;
      if (base.grades.some((g) => uids.has(g.pseudonymUid))) {
        await run(base, categories, dueDate, uids);
      }
    };
    try {
      const data = await pushToolColumn(functions, {
        sessionId,
        kind,
        ...toolColumnRequestFields(payload, only),
        create: true,
        categories,
        ...(dueDate ? { dueDate } : {}),
      });
      const { message, failed, retryUids } = formatToolColumnPushToast(data);
      const resend = new Set(retryUids);
      const sent = only
        ? payload.grades.filter((g) => only.has(g.pseudonymUid))
        : payload.grades;
      const retryable = sent.some((g) => resend.has(g.pseudonymUid));
      report(
        message,
        failed === 0,
        retryable ? () => void retryOf(resend)() : undefined
      );
    } catch (err) {
      logError('schoologyToolColumn.push', err, { sessionId });
      const all = only ?? new Set(payload.grades.map((g) => g.pseudonymUid));
      report(ltiPushErrorMessage(err), false, () => void retryOf(all)());
    } finally {
      inFlight.delete(sessionId);
      setBusy(false);
    }
  };

  const start = async () => {
    if (!sessionId || busy || inFlight.has(sessionId)) return;
    setBusy(true);
    let payload: ToolColumnPayload | null;
    let data: ToolColumnCategoriesData;
    try {
      payload = await buildPayload();
      if (!payload || payload.grades.length === 0) {
        if (payload) onDone('No scores to push yet.', true);
        setBusy(false);
        return;
      }
      data = await fetchToolColumnCategories(functions, sessionId, kind);
    } catch (err) {
      logError('schoologyToolColumn.prepare', err, { sessionId });
      onDone(ltiPushErrorMessage(err), false);
      setBusy(false);
      return;
    }
    setBusy(false);
    // Confirm when a column will be created or one needs its category repaired.
    if (data.sections.some((s) => !s.hasColumn || s.needsCategory)) {
      setPending({
        data,
        payload,
        dueDate: startingDueDate(closeAt, dueAt, endedAt),
      });
      return;
    }
    await run(payload, {});
  };

  const dialog =
    pending && sessionId ? (
      <ToolColumnPushDialog
        data={pending.data}
        sessionId={sessionId}
        kind={kind}
        title={title}
        missingCount={
          pending.payload.grades.filter((g) => 'missing' in g).length
        }
        initialDueDate={pending.dueDate}
        onCancel={() => setPending(null)}
        onConfirm={(categories, dueDate) => {
          const { payload } = pending;
          setPending(null);
          void run(payload, categories, dueDate);
        }}
      />
    ) : null;

  return { start, busy, dialog };
}
