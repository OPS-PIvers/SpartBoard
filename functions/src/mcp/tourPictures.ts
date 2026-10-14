// Step pictures from the browser run (LIVE_TOUR_ONE_SHOT.md D12a): a 30-minute ticket, then plain POSTs of the pictures.
import * as admin from 'firebase-admin';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { publicOrigin } from './config';
import { ToolError, type ToolContext } from './activity';
import { isAdmin, loadSet, saveSet, type GlSet } from './glTools';
import { grantRef } from './grants';
import { GL_MEDIA_MARKER } from '../glMediaReferences';

export const PICTURE_TICKETS = 'mcp_tour_picture_tickets';
export const PICTURE_TICKET_MS = 30 * 60 * 1000;
export const MAX_PICTURE_BYTES = 2 * 1024 * 1024;
const MAX_PICTURES = 40;
// Uploads one ticket allows, so a leaked ticket can't be replayed without limit.
export const MAX_TICKET_USES = 20;
const DATA_URL = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/;

const hashOf = (ticket: string) =>
  createHash('sha256').update(ticket).digest('hex');

// The direct functions URL, since cloud sessions' egress proxies refuse the hosting rewrite on *.web.app.
export const picturesUrl = (): string => {
  const project = process.env.GCLOUD_PROJECT;
  if (!project || process.env.MCP_PUBLIC_ORIGIN) return hostingPicturesUrl();
  return `https://us-central1-${project}.cloudfunctions.net/mcpServer/tour-pictures`;
};
export const hostingPicturesUrl = (): string =>
  `${publicOrigin()}/mcp/tour-pictures`;

/** A ticket, good for 30 minutes, that lets the browser-run script set this tour's step pictures. */
export async function issuePictureTicket(
  ctx: ToolContext,
  setId: string,
  now = Date.now()
) {
  const ticket = randomBytes(32).toString('base64url');
  const expiresAt = now + PICTURE_TICKET_MS;
  await ctx.db.collection(PICTURE_TICKETS).doc(hashOf(ticket)).set({
    uid: ctx.uid,
    email: ctx.email,
    grantId: ctx.grantId,
    setId,
    expiresAt,
  });
  return {
    upload_url: picturesUrl(),
    // Same endpoint through the hosting rewrite; use it only if upload_url is unreachable.
    upload_url_fallback: hostingPicturesUrl(),
    ticket,
    expires_at: new Date(expiresAt).toISOString(),
  };
}

export const pictureUpload = z.object({
  ticket: z.string().min(20).max(200),
  pictures: z
    .array(
      z.object({
        step_id: z.string().min(1).max(100),
        image: z.string().max(Math.ceil((MAX_PICTURE_BYTES * 4) / 3) + 40),
        w: z.number().int().min(1).max(4000),
        h: z.number().int().min(1).max(4000),
      })
    )
    .min(1)
    .max(MAX_PICTURES),
});

export type PictureUpload = z.infer<typeof pictureUpload>;

/** The context a live ticket was issued under; batches of pictures may reuse it until it expires. */
async function readTicket(
  db: admin.firestore.Firestore,
  ticket: string,
  now: number
): Promise<{ ctx: ToolContext; setId: string }> {
  const ref = db.collection(PICTURE_TICKETS).doc(hashOf(ticket));
  const snap = await ref.get();
  const data = snap.data() as
    | {
        uid: string;
        email: string;
        grantId: string;
        setId: string;
        expiresAt: number;
        uses?: number;
      }
    | undefined;
  const spent = !!data && (data.uses ?? 0) >= MAX_TICKET_USES;
  if (!data || data.expiresAt < now || spent) {
    if (data) await ref.delete().catch(() => undefined);
    throw new ToolError(
      'That ticket is unknown, expired or used up. Call start_live_tour_picture_upload again.'
    );
  }
  await ref.update({ uses: (data.uses ?? 0) + 1 });
  const { setId, uid, email, grantId } = data;
  return {
    ctx: { db, uid, email, grantId },
    setId,
  };
}

type Step = GlSet['steps'][number] & {
  tour?: { anchor?: string; thumbnail?: unknown };
};

/** Saves each picture as its step's thumbnail; steps without a control are skipped. */
export async function savePictures(
  db: admin.firestore.Firestore,
  body: PictureUpload,
  now = Date.now()
) {
  const { ctx, setId } = await readTicket(db, body.ticket, now);
  const grant = await grantRef(db, ctx.uid, ctx.grantId).get();
  if (!grant.exists || grant.get('revokedAt') != null)
    throw new ToolError('This SpartBoard connection was disconnected.');
  if (!(await isAdmin(ctx)))
    throw new ToolError('Only SpartBoard admins can set live tour pictures.');
  const loaded = await loadSet(ctx, 'building', setId);
  if (loaded.set.mode !== 'tour')
    throw new ToolError('That set is not a live tour.');
  const steps = loaded.set.steps as Step[];
  const bucket = admin.storage().bucket();
  const saved: string[] = [];
  const skipped: { step_id: string; reason: string }[] = [];
  const thumbs = new Map<
    string,
    { url: string; anchor: string; w: number; h: number }
  >();
  for (const [i, pic] of body.pictures.entries()) {
    const step = steps.find((s) => s.id === pic.step_id);
    const anchor = step?.tour?.anchor;
    if (!step || !anchor) {
      skipped.push({
        step_id: pic.step_id,
        reason: step ? 'The step has no control.' : 'No step has that id.',
      });
      continue;
    }
    const match = DATA_URL.exec(pic.image);
    if (!match) {
      skipped.push({
        step_id: pic.step_id,
        reason: 'Not a PNG, JPEG or WebP data URL.',
      });
      continue;
    }
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > MAX_PICTURE_BYTES) {
      skipped.push({
        step_id: pic.step_id,
        reason: 'The picture is over 2 MB.',
      });
      continue;
    }
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const path = `users/${ctx.uid}/hotspot_images/${now}-tour-${i + 1}.${ext}`;
    const token = randomUUID();
    await bucket.file(path).save(bytes, {
      resumable: false,
      contentType: `image/${match[1]}`,
      metadata: {
        metadata: {
          [GL_MEDIA_MARKER]: '1',
          firebaseStorageDownloadTokens: token,
        },
      },
    });
    thumbs.set(step.id, {
      url: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`,
      anchor,
      w: pic.w,
      h: pic.h,
    });
    saved.push(step.id);
  }
  if (thumbs.size > 0) {
    const next = {
      ...loaded.set,
      steps: steps.map((s) => {
        const thumbnail = thumbs.get(s.id);
        return thumbnail && s.tour
          ? { ...s, tour: { ...s.tour, thumbnail } }
          : s;
      }),
    } as GlSet;
    await saveSet(ctx, loaded, next, 'update');
  }
  return { set_id: setId, saved, skipped };
}
