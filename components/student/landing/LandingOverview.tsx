import React, { useState } from 'react';
import type { AssignmentSummary } from '@/hooks/useStudentAssignments';
import { upNextRows, type LandingPartition } from '@/utils/studentLanding';
import {
  EmptyBox,
  ListBox,
  LiveBanner,
  ResourceRow,
  WorkRow,
} from './LandingRows';
import type { LandingClass } from './types';

interface LandingOverviewProps {
  partition: LandingPartition;
  classOf: (a: AssignmentSummary) => LandingClass | undefined;
  firstName: string | null;
  nowMs: number;
  pseudonymUid: string | null;
  /** Resources list under Up next (`student-overview-resources`). */
  showResources?: boolean;
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
  showResources = false,
}) => {
  const [seeAll, setSeeAll] = useState(false);
  const [seeAllRes, setSeeAllRes] = useState(false);
  const resShown = seeAllRes ? p.resources : p.resources.slice(0, 3);
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
              className="self-start rounded-sm text-sm font-semibold text-brand-blue-primary hover:underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
            >
              {seeAll ? 'Show less' : `See all ${total} assignments`}
            </button>
          )}
        </section>
        {showResources && p.resources.length > 0 && (
          <section
            aria-labelledby="landing-resources"
            className="flex flex-col gap-2"
          >
            <h2
              id="landing-resources"
              className="text-sm font-semibold text-slate-500"
            >
              Resources
            </h2>
            <ListBox>
              {resShown.map((row) => (
                <ResourceRow
                  key={row.assignment.compositeId}
                  row={row}
                  nowMs={nowMs}
                  cls={classOf(row.assignment)}
                />
              ))}
            </ListBox>
            {p.resources.length > 3 && (
              <button
                type="button"
                onClick={() => setSeeAllRes((v) => !v)}
                className="self-start rounded-sm text-sm font-semibold text-brand-blue-primary hover:underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
              >
                {seeAllRes
                  ? 'Show less'
                  : `See all ${p.resources.length} resources`}
              </button>
            )}
          </section>
        )}
      </div>
    </>
  );
};
