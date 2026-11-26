// PLC settings, learning targets, gradebook settings and mentoring workspaces, written here instead of through firestore.rules.
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from './firebaseAdmin';
import { hasDeactivatedClaim, isDeactivatedOperatorMember } from './authz';
import { assertViewAsAllowed, readViewAsClaim } from './viewAsGuard';
import { isMembershipManager } from './plcMembership';

if (!admin.apps.length) {
  admin.initializeApp();
}

type Data = Record<string, unknown>;

export type SettingsReason = 'plcNotFound' | 'notAllowed' | 'invalid';

export class SettingsError extends Error {
  constructor(
    readonly reason: SettingsReason,
    readonly code:
      | 'permission-denied'
      | 'not-found'
      | 'invalid-argument' = 'permission-denied'
  ) {
    super(reason);
  }
}

const deny = (): never => {
  throw new SettingsError('notAllowed');
};
const invalid = (): never => {
  throw new SettingsError('invalid', 'invalid-argument');
};

export const TEACHER_GROUP_TYPES = ['plc', 'department', 'mentoring'] as const;
type TeacherGroupType = (typeof TEACHER_GROUP_TYPES)[number];
const GB_METHODS = ['mean', 'recent', 'highest', 'decaying'];
const CALENDAR_RE =
  /^https:\/\/calendar[.]google[.]com\/calendar\/(u\/[0-9]+\/)?embed[?].+$/s;
const DISTRICT_EMAIL_RE = /^[^@]+@orono[.]k12[.]mn[.]us$/;
const HTTPS_RE = /^https:\/\/.*/s;

export interface Caller {
  uid: string;
  emailLower: string;
  emailVerified: boolean;
  viewAs: boolean;
  deactivated: boolean;
  /** pinLoginV1 tokens resolve to no uid in the rules, so they write nothing. */
  pinLogin: boolean;
  studentRole: boolean;
  anonymous: boolean;
}

export type ActionItemInput = {
  id: string;
  text: string;
  done: boolean;
  assigneeUid: string | null;
  dueAt: number | null;
  createdBy: string;
  createdAt: number;
  doneAt: number | null;
};

export type DocLinkInput = {
  id: string;
  title: string;
  url: string;
  taskId?: string;
};

export type SettingsAction =
  | {
      action: 'create';
      name: string;
      displayName: string;
      orgId: string | null;
      buildingId: string | null;
      groupType?: TeacherGroupType;
      layout?: Data;
      features?: Record<string, boolean>;
    }
  | {
      action: 'rename';
      plcId: string;
      name: string;
      groupType?: TeacherGroupType;
    }
  | { action: 'delete'; plcId: string }
  | { action: 'setSharedSheetUrl'; plcId: string; url: string }
  | { action: 'clearSharedSheetUrl'; plcId: string }
  | {
      action: 'setFeatures';
      plcId: string;
      features: Record<string, boolean>;
    }
  | { action: 'setDigestOptIn'; plcId: string; optIn: boolean }
  | { action: 'setMeetingCadence'; plcId: string; cadence: Data | null }
  | {
      action: 'setNormingLabels';
      plcId: string;
      labels: Record<string, string> | null;
    }
  | {
      action: 'setLayout';
      plcId: string;
      layout: Data | null;
      features?: Record<string, boolean>;
    }
  | { action: 'setMeetingNoteTemplate'; plcId: string; markdown: string | null }
  | { action: 'setCalendar'; plcId: string; url: string | null }
  | {
      action: 'setMentorRole';
      plcId: string;
      uid: string;
      mentorRole: 'mentor' | 'mentee' | null;
    }
  | {
      action: 'saveLearningTargets';
      plcId: string;
      targets: unknown[];
      masteryCutoffs?: { proficient: number; approaching: number };
    }
  | {
      action: 'setMasteryCutoffs';
      plcId: string;
      cutoffs: { proficient: number; approaching: number };
    }
  | { action: 'saveGradebookSettings'; plcId: string; body: Data }
  | { action: 'deleteGradebookSettings'; plcId: string }
  | {
      action: 'createPairing';
      plcId: string;
      mentorUid: string;
      menteeUid: string;
      mentorName: string;
      menteeName: string;
    }
  | { action: 'removePairing'; plcId: string; workspaceId: string }
  | {
      action: 'addWorkspaceDoc';
      plcId: string;
      workspaceId: string;
      link: DocLinkInput;
      ifAbsent: boolean;
    }
  | {
      action: 'addActionItem';
      plcId: string;
      workspaceId: string;
      item: ActionItemInput;
    }
  | {
      action: 'toggleActionItem';
      plcId: string;
      workspaceId: string;
      itemId: string;
    }
  | {
      action: 'submitTask';
      plcId: string;
      workspaceId: string;
      taskId: string;
      name: string;
    }
  | {
      action: 'createCheckIn';
      plcId: string;
      workspaceId: string;
      title: string;
      body: string;
      name: string;
    }
  | {
      action: 'updateCheckIn';
      plcId: string;
      workspaceId: string;
      checkInId: string;
      title?: string;
      body?: string;
    };

export interface SettingsResult {
  plcId?: string;
  url?: string;
  workspaceId?: string;
  checkInId?: string;
  listed?: boolean;
}

// ── Payload parsing ──

const isObj = (v: unknown): v is Data =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const isId = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 200 && !v.includes('/');

function str(d: Data, k: string, max = 100_000): string {
  const v = d[k];
  if (typeof v !== 'string' || v.length > max) invalid();
  return v as string;
}
function id(d: Data, k: string): string {
  const v = d[k];
  if (!isId(v)) invalid();
  return v as string;
}
function nullableStr(d: Data, k: string, max = 100_000): string | null {
  const v = d[k];
  if (v === null || v === undefined) return null;
  return str(d, k, max);
}
function boolMap(v: unknown): Record<string, boolean> {
  if (!isObj(v) || Object.keys(v).length > 100) invalid();
  const out: Record<string, boolean> = {};
  for (const [k, b] of Object.entries(v as Data)) {
    if (typeof b !== 'boolean' || k.length > 100) invalid();
    out[k] = b as boolean;
  }
  return out;
}
function groupTypeOf(v: unknown): TeacherGroupType | undefined {
  if (v === undefined || v === null) return undefined;
  if (!(TEACHER_GROUP_TYPES as readonly unknown[]).includes(v)) deny();
  return v as TeacherGroupType;
}
function cutoffsOf(v: unknown): { proficient: number; approaching: number } {
  if (!isObj(v)) invalid();
  const c = v as Data;
  if (!Object.keys(c).every((k) => k === 'proficient' || k === 'approaching'))
    deny();
  const p = c.proficient;
  const a = c.approaching;
  if (!Number.isInteger(p) || !Number.isInteger(a)) deny();
  const pi = p as number;
  const ai = a as number;
  if (pi < 0 || pi > 100 || ai < 0 || ai > pi) deny();
  return { proficient: pi, approaching: ai };
}
function nullableInt(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) invalid();
  return v as number;
}

/** Validates the callable payload; throws invalid-argument on a malformed one. */
export function parseSettingsAction(raw: unknown): SettingsAction {
  if (!isObj(raw)) return invalid();
  const d = raw;
  switch (d.action) {
    case 'create': {
      const orgId = nullableStr(d, 'orgId', 200);
      const buildingId = nullableStr(d, 'buildingId', 200);
      const name = str(d, 'name', 1000).trim();
      if (!name) invalid();
      return {
        action: 'create',
        name,
        displayName: typeof d.displayName === 'string' ? d.displayName : '',
        orgId,
        buildingId,
        ...(d.groupType !== undefined
          ? { groupType: groupTypeOf(d.groupType) }
          : {}),
        ...(d.layout !== undefined ? { layout: d.layout as Data } : {}),
        ...(d.features !== undefined ? { features: boolMap(d.features) } : {}),
      };
    }
    case 'rename': {
      const name = str(d, 'name', 1000).trim();
      if (!name) invalid();
      const groupType = groupTypeOf(d.groupType);
      return {
        action: 'rename',
        plcId: id(d, 'plcId'),
        name,
        ...(groupType ? { groupType } : {}),
      };
    }
    case 'delete':
    case 'clearSharedSheetUrl':
    case 'deleteGradebookSettings':
      return { action: d.action, plcId: id(d, 'plcId') };
    case 'setSharedSheetUrl': {
      const url = str(d, 'url', 2000);
      if (!url) invalid();
      return { action: 'setSharedSheetUrl', plcId: id(d, 'plcId'), url };
    }
    case 'setFeatures':
      return {
        action: 'setFeatures',
        plcId: id(d, 'plcId'),
        features: boolMap(d.features),
      };
    case 'setDigestOptIn':
      if (typeof d.optIn !== 'boolean') invalid();
      return {
        action: 'setDigestOptIn',
        plcId: id(d, 'plcId'),
        optIn: d.optIn as boolean,
      };
    case 'setMeetingCadence': {
      const cadence = d.cadence ?? null;
      if (cadence !== null && !isObj(cadence)) deny();
      if (cadence !== null && JSON.stringify(cadence).length > 20_000)
        invalid();
      return {
        action: 'setMeetingCadence',
        plcId: id(d, 'plcId'),
        cadence: cadence as Data | null,
      };
    }
    case 'setNormingLabels': {
      const labels = d.labels ?? null;
      if (labels !== null) {
        if (!isObj(labels)) deny();
        for (const [k, v] of Object.entries(labels as Data)) {
          if (!['high', 'medium', 'low'].includes(k)) deny();
          if (typeof v !== 'string' || v.length > 40) deny();
        }
      }
      return {
        action: 'setNormingLabels',
        plcId: id(d, 'plcId'),
        labels: labels as Record<string, string> | null,
      };
    }
    case 'setLayout': {
      const layout = d.layout ?? null;
      if (layout !== null && !layoutShapeOk(layout)) deny();
      return {
        action: 'setLayout',
        plcId: id(d, 'plcId'),
        layout: layout as Data | null,
        ...(d.features !== undefined ? { features: boolMap(d.features) } : {}),
      };
    }
    case 'setMeetingNoteTemplate': {
      const v = d.markdown ?? null;
      if (v !== null && (typeof v !== 'string' || v.length > 20_000)) deny();
      return {
        action: 'setMeetingNoteTemplate',
        plcId: id(d, 'plcId'),
        markdown: v as string | null,
      };
    }
    case 'setCalendar': {
      const v = d.url ?? null;
      if (v !== null && !calendarOk(v)) deny();
      return {
        action: 'setCalendar',
        plcId: id(d, 'plcId'),
        url: v as string | null,
      };
    }
    case 'setMentorRole': {
      const r = d.mentorRole ?? null;
      if (r !== null && r !== 'mentor' && r !== 'mentee') invalid();
      return {
        action: 'setMentorRole',
        plcId: id(d, 'plcId'),
        uid: id(d, 'uid'),
        mentorRole: r as 'mentor' | 'mentee' | null,
      };
    }
    case 'saveLearningTargets': {
      if (!Array.isArray(d.targets)) deny();
      const targets = d.targets as unknown[];
      if (targets.length > 1000) deny();
      return {
        action: 'saveLearningTargets',
        plcId: id(d, 'plcId'),
        targets,
        ...(d.masteryCutoffs !== undefined
          ? { masteryCutoffs: cutoffsOf(d.masteryCutoffs) }
          : {}),
      };
    }
    case 'setMasteryCutoffs':
      return {
        action: 'setMasteryCutoffs',
        plcId: id(d, 'plcId'),
        cutoffs: cutoffsOf(d.cutoffs),
      };
    case 'saveGradebookSettings':
      if (!isObj(d.body)) invalid();
      return {
        action: 'saveGradebookSettings',
        plcId: id(d, 'plcId'),
        body: d.body as Data,
      };
    case 'createPairing':
      return {
        action: 'createPairing',
        plcId: id(d, 'plcId'),
        mentorUid: id(d, 'mentorUid'),
        menteeUid: id(d, 'menteeUid'),
        mentorName: str(d, 'mentorName', 1000),
        menteeName: str(d, 'menteeName', 1000),
      };
    case 'removePairing':
      return {
        action: 'removePairing',
        plcId: id(d, 'plcId'),
        workspaceId: id(d, 'workspaceId'),
      };
    case 'addWorkspaceDoc': {
      if (!isObj(d.link)) invalid();
      const l = d.link as Data;
      const url = str(l, 'url', 2000);
      if (!HTTPS_RE.test(url)) deny();
      return {
        action: 'addWorkspaceDoc',
        plcId: id(d, 'plcId'),
        workspaceId: id(d, 'workspaceId'),
        link: {
          id: id(l, 'id'),
          title: str(l, 'title', 1000),
          url,
          ...(l.taskId !== undefined ? { taskId: id(l, 'taskId') } : {}),
        },
        ifAbsent: d.ifAbsent === true,
      };
    }
    case 'addActionItem': {
      if (!isObj(d.item)) invalid();
      const it = d.item as Data;
      const text = str(it, 'text', 5000).trim();
      if (!text || typeof it.done !== 'boolean') invalid();
      const assignee = it.assigneeUid ?? null;
      if (assignee !== null && !isId(assignee)) invalid();
      return {
        action: 'addActionItem',
        plcId: id(d, 'plcId'),
        workspaceId: id(d, 'workspaceId'),
        item: {
          id: id(it, 'id'),
          text,
          done: it.done as boolean,
          assigneeUid: assignee as string | null,
          dueAt: nullableInt(it.dueAt),
          createdBy: id(it, 'createdBy'),
          createdAt: nullableInt(it.createdAt) ?? Date.now(),
          doneAt: nullableInt(it.doneAt),
        },
      };
    }
    case 'toggleActionItem':
      return {
        action: 'toggleActionItem',
        plcId: id(d, 'plcId'),
        workspaceId: id(d, 'workspaceId'),
        itemId: id(d, 'itemId'),
      };
    case 'submitTask':
      return {
        action: 'submitTask',
        plcId: id(d, 'plcId'),
        workspaceId: id(d, 'workspaceId'),
        taskId: id(d, 'taskId'),
        name: str(d, 'name', 1000),
      };
    case 'createCheckIn': {
      const title = str(d, 'title', 200);
      const body = str(d, 'body', 50_000);
      return {
        action: 'createCheckIn',
        plcId: id(d, 'plcId'),
        workspaceId: id(d, 'workspaceId'),
        title,
        body,
        name: str(d, 'name', 1000),
      };
    }
    case 'updateCheckIn': {
      const out: Extract<SettingsAction, { action: 'updateCheckIn' }> = {
        action: 'updateCheckIn',
        plcId: id(d, 'plcId'),
        workspaceId: id(d, 'workspaceId'),
        checkInId: id(d, 'checkInId'),
      };
      if (d.title !== undefined) out.title = str(d, 'title', 200);
      if (d.body !== undefined) out.body = str(d, 'body', 50_000);
      return out;
    }
    default:
      return invalid();
  }
}

// ── Rule ports ──

/** plcLayoutShapeOk. */
export function layoutShapeOk(l: unknown): boolean {
  if (!isObj(l)) return false;
  const keys = Object.keys(l).sort().join(',');
  if (keys !== 'cards,hero,landing,pages') return false;
  return (
    Array.isArray(l.pages) &&
    l.pages.length <= 20 &&
    typeof l.landing === 'string' &&
    Array.isArray(l.cards) &&
    l.cards.length <= 30 &&
    isObj(l.hero) &&
    (l.hero.mode === 'default' || l.hero.mode === 'pinned')
  );
}

/** plcCalendarFieldOk for a set value. */
export function calendarOk(v: unknown): boolean {
  return typeof v === 'string' && v.length <= 2000 && CALENDAR_RE.test(v);
}

/** gbSettingsOk(d, ['updatedBy']). */
export function gbSettingsOk(d: Data): boolean {
  const allowed = [
    'name',
    'flags',
    'categoriesEnabled',
    'categories',
    'scale',
    'method',
    'studentVisibility',
    'autoFlags',
    'updatedAt',
    'updatedBy',
  ];
  return (
    Object.keys(d).every((k) => allowed.includes(k)) &&
    typeof d.name === 'string' &&
    d.name.length > 0 &&
    d.name.length <= 80 &&
    Array.isArray(d.flags) &&
    d.flags.length <= 26 &&
    typeof d.categoriesEnabled === 'boolean' &&
    Array.isArray(d.categories) &&
    d.categories.length <= 20 &&
    isObj(d.scale) &&
    typeof d.method === 'string' &&
    GB_METHODS.includes(d.method) &&
    isObj(d.studentVisibility) &&
    typeof d.autoFlags === 'boolean' &&
    Number.isInteger(d.updatedAt)
  );
}

function memberUids(p: Data): string[] {
  return Array.isArray(p.memberUids)
    ? p.memberUids.filter((u): u is string => typeof u === 'string')
    : [];
}
const isMember = (p: Data, uid: string) => memberUids(p).includes(uid);
function roleOf(p: Data, uid: string): string {
  const entry = isObj(p.members) ? p.members[uid] : undefined;
  return isObj(entry) && typeof entry.role === 'string' ? entry.role : '';
}
/** plcCanEditContent: a current member whose role isn't viewer. */
const canEditContent = (p: Data, uid: string) =>
  isMember(p, uid) && roleOf(p, uid) !== 'viewer';

/** mentTagged: an active plain member carrying that mentoring tag. */
function isTagged(p: Data, uid: string, tag: 'mentor' | 'mentee'): boolean {
  const m = isObj(p.members) ? p.members[uid] : undefined;
  return (
    isObj(m) &&
    m.role === 'member' &&
    m.status === 'active' &&
    m.mentorRole === tag
  );
}

/** mentInPair plus plcEditor: in the pairing, a current member, and not a viewer. */
function pairEditor(p: Data, ws: Data, uid: string): boolean {
  const pair = Array.isArray(ws.memberUids) ? ws.memberUids : [];
  return pair.includes(uid) && canEditContent(p, uid);
}

/** mentWorkspaceContentOk on the doc after the write (docs checked per write). */
function workspaceContentOk(ws: Data): boolean {
  const allowed = [
    'mentorUid',
    'menteeUid',
    'memberUids',
    'mentorName',
    'menteeName',
    'actionItems',
    'docs',
    'taskStatus',
    'createdAt',
    'updatedAt',
  ];
  const optStr = (k: string) => !(k in ws) || typeof ws[k] === 'string';
  const optList = (k: string, max: number) =>
    !(k in ws) || (Array.isArray(ws[k]) && (ws[k] as unknown[]).length <= max);
  return (
    Object.keys(ws).every((k) => allowed.includes(k)) &&
    optStr('mentorName') &&
    optStr('menteeName') &&
    optList('actionItems', 200) &&
    optList('docs', 100) &&
    (!('taskStatus' in ws) || isObj(ws.taskStatus))
  );
}

// ── Caller gates ──

/** isDistrictStaff: a verified district address with a live, non-student operator-org member doc. */
async function isDistrictStaff(
  db: admin.firestore.Firestore,
  c: Caller
): Promise<boolean> {
  if (!c.emailVerified || !DISTRICT_EMAIL_RE.test(c.emailLower)) return false;
  if (c.studentRole) return false;
  const m = await db.doc(`organizations/orono/members/${c.emailLower}`).get();
  return staffMemberOk(m.exists ? m.data() : undefined);
}

function staffMemberOk(m: Data | undefined): boolean {
  if (!m) return false;
  const status = m.status ?? 'active';
  return (
    (status === 'active' || status === 'invited') &&
    (m.roleId ?? '') !== 'student'
  );
}

/** isAdmin() && isOrgMember(orgId); a View as tab never passes isAdmin() on a write. */
async function isOrgAdmin(
  db: admin.firestore.Firestore,
  c: Caller,
  orgId: unknown
): Promise<boolean> {
  if (c.viewAs || !c.emailVerified || !c.emailLower) return false;
  if (typeof orgId !== 'string' || !orgId || orgId.includes('/')) return false;
  const [adminDoc, member] = await Promise.all([
    db.doc(`admins/${c.emailLower}`).get(),
    db.doc(`organizations/${orgId}/members/${c.emailLower}`).get(),
  ]);
  return (
    adminDoc.exists && staffMemberOk(member.exists ? member.data() : undefined)
  );
}

// ── Root doc updates ──

export interface FieldOps {
  ts: () => unknown;
  del: () => unknown;
}

/** The root update for a settings action on an existing PLC, or null for a no-op; throws SettingsError. */
export function planRootUpdate(
  p: Data,
  action: Extract<
    SettingsAction,
    {
      action:
        | 'rename'
        | 'setFeatures'
        | 'setDigestOptIn'
        | 'setMeetingCadence'
        | 'setNormingLabels'
        | 'setLayout'
        | 'setMeetingNoteTemplate'
        | 'setCalendar'
        | 'setMentorRole';
    }
  >,
  uid: string,
  fv: FieldOps
): Data | null {
  const manager = isMembershipManager(p, uid);
  switch (action.action) {
    case 'rename': {
      if (uid !== p.leadUid) deny();
      if (action.groupType) {
        const oldType = typeof p.groupType === 'string' ? p.groupType : 'plc';
        if (action.groupType !== oldType && oldType === 'building') deny();
      }
      // The lead branch also re-checks the calendar field the doc already holds.
      const cal = p.calendarEmbedUrl ?? null;
      if (cal !== null && !calendarOk(cal)) deny();
      return {
        name: action.name,
        ...(action.groupType ? { groupType: action.groupType } : {}),
        updatedAt: fv.ts(),
      };
    }
    case 'setFeatures': {
      if (!isMember(p, uid)) deny();
      return { features: action.features, updatedAt: fv.ts() };
    }
    case 'setDigestOptIn': {
      if (!isMember(p, uid)) deny();
      if (p.digestOptIn === action.optIn) return null;
      return { digestOptIn: action.optIn, updatedAt: fv.ts() };
    }
    case 'setMeetingCadence':
      if (!manager) deny();
      return {
        meetingCadence: action.cadence ?? fv.del(),
        updatedAt: fv.ts(),
      };
    case 'setNormingLabels':
      if (!manager) deny();
      return {
        normingLevelLabels: action.labels ?? fv.del(),
        updatedAt: fv.ts(),
      };
    case 'setLayout': {
      if (!manager) deny();
      if (action.layout === null) {
        return { layout: fv.del(), updatedAt: fv.ts() };
      }
      const before = isObj(p.features) ? p.features : {};
      return {
        layout: action.layout,
        ...(action.features && Object.keys(action.features).length
          ? { features: { ...before, ...action.features } }
          : {}),
        updatedAt: fv.ts(),
      };
    }
    case 'setMeetingNoteTemplate':
      if (!manager) deny();
      return {
        meetingNoteTemplate: action.markdown ?? fv.del(),
        updatedAt: fv.ts(),
      };
    case 'setCalendar':
      if (!manager) deny();
      return {
        calendarEmbedUrl: action.url ?? fv.del(),
        updatedAt: fv.ts(),
      };
    case 'setMentorRole': {
      if (!manager) deny();
      const members = isObj(p.members) ? p.members : {};
      const target = members[action.uid];
      if (action.uid === p.leadUid || !isObj(target)) deny();
      const next: Data = { ...(target as Data) };
      if (action.mentorRole) next.mentorRole = action.mentorRole;
      else delete next.mentorRole;
      return {
        members: { ...members, [action.uid]: next },
        updatedAt: fv.ts(),
      };
    }
  }
}

// ── Runner ──

const plcPath = (plcId: string) => `plcs/${plcId}`;

async function readPlc(
  tx: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  plcId: string
): Promise<{ ref: admin.firestore.DocumentReference; data: Data }> {
  const ref = db.doc(plcPath(plcId));
  const snap = await tx.get(ref);
  if (!snap.exists) throw new SettingsError('plcNotFound', 'not-found');
  return { ref, data: snap.data() as Data };
}

async function readWorkspace(
  tx: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  plcId: string,
  workspaceId: string
): Promise<{ ref: admin.firestore.DocumentReference; data: Data | null }> {
  const ref = db.doc(`plcs/${plcId}/workspaces/${workspaceId}`);
  const snap = await tx.get(ref);
  return { ref, data: snap.exists ? (snap.data() as Data) : null };
}

const defaultOps = (): FieldOps => ({
  ts: () => admin.firestore.FieldValue.serverTimestamp(),
  del: () => admin.firestore.FieldValue.delete(),
});

/** Runs one settings action with the same gates the rules applied. */
export async function runSettingsAction(
  db: admin.firestore.Firestore,
  caller: Caller,
  action: SettingsAction,
  fv: FieldOps = defaultOps(),
  now: () => number = Date.now
): Promise<SettingsResult> {
  // Mirrors notDeactivated() and authUid(): deactivated accounts and PIN tokens write nothing.
  if (
    caller.deactivated ||
    caller.pinLogin ||
    (caller.emailLower &&
      (await isDeactivatedOperatorMember(db, caller.emailLower)))
  ) {
    deny();
  }
  const uid = caller.uid;
  switch (action.action) {
    case 'create': {
      if (!(await isDistrictStaff(db, caller))) deny();
      if (action.layout !== undefined && !layoutShapeOk(action.layout)) deny();
      const ref = db.collection('plcs').doc();
      return db.runTransaction(async (tx) => {
        // An id that was ever used is never re-created.
        const creator = await tx.get(db.doc(`plcCreators/${ref.id}`));
        if (creator.exists) deny();
        tx.create(ref, {
          name: action.name,
          orgId: action.orgId,
          buildingId: action.buildingId,
          ...(action.groupType && action.groupType !== 'plc'
            ? { groupType: action.groupType }
            : {}),
          ...(action.layout ? { layout: action.layout } : {}),
          ...(action.layout &&
          action.features &&
          Object.keys(action.features).length
            ? { features: action.features }
            : {}),
          members: {
            [uid]: {
              uid,
              email: caller.emailLower,
              displayName: action.displayName,
              role: 'lead',
              joinedAt: fv.ts(),
              status: 'active',
            },
          },
          leadUid: uid,
          memberUids: [uid],
          memberEmails: { [uid]: caller.emailLower },
          createdAt: fv.ts(),
          updatedAt: fv.ts(),
        });
        return { plcId: ref.id };
      });
    }
    case 'delete': {
      const snap = await db.doc(plcPath(action.plcId)).get();
      if (!snap.exists) throw new SettingsError('plcNotFound', 'not-found');
      const p = snap.data() as Data;
      if (uid !== p.leadUid && !(await isOrgAdmin(db, caller, p.orgId))) deny();
      return db.runTransaction(async (tx) => {
        const invites = await tx.get(
          db.collection('plc_invitations').where('plcId', '==', action.plcId)
        );
        for (const d of invites.docs) tx.delete(d.ref);
        tx.delete(db.doc(plcPath(action.plcId)));
        return {};
      });
    }
    case 'setSharedSheetUrl':
      return db.runTransaction(async (tx) => {
        const { ref, data } = await readPlc(tx, db, action.plcId);
        if (!isMember(data, uid)) deny();
        const current = data.sharedSheetUrl;
        if (typeof current === 'string' && current) return { url: current };
        tx.update(ref, { sharedSheetUrl: action.url, updatedAt: fv.ts() });
        return { url: action.url };
      });
    case 'clearSharedSheetUrl':
      return db.runTransaction(async (tx) => {
        const { ref, data } = await readPlc(tx, db, action.plcId);
        if (!isMember(data, uid)) deny();
        const current = data.sharedSheetUrl;
        if (typeof current === 'string' && current)
          tx.update(ref, { sharedSheetUrl: null, updatedAt: fv.ts() });
        return {};
      });
    case 'rename':
    case 'setFeatures':
    case 'setDigestOptIn':
    case 'setMeetingCadence':
    case 'setNormingLabels':
    case 'setLayout':
    case 'setMeetingNoteTemplate':
    case 'setCalendar':
    case 'setMentorRole':
      return db.runTransaction(async (tx) => {
        const { ref, data } = await readPlc(tx, db, action.plcId);
        const update = planRootUpdate(data, action, uid, fv);
        if (update) tx.update(ref, update);
        return {};
      });
    case 'saveLearningTargets':
      return db.runTransaction(async (tx) => {
        const { data } = await readPlc(tx, db, action.plcId);
        if (!canEditContent(data, uid)) deny();
        tx.set(db.doc(`plcs/${action.plcId}/meta/learningTargets`), {
          targets: action.targets,
          ...(action.masteryCutoffs
            ? { masteryCutoffs: action.masteryCutoffs }
            : {}),
          updatedAt: now(),
        });
        return {};
      });
    case 'setMasteryCutoffs':
      return db.runTransaction(async (tx) => {
        const { data } = await readPlc(tx, db, action.plcId);
        if (!canEditContent(data, uid)) deny();
        const ref = db.doc(`plcs/${action.plcId}/meta/learningTargets`);
        const snap = await tx.get(ref);
        const before = snap.exists ? (snap.data() as Data) : null;
        const targets = before ? before.targets : [];
        // The rule checks the whole doc after the write, kept targets included.
        if (
          before &&
          (!Object.keys(before).every((k) =>
            ['targets', 'masteryCutoffs', 'updatedAt'].includes(k)
          ) ||
            !Array.isArray(targets) ||
            targets.length > 1000)
        )
          deny();
        tx.set(ref, {
          targets,
          masteryCutoffs: action.cutoffs,
          updatedAt: now(),
        });
        return {};
      });
    case 'saveGradebookSettings':
    case 'deleteGradebookSettings': {
      // liveStaffSignedIn: not anonymous and not a student token.
      if (caller.anonymous || caller.studentRole) deny();
      const body =
        action.action === 'saveGradebookSettings'
          ? { ...action.body, updatedBy: uid, updatedAt: now() }
          : null;
      if (body && !gbSettingsOk(body)) deny();
      return db.runTransaction(async (tx) => {
        const { data } = await readPlc(tx, db, action.plcId);
        if (!isMembershipManager(data, uid)) deny();
        const ref = db.doc(`plcs/${action.plcId}/meta/gradebookSettings`);
        if (body) tx.set(ref, body);
        else tx.delete(ref);
        return {};
      });
    }
    case 'createPairing': {
      const { mentorUid, menteeUid } = action;
      if (mentorUid === menteeUid) deny();
      const workspaceId = `${mentorUid}_${menteeUid}`;
      return db.runTransaction(async (tx) => {
        const { data } = await readPlc(tx, db, action.plcId);
        if (!isMembershipManager(data, uid)) deny();
        if (data.groupType !== 'mentoring') deny();
        if (
          !isTagged(data, mentorUid, 'mentor') ||
          !isTagged(data, menteeUid, 'mentee')
        )
          deny();
        const { ref, data: ws } = await readWorkspace(
          tx,
          db,
          action.plcId,
          workspaceId
        );
        // A pair has one workspace; pairing it again keeps what it holds.
        if (!ws) {
          tx.create(ref, {
            mentorUid,
            menteeUid,
            memberUids: [mentorUid, menteeUid],
            mentorName: action.mentorName,
            menteeName: action.menteeName,
            actionItems: [],
            docs: [],
            taskStatus: {},
            createdAt: fv.ts(),
            updatedAt: fv.ts(),
          });
        }
        return { workspaceId };
      });
    }
    case 'removePairing': {
      const plc = await db.doc(plcPath(action.plcId)).get();
      if (!plc.exists) throw new SettingsError('plcNotFound', 'not-found');
      if (!isMembershipManager(plc.data() as Data, uid)) deny();
      const ws = db.doc(
        `plcs/${action.plcId}/workspaces/${action.workspaceId}`
      );
      const [checkIns, submissions] = await Promise.all([
        ws.collection('checkins').get(),
        ws.collection('submissions').get(),
      ]);
      const refs = [...checkIns.docs, ...submissions.docs].map((d) => d.ref);
      for (let i = 0; i < refs.length; i += 400) {
        await Promise.all(refs.slice(i, i + 400).map((r) => r.delete()));
      }
      await ws.delete();
      return {};
    }
    case 'addWorkspaceDoc':
      return db.runTransaction(async (tx) => {
        const { data: p } = await readPlc(tx, db, action.plcId);
        const { ref, data: ws } = await readWorkspace(
          tx,
          db,
          action.plcId,
          action.workspaceId
        );
        if (!ws) return { listed: false };
        if (!isMembershipManager(p, uid) && !pairEditor(p, ws, uid)) deny();
        const docs = Array.isArray(ws.docs) ? (ws.docs as unknown[]) : [];
        const sameId = (d: unknown) => isObj(d) && d.id === action.link.id;
        if (action.ifAbsent && docs.some(sameId)) return { listed: false };
        const next = [
          ...docs.filter((d) => !sameId(d)),
          { ...action.link, addedBy: uid, addedAt: now() },
        ];
        if (!workspaceContentOk({ ...ws, docs: next })) deny();
        tx.update(ref, { docs: next, updatedAt: fv.ts() });
        return { listed: true };
      });
    case 'addActionItem':
    case 'toggleActionItem':
      return db.runTransaction(async (tx) => {
        const { data: p } = await readPlc(tx, db, action.plcId);
        const { ref, data: ws } = await readWorkspace(
          tx,
          db,
          action.plcId,
          action.workspaceId
        );
        if (!ws) return {};
        if (!pairEditor(p, ws, uid)) deny();
        const items = Array.isArray(ws.actionItems)
          ? (ws.actionItems as unknown[])
          : [];
        let next: unknown[];
        if (action.action === 'addActionItem') {
          next = [...items, action.item];
        } else {
          next = items.map((a) => {
            if (!isObj(a) || a.id !== action.itemId) return a;
            const done = a.done === true;
            const out: Data = {
              ...a,
              done: !done,
              doneAt: done ? null : now(),
            };
            if (done) delete out.clearedAt;
            return out;
          });
        }
        if (!workspaceContentOk({ ...ws, actionItems: next })) deny();
        tx.update(ref, { actionItems: next, updatedAt: fv.ts() });
        return {};
      });
    case 'submitTask':
      return db.runTransaction(async (tx) => {
        const { data: p } = await readPlc(tx, db, action.plcId);
        const { ref, data: ws } = await readWorkspace(
          tx,
          db,
          action.plcId,
          action.workspaceId
        );
        if (!ws || !pairEditor(p, ws, uid)) deny();
        const w = ws as Data;
        const task = await tx.get(
          db.doc(`plcs/${action.plcId}/tasks/${action.taskId}`)
        );
        if (!task.exists) deny();
        const who: unknown = task.get('submitter');
        const may =
          who === 'both' ||
          (who === 'mentor' && uid === w.mentorUid) ||
          (who === 'mentee' && uid === w.menteeUid);
        if (!may) deny();
        const subId = `${action.taskId}_${uid}`;
        const docs = Array.isArray(w.docs) ? (w.docs as unknown[]) : [];
        const link = docs.find((d) => isObj(d) && d.taskId === action.taskId);
        const docUrl = isObj(link) ? link.url : undefined;
        const urlOk =
          typeof docUrl === 'string' &&
          docUrl.length <= 2000 &&
          HTTPS_RE.test(docUrl);
        const submittedAt = fv.ts();
        tx.set(ref.collection('submissions').doc(subId), {
          id: subId,
          taskId: action.taskId,
          submittedBy: uid,
          submittedByName: action.name,
          submittedAt,
          ...(urlOk ? { docUrl } : {}),
        });
        const status = isObj(w.taskStatus) ? w.taskStatus : {};
        if (!status[subId]) {
          tx.update(ref, {
            taskStatus: {
              ...status,
              [subId]: { submittedAt, submittedBy: uid },
            },
            updatedAt: fv.ts(),
          });
        }
        return {};
      });
    case 'createCheckIn':
    case 'updateCheckIn':
      return db.runTransaction(async (tx) => {
        const { data: p } = await readPlc(tx, db, action.plcId);
        const { ref: wsRef, data: ws } = await readWorkspace(
          tx,
          db,
          action.plcId,
          action.workspaceId
        );
        if (!ws || !pairEditor(p, ws, uid)) deny();
        const checkins = wsRef.collection('checkins');
        if (action.action === 'createCheckIn') {
          const ref = checkins.doc();
          tx.create(ref, {
            id: ref.id,
            title: action.title,
            body: action.body,
            createdBy: uid,
            createdByName: action.name,
            createdAt: fv.ts(),
            updatedAt: fv.ts(),
          });
          return { checkInId: ref.id };
        }
        const ref = checkins.doc(action.checkInId);
        const snap = await tx.get(ref);
        if (!snap.exists) throw new SettingsError('notAllowed', 'not-found');
        const after: Data = {
          ...(snap.data() as Data),
          ...(action.title !== undefined ? { title: action.title } : {}),
          ...(action.body !== undefined ? { body: action.body } : {}),
        };
        const allowed = [
          'id',
          'title',
          'body',
          'createdBy',
          'createdByName',
          'createdAt',
          'updatedAt',
        ];
        if (
          !Object.keys(after).every((k) => allowed.includes(k)) ||
          after.id !== action.checkInId ||
          typeof after.title !== 'string' ||
          after.title.length > 200 ||
          typeof after.body !== 'string' ||
          after.body.length > 50_000 ||
          typeof after.createdByName !== 'string'
        )
          deny();
        tx.update(ref, {
          ...(action.title !== undefined ? { title: action.title } : {}),
          ...(action.body !== undefined ? { body: action.body } : {}),
          updatedAt: fv.ts(),
        });
        return {};
      });
  }
}

export const plcSettingsV1 = onCall(
  { memory: '256MiB', timeoutSeconds: 60, maxInstances: 20 },
  async (request): Promise<SettingsResult> => {
    await assertViewAsAllowed(request);
    if (!request.auth)
      throw new HttpsError('unauthenticated', 'Sign in first.');
    const token = request.auth.token as Record<string, unknown>;
    const firebase = isObj(token.firebase) ? token.firebase : {};
    const caller: Caller = {
      uid: request.auth.uid,
      emailLower:
        typeof token.email === 'string' ? token.email.trim().toLowerCase() : '',
      emailVerified: token.email_verified === true,
      viewAs: readViewAsClaim(request) !== null,
      deactivated: hasDeactivatedClaim(token),
      pinLogin: token.pinLogin === true,
      studentRole: token.studentRole === true,
      anonymous: firebase.sign_in_provider === 'anonymous',
    };
    try {
      const action = parseSettingsAction(request.data);
      return await runSettingsAction(admin.firestore(), caller, action);
    } catch (err) {
      if (err instanceof SettingsError)
        throw new HttpsError(err.code, err.reason, { reason: err.reason });
      throw err;
    }
  }
);
