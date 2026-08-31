import React, { useMemo, useState } from 'react';
import { Inbox } from 'lucide-react';
import { AssignmentListItem, type CompletionState } from './AssignmentListItem';
import type { AssignmentSummary } from '@/hooks/useStudentAssignments';
import type { ClassDirectoryEntry } from '@/hooks/useStudentClassDirectory';
import type { AssignmentFilterMode } from './AssignmentFilterTabs';
import { getWindowState } from '@/utils/assignmentWindow';
import { getServerNow } from '@/utils/serverTime';

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
 *
 * M17 C2 (§3a-C): within the Active list, "Open now" and "Upcoming" are
 * subheaders (not separate top-level sections) — a locked-window row that
 * hasn't opened yet stays inside `active` (the page-level partition only
 * moves *closed*-window rows into `completed`). Completed collapses past
 * 10 items by default (§3a-C).
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

const COMPLETED_COLLAPSE_THRESHOLD = 10;

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
  // Computed once per render against server-offset "now" — never a live
  // countdown (Design Contract §4).
  const nowMs = getServerNow();

  const { openNow, upcoming } = useMemo(() => {
    const openNow: AssignmentSummary[] = [];
    const upcoming: AssignmentSummary[] = [];
    for (const a of active) {
      if (getWindowState(a, nowMs) === 'upcoming') upcoming.push(a);
      else openNow.push(a);
    }
    return { openNow, upcoming };
  }, [active, nowMs]);

  const [showAllCompleted, setShowAllCompleted] = useState(false);

  if (mode === 'active') {
    return (
      <div className="flex flex-col gap-6">
        <Section
          label="Open now"
          count={openNow.length}
          empty={
            <CalmEmpty
              title="All caught up"
              body="You're all caught up — no active assignments right now."
            />
          }
        >
          {openNow.map((a) => (
            <AssignmentListItem
              key={a.compositeId}
              assignment={a}
              pseudonymUid={pseudonymUid}
              classEntry={
                a.classIds[0] ? directoryById[a.classIds[0]] : undefined
              }
              hideClassName={hideClassName}
              onCompletionResolved={onCompletionResolved}
              windowState="open"
            />
          ))}
        </Section>

        {upcoming.length > 0 && (
          <Section label="Upcoming" count={upcoming.length}>
            {upcoming.map((a) => (
              <AssignmentListItem
                key={a.compositeId}
                assignment={a}
                pseudonymUid={pseudonymUid}
                classEntry={
                  a.classIds[0] ? directoryById[a.classIds[0]] : undefined
                }
                hideClassName={hideClassName}
                onCompletionResolved={onCompletionResolved}
                windowState="upcoming"
              />
            ))}
          </Section>
        )}
      </div>
    );
  }

  const visibleCompleted =
    !showAllCompleted && completed.length > COMPLETED_COLLAPSE_THRESHOLD
      ? completed.slice(0, COMPLETED_COLLAPSE_THRESHOLD)
      : completed;
  const hiddenCount = completed.length - visibleCompleted.length;

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
      {visibleCompleted.map((a) => (
        <AssignmentListItem
          key={a.compositeId}
          assignment={a}
          pseudonymUid={pseudonymUid}
          classEntry={a.classIds[0] ? directoryById[a.classIds[0]] : undefined}
          hideClassName={hideClassName}
          onCompletionResolved={onCompletionResolved}
          pendingVerification={pendingVerificationKeys?.has(a.compositeId)}
          windowState={
            getWindowState(a, nowMs) === 'closed' ? 'closed' : 'open'
          }
        />
      ))}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAllCompleted(true)}
          className="mt-1 self-start text-xs font-semibold text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-700"
        >
          Show {hiddenCount} more
        </button>
      )}
    </Section>
  );
};

interface SectionProps {
  label: string;
  count: number;
  empty?: React.ReactNode;
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
