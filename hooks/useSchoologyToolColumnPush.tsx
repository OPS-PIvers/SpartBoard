import React, { useState } from 'react';
import { functions } from '@/config/firebase';
import { useAuth } from '@/context/useAuth';
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

/** Epoch ms as the teacher's local YYYY-MM-DD. */
export const localDateString = (ms: number): string => {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export interface ToolColumnPayload {
  maxPoints: number;
  grades: ToolColumnGradeEntry[];
}

interface Options {
  sessionId: string | null | undefined;
  kind: ToolColumnKind;
  title: string;
  /** The assignment's due or close time (epoch ms), the starting due date for a new column. */
  dueAt?: number | null;
  /** Builds the scores (and Missing entries) at click time; null stops quietly after the caller explains why. */
  buildPayload: () => Promise<ToolColumnPayload | null>;
  onDone: (message: string, ok: boolean) => void;
}

/** Explicit "Push to Schoology" for a tool column: confirm and pick categories when needed, then push. */
export function useSchoologyToolColumnPush({
  sessionId,
  kind,
  title,
  dueAt,
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
      const { message, failed } = formatToolColumnPushToast(data);
      onDone(message, failed === 0);
    } catch (err) {
      logError('schoologyToolColumn.push', err, { sessionId });
      onDone(ltiPushErrorMessage(err), false);
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (!sessionId || busy) return;
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
        dueDate: canAccessFeature('schoology-push-due-date')
          ? localDateString(dueAt ?? Date.now())
          : undefined,
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
