import type { Timestamp } from 'firebase/firestore';
import type { GuidedLearningSet, WidgetType } from '@/types';
import { TOUR_ANCHORS, type TourAnchorDef } from '@/config/tourAnchors';

// Untagged recorded clicks, queued per project for the anchor-mapping routine (Live Tours v2).
export const TOUR_ANCHOR_QUEUE_COLLECTION = 'tour_anchor_queue';
export const TOUR_ANCHOR_BATCHES_COLLECTION = 'tour_anchor_batches';

export type TourAnchorQueueStatus =
  | 'open'
  | 'pr-open'
  | 'mapped'
  | 'rebound'
  | 'needs-human';

export interface TourAnchorAncestor {
  tag: string;
  testId?: string;
  ariaLabel?: string;
  role?: string;
}

/** What the recorder captured about an untagged click; text is already redacted. */
export interface UnmappedAnchorContext {
  suggestedId: string | null;
  role: string | null;
  name: string | null;
  widgetType: WidgetType | null;
  pathname: string;
  nearestAnchor: string | null;
  /** Innermost first, at most 8. */
  ancestors: TourAnchorAncestor[];
  htmlExcerpt: string;
}

export interface TourAnchorOccurrence {
  setId: string;
  stepId: string;
}

export interface TourAnchorQueueItem extends UnmappedAnchorContext {
  fingerprint: string;
  status: TourAnchorQueueStatus;
  occurrences: TourAnchorOccurrence[];
  anchorId?: string;
  prUrl?: string;
  reason?: string;
  firstSeenAt?: Timestamp;
  updatedAt?: Timestamp;
  reboundAt?: Timestamp;
}

/** One fingerprint's context and the recorded steps that clicked it, ready to queue. */
export interface UnmappedQueueEntry {
  fingerprint: string;
  context: UnmappedAnchorContext;
  occurrences: TourAnchorOccurrence[];
}

type Registry = Readonly<Record<string, TourAnchorDef>>;

const ancestorKey = (a: TourAnchorAncestor) =>
  [a.tag, a.testId ?? '', a.ariaLabel ?? '', a.role ?? ''].join(',');

/** The string a fingerprint hashes: widget type, pathname, ancestor chain and name. */
export const fingerprintSource = (ctx: UnmappedAnchorContext): string =>
  [
    ctx.widgetType ?? '',
    ctx.pathname,
    ctx.ancestors.map(ancestorKey).join('>'),
    ctx.name ?? '',
  ].join('|');

/** SHA-1 hex of the fingerprint source; the queue doc id. */
export async function anchorFingerprint(
  ctx: UnmappedAnchorContext
): Promise<string> {
  const bytes = new TextEncoder().encode(fingerprintSource(ctx));
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');
}

export const isFingerprint = (s: string) => /^[0-9a-f]{40}$/.test(s);

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const optStr = (v: unknown) => (typeof v === 'string' ? v : undefined);
const STATUSES: readonly TourAnchorQueueStatus[] = [
  'open',
  'pr-open',
  'mapped',
  'rebound',
  'needs-human',
];

/** Reads a queue doc, or null when it is malformed. */
export function parseQueueItem(
  id: string,
  data: unknown
): TourAnchorQueueItem | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const status = STATUSES.find((s) => s === d.status);
  if (!status) return null;
  const ancestors = Array.isArray(d.ancestors)
    ? d.ancestors.flatMap((a: unknown) => {
        if (!a || typeof a !== 'object') return [];
        const r = a as Record<string, unknown>;
        const tag = str(r.tag);
        if (!tag) return [];
        return [
          {
            tag,
            ...(optStr(r.testId) ? { testId: optStr(r.testId) } : {}),
            ...(optStr(r.ariaLabel) ? { ariaLabel: optStr(r.ariaLabel) } : {}),
            ...(optStr(r.role) ? { role: optStr(r.role) } : {}),
          },
        ];
      })
    : [];
  const occurrences = Array.isArray(d.occurrences)
    ? d.occurrences.flatMap((o: unknown) => {
        if (!o || typeof o !== 'object') return [];
        const r = o as Record<string, unknown>;
        const setId = str(r.setId);
        const stepId = str(r.stepId);
        return setId && stepId ? [{ setId, stepId }] : [];
      })
    : [];
  return {
    fingerprint: id,
    status,
    suggestedId: str(d.suggestedId),
    role: str(d.role),
    name: str(d.name),
    widgetType: str(d.widgetType) as WidgetType | null,
    pathname: str(d.pathname) ?? '',
    nearestAnchor: str(d.nearestAnchor),
    ancestors,
    htmlExcerpt: str(d.htmlExcerpt) ?? '',
    occurrences,
    ...(optStr(d.anchorId) ? { anchorId: optStr(d.anchorId) } : {}),
    ...(optStr(d.prUrl) ? { prUrl: optStr(d.prUrl) } : {}),
    ...(optStr(d.reason) ? { reason: optStr(d.reason) } : {}),
    ...(d.firstSeenAt ? { firstSeenAt: d.firstSeenAt as Timestamp } : {}),
    ...(d.updatedAt ? { updatedAt: d.updatedAt as Timestamp } : {}),
    ...(d.reboundAt ? { reboundAt: d.reboundAt as Timestamp } : {}),
  };
}

export type QueueDisplayState =
  | 'open'
  | 'pr-open'
  | 'waiting-deploy'
  | 'mapped'
  | 'rebound'
  | 'needs-human';

const inRegistry = (id: string | undefined, registry: Registry) =>
  !!id && Object.prototype.hasOwnProperty.call(registry, id);

/** What Tour Health shows; a PR's anchor counts as mapped once this build registers it. */
export function queueDisplayState(
  item: Pick<TourAnchorQueueItem, 'status' | 'anchorId'>,
  registry: Registry = TOUR_ANCHORS
): QueueDisplayState {
  if (item.status === 'open' || item.status === 'rebound') return item.status;
  if (item.status === 'needs-human') return 'needs-human';
  if (!item.anchorId) return 'pr-open';
  return inRegistry(item.anchorId, registry) ? 'mapped' : 'waiting-deploy';
}

/** The step anchor ref a rebind writes, or null when this build doesn't know the id. */
export function reboundAnchorRef(
  item: Pick<TourAnchorQueueItem, 'anchorId' | 'widgetType'>,
  registry: Registry = TOUR_ANCHORS
): string | null {
  const id = item.anchorId;
  if (!id || !inRegistry(id, registry)) return null;
  return registry[id].perWidgetType && item.widgetType
    ? `${id}:${item.widgetType}`
    : id;
}

export const canRebind = (
  item: TourAnchorQueueItem,
  registry: Registry = TOUR_ANCHORS
) =>
  queueDisplayState(item, registry) === 'mapped' && item.occurrences.length > 0;

/** Writes `anchorRef` into the set's steps still unmapped under this fingerprint. */
export function rebindSteps(
  set: GuidedLearningSet,
  fingerprint: string,
  stepIds: ReadonlySet<string>,
  anchorRef: string
): { set: GuidedLearningSet; count: number } {
  let count = 0;
  const steps = set.steps.map((step) => {
    if (!step.tour || step.tour.unmapped !== fingerprint) return step;
    if (!stepIds.has(step.id)) return step;
    count++;
    const tour = { ...step.tour, anchor: anchorRef };
    delete tour.unmapped;
    return { ...step, tour };
  });
  return { set: count > 0 ? { ...set, steps } : set, count };
}

/** Queue occurrences whose step a save deleted. */
export function removedOccurrences(
  stored: Pick<GuidedLearningSet, 'id' | 'steps'> | undefined,
  next: Pick<GuidedLearningSet, 'steps'>
): Array<TourAnchorOccurrence & { fingerprint: string }> {
  if (!stored || !Array.isArray(stored.steps)) return [];
  const kept = new Set(next.steps.map((s) => s.id));
  return stored.steps.flatMap((s) =>
    s.tour?.unmapped && !kept.has(s.id)
      ? [{ fingerprint: s.tour.unmapped, setId: stored.id, stepId: s.id }]
      : []
  );
}

const fenceFor = (text: string) => {
  const longest = Math.max(
    0,
    ...Array.from(text.matchAll(/`+/g), (m) => m[0].length)
  );
  return '`'.repeat(Math.max(3, longest + 1));
};

const code = (s: string) => `\`${s.replace(/`/g, "'")}\``;

const ancestorLabel = (a: TourAnchorAncestor) =>
  a.tag +
  (a.testId ? `[data-testid="${a.testId}"]` : '') +
  (a.role ? `[role="${a.role}"]` : '') +
  (a.ariaLabel ? `[aria-label="${a.ariaLabel}"]` : '');

export const COPY_INSTRUCTION =
  'Register an id in `config/tourAnchors.ts` and tag the element with `tourAttr`.';

type CopyEntry = UnmappedAnchorContext &
  Partial<Pick<TourAnchorQueueItem, 'fingerprint' | 'occurrences'>>;

/** A Markdown block with every captured field, one entry per untagged element. */
export function formatUnmappedAnchors(entries: readonly CopyEntry[]): string {
  const blocks = entries.map((e, i) => {
    const title = e.suggestedId ?? e.name ?? e.role ?? 'untagged element';
    const lines = [`## ${i + 1}. ${title}`, ''];
    const field = (label: string, value: string | null | undefined) => {
      if (value) lines.push(`- ${label}: ${value}`);
    };
    field('Fingerprint', e.fingerprint && code(e.fingerprint));
    field('Suggested id', e.suggestedId && code(e.suggestedId));
    field('Role', e.role);
    field('Name', e.name);
    field('Widget type', e.widgetType && code(e.widgetType));
    field('Page', code(e.pathname || '/'));
    field('Nearest anchor', e.nearestAnchor && code(e.nearestAnchor));
    field(
      'Ancestors (innermost first)',
      e.ancestors.length > 0
        ? e.ancestors.map((a) => code(ancestorLabel(a))).join(' > ')
        : null
    );
    field(
      'Clicked in',
      e.occurrences?.length
        ? e.occurrences.map((o) => `${o.setId} / ${o.stepId}`).join(', ')
        : null
    );
    if (e.htmlExcerpt) {
      const fence = fenceFor(e.htmlExcerpt);
      lines.push('', `${fence}html`, e.htmlExcerpt, fence);
    }
    return lines.join('\n');
  });
  return [COPY_INSTRUCTION, '', ...blocks]
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n');
}
