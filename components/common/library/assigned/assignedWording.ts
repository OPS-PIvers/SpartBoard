import type {
  AssignedClass,
  AssignedMainAction,
  AssignedStatus,
  ClassStatus,
} from '@/utils/assignedStatus';

/** How a piece of the status line is coloured. */
export type LineTone = 'open' | 'paused' | 'alert' | 'warn' | 'plain';

export interface LineSegment {
  text: string;
  tone: LineTone;
  /** Joins the previous segment with a space instead of " · ". */
  glued?: boolean;
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** "Thu 8:05 AM", or just the time when it is today. */
export function formatOpensAt(ms: number, nowMs: number): string {
  const at = new Date(ms);
  const time = at.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  if (at.toDateString() === new Date(nowMs).toDateString()) return time;
  return `${at.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
}

const turnedIn = (submitted: number, total: number | null) =>
  total != null && total > 0
    ? `${submitted} of ${total} turned in`
    : `${submitted} turned in`;

const forClass = (word: string, label: string | null) =>
  label ? `${word} for ${label}` : word;

/** D14: the row's one plain status line, as coloured segments joined by " · ". */
export function statusLineSegments(
  s: AssignedStatus,
  nowMs: number
): LineSegment[] {
  const line = s.line;
  const named = (c: AssignedClass) => (s.singleLine ? null : c.label);
  switch (line.kind) {
    case 'open': {
      // Every open class gets its own count, as in the prototype.
      const open = s.classes.filter((c) => c.status === 'open');
      const shown = open.length > 0 ? open : [];
      const openOnes = shown.length
        ? shown.map((c) => [named(c), c.submitted, c.total] as const)
        : ([[line.classLabel, line.submitted, line.total]] as const);
      const segs: LineSegment[] = openOnes.flatMap(([label, n, total]) => [
        { text: forClass('Open', label), tone: 'open' as const },
        { text: turnedIn(n, total), tone: 'plain' as const, glued: true },
      ]);
      const paused = s.classes.filter((x) => x.status === 'paused');
      for (const c of paused)
        segs.push({ text: forClass('Paused', named(c)), tone: 'paused' });
      const toGo = s.classes.filter((c) => c.status !== 'closed').length;
      const left = toGo - openOnes.length - paused.length;
      if (left > 0)
        segs.push({
          text: `${plural(left, 'class', 'classes')} to go`,
          tone: 'plain',
        });
      return segs;
    }
    case 'paused': {
      const segs: LineSegment[] = s.classes
        .filter((c) => c.status === 'paused')
        .map((c) => ({ text: forClass('Paused', named(c)), tone: 'paused' }));
      if (segs.length === 0)
        segs.push({
          text: forClass('Paused', line.classLabel),
          tone: 'paused',
        });
      const left =
        s.classes.filter((c) => c.status !== 'closed').length - segs.length;
      if (left > 0)
        segs.push({
          text: `${plural(left, 'class', 'classes')} to go`,
          tone: 'plain',
        });
      return segs;
    }
    case 'scheduled':
      return [
        { text: `Opens ${formatOpensAt(line.opensAt, nowMs)}`, tone: 'plain' },
      ];
    case 'ready': {
      const total = line.readyCount + line.scheduledCount + line.closedCount;
      if (s.singleLine) return [{ text: 'Ready', tone: 'plain' }];
      if (line.closedCount > 0)
        return [
          {
            text: `${line.closedCount} of ${plural(total, 'class', 'classes')} done`,
            tone: 'plain',
          },
        ];
      return [
        {
          text: `Ready for ${plural(line.readyCount + line.scheduledCount, 'class', 'classes')}`,
          tone: 'plain',
        },
      ];
    }
    case 'needs-grading':
      return [{ text: 'Needs grading', tone: 'alert' }];
    case 'grading-unknown':
      return [{ text: 'Closed', tone: 'plain' }];
    case 'scores-unpublished':
      return [{ text: 'Scores not published', tone: 'warn' }];
    case 'view-only':
      return [{ text: 'Shared, view only', tone: 'plain' }];
    case 'done':
      return [
        {
          text: line.scoresPublished ? 'Scores published' : 'Closed',
          tone: 'plain',
        },
      ];
  }
}

/** D6/D8: the main button's label. */
export function mainActionLabel(
  action: AssignedMainAction,
  needsGrading: number | null
): string {
  switch (action.kind) {
    case 'open':
      return forClass('Open', action.classLabel);
    case 'resume':
      return action.classLabel ? `Resume ${action.classLabel}` : 'Resume';
    case 'monitor':
      return 'Monitor';
    case 'grade':
      return needsGrading ? `Grade (${needsGrading})` : 'Grade';
    case 'publish':
      return 'Publish scores';
    case 'results':
      return 'Results';
    case 'choose-class':
      return 'Choose class';
  }
}

export const CLASS_STATUS_WORD: Record<ClassStatus, string> = {
  open: 'Open',
  paused: 'Paused',
  ready: 'Ready',
  scheduled: 'Scheduled',
  closed: 'Closed',
};

/** The small line under a class name in the expanded row. */
export function classDetail(
  c: AssignedClass,
  nowMs: number,
  bellLabel: string | null
): string {
  const word = CLASS_STATUS_WORD[c.status];
  if (c.status === 'scheduled' && c.opensAt != null)
    return `${word} · opens ${formatOpensAt(c.opensAt, nowMs)}`;
  if (c.status === 'ready') return bellLabel ? `${word} · ${bellLabel}` : word;
  return `${word} · ${turnedIn(c.submitted, c.total)}`;
}

/** Per-class buttons in the expanded row (D6). */
export type ClassActionKind =
  'open' | 'pause' | 'resume' | 'close' | 'reopen' | 'monitor';

export function classActions(status: ClassStatus): ClassActionKind[] {
  switch (status) {
    case 'open':
      return ['pause', 'close', 'monitor'];
    case 'paused':
      return ['resume', 'close'];
    case 'closed':
      return ['reopen'];
    default:
      return ['open'];
  }
}

export const CLASS_ACTION_LABEL: Record<ClassActionKind, string> = {
  open: 'Open',
  pause: 'Pause',
  resume: 'Resume',
  close: 'Close',
  reopen: 'Reopen',
  monitor: 'Monitor',
};
