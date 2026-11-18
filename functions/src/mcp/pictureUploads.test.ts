import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';

const h = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  granted: true,
  deactivated: false,
  uploads: [] as { name: string; type: string; bytes: number }[],
}));

vi.mock('../featureGrant', () => ({
  isGlobalFeatureGranted: () => Promise.resolve(h.granted),
}));
vi.mock('./eligibility', () => ({
  isDeactivatedOperatorMember: () => Promise.resolve(h.deactivated),
}));
vi.mock('./drive', () => ({
  driveTokenFor: () => Promise.resolve('token'),
  claudePictureFolder: () => Promise.resolve('folder'),
  readDriveBytes: () => Promise.resolve({ data: Buffer.from('x') }),
  uploadPrivateImage: (
    _t: string,
    _f: string,
    bytes: Buffer,
    type: string,
    name: string
  ) => {
    h.uploads.push({ name, type, bytes: bytes.length });
    return Promise.resolve(`drive-${h.uploads.length}`);
  },
}));

import {
  MAX_UPLOADS_PER_TICKET,
  UPLOAD_TICKET_MS,
  cleanName,
  isPictureRef,
  issueUploadTicket,
  resolvePicture,
  savePictureUpload,
} from './pictureUploads';

const docAt = (path: string) => ({
  path,
  get: () => {
    const data = h.docs.get(path);
    return Promise.resolve({
      exists: !!data,
      data: () => data,
      get: (k: string) => data?.[k],
    });
  },
  set: (data: Record<string, unknown>) => {
    h.docs.set(path, data);
    return Promise.resolve();
  },
  update: (data: Record<string, unknown>) => {
    h.docs.set(path, { ...h.docs.get(path), ...data });
    return Promise.resolve();
  },
});
type Ref = ReturnType<typeof docAt>;
const collection = (c: string) => ({
  doc: (id: string) => ({
    ...docAt(`${c}/${id}`),
    collection: (sub: string) => collection(`${c}/${id}/${sub}`),
  }),
});
const db = {
  doc: docAt,
  collection,
  runTransaction: <T>(
    fn: (tx: {
      get: (r: Ref) => ReturnType<Ref['get']>;
      update: (r: Ref, d: Record<string, unknown>) => void;
    }) => Promise<T>
  ) =>
    fn({
      get: (r) => r.get(),
      update: (r, d) => void r.update(d),
    }),
} as unknown as Firestore;

const ctx = { db, uid: 'u1', email: 'a@b.org', grantId: 'g1' };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const ticketPath = (t: string) =>
  `mcp_picture_upload_tickets/${createHash('sha256').update(t).digest('hex')}`;

beforeEach(() => {
  h.docs.clear();
  h.uploads = [];
  h.granted = true;
  h.deactivated = false;
  h.docs.set('users/u1/mcp_grants/g1', {});
});

describe('picture upload tickets', () => {
  it('issues a ticket with an upload address and a page link', async () => {
    const out = await issueUploadTicket(ctx, 1000);
    expect(out.page_url).toMatch(/\/claude-pictures#/);
    expect(out.page_url.endsWith(out.ticket)).toBe(true);
    expect(h.docs.get(ticketPath(out.ticket))).toMatchObject({
      uid: 'u1',
      expiresAt: 1000 + UPLOAD_TICKET_MS,
    });
  });

  it('refuses a ticket when the flag is off', async () => {
    h.granted = false;
    await expect(issueUploadTicket(ctx)).rejects.toThrow(/not turned on/);
  });
});

describe('savePictureUpload', () => {
  const start = async () => (await issueUploadTicket(ctx, 0)).ticket;

  it('saves a PNG to Drive and returns its ref', async () => {
    const ticket = await start();
    const out = await savePictureUpload(
      db,
      { ticket, body: PNG, fileName: 'Cell%20diagram.png' },
      10
    );
    expect(out.status).toBe(200);
    const ref = (out.body as { ref: string }).ref;
    expect(isPictureRef(ref)).toBe(true);
    expect(h.uploads).toEqual([
      { name: 'Cell diagram.png', type: 'image/png', bytes: PNG.length },
    ]);
    const picture = await resolvePicture(ctx, ref);
    expect(picture).toMatchObject({ uid: 'u1', driveId: 'drive-1' });
  });

  it('rejects an unknown or expired ticket', async () => {
    expect(
      (await savePictureUpload(db, { ticket: 'x'.repeat(40), body: PNG }))
        .status
    ).toBe(401);
    const ticket = await start();
    expect(
      (await savePictureUpload(db, { ticket, body: PNG }, UPLOAD_TICKET_MS + 1))
        .status
    ).toBe(401);
  });

  it('stops after the ticket is used up', async () => {
    const ticket = await start();
    h.docs.set(ticketPath(ticket), {
      ...h.docs.get(ticketPath(ticket)),
      uses: MAX_UPLOADS_PER_TICKET,
    });
    expect((await savePictureUpload(db, { ticket, body: PNG }, 1)).status).toBe(
      401
    );
  });

  it('refuses a disconnected grant or a flag turned off', async () => {
    const ticket = await start();
    h.docs.set('users/u1/mcp_grants/g1', { revokedAt: 5 });
    expect((await savePictureUpload(db, { ticket, body: PNG }, 1)).status).toBe(
      403
    );
    h.docs.set('users/u1/mcp_grants/g1', {});
    h.granted = false;
    expect((await savePictureUpload(db, { ticket, body: PNG }, 1)).status).toBe(
      403
    );
    expect(h.uploads).toHaveLength(0);
  });

  it('refuses files that are not pictures or are too big', async () => {
    const ticket = await start();
    expect(
      (
        await savePictureUpload(
          db,
          { ticket, body: Buffer.from('%PDF-1.4') },
          1
        )
      ).status
    ).toBe(415);
    expect(
      (
        await savePictureUpload(
          db,
          { ticket, body: Buffer.alloc(9 * 1024 * 1024) },
          1
        )
      ).status
    ).toBe(413);
    expect(h.uploads).toHaveLength(0);
  });
});

describe('resolvePicture', () => {
  it("never resolves another teacher's picture", async () => {
    h.docs.set('users/u1/claude_pictures/AAAAAAAAAAAAAAAA', {
      uid: 'u2',
      driveId: 'd',
    });
    await expect(
      resolvePicture(ctx, 'picture:AAAAAAAAAAAAAAAA')
    ).rejects.toThrow(/No picture matches/);
    await expect(resolvePicture(ctx, 'picture:bad')).rejects.toThrow(
      /not a picture ref/
    );
  });
});

describe('cleanName', () => {
  it('keeps a readable name with the real extension', () => {
    expect(cleanName('a/b:c.JPG', 'f', 'image/png')).toBe('a_b_c.png');
    expect(cleanName(undefined, 'picture-1', 'image/webp')).toBe(
      'picture-1.webp'
    );
    expect(cleanName('%E0%A4', 'f', 'image/gif')).toBe('%E0%A4.gif');
  });
});
