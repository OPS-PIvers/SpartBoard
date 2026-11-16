import React, { useState } from 'react';
import { functions } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
import { ToolColumnPushDialog } from '@/components/schoology/ToolColumnPushDialog';
import { logError } from '@/utils/logError';
import { ASSIGN_DUE_DATE_FEATURE } from '@/hooks/useLastAssignWhen';
import { ltiPushErrorMessage } from '@/utils/ltiGradePush';
import {
  fetchToolColumnCategories,
  formatToolColumnPushToast,
  pushToolColumn,
  type ToolColumnCategoriesData,
  type ToolColumnGradeEntry,
  type ToolColumnKind,
} from '@/utils/schoologyToolColumns';

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
  grades: ToolColumnGradeEntry[];
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
  const { canAccessFeature } = useAuth();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{
    data: ToolColumnCategoriesData;
    payload: ToolColumnPayload;
    dueDate?: string;
  } | null>(null);

  const run = async (
    payload: ToolColumnPayload,
    categories: Record<string, string>,
    dueDate: string | null = null
  ) => {
    if (!sessionId) return;
    setBusy(true);
    try {
      const data = await pushToolColumn(functions, {
        sessionId,
        kind,
        maxPoints: payload.maxPoints,
        grades: payload.grades,
        create: true,
        categories,
        ...(dueDate ? { dueDate } : {}),
      });
      const { message, failed, failedUids } = formatToolColumnPushToast(data);
      const resend = new Set(failedUids);
      const retryGrades = payload.grades.filter((g) =>
        resend.has(g.pseudonymUid)
      );
      onDone(
        message,
        failed === 0,
        retryGrades.length > 0
          ? () => void prepare({ ...payload, grades: retryGrades })
          : undefined
      );
    } catch (err) {
      logError('schoologyToolColumn.push', err, { sessionId });
      onDone(ltiPushErrorMessage(err), false, () => void prepare(payload));
    } finally {
      setBusy(false);
    }
  };

  // `retryPayload` is a Retry of the grades that failed last time; otherwise the scores are built now.
  const prepare = async (retryPayload?: ToolColumnPayload) => {
    if (!sessionId) return;
    setBusy(true);
    let payload: ToolColumnPayload | null;
    let data: ToolColumnCategoriesData;
    try {
      payload = retryPayload ?? (await buildPayload());
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
        dueDate: startingDueDate(
          closeAt,
          dueAt,
          canAccessFeature(ASSIGN_DUE_DATE_FEATURE) ? endedAt : null
        ),
      });
      return;
    }
    await run(payload, {});
  };

  const start = async () => {
    if (!sessionId || busy) return;
    await prepare();
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
