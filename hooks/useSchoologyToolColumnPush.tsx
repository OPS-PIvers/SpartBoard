import React, { useState } from 'react';
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

export interface ToolColumnPayload {
  maxPoints: number;
  grades: ToolColumnGradeEntry[];
}

interface Options {
  sessionId: string | null | undefined;
  kind: ToolColumnKind;
  title: string;
  /** Builds the scores (and Missing entries) at click time; null stops quietly after the caller explains why. */
  buildPayload: () => Promise<ToolColumnPayload | null>;
  onDone: (message: string, ok: boolean) => void;
}

/** Explicit "Push to Schoology" for a tool column: confirm and pick categories when needed, then push. */
export function useSchoologyToolColumnPush({
  sessionId,
  kind,
  title,
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
  } | null>(null);

  const run = async (
    payload: ToolColumnPayload,
    categories: Record<string, string>
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
      setPending({ data, payload });
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
        onCancel={() => setPending(null)}
        onConfirm={(categories) => {
          const { payload } = pending;
          setPending(null);
          void run(payload, categories);
        }}
      />
    ) : null;

  return { start, busy, dialog };
}
