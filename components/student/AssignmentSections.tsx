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
 *   - completion === 'unknown' → Active (with neutral pill, resolves later)
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
  /** Optional override for the all-empty state (mode='all', both sections empty). */
  emptyAll?: React.ReactNode;
}

export const AssignmentSections: React.FC<AssignmentSectionsProps> = ({
  mode,
  active,
  completed,
  pseudonymUid,
  directoryById,
  hideClassName,
  onCompletionResolved,
  emptyAll,
}) => {
  const showActive = mode === 'all' || mode === 'active';
  const showCompleted = mode === 'all' || mode === 'completed';

  // All-empty fallback for mode='all' so the page reads as "you're all caught
  // up" instead of two empty headers.
  if (mode === 'all' && active.length === 0 && completed.length === 0) {
    return (
      <>
        {emptyAll ?? (
          <CalmEmpty
            title="All caught up"
            body="You're all caught up — nothing active or completed yet."
          />
        )}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {showActive && (
        <Section
          label="Active"
          count={active.length}
          empty={
            mode === 'all' ? (
              <p className="text-sm text-slate-500">
                Nothing active right now.
              </p>
            ) : (
              <CalmEmpty
                title="All caught up"
                body="You're all caught up — no active assignments right now."
              />
            )
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
      )}
      {showCompleted && (
        <Section
          label="Completed"
          count={completed.length}
          empty={
            mode === 'all' ? (
              <p className="text-sm text-slate-500">Nothing completed yet.</p>
            ) : (
              <CalmEmpty
                title="Nothing completed yet"
                body="Once you finish an assignment, it'll show up here."
              />
            )
          }
        >
          {completed.map((a) => (
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
      )}
    </div>
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
