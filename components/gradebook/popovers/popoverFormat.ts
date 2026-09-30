import type {
  GradebookFlagDef,
  GradebookHistoryEntry,
  GradebookKind,
} from '@/utils/gradebook/gradebookCore';

export const KIND_LABELS: Record<GradebookKind, string> = {
  quiz: 'Quiz',
  'video-activity': 'Video activity',
  'guided-learning': 'Guided learning',
  flashcards: 'Flashcards',
  projects: 'Project',
  'mini-app': 'Mini app',
  'activity-wall': 'Activity wall',
};

// Flag colors are Tailwind hue names; full class strings keep them in the build.
const FLAG_SWATCH: Record<string, { solid: string; ring: string }> = {
  rose: {
    solid: 'bg-rose-600 text-white',
    ring: 'text-rose-700 ring-rose-600',
  },
  red: { solid: 'bg-red-600 text-white', ring: 'text-red-700 ring-red-600' },
  slate: {
    solid: 'bg-slate-600 text-white',
    ring: 'text-slate-700 ring-slate-600',
  },
  amber: {
    solid: 'bg-amber-500 text-slate-900',
    ring: 'text-amber-700 ring-amber-500',
  },
  orange: {
    solid: 'bg-orange-500 text-white',
    ring: 'text-orange-700 ring-orange-500',
  },
  sky: { solid: 'bg-sky-600 text-white', ring: 'text-sky-700 ring-sky-600' },
  blue: {
    solid: 'bg-blue-600 text-white',
    ring: 'text-blue-700 ring-blue-600',
  },
  emerald: {
    solid: 'bg-emerald-600 text-white',
    ring: 'text-emerald-700 ring-emerald-600',
  },
  teal: {
    solid: 'bg-teal-600 text-white',
    ring: 'text-teal-700 ring-teal-600',
  },
  lime: {
    solid: 'bg-lime-600 text-white',
    ring: 'text-lime-700 ring-lime-600',
  },
};

export function flagSwatch(color: string) {
  return FLAG_SWATCH[color] ?? FLAG_SWATCH.slate;
}

export function fmtPoints(n: number | null): string {
  if (n === null) return '';
  return String(Math.round(n * 10) / 10);
}

export function fmtPct(n: number | null): string {
  return n === null ? '' : `${Math.round(n)}%`;
}

export function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function fmtDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function flagNames(v: unknown, defs: GradebookFlagDef[]): string {
  const ids = Array.isArray(v) ? (v as string[]) : [];
  if (ids.length === 0) return 'none';
  return ids.map((id) => defs.find((d) => d.id === id)?.name ?? id).join(', ');
}

/** One history line in plain words: what changed, before and after. */
export function describeHistory(
  e: GradebookHistoryEntry,
  defs: GradebookFlagDef[]
): string {
  const num = (v: unknown) => (typeof v === 'number' ? fmtPoints(v) : 'none');
  switch (e.field) {
    case 'override':
      return e.after === null
        ? `Score reverted from ${num(e.before)}`
        : `Score ${num(e.before)} to ${num(e.after)}`;
    case 'fill':
      return `Filled with ${num(e.after)}`;
    case 'comment': {
      const after = e.after as { shared?: boolean } | null;
      if (!after) return 'Comment removed';
      return after.shared ? 'Comment saved, shared' : 'Comment saved';
    }
    case 'publish':
      return e.after === 'published'
        ? 'Published for student'
        : e.after === 'unpublished'
          ? 'Unpublished for student'
          : 'Publish follows the class';
    case 'flags': {
      const b =
        (e.before as { flags?: string[]; suppressedAuto?: string[] } | null) ??
        {};
      const a =
        (e.after as { flags?: string[]; suppressedAuto?: string[] } | null) ??
        {};
      const cleared = (a.suppressedAuto ?? []).filter(
        (id) => !(b.suppressedAuto ?? []).includes(id)
      );
      if (cleared.length)
        return `Auto flag cleared: ${flagNames(cleared, defs)}`;
      return `Flags ${flagNames(b.flags, defs)} to ${flagNames(a.flags, defs)}`;
    }
  }
}
