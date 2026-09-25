import React from 'react';
import type { ProjectGroup, ProjectStep } from '@/types';
import {
  STEP_STATE_LABELS,
  completedStepCount,
  defaultGroupColor,
  stepStateOf,
} from '@/components/widgets/Projects/projectSteps';
import { STATE_STYLES } from '@/components/widgets/Projects/stepVisuals';
import { StateMark } from '@/components/widgets/Projects/StateMark';

interface ProjectPeerGridProps {
  groups: ProjectGroup[];
  steps: ProjectStep[];
}

/** D47 — classmates' groups as read-only rows in the board's colors (D39 decides whether they appear). */
export const ProjectPeerGrid: React.FC<ProjectPeerGridProps> = ({
  groups,
  steps,
}) => (
  <section aria-labelledby="project-other-groups">
    <h3 id="project-other-groups" className="text-sm font-bold text-slate-900">
      Other groups
    </h3>
    <div className="mt-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-500"
            >
              Group
            </th>
            {steps.map((step, index) => (
              <th
                key={step.id}
                scope="col"
                title={step.title}
                className="px-1 py-2 text-center text-xs font-semibold text-slate-500"
              >
                <span aria-hidden>{index + 1}</span>
                <span className="sr-only">{step.title}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.id} data-testid={`peer-row-${group.id}`}>
              <th
                scope="row"
                className="sticky left-0 z-10 max-w-[10rem] bg-white px-3 py-1.5 text-left"
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`h-6 w-1.5 shrink-0 rounded-full ${
                      group.color ?? defaultGroupColor(group.order)
                    }`}
                  />
                  <span className="truncate font-semibold text-slate-800">
                    {group.name}
                  </span>
                  <span className="sr-only">
                    , {completedStepCount(group, steps)} of {steps.length} done
                  </span>
                </span>
              </th>
              {steps.map((step) => {
                const state = stepStateOf(group, step.id);
                return (
                  <td key={step.id} className="px-1 py-1.5">
                    <span
                      role="img"
                      aria-label={`${step.title}: ${STEP_STATE_LABELS[state]}`}
                      className={`mx-auto flex h-7 w-7 items-center justify-center rounded-md ${STATE_STYLES[state].tone}`}
                    >
                      <StateMark state={state} size="0.875rem" />
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
);
