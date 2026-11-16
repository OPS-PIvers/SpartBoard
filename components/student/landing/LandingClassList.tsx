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
  /** `dark` on the brand-blue sidebar; `light` in the white class sheet. */
  tone?: 'light' | 'dark';
}

const TONE: Record<'now' | 'missing' | 'plain', string> = {
  now: 'text-emerald-700',
  missing: 'text-rose-700',
  plain: 'text-slate-500',
};
const DARK_TONE: Record<'now' | 'missing' | 'plain', string> = {
  now: 'text-emerald-300',
  missing: 'text-rose-300',
  plain: 'text-white/60',
};

const rowClass = (active: boolean, dark: boolean): string =>
  `flex w-full min-h-[48px] items-center gap-3 rounded-xl px-2.5 py-2 text-left transition focus:outline-hidden focus-visible:ring-2 ${
    dark
      ? `focus-visible:ring-white/70 ${active ? 'bg-white shadow-xs' : 'hover:bg-white/10'}`
      : `focus-visible:ring-brand-blue-primary ${active ? 'bg-slate-100' : 'hover:bg-slate-50'}`
  }`;

/** D21: a class-colour square with the period, the name, and one plain line. */
export const LandingClassList: React.FC<LandingClassListProps> = ({
  classes,
  partition,
  inSessionIds,
  selectedClassId,
  onSelect,
  nowMs,
  tone = 'light',
}) => {
  const dark = tone === 'dark';
  // An active row on the dark rail is a white pill, so it uses the light text colours.
  const onDark = (active: boolean) => dark && !active;
  const nameClass = (active: boolean) =>
    `block truncate text-sm font-semibold ${
      onDark(active)
        ? 'text-white'
        : dark
          ? 'text-brand-blue-dark'
          : 'text-slate-800'
    }`;
  const overviewActive = selectedClassId === null;
  return (
    <nav aria-label="Classes" className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-current={selectedClassId === null ? 'page' : undefined}
        className={rowClass(overviewActive, dark)}
      >
        <span
          aria-hidden="true"
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${onDark(overviewActive) ? 'bg-white/15 text-white' : dark ? 'bg-brand-blue-lighter text-brand-blue-dark' : 'bg-slate-200 text-slate-600'}`}
        >
          <House className="h-4 w-4" strokeWidth={2.25} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={nameClass(overviewActive)}>Overview</span>
          <span
            className={`block truncate text-xs ${onDark(overviewActive) ? 'text-white/60' : 'text-slate-500'}`}
          >
            All classes
          </span>
        </span>
      </button>
      <p
        className={`mb-1 mt-3 px-2.5 text-xs font-semibold ${dark ? 'text-white/50' : 'text-slate-500'}`}
      >
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
            className={rowClass(active, dark)}
          >
            <span
              aria-hidden="true"
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white ${onDark(active) ? 'ring-1 ring-white/30' : ''}`}
              style={{ background: c.color.bar }}
            >
              {c.square}
            </span>
            <span className="min-w-0 flex-1">
              <span className={nameClass(active)}>{c.name}</span>
              <span
                className={`block truncate text-xs ${(onDark(active) ? DARK_TONE : TONE)[line.tone]}`}
              >
                {line.text}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
};
