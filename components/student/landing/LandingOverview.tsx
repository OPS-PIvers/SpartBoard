import React, { useState } from 'react';
import type { AssignmentSummary } from '@/hooks/useStudentAssignments';
import { upNextRows, type LandingPartition } from '@/utils/studentLanding';
import { EmptyBox, ListBox, LiveBanner, WorkRow } from './LandingRows';
import type { LandingClass } from './types';

interface LandingOverviewProps {
  partition: LandingPartition;
  classOf: (a: AssignmentSummary) => LandingClass | undefined;
  firstName: string | null;
  nowMs: number;
  pseudonymUid: string | null;
}

const greetingFor = (hour: number): string =>
  hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

/** D19: Live only when something is live, then Up next across classes. */
export const LandingOverview: React.FC<LandingOverviewProps> = ({
  partition: p,
  classOf,
  firstName,
  nowMs,
  pseudonymUid,
}) => {
  const [seeAll, setSeeAll] = useState(false);
  const now = new Date(nowMs);
  const { shown: firstRows, total } = upNextRows(p.work, nowMs);
  const shown = seeAll ? p.work : firstRows;
  const greeting = greetingFor(now.getHours());
  return (
    <>
      <div>
        <p className="text-sm text-slate-500">
          {now.toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {firstName ? `${greeting}, ${firstName}` : greeting}
        </h1>
      </div>
      <div className="mt-5 flex flex-col gap-4">
        <LiveBanner rows={p.live} classNameOf={(a) => classOf(a)?.name} />
        <section
          aria-labelledby="landing-up-next"
          className="flex flex-col gap-2"
        >
          <h2
            id="landing-up-next"
            className="text-sm font-semibold text-slate-500"
          >
            Up next
          </h2>
          {shown.length ? (
            <ListBox>
              {shown.map((row) => (
                <WorkRow
                  key={row.assignment.compositeId}
                  row={row}
                  nowMs={nowMs}
                  pseudonymUid={pseudonymUid}
                  cls={classOf(row.assignment)}
                />
              ))}
            </ListBox>
          ) : (
            <EmptyBox text="You're all caught up." />
          )}
          {(seeAll || total > firstRows.length) && (
            <button
              type="button"
              onClick={() => setSeeAll((v) => !v)}
              className="self-start rounded text-sm font-semibold text-brand-blue-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
            >
              {seeAll ? 'Show less' : `See all ${total} assignments`}
            </button>
          )}
        </section>
      </div>
    </>
  );
};
