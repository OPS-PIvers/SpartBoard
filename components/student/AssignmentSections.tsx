import React from 'react';
import { Inbox } from 'lucide-react';
import { AssignmentListItem, type CompletionState } from './AssignmentListItem';
import type { AssignmentSummary } from '@/hooks/useStudentAssignments';
import type { ClassDirectoryEntry } from '@/hooks/useStudentClassDirectory';
import type { AssignmentFilterMode } from './AssignmentFilterTabs';

/**
 * Renders the Active and/or Completed sections per the selected filter
 * mode. Shared between StudentOverview (all classes) and StudentClassView
 * (single class) so the partition rule lives in one place.
 *
 * Partition rule (matches the plan):
 *   - completion === 'completed' → Completed section
 *   - completion === 'not-completed' AND channel === 'active' → Active
 *   - completion === 'not-completed' AND channel === 'ended' → hidden
 *   - completion === 'unknown' AND channel === 'active' → Active (with neutral pill, resolves later)
 *   - completion === 'unknown' AND channel === 'ended' → Completed (optimistic;
 *       lets AssignmentListItem mount so its completion check can fire and
 *       either keep the row in Completed or filter it out). Rows in this
 *       state render with the muted "Checking…" treatment via
 *       `pendingVerificationKeys` so the student doesn't see a row that
 *       looks like a confirmed completion before the check has resolved.
 */

interface AssignmentSectionsProps {
  mode: AssignmentFilterMode;
  active: AssignmentSummary[];
  completed: AssignmentSummary[];
  pseudonymUid: string | null;
  directoryById: Record<string, ClassDirectoryEntry>;
  hideClassName?: boolean;
  onCompletionResolved: (
    sessionId: string,
    kind: AssignmentSummary['kind'],
    completion: CompletionState
  ) => void;
  /**
   * Set of `${kind}:${sessionId}` keys for rows surfaced in Completed
   * optimistically (ended channel, completion check still resolving).
   * Drives the muted "Checking…" visual on the matching list rows.
   */
  pendingVerificationKeys?: ReadonlySet<string>;
}

export const AssignmentSections: React.FC<AssignmentSectionsProps> = ({
  mode,
  active,
  completed,
  pseudonymUid,
  directoryById,
  hideClassName,
  onCompletionResolved,
  pendingVerificationKeys,
}) => {
  if (mode === 'active') {
    return (
      <Section
        label="Active"
        count={active.length}
        empty={
          <CalmEmpty
            title="All caught up"
            body="You're all caught up — no active assignments right now."
          />
        }
      >
        {active.map((a) => (
          <AssignmentListItem
            key={a.compositeId}
            assignment={a}
            pseudonymUid={pseudonymUid}
            classEntry={
              a.classIds[0] ? directoryById[a.classIds[0]] : undefined
            }
            hideClassName={hideClassName}
            onCompletionResolved={onCompletionResolved}
          />
        ))}
      </Section>
    );
  }

  return (
    <Section
      label="Completed"
      count={completed.length}
      empty={
        <CalmEmpty
          title="Nothing completed yet"
          body="Once you finish an assignment, it'll show up here."
        />
      }
    >
      {completed.map((a) => (
        <AssignmentListItem
          key={a.compositeId}
          assignment={a}
          pseudonymUid={pseudonymUid}
          classEntry={a.classIds[0] ? directoryById[a.classIds[0]] : undefined}
          hideClassName={hideClassName}
          onCompletionResolved={onCompletionResolved}
          pendingVerification={pendingVerificationKeys?.has(a.compositeId)}
        />
      ))}
    </Section>
  );
};

interface SectionProps {
  label: string;
  count: number;
  empty: React.ReactNode;
  children?: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ label, count, empty, children }) => (
  <section>
    <header className="mb-3 flex items-baseline justify-between">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
        {label} · {count}
      </h2>
    </header>
    {count === 0 ? (
      empty
    ) : (
      <div className="flex flex-col gap-2">{children}</div>
    )}
  </section>
);

const CalmEmpty: React.FC<{ title: string; body: string }> = ({
  title,
  body,
}) => (
  <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 px-6 py-10 text-center">
    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
      <Inbox className="h-6 w-6 text-slate-400" strokeWidth={2} />
    </div>
    <div className="max-w-sm">
      <h3 className="text-sm font-bold text-slate-700">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{body}</p>
    </div>
  </div>
);
