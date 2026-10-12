import React from 'react';
import { ChevronRight, Lock, MessageSquareText } from 'lucide-react';
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
import { tourFieldAttr } from '@/config/tourAnchors';
import { nextScheduledOpen, studentCanEnter } from '@/utils/periodAccess';
import type { DoneItem, LandingRow } from '@/utils/studentLanding';
import {
  formatPoints,
  type StudentGradeRow,
} from '@/utils/gradebook/studentGrades';
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
  item: DoneItem;
  check: TurnInCheck | undefined;
  nowMs: number;
  /** Gradebook tab: score, Late, NEW and the teacher's comment replace the Completed labels. */
  gradebook?: boolean;
  isNew?: boolean;
  /** Named in the Missing explanation. */
  teachers: string;
  onLockedClick: (a: AssignmentSummary) => void;
  /** Opens a graded session that is no longer in the student's list. */
  onOpenGradeOnly: (item: DoneItem) => void;
}

const GradeScore: React.FC<{ grade: StudentGradeRow | undefined }> = ({
  grade,
}) => {
  const cls = 'w-14 text-right text-sm font-semibold tabular-nums';
  if (grade?.status === 'scored' && grade.points !== null && grade.max !== null)
    return (
      <span className={`${cls} text-slate-800`}>
        {formatPoints(grade.points)}/{formatPoints(grade.max)}
      </span>
    );
  if (grade?.status === 'complete')
    return <span className={`${cls} text-slate-800`}>Done</span>;
  if (grade?.status === 'excluded')
    return <span className="text-xs text-slate-500">Excused</span>;
  return <span className="text-xs text-slate-500">Awaiting grade</span>;
};

const FLAG_INK: Record<string, string> = {
  rose: 'text-rose-700',
  amber: 'text-amber-700',
  orange: 'text-orange-700',
};

/** Flags other than Missing and Excused, which the row already says. */
const extraFlags = (grade: StudentGradeRow | undefined) =>
  (grade?.flags ?? []).filter((f) => f.id !== 'missing' && f.id !== 'excused');

function gradebookRight(item: DoneItem, isNew: boolean): React.ReactNode {
  if (item.missing) {
    return (
      <>
        <span className="text-xs font-semibold text-rose-700">Missing</span>
        {item.grade?.status === 'scored' && (
          <span className="w-14 text-right text-sm font-semibold tabular-nums text-slate-400">
            {formatPoints(item.grade.points ?? 0)}
          </span>
        )}
      </>
    );
  }
  if (item.row?.state === 'closed' && !item.grade) {
    return <span className="text-xs text-slate-500">Not turned in</span>;
  }
  return (
    <>
      {isNew && (
        <span className="text-[10px] font-bold uppercase tracking-wide text-brand-red-primary">
          New
        </span>
      )}
      {extraFlags(item.grade).map((f) => (
        <span
          key={f.id}
          className={`text-xs font-semibold ${FLAG_INK[f.color] ?? 'text-slate-600'}`}
        >
          {f.name}
        </span>
      ))}
      <GradeScore grade={item.grade} />
    </>
  );
}

function completedRight(
  item: DoneItem,
  check: TurnInCheck | undefined,
  nowMs: number
): React.ReactNode {
  if (item.missing)
    return <span className="text-xs font-semibold text-rose-700">Missing</span>;
  if (item.row?.state === 'closed')
    return <span className="text-xs text-slate-500">Not turned in</span>;
  if (check?.lockedOut)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700">
        <Lock className="h-3 w-3" aria-hidden="true" />
        Locked
      </span>
    );
  return item.row && areResultsShared(item.row.assignment, check, nowMs) ? (
    <span className="text-xs font-semibold text-brand-blue-primary">
      View results
    </span>
  ) : (
    <span className="text-xs text-slate-500">Not graded yet</span>
  );
}

const missingMessage = (item: DoneItem, teachers: string): string => {
  const when =
    item.row?.assignment.closeAt ?? item.row?.assignment.endedAt ?? item.when;
  const closed =
    when !== undefined ? `This closed on ${fmtDay(when)}` : 'This closed';
  return `${closed} before you turned it in. Talk to ${teachers || 'your teacher'} if you need it reopened.`;
};

/** D17, D18: a Completed or Gradebook row; every one opens the student's own work, or says why it is Missing. */
export const DoneRow: React.FC<DoneRowProps> = ({
  item,
  check,
  nowMs,
  gradebook = false,
  isNew = false,
  teachers,
  onLockedClick,
  onOpenGradeOnly,
}) => {
  const { showAlert } = useDialog();
  const a = item.row?.assignment;
  const comment = gradebook ? item.grade?.comment : null;
  const body = (
    <>
      <KindIcon kind={item.kind} />
      <span className="min-w-0 flex-1">
        <Title muted={item.missing}>{item.title}</Title>
        <span className="mt-0.5 block truncate text-xs text-slate-500">
          {a ? kindLabel(a) : KIND_CONFIG[item.kind].label}
          {item.when !== undefined &&
            ` · ${item.missing ? 'closed' : 'due'} ${fmtDay(item.when)}`}
        </span>
        {comment && (
          <span className="mt-1 flex items-start gap-1.5 text-xs text-slate-600">
            <MessageSquareText
              className="mt-px h-3.5 w-3.5 shrink-0 text-slate-400"
              aria-label="Teacher comment"
            />
            <span className="line-clamp-2">{comment}</span>
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-2.5">
        {gradebook
          ? gradebookRight(item, isNew)
          : completedRight(item, check, nowMs)}
      </span>
    </>
  );
  if (item.missing) {
    return (
      <button
        type="button"
        {...tourFieldAttr(
          'gradebook.student-view.done-row',
          'gradebook',
          item.key
        )}
        onClick={() =>
          void showAlert(missingMessage(item, teachers), {
            title: item.title,
            variant: 'info',
          })
        }
        className={ROW_CLASS}
      >
        {body}
      </button>
    );
  }
  if (a && check?.lockedOut) {
    return (
      <button
        type="button"
        {...tourFieldAttr(
          'gradebook.student-view.done-row',
          'gradebook',
          item.key
        )}
        onClick={() => onLockedClick(a)}
        className={ROW_CLASS}
      >
        {body}
      </button>
    );
  }
  if (!a) {
    return (
      <button
        type="button"
        {...tourFieldAttr(
          'gradebook.student-view.done-row',
          'gradebook',
          item.key
        )}
        onClick={() => onOpenGradeOnly(item)}
        className={ROW_CLASS}
      >
        {body}
      </button>
    );
  }
  return (
    <a
      href={a.openHref}
      {...tourFieldAttr(
        'gradebook.student-view.done-row',
        'gradebook',
        item.key
      )}
      className={ROW_CLASS}
    >
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
