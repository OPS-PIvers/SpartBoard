// Admin-only tools that ask the tour-anchor-mapper routine to tag controls before any step uses them.
import * as admin from '../firebaseAdmin';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ToolError, reserveWrite, type ToolContext } from './activity';
import { assertAccess } from './glTools';
import {
  readyAnchorRef,
  requestFingerprint,
  settingsFieldAnchor,
} from './glAnchorRequests';
import { TOUR_ANCHOR_LIST } from './tourAnchorList';
import { WIDGET_TYPE_LIST } from './widgetTypeList';
import { TOUR_ANCHOR_BATCHES, TOUR_ANCHOR_QUEUE } from '../tourAnchorQueue';
import { CREATES, READ_ONLY, run } from './toolKit';

export const MAX_CONTROLS_PER_REQUEST = 10;
export const MAX_OPEN_REQUESTS = 50;
const LIST_CAP = 200;

const KNOWN_ANCHORS = new Set(TOUR_ANCHOR_LIST.map((a) => a.id));
const WIDGET_TYPES = new Set(WIDGET_TYPE_LIST);

export const anchorRequestInput = z
  .object({
    role: z
      .string()
      .regex(/^[a-z]{2,40}$/, 'role is a lowercase ARIA role, e.g. "button".'),
    name: z.string().trim().min(1).max(200),
    where: z.string().trim().min(1).max(300),
    widget_type: z.string().min(1).max(60).optional(),
    near_anchor: z.string().min(1).max(120).optional(),
  })
  .strict();
export type AnchorRequestInput = z.infer<typeof anchorRequestInput>;

export type RequestOutcome =
  | { kind: 'exists'; anchor: string }
  | { kind: 'request'; fingerprint: string; context: Record<string, unknown> };

/** Validates one control and returns its settings anchor, or the queue item to create. */
export function planControlRequest(
  c: AnchorRequestInput,
  at: string
): RequestOutcome {
  const widgetType = c.widget_type ?? null;
  if (widgetType && !WIDGET_TYPES.has(widgetType))
    throw new ToolError(`${at}.widget_type "${widgetType}" is not a widget.`);
  const near = c.near_anchor?.split(/[:#]/)[0] ?? null;
  if (near && !KNOWN_ANCHORS.has(near))
    throw new ToolError(
      `${at}.near_anchor "${c.near_anchor}" is not a SpartBoard tour anchor (list_tour_anchors).`
    );
  const field = settingsFieldAnchor(c.role, c.name, widgetType);
  if (field) return { kind: 'exists', anchor: field };
  return {
    kind: 'request',
    fingerprint: requestFingerprint(c.role, c.name, widgetType),
    context: {
      suggestedId: null,
      role: c.role,
      name: c.name,
      widgetType,
      pathname: '/',
      nearestAnchor: near,
      ancestors: [],
      htmlExcerpt: '',
      requestNote: c.where,
    },
  };
}

interface QueueData {
  status?: unknown;
  anchorId?: unknown;
  widgetType?: unknown;
  prUrl?: unknown;
  reason?: unknown;
  role?: unknown;
  name?: unknown;
  requestNote?: unknown;
  occurrences?: unknown;
  requested?: unknown;
  requestedAt?: { toMillis?: () => number };
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/** What Claude sees for a queue item: ready once this build knows the anchor the routine tagged. */
export function requestStatus(data: QueueData) {
  const ref = readyAnchorRef(data);
  const anchorId = str(data.anchorId);
  const known = !!anchorId && KNOWN_ANCHORS.has(anchorId.split(/[:#]/)[0]);
  const status =
    data.status === 'needs-human'
      ? 'needs_human'
      : data.status === 'open'
        ? 'open'
        : known
          ? 'ready'
          : 'pr_open';
  return {
    status,
    ...(status === 'ready' ? { anchor_ready: ref ?? anchorId } : {}),
    ...(status === 'ready' && !ref ? { needs_widget_type: true } : {}),
    ...(str(data.prUrl) ? { pr_url: str(data.prUrl) } : {}),
    ...(status === 'needs_human' && str(data.reason)
      ? { reason: str(data.reason) }
      : {}),
  };
}

export function registerAnchorRequestTools(
  server: McpServer,
  ctx: ToolContext
): void {
  server.registerTool(
    'request_tour_anchors',
    {
      title: 'Ask for live tour anchors',
      description:
        'Admins only. Asks a developer to tag controls that have no live tour anchor yet, before any step uses them. Check list_tour_anchors first. Each control is described by its ARIA role, its English accessible name, where it is, and the widget it sits on. A routine opens a pull request that tags them, and each anchor works once that change is deployed. A settings drawer control that already has an anchor comes back at once. Follow progress with list_tour_anchor_requests, then use anchor_ready in tour.anchor. Until then, a step can still point at the control with anchor "" and a fallback.',
      inputSchema: {
        controls: z
          .array(anchorRequestInput)
          .min(1)
          .max(MAX_CONTROLS_PER_REQUEST)
          .describe(
            'role: the ARIA role, e.g. "button" or "switch". name: the English accessible name. where: where it is and what it does, e.g. "Quiz editor, beside Add question; opens the question bank". widget_type: the widget it sits on, if any. near_anchor: an anchor next to it, if any.'
          ),
      },
      annotations: CREATES,
    },
    ({ controls }) =>
      run('request_tour_anchors', ctx, async () => {
        await assertAccess(ctx, 'building');
        const plans = controls.map((c, i) =>
          planControlRequest(c, `controls[${i}]`)
        );
        const wanted = new Map<
          string,
          Extract<RequestOutcome, { kind: 'request' }>
        >();
        for (const p of plans)
          if (p.kind === 'request') wanted.set(p.fingerprint, p);
        const refs = [...wanted.keys()].map((fp) =>
          ctx.db.doc(`${TOUR_ANCHOR_QUEUE}/${fp}`)
        );
        const snaps = refs.length ? await ctx.db.getAll(...refs) : [];
        const stored = new Map(
          snaps
            .filter((s) => s.exists)
            .map((s) => [s.id, s.data() as QueueData])
        );
        const fresh = [...wanted.values()].filter(
          (p) => !stored.has(p.fingerprint)
        );
        // A control a saved step already queued joins the list without changing its item.
        const adopt = [...stored].filter(([, d]) => d.requested !== true);
        if (fresh.length > 0 || adopt.length > 0) {
          const open = await ctx.db
            .collection(TOUR_ANCHOR_QUEUE)
            .where('status', '==', 'open')
            .count()
            .get();
          if (
            fresh.length > 0 &&
            open.data().count + fresh.length > MAX_OPEN_REQUESTS
          )
            throw new ToolError(
              `${MAX_OPEN_REQUESTS} controls are already waiting for an anchor. Ask again once the routine has worked through them.`
            );
          await reserveWrite(ctx);
          const now = admin.firestore.FieldValue.serverTimestamp();
          const batch = ctx.db.batch();
          for (const p of fresh) {
            batch.create(ctx.db.doc(`${TOUR_ANCHOR_QUEUE}/${p.fingerprint}`), {
              ...p.context,
              fingerprint: p.fingerprint,
              status: 'open',
              occurrences: [],
              requested: true,
              requestedAt: now,
              firstSeenAt: now,
              updatedAt: now,
            });
          }
          for (const [id, d] of adopt) {
            batch.update(ctx.db.doc(`${TOUR_ANCHOR_QUEUE}/${id}`), {
              requested: true,
              ...(d.requestedAt ? {} : { requestedAt: now }),
            });
          }
          // The batch doc wakes the routine (tourAnchorBatchTrigger).
          if (fresh.length > 0)
            batch.set(ctx.db.collection(TOUR_ANCHOR_BATCHES).doc(), {
              setId: null,
              fingerprints: fresh.map((p) => p.fingerprint),
              createdAt: now,
            });
          await batch.commit();
        }
        const freshIds = new Set(fresh.map((p) => p.fingerprint));
        return {
          controls: controls.map((c, i) => {
            const p = plans[i];
            const head = { role: c.role, name: c.name };
            if (p.kind === 'exists')
              return { ...head, status: 'ready', anchor_ready: p.anchor };
            if (freshIds.has(p.fingerprint))
              return { ...head, fingerprint: p.fingerprint, status: 'open' };
            return {
              ...head,
              fingerprint: p.fingerprint,
              ...requestStatus(stored.get(p.fingerprint) ?? {}),
            };
          }),
          ...(fresh.length ? { queued: fresh.length } : {}),
        };
      })
  );

  server.registerTool(
    'list_tour_anchor_requests',
    {
      title: 'List live tour anchor requests',
      description:
        'Admins only. Lists the controls Claude asked to have tagged with request_tour_anchors, newest first, with their status: open (waiting for the routine), pr_open (a pull request tags it, not deployed yet), ready (use anchor_ready in tour.anchor; needs_widget_type means add ":<type>" yourself) or needs_human (reason says why the routine could not place it). Steps saved with anchor "" show their own anchor_ready in get_live_tour instead.',
      inputSchema: {
        status: z
          .enum(['open', 'pr_open', 'ready', 'needs_human'])
          .optional()
          .describe('Only requests in this state.'),
      },
      annotations: READ_ONLY,
    },
    ({ status }) =>
      run('list_tour_anchor_requests', ctx, async () => {
        await assertAccess(ctx, 'building');
        const snap = await ctx.db
          .collection(TOUR_ANCHOR_QUEUE)
          .where('requested', '==', true)
          .limit(LIST_CAP)
          .get();
        const millis = (d: QueueData) => d.requestedAt?.toMillis?.() ?? 0;
        const rows = snap.docs
          .map((d) => ({ id: d.id, data: d.data() }))
          .sort((a, b) => millis(b.data) - millis(a.data))
          .map(({ id, data }) => ({
            fingerprint: id,
            role: str(data.role) ?? '',
            name: str(data.name) ?? '',
            ...(str(data.widgetType)
              ? { widget_type: str(data.widgetType) }
              : {}),
            where: str(data.requestNote) ?? '',
            ...requestStatus(data),
            ...(millis(data)
              ? { requested_at: new Date(millis(data)).toISOString() }
              : {}),
          }))
          .filter((r) => !status || r.status === status);
        return { requests: rows };
      })
  );
}
