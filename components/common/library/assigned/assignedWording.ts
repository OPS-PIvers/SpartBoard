import type {
  AssignedClass,
  AssignedMainAction,
  AssignedStatus,
  ClassStatus,
} from '@/utils/assignedStatus';

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
    ? `${submitted} of ${total} submitted`
    : `${submitted} submitted`;

/** The row's status word: where its classes stand, never grading or publishing. */
export interface AccessBadge {
  label: string;
  tone: 'success' | 'warn' | 'info' | 'scheduled' | 'neutral';
  dot?: boolean;
}

const BADGE_TONE: Record<ClassStatus, AccessBadge['tone']> = {
  open: 'success',
  paused: 'warn',
  ready: 'info',
  scheduled: 'scheduled',
  closed: 'neutral',
};

/** One class's status word, as the expanded row and a class filter show it. */
export function classBadge(c: AssignedClass): AccessBadge {
  return {
    label: CLASS_STATUS_WORD[c.status],
    tone: BADGE_TONE[c.status],
    dot: c.status === 'open',
  };
}

const named = (word: string, of: AssignedClass[], single: boolean) =>
  single || of.length === 0
    ? word
    : of.length === 1
      ? `${word} · ${of[0].label}`
      : `${word} · ${of.length} classes`;

/** Where the row's classes stand, in the same column as each class's word. */
export function accessBadge(s: AssignedStatus): AccessBadge {
  const by = (st: ClassStatus) => s.classes.filter((c) => c.status === st);
  const open = by('open');
  if (open.length > 0)
    return {
      label: named('Open', open, s.singleLine),
      tone: 'success',
      dot: true,
    };
  const paused = by('paused');
  if (paused.length > 0)
    return { label: named('Paused', paused, s.singleLine), tone: 'warn' };
  if (by('ready').length > 0) return { label: 'Ready', tone: 'info' };
  if (by('scheduled').length > 0)
    return { label: 'Scheduled', tone: 'scheduled' };
  return { label: 'Closed', tone: 'neutral' };
}

/** The grey text beside the status word: counts, what is waiting and when it opens. */
export function detailText(
  s: AssignedStatus,
  nowMs: number,
  counts = true
): string {
  const line = s.line;
  const parts: string[] = [];
  const toGo = (shown: number) => {
    const left = s.classes.filter((c) => c.status !== 'closed').length - shown;
    if (left > 0) parts.push(`${plural(left, 'class', 'classes')} to go`);
  };
  switch (line.kind) {
    case 'open': {
      const open = s.classes.filter((c) => c.status === 'open');
      if (counts) {
        const n = open.reduce((t, c) => t + c.submitted, 0);
        const totals = open.map((c) => c.total);
        const total = totals.every((t) => t != null)
          ? totals.reduce<number>((t, x) => t + (x ?? 0), 0)
          : null;
        parts.push(
          open.length > 0
            ? turnedIn(n, total)
            : turnedIn(line.submitted, line.total)
        );
      }
      toGo(
        Math.max(open.length, 1) +
          s.classes.filter((c) => c.status === 'paused').length
      );
      break;
    }
    case 'paused':
      toGo(Math.max(s.classes.filter((c) => c.status === 'paused').length, 1));
      break;
    case 'scheduled':
      parts.push(`Opens ${formatOpensAt(line.opensAt, nowMs)}`);
      break;
    case 'ready': {
      const total = line.readyCount + line.scheduledCount + line.closedCount;
      if (s.singleLine) break;
      parts.push(
        line.closedCount > 0
          ? `${line.closedCount} of ${plural(total, 'class', 'classes')} closed`
          : plural(total, 'class', 'classes')
      );
      break;
    }
    case 'students-scheduled':
      parts.push(
        `${plural(line.students.length, 'student', 'students')} scheduled`
      );
      break;
    case 'needs-grading':
      parts.push(line.count > 0 ? `${line.count} to grade` : 'Needs grading');
      break;
    case 'grading-unknown':
      break;
    case 'scores-unpublished':
      if (counts) parts.push(`${line.submitted} submitted`);
      break;
    case 'view-only':
      parts.push('View only');
      break;
    case 'done':
      if (line.scoresPublished) parts.push('Scores published');
      break;
  }
  if (line.kind !== 'needs-grading' && s.grading === 'needs-grading')
    parts.push('Needs grading');
  return parts.join(' · ');
}

/** One class's grey text, without its status word. */
export function classDetailText(
  c: AssignedClass,
  nowMs: number,
  bellLabel: string | null,
  counts = true
): string {
  if (c.status === 'scheduled' && c.opensAt != null)
    return `Opens ${formatOpensAt(c.opensAt, nowMs)}`;
  if (c.status === 'ready') return bellLabel ?? '';
  return counts ? turnedIn(c.submitted, c.total) : '';
}

/** D6/D8: the main button's label. */
export function mainActionLabel(
  action: AssignedMainAction,
  needsGrading: number | null
): string {
  switch (action.kind) {
    case 'open':
      return action.classLabel ? `Open for ${action.classLabel}` : 'Open';
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

/** Per-class buttons in the expanded row (D6). */
export type ClassActionKind =
  'open' | 'pause' | 'resume' | 'close' | 'reopen' | 'monitor';

export function classActions(status: ClassStatus): ClassActionKind[] {
  switch (status) {
    case 'open':
      return ['pause', 'close'];
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
