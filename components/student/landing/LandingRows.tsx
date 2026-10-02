import React from 'react';
import { ChevronRight, Lock } from 'lucide-react';
import {
  KIND_CONFIG,
  type AssignmentSummary,
  type SessionKind,
} from '@/hooks/useStudentAssignments';
import { areResultsShared, type TurnInCheck } from '@/hooks/useStudentTurnIns';
import { useDialog } from '@/context/useDialog';
import {
  formatAvailableUntilLabel,
  formatOpensLabel,
  getWindowState,
} from '@/utils/assignmentWindow';
import { formatDueLabel } from '@/utils/studentTurnIn';
import { nextScheduledOpen, studentCanEnter } from '@/utils/periodAccess';
import type { LandingRow } from '@/utils/studentLanding';
import type { LandingClass } from './types';

// D22: flat kind icons, coloured glyph on a pale slate tile; hues follow each library's identity.
const KIND_INK: Record<SessionKind, string> = {
  quiz: 'text-emerald-700',
  'video-activity': 'text-red-700',
  'guided-learning': 'text-amber-700',
  'mini-app': 'text-slate-700',
  'activity-wall': 'text-orange-700',
  flashcards: 'text-pink-700',
  projects: 'text-blue-700',
};

export const KindIcon: React.FC<{ kind: SessionKind }> = ({ kind }) => {
  const Icon = KIND_CONFIG[kind].icon;
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 ${KIND_INK[kind]}`}
    >
      <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
    </span>
  );
};

const fmtDay = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

const kindLabel = (a: AssignmentSummary): string => {
  const base = KIND_CONFIG[a.kind].label;
  if (a.kind !== 'flashcards' || !a.flashcardKind) return base;
  return `${base} · ${a.flashcardKind === 'check' ? 'Check' : 'Study'}`;
};

const ROW_CLASS =
  'group flex w-full min-w-0 items-center gap-3 px-1 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue-primary';

const Title: React.FC<{ children: string; muted?: boolean }> = ({
  children,
  muted,
}) => (
  <span
    className={`block truncate text-sm font-semibold group-hover:text-brand-blue-primary ${
      muted ? 'text-slate-500' : 'text-slate-800'
    }`}
  >
    {children}
  </span>
);

const Dot: React.FC = () => (
  <span aria-hidden="true" className="text-slate-300">
    ·
  </span>
);

/** A row that says why it can't open yet instead of navigating. */
const LockedRow: React.FC<{
  message: string;
  children: React.ReactNode;
}> = ({ message, children }) => {
  const { showAlert } = useDialog();
  return (
    <button
      type="button"
      onClick={() =>
        void showAlert(message, { title: 'Not open', variant: 'info' })
      }
      className={`${ROW_CLASS} opacity-60`}
    >
      {children}
      <Lock
        className="h-4 w-4 shrink-0 text-slate-400"
        aria-hidden="true"
        strokeWidth={2}
      />
    </button>
  );
};

const OpenRow: React.FC<{ href: string; children: React.ReactNode }> = ({
  href,
  children,
}) => (
  <a href={href} className={ROW_CLASS}>
    {children}
    <ChevronRight
      className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-slate-500"
      aria-hidden="true"
    />
  </a>
);

const ClassMark: React.FC<{ cls: LandingClass }> = ({ cls }) => (
  <span className="inline-flex min-w-0 items-center gap-1.5 text-slate-600">
    <span
      aria-hidden="true"
      className="h-2 w-2 shrink-0 rounded-full"
      style={{ background: cls.color.bar }}
    />
    <span className="truncate">{cls.name}</span>
  </span>
);

function dueLine(row: LandingRow, nowMs: number): React.ReactNode {
  const a = row.assignment;
  if (row.state === 'missing-open') {
    const was = a.dueAt !== undefined ? ` · was due ${fmtDay(a.dueAt)}` : '';
    const closes =
      a.closeAt !== undefined ? `, closes ${fmtDay(a.closeAt)}` : '';
    return (
      <>
        <span className="font-semibold text-rose-700">
          Missing · still open
        </span>
        <span className="text-slate-500">
          {was}
          {closes}
        </span>
      </>
    );
  }
  if (row.state === 'upcoming' && a.openAt !== undefined) {
    return <span className="text-slate-500">{formatOpensLabel(a.openAt)}</span>;
  }
  if (a.dueAt === undefined) {
    return <span className="text-slate-500">No due date</span>;
  }
  const label = formatDueLabel(a.dueAt, nowMs);
  return label.startsWith('Due today') ? (
    <span className="font-semibold text-slate-800">{label}</span>
  ) : (
    <span className="text-slate-500">{label}</span>
  );
}

interface WorkRowProps {
  row: LandingRow;
  nowMs: number;
  pseudonymUid: string | null;
  /** Overview rows name their class. */
  cls?: LandingClass;
}

export const WorkRow: React.FC<WorkRowProps> = ({
  row,
  nowMs,
  pseudonymUid,
  cls,
}) => {
  const a = row.assignment;
  const gate = a.periodGate;
  const periodLocked =
    !!gate && !studentCanEnter(gate, gate.periodKeys, pseudonymUid, nowMs);
  const periodOpensAt = periodLocked
    ? nextScheduledOpen(gate, gate.periodKeys, nowMs)
    : null;
  const body = (
    <>
      <KindIcon kind={a.kind} />
      <span className="min-w-0 flex-1">
        <Title muted={row.state === 'upcoming'}>{a.title}</Title>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs">
          {cls && (
            <>
              <ClassMark cls={cls} />
              <Dot />
            </>
          )}
          {dueLine(row, nowMs)}
          {row.state === 'in-progress' && (
            <>
              <Dot />
              <span className="text-sky-700">In progress</span>
            </>
          )}
          {periodLocked && (
            <>
              <Dot />
              <span className="text-slate-500">
                {periodOpensAt != null
                  ? formatOpensLabel(periodOpensAt)
                  : 'Not started yet'}
              </span>
            </>
          )}
        </span>
      </span>
    </>
  );
  if (row.state === 'upcoming') {
    const message =
      a.openAt !== undefined
        ? `${formatOpensLabel(a.openAt)}. Not available yet.`
        : 'Not available yet.';
    return <LockedRow message={message}>{body}</LockedRow>;
  }
  return <OpenRow href={a.openHref}>{body}</OpenRow>;
};

export const ResourceRow: React.FC<{ row: LandingRow; nowMs: number }> = ({
  row,
  nowMs,
}) => {
  const a = row.assignment;
  const upcoming = getWindowState(a, nowMs) === 'upcoming';
  const meta =
    upcoming && a.openAt !== undefined
      ? formatOpensLabel(a.openAt)
      : formatAvailableUntilLabel(a.closeAt);
  const body = (
    <>
      <KindIcon kind={a.kind} />
      <span className="min-w-0 flex-1">
        <Title>{a.title}</Title>
        <span className="mt-0.5 block truncate text-xs text-slate-500">
          {kindLabel(a)} · {meta}
        </span>
      </span>
    </>
  );
  const gallery =
    a.kind === 'activity-wall' && a.publiclyShared && a.latestShareCode
      ? `${window.location.origin}/r/${a.latestShareCode}`
      : null;
  return (
    <div className="flex items-center">
      <div className="min-w-0 flex-1">
        {upcoming ? (
          <LockedRow message={`${meta}. Not available yet.`}>{body}</LockedRow>
        ) : (
          <OpenRow href={a.openHref}>{body}</OpenRow>
        )}
      </div>
      {gallery && (
        <a
          href={gallery}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded px-2 py-1 text-xs font-semibold text-brand-blue-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
        >
          Gallery
        </a>
      )}
    </div>
  );
};

interface DoneRowProps {
  row: LandingRow;
  check: TurnInCheck | undefined;
  nowMs: number;
  onLockedClick: (a: AssignmentSummary) => void;
}

export const DoneRow: React.FC<DoneRowProps> = ({
  row,
  check,
  nowMs,
  onLockedClick,
}) => {
  const a = row.assignment;
  const missing = row.state === 'missing';
  const when = a.dueAt ?? a.closeAt ?? a.endedAt;
  const right =
    row.state === 'missing' ? (
      <span className="text-xs font-semibold text-rose-700">Missing</span>
    ) : row.state === 'closed' ? (
      <span className="text-xs text-slate-500">Not turned in</span>
    ) : check?.lockedOut ? (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700">
        <Lock className="h-3 w-3" aria-hidden="true" />
        Locked
      </span>
    ) : areResultsShared(a, check, nowMs) ? (
      <span className="text-xs font-semibold text-brand-blue-primary">
        View results
      </span>
    ) : (
      <span className="text-xs text-slate-500">Not graded yet</span>
    );
  const body = (
    <>
      <KindIcon kind={a.kind} />
      <span className="min-w-0 flex-1">
        <Title muted={missing}>{a.title}</Title>
        <span className="mt-0.5 block truncate text-xs text-slate-500">
          {kindLabel(a)}
          {when !== undefined &&
            ` · ${missing ? 'closed' : 'due'} ${fmtDay(when)}`}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2.5">{right}</span>
    </>
  );
  if (check?.lockedOut) {
    return (
      <button
        type="button"
        onClick={() => onLockedClick(a)}
        className={ROW_CLASS}
      >
        {body}
      </button>
    );
  }
  return (
    <a href={a.openHref} className={ROW_CLASS}>
      {body}
    </a>
  );
};

export const ListBox: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white px-3">
    {React.Children.map(children, (child) => (
      <li>{child}</li>
    ))}
  </ul>
);

export const EmptyBox: React.FC<{
  text: string;
  children?: React.ReactNode;
}> = ({ text, children }) => (
  <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center">
    <p className="text-sm text-slate-500">{text}</p>
    {children}
  </div>
);

export const LiveBanner: React.FC<{
  rows: LandingRow[];
  classNameOf: (a: AssignmentSummary) => string | undefined;
}> = ({ rows, classNameOf }) => (
  <>
    {rows.map(({ assignment: a }) => (
      <a
        key={a.compositeId}
        href={a.openHref}
        className="flex w-full items-center gap-3 rounded-2xl bg-brand-blue-primary px-4 py-3 text-left text-white shadow-sm transition hover:bg-brand-blue-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-2"
      >
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-white">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full bg-red-400"
          />
          Live
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{a.title}</span>
          {classNameOf(a) && (
            <span className="block truncate text-xs text-white/80">
              {classNameOf(a)}
            </span>
          )}
        </span>
        <span className="shrink-0 rounded-xl bg-white px-3 py-1.5 text-sm font-bold text-brand-blue-primary">
          Join
        </span>
      </a>
    ))}
  </>
);
