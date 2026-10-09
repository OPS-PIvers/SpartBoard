/* eslint-disable react-refresh/only-export-components -- harness preview module, never hot-reloaded in the app */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClassRoster } from '@/types';
import type { AssignPeriodAccessContext } from '../AssignPeriodAccessSection';
import { AssignWhenStep } from './AssignWhenStep';
import {
  defaultWhenValue,
  formatWhenValue,
  type AssignWhenVariant,
} from './assignWhenValue';

const roster = (n: number, name: string): ClassRoster => ({
  id: `r${n}`,
  name,
  driveFileId: null,
  studentCount: 24,
  createdAt: 0,
  students: [],
  bellPeriod: { buildingId: 'b', periodId: String(n) },
});

const ROSTERS = [
  roster(1, 'Sample 1'),
  roster(2, 'Sample 2'),
  roster(3, 'Sample 3'),
];

const CTX: AssignPeriodAccessContext = {
  bellOptions: [],
  bellWindow: () => null,
  onTagRoster: () => undefined,
};

const Example: React.FC<{
  label: string;
  variant: AssignWhenVariant;
  activity: 'quiz' | 'video' | 'gl' | 'flashcards';
  rosters: ClassRoster[];
  bells?: boolean;
}> = ({ label, variant, activity, rosters, bells = true }) => {
  const { t } = useTranslation();
  const [value, setValue] = useState(() =>
    defaultWhenValue({
      activity,
      bellAvailable: bells,
      manualAvailable: bells,
    })
  );
  const title = variant === 'available' ? 'Available' : 'When';
  const collapsed = formatWhenValue(value, {
    variant,
    rosterCount: rosters.length,
    manualAvailable: bells && variant === 'when',
    t,
  });
  return (
    <section className="space-y-2">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <div className="rounded-xl border border-brand-blue-primary/40 bg-white shadow-sm">
        <div className="flex items-center gap-3 px-4 py-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-brand-blue-primary bg-white text-xs font-bold text-brand-blue-primary">
            2
          </span>
          <span className="text-sm font-bold text-brand-blue-dark">
            {title}
          </span>
        </div>
        <div className="px-4 pb-4 pl-[3.25rem]">
          <AssignWhenStep
            value={value}
            onChange={setValue}
            variant={variant}
            rosters={rosters}
            periodAccess={bells ? CTX : undefined}
          />
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
          2
        </span>
        <span className="text-sm font-bold text-slate-700">{title}</span>
        <span className="ml-auto min-w-0 truncate pl-4 text-xs text-slate-500">
          {collapsed}
        </span>
      </div>
    </section>
  );
};

const AssignWhenStepDev: React.FC = () => (
  <div className="mx-auto max-w-xl space-y-6 p-6">
    <Example
      label="Quiz, three classes"
      variant="when"
      activity="quiz"
      rosters={ROSTERS}
    />
    <Example
      label="Flashcards, students submit work"
      variant="when"
      activity="flashcards"
      rosters={ROSTERS}
    />
    <Example
      label="Quiz, no bell periods"
      variant="when"
      activity="quiz"
      rosters={ROSTERS.slice(0, 1)}
      bells={false}
    />
    <Example
      label="Guided Learning, study resource"
      variant="available"
      activity="gl"
      rosters={ROSTERS}
    />
    <Example
      label="Video Activity, teacher-paced (live)"
      variant="live"
      activity="video"
      rosters={ROSTERS.slice(0, 1)}
    />
  </div>
);

export default {
  title: 'When / Available step',
  render: () => <AssignWhenStepDev />,
};
