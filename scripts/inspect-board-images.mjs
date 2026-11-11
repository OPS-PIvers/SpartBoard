/**
 * Read-only: lists one teacher's boards with their image (sticker) and Links widgets,
 * so a "my picture vanished on reload" report can be told apart: widget gone (save lost)
 * or widget there with an image URL that no longer loads.
 *
 *   scripts/cloud-run.sh scripts/inspect-board-images.mjs <email>
 * Prints board names, widget ids, URL host and kind only; writes nothing.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const email = (process.argv[2] ?? '').trim().toLowerCase();
if (!email.includes('@')) {
  console.error('Usage: node scripts/inspect-board-images.mjs <email>');
  process.exit(1);
}

function loadCredentials() {
  const fromEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (fromEnv) return JSON.parse(fromEnv);
  const keyPath = join(__dirname, 'service-account-key.json');
  if (existsSync(keyPath)) return JSON.parse(readFileSync(keyPath, 'utf8'));
  console.error(
    'No credentials: set FIREBASE_SERVICE_ACCOUNT or add scripts/service-account-key.json'
  );
  process.exit(1);
}

const creds = loadCredentials();
const app = initializeApp(
  creds.type === 'cloud-proxy'
    ? { projectId: creds.project_id }
    : { credential: cert(creds) }
);
const db = getFirestore(app);

function describeUrl(raw) {
  if (typeof raw !== 'string' || raw === '') return '(none)';
  if (raw.startsWith('data:')) return `data URL (${raw.length} chars)`;
  if (raw.startsWith('blob:'))
    return 'blob URL (only valid in the tab that made it)';
  try {
    const u = new URL(raw);
    if (u.hostname === 'lh3.googleusercontent.com')
      return `Drive lh3 ${u.pathname}`;
    if (u.hostname === 'firebasestorage.googleapis.com')
      return `Firebase Storage${u.searchParams.has('token') ? ' (with token)' : ' (no token)'}`;
    return u.hostname;
  } catch {
    return `unparseable (${raw.slice(0, 40)})`;
  }
}

const iso = (v) => {
  if (typeof v === 'number') return new Date(v).toISOString();
  if (v && typeof v.toDate === 'function') return v.toDate().toISOString();
  return String(v ?? '-');
};

const member = await db.doc(`organizations/orono/members/${email}`).get();
let uid = member.get('uid');
if (!uid) {
  const users = await db
    .collection('users')
    .where('email', '==', email)
    .limit(2)
    .get();
  if (users.size === 1) uid = users.docs[0].id;
}
if (!uid) {
  console.error('No member doc or users doc with a uid for that address.');
  process.exit(1);
}
const boards = await db.collection(`users/${uid}/dashboards`).get();
console.log(`${boards.size} boards`);
for (const doc of boards.docs) {
  const d = doc.data();
  const widgets = Array.isArray(d.widgets) ? d.widgets : [];
  const stickers = widgets.filter((w) => w?.type === 'sticker');
  const links = widgets.filter((w) => w?.type === 'url');
  console.log(
    `\n[${doc.id}] "${d.name ?? ''}" updatedAt=${iso(d.updatedAt)} widgets=${widgets.length} stickers=${stickers.length} links=${links.length}`
  );
  for (const w of stickers) {
    const c = w.config ?? {};
    console.log(
      `  sticker ${w.id} ${c.icon ? `icon=${c.icon}` : describeUrl(c.url)} size=${w.w}x${w.h}`
    );
  }
  for (const w of links) {
    const urls = Array.isArray(w.config?.urls) ? w.config.urls : [];
    console.log(
      `  links ${w.id} count=${urls.length} imageUrls=[${urls.map((u) => describeUrl(u?.imageUrl)).join(', ')}]`
    );
  }
}
