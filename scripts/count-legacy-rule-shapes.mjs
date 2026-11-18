// Read-only: counts data still relying on firestore.rules compatibility branches (PT-175). Never writes.
import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
initializeApp({ credential: sa ? cert(JSON.parse(sa)) : applicationDefault() });
const db = getFirestore();

const LEGACY_BUILDINGS = new Set([
  'orono-high-school',
  'orono-middle-school',
  'orono-intermediate-school',
  'schumann-elementary',
]);
const TIME_FIELDS = [
  'createdAt',
  'updatedAt',
  'lastSeenAt',
  'lastEditedAt',
  'deletedAt',
  'heldAt',
  'opensAt',
  'dueAt',
  'lastHeartbeatAt',
];
const out = {};
const ex = (k, v) => {
  (out[k] ??= []).length < 5 && out[k].push(v);
};

async function scan(q, fn) {
  let n = 0;
  let last = null;
  for (;;) {
    let page = q.orderBy('__name__').limit(500);
    if (last) page = page.startAfter(last);
    const snap = await page.get();
    for (const d of snap.docs) {
      n++;
      fn(d);
    }
    if (snap.size < 500) return n;
    last = snap.docs[snap.size - 1];
  }
}

// (1) classId but no classIds list, per session collection.
const sessionCols = [
  'quiz_sessions',
  'video_activity_sessions',
  'mini_app_sessions',
  'guided_learning_sessions',
  'activity_wall_sessions',
  'project_runs',
];
const one = {};
for (const c of sessionCols) {
  const r = { scanned: 0, legacy: 0, legacyNotEnded: 0 };
  r.scanned = await scan(
    db.collection(c).select('classId', 'classIds', 'status'),
    (d) => {
      const x = d.data();
      const hasList = Array.isArray(x.classIds) && x.classIds.length > 0;
      if (typeof x.classId === 'string' && x.classId !== '' && !hasList) {
        r.legacy++;
        if (x.status !== 'ended') {
          r.legacyNotEnded++;
          ex(`1:${c}:notEnded`, `${d.id} status=${x.status ?? '(none)'}`);
        }
        ex(`1:${c}`, d.id);
      }
    }
  );
  one[c] = r;
}

// (2) int time fields on PLC-family docs and plc_state.
const two = {};
const intCheck = (label, d) => {
  const x = d.data();
  const hits = TIME_FIELDS.filter((f) => typeof x[f] === 'number');
  two[label] ??= { scanned: 0, withInt: 0, byField: {} };
  two[label].scanned++;
  if (hits.length) {
    two[label].withInt++;
    for (const f of hits)
      two[label].byField[f] = (two[label].byField[f] ?? 0) + 1;
    ex(`2:${label}`, `${d.ref.path} [${hits.join(',')}]`);
  }
};
async function walk(ref, label) {
  const snap = await ref.get();
  for (const d of snap.docs) {
    intCheck(label, d);
    for (const sub of await d.ref.listCollections())
      await walk(sub, `${label}/${sub.id}`);
  }
}
for (const c of [
  'plcs',
  'synced_quizzes',
  'synced_question_banks',
  'synced_video_activities',
  'plc_norming_sources',
  'plcIndex',
  'plc_invitations',
  'plc_resources',
]) {
  await walk(db.collection(c), c);
}
await scan(db.collectionGroup('plc_state'), (d) =>
  intCheck('users/*/plc_state', d)
);

// (3) legacy superAdmins without an active super_admin member doc.
const roles = await db.doc('admin_settings/user_roles').get();
const legacyList = roles.exists ? (roles.data().superAdmins ?? []) : [];
const three = {
  userRolesDocExists: roles.exists,
  listed: legacyList.length,
  withoutActiveMemberSuperAdmin: 0,
  missingDetail: [],
};
for (const email of legacyList) {
  const m = await db
    .doc(`organizations/orono/members/${String(email).toLowerCase()}`)
    .get();
  const md = m.exists ? m.data() : null;
  const ok =
    md && md.roleId === 'super_admin' && (md.status ?? 'active') === 'active';
  if (!ok) {
    three.withoutActiveMemberSuperAdmin++;
    three.missingDetail.push(
      md
        ? `member doc roleId=${md.roleId} status=${md.status}`
        : 'no member doc'
    );
  }
}

// (4) legacy long-form building ids.
const four = {};
const bump = (k, path) => {
  four[k] = (four[k] ?? 0) + 1;
  ex(`4:${k}`, path);
};
const orgs = await db.collection('organizations').listDocuments();
for (const org of orgs) {
  for (const b of await org.collection('buildings').listDocuments())
    if (LEGACY_BUILDINGS.has(b.id)) bump('org building doc ids', b.path);
  await scan(
    org.collection('members').select('buildingIds', 'buildingId'),
    (d) => {
      const x = d.data();
      if (
        (x.buildingIds ?? []).some((id) => LEGACY_BUILDINGS.has(id)) ||
        LEGACY_BUILDINGS.has(x.buildingId)
      )
        bump('org member docs', `${org.id}/members/<member>`);
    }
  );
}
await scan(db.collection('plcs').select('buildingId'), (d) => {
  if (LEGACY_BUILDINGS.has(d.data().buildingId))
    bump('plcs.buildingId', d.ref.path);
});
await scan(
  db
    .collection('users')
    .select('buildingIds', 'buildingId', 'selectedBuildings'),
  (d) => {
    const x = d.data();
    const arr = [
      ...(x.buildingIds ?? []),
      ...(x.selectedBuildings ?? []),
      x.buildingId,
    ];
    if (arr.some((id) => LEGACY_BUILDINGS.has(id)))
      bump('users root docs', 'users/<uid>');
  }
);

console.log(
  JSON.stringify(
    {
      project: process.env.GOOGLE_CLOUD_PROJECT,
      one,
      two,
      three,
      four,
      examples: out,
    },
    null,
    2
  )
);
