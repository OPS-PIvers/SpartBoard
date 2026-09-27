// Single-use authorization codes, stored by hash with a TTL (plan: "Tokens").
import * as admin from 'firebase-admin';
import { AUTH_CODE_TTL_MS } from './config';
import { randomToken, sha256 } from './tokens';

type Firestore = admin.firestore.Firestore;

export interface AuthCodeDoc {
  uid: string;
  email: string;
  orgId: string | null;
  clientId: string;
  clientName: string;
  redirectUri: string;
  codeChallenge: string;
  expiresAt: number;
  expireAt: admin.firestore.Timestamp;
}

export async function mintAuthCode(
  db: Firestore,
  input: Omit<AuthCodeDoc, 'expiresAt' | 'expireAt'>,
  now = Date.now()
): Promise<string> {
  const code = randomToken();
  const expiresAt = now + AUTH_CODE_TTL_MS;
  const doc: AuthCodeDoc = {
    ...input,
    expiresAt,
    expireAt: admin.firestore.Timestamp.fromMillis(expiresAt),
  };
  await db.collection('mcp_oauth_codes').doc(sha256(code)).set(doc);
  return code;
}

/** Deletes the code whatever happens next, so a code can never be redeemed twice. */
export async function consumeAuthCode(
  db: Firestore,
  code: string,
  now = Date.now()
): Promise<AuthCodeDoc | null> {
  const ref = db.collection('mcp_oauth_codes').doc(sha256(code));
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    tx.delete(ref);
    const doc = snap.data() as AuthCodeDoc;
    return now > doc.expiresAt ? null : doc;
  });
}
