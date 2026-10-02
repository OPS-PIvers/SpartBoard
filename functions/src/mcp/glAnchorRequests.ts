// Queues live tour steps Claude saved with no anchor, so the tour-anchor-mapper routine can tag the control.
import * as admin from 'firebase-admin';
import { createHash } from 'node:crypto';
import { TOUR_ANCHOR_BATCHES, TOUR_ANCHOR_QUEUE } from '../tourAnchorQueue';

type Step = Record<string, unknown> & { id: string };
interface Tour {
  anchor?: unknown;
  fallback?: { role?: unknown; name?: unknown };
  unmapped?: unknown;
}

export interface MissingAnchorNote {
  where: string;
  widget_type?: string;
}

export interface AnchorRequest {
  fingerprint: string;
  context: {
    suggestedId: null;
    role: string;
    name: string;
    widgetType: string | null;
    pathname: string;
    nearestAnchor: string | null;
    ancestors: never[];
    htmlExcerpt: string;
    requestNote: string | null;
  };
  stepIds: string[];
}

/** SHA-1 of the request; the `claude` prefix keeps it apart from recorder fingerprints. */
export const requestFingerprint = (
  role: string,
  name: string,
  widgetType: string | null
) =>
  createHash('sha1')
    .update(['claude', widgetType ?? '', role, name].join('|'))
    .digest('hex');

const tourOf = (s: Step | undefined) => s?.tour as Tour | undefined;

/** Stamps `tour.unmapped` on fallback-only steps and returns the new queue requests; recorder fingerprints are kept as stored. */
export function planAnchorRequests(
  steps: readonly Step[],
  prior: readonly Step[],
  notes: ReadonlyMap<string, MissingAnchorNote>
): { steps: Step[]; requests: AnchorRequest[] } {
  const priorById = new Map(prior.map((s) => [s.id, s]));
  const requests = new Map<string, AnchorRequest>();
  let nearestAnchor: string | null = null;
  const out = steps.map((step) => {
    const tour = tourOf(step);
    if (!tour) return step;
    const anchor = typeof tour.anchor === 'string' ? tour.anchor : '';
    const priorTour = tourOf(priorById.get(step.id));
    const sameControl =
      priorTour?.fallback?.role === tour.fallback?.role &&
      priorTour?.fallback?.name === tour.fallback?.name;
    const next: Tour = { ...tour };
    // The stored fingerprint wins over whatever Claude sent while the step still names the same control.
    delete next.unmapped;
    if (anchor === '' && sameControl && typeof priorTour?.unmapped === 'string')
      next.unmapped = priorTour.unmapped;
    if (anchor !== '') {
      nearestAnchor = anchor.split(/[:#]/)[0];
    } else if (!next.unmapped && next.fallback) {
      const { role: r, name: n } = next.fallback;
      const role = typeof r === 'string' ? r : '';
      const name = typeof n === 'string' ? n : '';
      const note = notes.get(step.id);
      const widgetType = note?.widget_type ?? null;
      const fingerprint = requestFingerprint(role, name, widgetType);
      next.unmapped = fingerprint;
      const known = requests.get(fingerprint);
      if (known) known.stepIds.push(step.id);
      else
        requests.set(fingerprint, {
          fingerprint,
          stepIds: [step.id],
          context: {
            suggestedId: null,
            role,
            name,
            widgetType,
            pathname: '/',
            nearestAnchor,
            ancestors: [],
            htmlExcerpt: '',
            requestNote: note?.where ?? null,
          },
        });
    }
    return { ...step, tour: next };
  });
  return { steps: out, requests: [...requests.values()] };
}

/** Adds the queue items and one batch doc (which wakes the routine) to the save's write batch. */
export async function queueAnchorRequests(
  db: admin.firestore.Firestore,
  batch: admin.firestore.WriteBatch,
  setId: string,
  requests: readonly AnchorRequest[]
): Promise<number> {
  if (requests.length === 0) return 0;
  const refs = requests.map((r) =>
    db.doc(`${TOUR_ANCHOR_QUEUE}/${r.fingerprint}`)
  );
  const snaps = await db.getAll(...refs);
  const now = admin.firestore.FieldValue.serverTimestamp();
  requests.forEach((r, i) => {
    // Context, status and firstSeenAt only on create, so a stored note is kept and a PR-open or rebound item is never reopened.
    const created = !snaps[i].exists;
    batch.set(
      refs[i],
      {
        ...(created
          ? {
              ...r.context,
              fingerprint: r.fingerprint,
              status: 'open',
              firstSeenAt: now,
            }
          : {}),
        occurrences: admin.firestore.FieldValue.arrayUnion(
          ...r.stepIds.map((stepId) => ({ setId, stepId }))
        ),
        updatedAt: now,
      },
      { merge: true }
    );
  });
  batch.set(db.collection(TOUR_ANCHOR_BATCHES).doc(), {
    setId,
    fingerprints: requests.map((r) => r.fingerprint),
    createdAt: now,
  });
  return requests.length;
}
