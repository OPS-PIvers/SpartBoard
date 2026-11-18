// Pictures a teacher shares with Claude: a 30-minute ticket, raw-body POSTs into the teacher's Drive, then `picture:` refs.
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { createHash, randomBytes } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { PICTURE_UPLOAD_FEATURE_ID, publicOrigin } from './config';
import { ToolError, type ToolContext } from './activity';
import { grantRef } from './grants';
import { isDeactivatedOperatorMember } from './eligibility';
import {
  assetFolder,
  claudePictureFolder,
  copyPictureShared,
  driveTokenFor,
  readDriveBytes,
  trashDriveFile,
  uploadPrivateImage,
} from './drive';
import { READ_ONLY, CREATES, run } from './toolKit';
import { sniffImageType } from '../fetchImportImage';

export const PICTURE_UPLOAD_TICKETS = 'mcp_picture_upload_tickets';
/** Admin SDK only (rules default deny): users/{uid}/claude_pictures/{id}. */
export const PICTURES = 'claude_pictures';
const picturesOf = (db: Firestore, uid: string) =>
  db.collection('users').doc(uid).collection(PICTURES);
export const UPLOAD_TICKET_MS = 30 * 60 * 1000;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
/** Uploads one ticket allows, so a leaked ticket can't fill a Drive. */
export const MAX_UPLOADS_PER_TICKET = 30;
const LIST_WINDOW_MS = 24 * 60 * 60 * 1000;
const LIST_LIMIT = 20;
const SHOW_LIMIT = 6;
const SHOW_MAX_BYTES = 1_500_000;
const SHOW_TOTAL_BYTES = 4_000_000;
export const PICTURE_REF = /^picture:([A-Za-z0-9_-]{16})$/;
const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

export const PICTURE_TOOLS = [
  'start_picture_upload',
  'list_uploaded_pictures',
] as const;

const hashOf = (ticket: string) =>
  createHash('sha256').update(ticket).digest('hex');

export interface PictureDoc {
  uid: string;
  driveId: string;
  mimeType: string;
  name: string;
  bytes: number;
  createdAt: number;
}

export const isPictureRef = (value: string): boolean => PICTURE_REF.test(value);

/** The direct functions URL, since cloud sandboxes often refuse the hosting rewrite on *.web.app. */
export const pictureUploadUrl = (): string => {
  const project = process.env.GCLOUD_PROJECT;
  if (!project || process.env.MCP_PUBLIC_ORIGIN) return hostingUploadUrl();
  return `https://us-central1-${project}.cloudfunctions.net/mcpServer/picture-uploads`;
};
export const hostingUploadUrl = (): string =>
  `${publicOrigin()}/mcp/picture-uploads`;

export async function picturesOn(ctx: ToolContext): Promise<boolean> {
  const { isGlobalFeatureGranted } = await import('../featureGrant');
  return isGlobalFeatureGranted(
    ctx.db,
    PICTURE_UPLOAD_FEATURE_ID,
    ctx.email,
    ctx.uid
  );
}

export async function assertPicturesOn(ctx: ToolContext): Promise<void> {
  if (!(await picturesOn(ctx)))
    throw new ToolError(
      'Picture uploads through Claude are not turned on for this account yet.'
    );
}

/** A ticket, good for 30 minutes, for posting pictures into this teacher's Drive. */
export async function issueUploadTicket(ctx: ToolContext, now = Date.now()) {
  await assertPicturesOn(ctx);
  // Fails early with the reconnect message when SpartBoard can't reach their Drive.
  await driveTokenFor(ctx.uid);
  const ticket = randomBytes(32).toString('base64url');
  const expiresAt = now + UPLOAD_TICKET_MS;
  await ctx.db
    .collection(PICTURE_UPLOAD_TICKETS)
    .doc(hashOf(ticket))
    .set({
      uid: ctx.uid,
      email: ctx.email,
      grantId: ctx.grantId,
      expiresAt,
      // TTL field, so spent tickets are deleted.
      expireAt: Timestamp.fromMillis(expiresAt),
      uses: 0,
    });
  return {
    upload_url: pictureUploadUrl(),
    upload_url_fallback: hostingUploadUrl(),
    ticket,
    page_url: `${publicOrigin()}/claude-pictures#${ticket}`,
    expires_at: new Date(expiresAt).toISOString(),
    how_to_send: `POST each file as the raw request body. Send the headers Authorization: Bearer <ticket>, Content-Type: the image type, and X-File-Name: the file name. Example: curl -sS -X POST <upload_url> -H "Authorization: Bearer <ticket>" -H "Content-Type: image/png" -H "X-File-Name: slide1.png" --data-binary @slide1.png. The reply holds the picture's ref.`,
    if_you_cannot_send: `Give the teacher page_url. They drop or paste the pictures there. Then call list_uploaded_pictures.`,
    limits: 'PNG, JPEG, GIF or WebP. Up to 8 MB each.',
  };
}

export type UploadOutcome =
  | { status: 200; body: { ref: string; name: string; type: string } }
  | { status: 400 | 401 | 403 | 413 | 415; body: { error: string } };

/** Saves one posted picture to the ticket owner's Drive; the ticket is the only credential. */
export async function savePictureUpload(
  db: Firestore,
  input: { ticket: string; body: Buffer | undefined; fileName?: string },
  now = Date.now()
): Promise<UploadOutcome> {
  const ref = db.collection(PICTURE_UPLOAD_TICKETS).doc(hashOf(input.ticket));
  // Counted in a transaction, so parallel posts can't go past the cap.
  const owner = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as
      | {
          uid: string;
          email: string;
          grantId: string;
          expiresAt: number;
          uses?: number;
        }
      | undefined;
    if (
      !data ||
      data.expiresAt < now ||
      (data.uses ?? 0) >= MAX_UPLOADS_PER_TICKET
    )
      return null;
    tx.update(ref, { uses: (data.uses ?? 0) + 1 });
    return data;
  });
  if (!owner)
    return {
      status: 401,
      body: {
        error:
          'This upload link expired or was used up. Ask Claude for a new one.',
      },
    };
  const ctx: ToolContext = {
    db,
    uid: owner.uid,
    email: owner.email,
    grantId: owner.grantId,
  };
  const grant = await grantRef(db, ctx.uid, ctx.grantId).get();
  if (
    !grant.exists ||
    grant.get('revokedAt') != null ||
    (await isDeactivatedOperatorMember(db, ctx.email)) ||
    !(await picturesOn(ctx))
  )
    return {
      status: 403,
      body: { error: 'This SpartBoard connection can no longer add pictures.' },
    };
  const bytes = input.body;
  if (!bytes || bytes.length === 0)
    return { status: 400, body: { error: 'The picture was empty.' } };
  if (bytes.length > MAX_UPLOAD_BYTES)
    return { status: 413, body: { error: 'The picture is over 8 MB.' } };
  const type = sniffImageType(bytes);
  if (!type)
    return {
      status: 415,
      body: { error: 'Use a PNG, JPEG, GIF or WebP picture.' },
    };
  const id = randomBytes(12).toString('base64url');
  const name = cleanName(input.fileName, `picture-${id.slice(0, 6)}`, type);
  const token = await driveTokenFor(ctx.uid);
  const driveId = await uploadPrivateImage(
    token,
    await claudePictureFolder(token),
    bytes,
    type,
    name
  );
  const doc: PictureDoc = {
    uid: ctx.uid,
    driveId,
    mimeType: type,
    name,
    bytes: bytes.length,
    createdAt: now,
  };
  await picturesOf(db, ctx.uid).doc(id).set(doc);
  return { status: 200, body: { ref: `picture:${id}`, name, type } };
}

/** A readable file name with the right extension, from whatever the client sent. */
export function cleanName(
  raw: string | undefined,
  fallback: string,
  type: string
): string {
  let decoded = raw ?? '';
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Keep the raw header when it isn't URI-encoded.
  }
  const base =
    decoded
      // eslint-disable-next-line no-control-regex -- strips control characters from a client file name
      .replace(/[/\\:*?"<>|\u0000-\u001f]/g, '_')
      .replace(/\.[A-Za-z0-9]{1,5}$/, '')
      .trim()
      .slice(0, 80) || fallback;
  return `${base}.${EXTENSIONS[type]}`;
}

/** The teacher's own uploaded picture behind a `picture:` ref. */
export async function resolvePicture(
  ctx: ToolContext,
  ref: string
): Promise<PictureDoc> {
  const id = PICTURE_REF.exec(ref)?.[1];
  if (!id) throw new ToolError(`"${ref}" is not a picture ref.`);
  const snap = await picturesOf(ctx.db, ctx.uid).doc(id).get();
  const data = snap.data() as PictureDoc | undefined;
  if (!data || data.uid !== ctx.uid)
    throw new ToolError(
      `No picture matches ${ref}. Call list_uploaded_pictures for current refs.`
    );
  return data;
}

/** Bytes of a teacher's uploaded picture, read back from their Drive. */
export async function pictureBytes(
  ctx: ToolContext,
  picture: PictureDoc
): Promise<{ contentType: string; body: Buffer }> {
  const { data } = await readDriveBytes(
    await driveTokenFor(ctx.uid),
    picture.driveId
  );
  return { contentType: picture.mimeType, body: data };
}

/** Shared copies of the teacher's pictures in one Assets folder, made together and all trashed if one fails. */
export async function copyPicturesTo(
  ctx: ToolContext,
  token: string,
  folder: string,
  refs: readonly string[],
  maxBytes = MAX_UPLOAD_BYTES
): Promise<{ ref: string; driveId: string; name: string }[]> {
  if (refs.length === 0) return [];
  await assertPicturesOn(ctx);
  const pictures = await Promise.all(
    refs.map((ref) => resolvePicture(ctx, ref))
  );
  const big = pictures.findIndex((p) => p.bytes > maxBytes);
  if (big >= 0)
    throw new ToolError(
      `${refs[big]} is over ${Math.floor(maxBytes / 1024 / 1024)} MB, too big here. Ask the teacher for a smaller picture.`
    );
  const folderId = await assetFolder(token, folder);
  const stamp = Date.now();
  const results = await Promise.allSettled(
    pictures.map((p, i) =>
      copyPictureShared(
        token,
        folderId,
        p.driveId,
        `claude-${stamp}-${i + 1}-${p.name}`
      )
    )
  );
  const made = results.flatMap((r) =>
    r.status === 'fulfilled' ? [r.value] : []
  );
  const failed = results.find((r) => r.status === 'rejected');
  if (failed) {
    await Promise.all(made.map((id) => trashDriveFile(token, id)));
    throw failed.reason;
  }
  return refs.map((ref, i) => ({
    ref,
    driveId: made[i],
    name: pictures[i].name,
  }));
}

async function listPictures(ctx: ToolContext, now = Date.now()) {
  const snap = await picturesOf(ctx.db, ctx.uid)
    .where('createdAt', '>=', now - LIST_WINDOW_MS)
    .orderBy('createdAt', 'desc')
    .limit(LIST_LIMIT)
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as PictureDoc) }))
    .reverse();
}

export function registerPictureTools(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    'start_picture_upload',
    {
      title: 'Add pictures from the chat',
      description:
        'Use this when the teacher shares pictures in the chat and wants them in SpartBoard. It returns an upload ticket, good for 30 minutes. If you can run code and reach upload_url, send each attached file there yourself. Otherwise give the teacher page_url to drop the pictures in. Each saved picture gets a ref like picture:abc. Use refs in Guided Learning slides, the add_picture field of quiz and bank questions, or the term_picture and definition_picture fields of flashcards.',
      inputSchema: {},
      annotations: CREATES,
    },
    () => run('start_picture_upload', ctx, async () => issueUploadTicket(ctx))
  );

  server.registerTool(
    'list_uploaded_pictures',
    {
      title: 'List pictures the teacher added',
      description:
        "Lists pictures added in the last 24 hours, oldest first, with each one's ref. Set show_pictures to see the newest few, to tell which is which.",
      inputSchema: {
        show_pictures: z.boolean().optional(),
      },
      annotations: READ_ONLY,
    },
    async ({ show_pictures }): Promise<CallToolResult> => {
      const images: { ref: string; data: string; mimeType: string }[] = [];
      const result = await run('list_uploaded_pictures', ctx, async () => {
        await assertPicturesOn(ctx);
        const pictures = await listPictures(ctx);
        if (show_pictures) {
          const token = await driveTokenFor(ctx.uid);
          let total = 0;
          for (const p of pictures.slice(-SHOW_LIMIT).reverse()) {
            if (p.bytes > SHOW_MAX_BYTES || total + p.bytes > SHOW_TOTAL_BYTES)
              continue;
            total += p.bytes;
            const { data } = await readDriveBytes(token, p.driveId).catch(
              () => ({ data: null })
            );
            if (data)
              images.push({
                ref: `picture:${p.id}`,
                data: data.toString('base64'),
                mimeType: p.mimeType,
              });
          }
        }
        return {
          pictures: pictures.map((p) => ({
            ref: `picture:${p.id}`,
            name: p.name,
            type: p.mimeType,
            uploaded_at: new Date(p.createdAt).toISOString(),
          })),
          ...(pictures.length === 0
            ? {
                note: 'No pictures yet. Ask the teacher to finish on the upload page, then check again.',
              }
            : {}),
        };
      });
      if (result.isError || images.length === 0) return result;
      return {
        ...result,
        content: [
          ...result.content,
          ...images.flatMap(({ ref, data, mimeType }) => [
            { type: 'text' as const, text: ref },
            { type: 'image' as const, data, mimeType },
          ]),
        ],
      };
    }
  );
}

/** Mirrors MAX_FLASHCARD_IMAGE_BYTES in utils/flashcardImages.ts. */
export const MAX_CARD_PICTURE_BYTES = 5 * 1024 * 1024;
const CARD_IMAGES_FEATURE_ID = 'flashcard-card-images';

export interface CardPictureInput {
  term_picture?: string | null;
  definition_picture?: string | null;
}

/** Sets or clears card pictures from refs; returns a cleanup that trashes the new copies if the save fails. */
export async function applyCardPictures(
  ctx: ToolContext,
  inputs: readonly CardPictureInput[],
  cards: { termImageUrl?: string; definitionImageUrl?: string }[]
): Promise<() => Promise<void>> {
  const wanted: { card: number; side: 'term' | 'definition'; ref: string }[] =
    [];
  inputs.forEach((input, i) => {
    for (const side of ['term', 'definition'] as const) {
      const value = input[`${side}_picture`];
      if (value === null) delete cards[i][`${side}ImageUrl`];
      else if (value !== undefined) wanted.push({ card: i, side, ref: value });
    }
  });
  if (wanted.length === 0) return () => Promise.resolve();
  const { isGlobalFeatureGranted } = await import('../featureGrant');
  if (
    !(await isGlobalFeatureGranted(
      ctx.db,
      CARD_IMAGES_FEATURE_ID,
      ctx.email,
      ctx.uid
    ))
  )
    throw new ToolError(
      'Card pictures are not turned on for this account yet.'
    );
  const token = await driveTokenFor(ctx.uid);
  const copies = await copyPicturesTo(
    ctx,
    token,
    'FlashcardImages',
    wanted.map((w) => w.ref),
    MAX_CARD_PICTURE_BYTES
  );
  wanted.forEach((w, i) => {
    cards[w.card][`${w.side}ImageUrl`] =
      `https://lh3.googleusercontent.com/d/${copies[i].driveId}`;
  });
  return async () => {
    await Promise.all(copies.map((c) => trashDriveFile(token, c.driveId)));
  };
}
