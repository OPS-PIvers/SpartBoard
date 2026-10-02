import React from 'react';
import { House } from 'lucide-react';
import {
  classListLine,
  partitionForClass,
  type LandingPartition,
} from '@/utils/studentLanding';
import type { LandingClass } from './types';

interface LandingClassListProps {
  classes: LandingClass[];
  partition: LandingPartition;
  inSessionIds: ReadonlySet<string>;
  selectedClassId: string | null;
  onSelect: (classId: string | null) => void;
  nowMs: number;
}

const TONE: Record<'now' | 'missing' | 'plain', string> = {
  now: 'text-emerald-700',
  missing: 'text-rose-700',
  plain: 'text-slate-500',
};

const rowClass = (active: boolean): string =>
  `flex w-full min-h-[48px] items-center gap-3 rounded-xl px-2.5 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary ${
    active ? 'bg-slate-100' : 'hover:bg-slate-50'
  }`;

/** D21: a class-colour square with the period, the name, and one plain line. */
export const LandingClassList: React.FC<LandingClassListProps> = ({
  classes,
  partition,
  inSessionIds,
  selectedClassId,
  onSelect,
  nowMs,
}) => (
  <nav aria-label="Classes" className="flex flex-col gap-0.5">
    <button
      type="button"
      onClick={() => onSelect(null)}
      aria-current={selectedClassId === null ? 'page' : undefined}
      className={rowClass(selectedClassId === null)}
    >
      <span
        aria-hidden="true"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-slate-600"
      >
        <House className="h-4 w-4" strokeWidth={2.25} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-800">
          Overview
        </span>
        <span className="block truncate text-xs text-slate-500">
          All classes
        </span>
      </span>
    </button>
    <p className="mb-1 mt-3 px-2.5 text-xs font-semibold text-slate-500">
      My classes
    </p>
    {classes.map((c) => {
      const line = classListLine(
        partitionForClass(partition, c.classId).work,
        inSessionIds.has(c.classId),
        c.teachers,
        nowMs
      );
      const active = selectedClassId === c.classId;
      return (
        <button
          key={c.classId}
          type="button"
          onClick={() => onSelect(c.classId)}
          aria-current={active ? 'page' : undefined}
          className={rowClass(active)}
        >
          <span
            aria-hidden="true"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
            style={{ background: c.color.bar }}
          >
            {c.square}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-800">
              {c.name}
            </span>
            <span className={`block truncate text-xs ${TONE[line.tone]}`}>
              {line.text}
            </span>
          </span>
        </button>
      );
    })}
  </nav>
);
