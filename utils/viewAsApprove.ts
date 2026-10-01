// Transactional per-widget approve for View as pending changes (docs/plans/ADMIN_VIEW_AS.md D11, D16).
import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  type DocumentReference,
} from 'firebase/firestore';
import { auth, db } from '@/config/firebase';
import { runAuditedWrite } from '@/utils/viewAsTab';
import type { ViewAsAuditAction, ViewAsClaim } from '@/types/viewAs';
import type { PendingChange } from '@/utils/viewAsBoards';
import { PII_WIDGET_FIELDS } from '@/utils/dashboardPII';

type FieldMap = Record<string, unknown>;

export interface ViewAsAuditInput {
  action: ViewAsAuditAction;
  path?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

interface ViewAsIdentity {
  sid: string;
  email: string;
  targetEmail: string;
  targetUid: string;
}

async function currentIdentity(): Promise<ViewAsIdentity> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');
  const { claims } = await user.getIdTokenResult();
  const claim = claims.viewAs as ViewAsClaim | undefined;
  if (!claim?.sid || !claim.by) throw new Error('Not a View as session.');
  return {
    sid: claim.sid,
    email: claim.by,
    targetEmail: (user.email ?? '').toLowerCase(),
    targetUid: user.uid,
  };
}

/** Audit doc matching the rules' view-as create shape, for use inside a transaction. */
export async function buildViewAsAuditEntry(
  input: ViewAsAuditInput
): Promise<{ ref: DocumentReference; data: FieldMap }> {
  const identity = await currentIdentity();
  const data: FieldMap = {
    action: input.action,
    ...identity,
    timestamp: serverTimestamp(),
  };
  if (input.path !== undefined) data.path = input.path;
  if (input.before !== undefined) data.before = input.before;
  if (input.after !== undefined) data.after = input.after;
  if (input.reason !== undefined) data.reason = input.reason;
  return { ref: doc(collection(db, 'admin_audit_log')), data };
}

export type ApproveResult = 'approved' | 'stale';

/** Reads their latest board, replaces only this widget's fields, writes, and audits in one transaction. */
export async function approveViewAsChange(
  change: PendingChange
): Promise<ApproveResult> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in.');
  const boardRef = doc(db, 'users', uid, 'dashboards', change.boardId);
  const fields = Array.from(
    new Set([...Object.keys(change.before), ...Object.keys(change.after)])
  );
  const audit = await buildViewAsAuditEntry({
    action: 'view_as_approve',
    path: `users/${uid}/dashboards/${change.boardId}#widgets/${change.widgetId}`,
    after: change.after,
  });

  return runAuditedWrite(() =>
    runTransaction(db, async (tx) => {
      const snap = await tx.get(boardRef);
      if (!snap.exists()) return 'stale';
      const raw: unknown = snap.get('widgets');
      const widgets = Array.isArray(raw) ? (raw as FieldMap[]) : [];
      const index = widgets.findIndex((w) => w?.id === change.widgetId);
      if (index < 0) return 'stale';

      const current = widgets[index];
      const before: FieldMap = {};
      const next: FieldMap = { ...current };
      for (const f of fields) {
        if (current[f] !== undefined) before[f] = current[f];
        if (f in change.after) next[f] = change.after[f];
        else delete next[f];
      }
      if (change.kind === 'layout') {
        for (const f of ['x', 'y', 'w', 'h'] as const)
          next[f] = change.widget[f];
      } else {
        // Their stored config should hold no PII, but never drop any it does hold.
        const currentConfig = current.config as FieldMap | undefined;
        if (next.config && currentConfig) {
          const kept: FieldMap = { ...(next.config as FieldMap) };
          for (const f of [...PII_WIDGET_FIELDS, 'assignments']) {
            if (currentConfig[f] !== undefined && kept[f] === undefined) {
              kept[f] = currentConfig[f];
            }
          }
          next.config = kept;
        }
        const version =
          typeof current.version === 'number' ? current.version : 1;
        next.version = version + 1;
      }
      const nextWidgets = [...widgets];
      nextWidgets[index] = next;
      tx.update(boardRef, { widgets: nextWidgets, updatedAt: Date.now() });
      tx.set(audit.ref, { ...audit.data, before });
      return 'approved';
    })
  );
}
