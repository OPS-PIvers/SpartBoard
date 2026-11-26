// The firestore.rules checks for shared PLC content (plcs/{plcId}/<coll>), ported one condition at a time.
export type Data = Record<string, unknown>;

export const PLC_CONTENT_COLLECTIONS = [
  'assessments',
  'assignment_index',
  'assignments',
  'docs',
  'flashcard_results',
  'flashcard_sets',
  'question_banks',
  'quizzes',
  'rubrics',
  'video_activities',
] as const;
export type PlcContentCollection = (typeof PLC_CONTENT_COLLECTIONS)[number];

export function isPlcContentCollection(v: unknown): v is PlcContentCollection {
  return (
    typeof v === 'string' &&
    (PLC_CONTENT_COLLECTIONS as readonly string[]).includes(v)
  );
}

export interface PlcContentRequest {
  method: 'create' | 'update' | 'delete';
  coll: PlcContentCollection;
  docId: string;
  uid: string;
  /** plcs/{plcId} data, or null when the PLC doc is missing. */
  plc: Data | null;
  /** request.resource.data: the doc as it would be after the write (create and update). */
  incoming: Data;
  /** resource.data: the stored doc, or null when it doesn't exist. */
  existing: Data | null;
}

// ── Value helpers. A rules read of a missing key is an error, and an error denies. ──

const has = (d: Data | null, k: string): d is Data =>
  !!d && Object.prototype.hasOwnProperty.call(d, k);
interface TsLike {
  seconds: number;
  nanoseconds: number;
  toMillis: () => number;
}
/** A Firestore Timestamp (Admin or web SDK); duck-typed so the module has no SDK import. */
const isTs = (v: unknown): v is TsLike =>
  !!v &&
  typeof v === 'object' &&
  typeof (v as TsLike).seconds === 'number' &&
  typeof (v as TsLike).nanoseconds === 'number' &&
  typeof (v as TsLike).toMillis === 'function';
const isMapVal = (v: unknown): v is Data =>
  !!v && typeof v === 'object' && !Array.isArray(v) && !isTs(v);
/** What Firestore stores as integerValue: safe integers other than -0 (the rest become doubles). */
const isIntVal = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && !Object.is(v, -0);

/** `get(k, dflt)` in rules. */
const getOr = (d: Data | null, k: string, dflt: unknown): unknown =>
  has(d, k) ? d[k] : dflt;

/** Rules `==`: deep value equality, with timestamps compared by instant. */
export function rulesEqual(a: unknown, b: unknown): boolean {
  if (isTs(a) || isTs(b))
    return (
      isTs(a) &&
      isTs(b) &&
      a.seconds === b.seconds &&
      a.nanoseconds === b.nanoseconds
    );
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v, i) => rulesEqual(v, b[i]))
    );
  }
  if (isMapVal(a) || isMapVal(b)) {
    if (!isMapVal(a) || !isMapVal(b)) return false;
    const ka = Object.keys(a);
    return (
      ka.length === Object.keys(b).length &&
      ka.every((k) => has(b, k) && rulesEqual(a[k], b[k]))
    );
  }
  return a === b;
}

const isStr = (d: Data, k: string) => has(d, k) && typeof d[k] === 'string';
const isInt = (d: Data, k: string) => has(d, k) && isIntVal(d[k]);
const isNum = (d: Data, k: string) => has(d, k) && typeof d[k] === 'number';
const isList = (d: Data, k: string) => has(d, k) && Array.isArray(d[k]);
const isMap = (d: Data, k: string) => has(d, k) && isMapVal(d[k]);
const optStr = (d: Data, k: string) => !has(d, k) || typeof d[k] === 'string';
const optMap = (d: Data, k: string) => !has(d, k) || isMapVal(d[k]);
const optInt = (d: Data, k: string) => !has(d, k) || isIntVal(d[k]);
const optBool = (d: Data, k: string) => !has(d, k) || typeof d[k] === 'boolean';
const optNullStr = (d: Data, k: string) =>
  !has(d, k) || d[k] === null || typeof d[k] === 'string';
const optListMax = (d: Data, k: string, n: number) =>
  !has(d, k) || (Array.isArray(d[k]) && (d[k] as unknown[]).length <= n);
const listMax = (d: Data, k: string, n: number) =>
  isList(d, k) && (d[k] as unknown[]).length <= n;
const nonEmptyStr = (d: Data, k: string) =>
  isStr(d, k) && (d[k] as string).length > 0;
const intAtLeast0 = (d: Data, k: string) =>
  isInt(d, k) && (d[k] as number) >= 0;
const keysOnly = (d: Data, allowed: readonly string[]) =>
  Object.keys(d).every((k) => allowed.includes(k));
const oneOf = (d: Data, k: string, values: readonly string[]) =>
  has(d, k) && typeof d[k] === 'string' && values.includes(d[k]);

/** plcSubTimeFieldOk: missing reads as 0, which passes. */
const timeOk = (d: Data, k: string) => {
  const v = getOr(d, k, 0);
  return isTs(v) || isIntVal(v);
};
/** plcSubNullableTimeFieldOk / plcSubDeletedAtOk. */
const nullableTimeOk = (d: Data, k: string) => {
  const v = getOr(d, k, null);
  return v === null || isTs(v) || isIntVal(v);
};

/** unchanged(k): both sides must hold the key, and the values must match. */
const unchanged = (r: PlcContentRequest, k: string) =>
  has(r.incoming, k) &&
  has(r.existing, k) &&
  rulesEqual(r.incoming[k], r.existing[k]);
const allUnchanged = (r: PlcContentRequest, keys: readonly string[]) =>
  keys.every((k) => unchanged(r, k));

/** `existing().<k> == authUid()`, where a missing doc or key is an error (false). */
const existingIs = (r: PlcContentRequest, k: string) =>
  has(r.existing, k) && r.existing[k] === r.uid;
const incomingIs = (r: PlcContentRequest, k: string) =>
  has(r.incoming, k) && r.incoming[k] === r.uid;
const idPinned = (r: PlcContentRequest) =>
  has(r.incoming, 'id') && r.incoming.id === r.docId;

// ── Membership, as plcMember / plcCanEditContent / isPlcMembershipManager. notDeactivated is checked by the caller. ──

function memberUids(plc: Data | null): string[] | null {
  return plc && Array.isArray(plc.memberUids)
    ? (plc.memberUids as string[])
    : null;
}

/** members.get(uid, {}), or null where the rules' `.get` would error on a non-map. */
function memberEntry(plc: Data, uid: string): Data | null {
  const members = getOr(plc, 'members', {});
  if (!isMapVal(members)) return null;
  const entry = getOr(members, uid, {});
  return isMapVal(entry) ? entry : null;
}

export function plcMember(plc: Data | null, uid: string): boolean {
  return !!memberUids(plc)?.includes(uid);
}

export function plcCanEditContent(plc: Data | null, uid: string): boolean {
  return (
    !!plc &&
    plcMember(plc, uid) &&
    memberEntry(plc, uid) !== null &&
    getOr(memberEntry(plc, uid), 'role', '') !== 'viewer'
  );
}

export function isPlcMembershipManager(plc: Data | null, uid: string): boolean {
  if (!plc) return false;
  const uids = getOr(plc, 'memberUids', []);
  if (!Array.isArray(uids) || !uids.includes(uid)) return false;
  if (uid === getOr(plc, 'leadUid', '')) return true;
  const entry = memberEntry(plc, uid);
  if (!entry) return false;
  const role = getOr(entry, 'role', '');
  return (
    (role === 'lead' || role === 'coLead') &&
    getOr(entry, 'status', 'active') !== 'removed'
  );
}

// ── Per-collection rules ──

const SHARED_BY = ['sharedBy', 'sharedByEmail', 'sharedByName', 'sharedAt'];
const SESSION_MODES = ['teacher', 'auto', 'student'];

const ASSIGNMENT_INDEX_KEYS = [
  'id',
  'kind',
  'ownerUid',
  'ownerName',
  'ownerEmail',
  'title',
  'sheetUrl',
  'status',
  'createdAt',
];
const SHEET_URL = /^https:\/\/docs[.]google[.]com\/spreadsheets\/.*$/;

function assignmentIndexBody(r: PlcContentRequest): boolean {
  const d = r.incoming;
  return (
    idPinned(r) &&
    keysOnly(d, ASSIGNMENT_INDEX_KEYS) &&
    oneOf(d, 'kind', ['quiz', 'video-activity']) &&
    oneOf(d, 'status', ['active', 'paused', 'inactive']) &&
    isStr(d, 'sheetUrl') &&
    (d.sheetUrl === '' || SHEET_URL.test(d.sheetUrl as string))
  );
}

const ASSESSMENT_KEYS = [
  'id',
  'title',
  'kind',
  'syncGroupId',
  'unitLabel',
  'opensAt',
  'dueAt',
  'status',
  'createdBy',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'sourceQuizId',
  'dirtyAt',
  'folderId',
];
const ASSESSMENT_STATUSES = ['planning', 'active', 'reviewing', 'closed'];

function assessmentCommon(d: Data): boolean {
  return (
    isStr(d, 'title') &&
    oneOf(d, 'status', ASSESSMENT_STATUSES) &&
    optStr(d, 'unitLabel') &&
    nullableTimeOk(d, 'opensAt') &&
    nullableTimeOk(d, 'dueAt') &&
    nullableTimeOk(d, 'deletedAt') &&
    timeOk(d, 'updatedAt') &&
    optNullStr(d, 'folderId')
  );
}

const QUIZ_KEYS = [
  'id',
  'title',
  'questionCount',
  'syncGroupId',
  'sharedBy',
  'sharedByEmail',
  'sharedByName',
  'sharedAt',
  'updatedAt',
  'deletedAt',
  'sessionMode',
  'sessionOptions',
  'attemptLimit',
  'quizId',
  'folderId',
  'archived',
];

/** plcQuizRunSettingsOk. */
function quizRunSettingsOk(d: Data): boolean {
  return (
    (!has(d, 'sessionMode') ||
      (typeof d.sessionMode === 'string' &&
        SESSION_MODES.includes(d.sessionMode))) &&
    optMap(d, 'sessionOptions') &&
    (!has(d, 'attemptLimit') ||
      d.attemptLimit === null ||
      isIntVal(d.attemptLimit)) &&
    optStr(d, 'quizId')
  );
}

function quizCommon(d: Data): boolean {
  return (
    quizRunSettingsOk(d) &&
    optBool(d, 'archived') &&
    isStr(d, 'title') &&
    intAtLeast0(d, 'questionCount') &&
    isInt(d, 'updatedAt') &&
    optNullStr(d, 'folderId') &&
    nullableTimeOk(d, 'deletedAt')
  );
}

const BANK_KEYS = [
  'id',
  'title',
  'questionCount',
  'syncGroupId',
  'targetIds',
  'sharedBy',
  'sharedByEmail',
  'sharedByName',
  'sharedAt',
  'updatedAt',
  'deletedAt',
];
const VIDEO_KEYS = [
  'id',
  'title',
  'youtubeUrl',
  'questionCount',
  'syncGroupId',
  'sharedBy',
  'sharedByEmail',
  'sharedByName',
  'sharedAt',
  'updatedAt',
  'deletedAt',
];
const RUBRIC_KEYS = [
  'id',
  'title',
  'description',
  'criteria',
  'createdAt',
  'updatedAt',
  'sharedBy',
  'sharedByEmail',
  'sharedByName',
  'sharedAt',
  'deletedAt',
];
const FLASHCARD_SET_KEYS = [
  'id',
  'title',
  'description',
  'termLanguage',
  'definitionLanguage',
  'cards',
  'createdAt',
  'updatedAt',
  'sharedBy',
  'sharedByEmail',
  'sharedByName',
  'sharedAt',
  'deletedAt',
  'speak',
];
const FLASHCARD_RESULT_KEYS = [
  'id',
  'setId',
  'setTitle',
  'kind',
  'classLabel',
  'students',
  'completed',
  'averagePercent',
  'cards',
  'sharedBy',
  'sharedByEmail',
  'sharedByName',
  'sharedAt',
  'updatedAt',
];
const ASSIGNMENT_KEYS = [
  'id',
  'quizTitle',
  'quizId',
  'syncGroupId',
  'sessionMode',
  'sessionOptions',
  'attemptLimit',
  'sharedBy',
  'sharedByEmail',
  'sharedByName',
  'sharedAt',
  'updatedAt',
];
const DOC_KEYS = [
  'id',
  'title',
  'url',
  'createdBy',
  'createdByName',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'actionItems',
];

/** sharedByEmail/Name strings and an int sharedAt, on create. */
const sharerFieldsOk = (d: Data) =>
  isStr(d, 'sharedByEmail') && isStr(d, 'sharedByName') && isInt(d, 'sharedAt');

/** `attemptLimit == null || isInt('attemptLimit')`: the key must be present. */
const attemptLimitSet = (d: Data) =>
  has(d, 'attemptLimit') &&
  (d.attemptLimit === null || isIntVal(d.attemptLimit));

function flashcardSetCommon(d: Data): boolean {
  return (
    keysOnly(d, FLASHCARD_SET_KEYS) &&
    optMap(d, 'speak') &&
    isStr(d, 'title') &&
    isStr(d, 'termLanguage') &&
    isStr(d, 'definitionLanguage') &&
    listMax(d, 'cards', 1000) &&
    isInt(d, 'updatedAt') &&
    nullableTimeOk(d, 'deletedAt')
  );
}

function assignmentCommon(d: Data): boolean {
  return (
    keysOnly(d, ASSIGNMENT_KEYS) &&
    isStr(d, 'quizTitle') &&
    oneOf(d, 'sessionMode', SESSION_MODES) &&
    isMap(d, 'sessionOptions') &&
    attemptLimitSet(d) &&
    isInt(d, 'updatedAt')
  );
}

function docCommon(d: Data): boolean {
  return (
    keysOnly(d, DOC_KEYS) &&
    isStr(d, 'title') &&
    isStr(d, 'url') &&
    nullableTimeOk(d, 'deletedAt') &&
    optListMax(d, 'actionItems', 200) &&
    timeOk(d, 'updatedAt')
  );
}

/** Collections whose delete rule is just plcEd() (the shared `match /{coll}/{collDocId}` rule). */
const EDITOR_DELETE: readonly PlcContentCollection[] = [
  'assessments',
  'assignments',
  'docs',
  'flashcard_sets',
  'quizzes',
  'rubrics',
  'video_activities',
];

/** True when firestore.rules would allow this write. */
export function plcContentWriteAllowed(r: PlcContentRequest): boolean {
  const { plc, uid, incoming: d, method } = r;
  const ed = plcCanEditContent(plc, uid);

  if (method === 'delete') {
    if (EDITOR_DELETE.includes(r.coll)) return ed;
    if (r.coll === 'question_banks')
      return (
        ed && (existingIs(r, 'sharedBy') || isPlcMembershipManager(plc, uid))
      );
    if (r.coll === 'flashcard_results') return existingIs(r, 'sharedBy');
    if (r.coll === 'assignment_index') return existingIs(r, 'ownerUid');
    return false;
  }
  const create = method === 'create';

  switch (r.coll) {
    case 'assignment_index':
      return create
        ? incomingIs(r, 'ownerUid') &&
            plcMember(plc, uid) &&
            assignmentIndexBody(r)
        : existingIs(r, 'ownerUid') &&
            plcMember(plc, uid) &&
            allUnchanged(r, ['id', 'ownerUid', 'createdAt']) &&
            assignmentIndexBody(r);

    case 'assessments':
      if (create) {
        return (
          ed &&
          keysOnly(d, ASSESSMENT_KEYS) &&
          idPinned(r) &&
          has(d, 'createdBy') &&
          d.createdBy === uid &&
          oneOf(d, 'kind', ['quiz', 'video-activity']) &&
          nonEmptyStr(d, 'syncGroupId') &&
          assessmentCommon(d) &&
          timeOk(d, 'createdAt') &&
          optStr(d, 'sourceQuizId') &&
          getOr(d, 'dirtyAt', null) === null
        );
      }
      return (
        ed &&
        keysOnly(d, [...ASSESSMENT_KEYS, 'order']) &&
        allUnchanged(r, [
          'id',
          'createdBy',
          'createdAt',
          'kind',
          'syncGroupId',
        ]) &&
        assessmentCommon(d) &&
        optInt(d, 'order') &&
        rulesEqual(
          getOr(d, 'sourceQuizId', null),
          getOr(r.existing, 'sourceQuizId', null)
        ) &&
        rulesEqual(
          getOr(d, 'dirtyAt', null),
          getOr(r.existing, 'dirtyAt', null)
        )
      );

    case 'quizzes':
      if (create) {
        return (
          ed &&
          keysOnly(d, QUIZ_KEYS) &&
          idPinned(r) &&
          incomingIs(r, 'sharedBy') &&
          nonEmptyStr(d, 'syncGroupId') &&
          sharerFieldsOk(d) &&
          quizCommon(d)
        );
      }
      return (
        ed &&
        keysOnly(d, [...QUIZ_KEYS, 'order']) &&
        optInt(d, 'order') &&
        allUnchanged(r, ['id', 'syncGroupId', ...SHARED_BY]) &&
        quizCommon(d)
      );

    case 'question_banks':
      if (create) {
        return (
          ed &&
          keysOnly(d, BANK_KEYS) &&
          idPinned(r) &&
          incomingIs(r, 'sharedBy') &&
          isStr(d, 'title') &&
          intAtLeast0(d, 'questionCount') &&
          nonEmptyStr(d, 'syncGroupId') &&
          isList(d, 'targetIds') &&
          sharerFieldsOk(d) &&
          isInt(d, 'updatedAt') &&
          nullableTimeOk(d, 'deletedAt')
        );
      }
      // No questionCount >= 0 on update, as in the rule.
      return (
        ed &&
        (existingIs(r, 'sharedBy') || isPlcMembershipManager(plc, uid)) &&
        keysOnly(d, BANK_KEYS) &&
        allUnchanged(r, ['id', 'syncGroupId', ...SHARED_BY]) &&
        isStr(d, 'title') &&
        isInt(d, 'questionCount') &&
        isList(d, 'targetIds') &&
        isInt(d, 'updatedAt') &&
        nullableTimeOk(d, 'deletedAt')
      );

    case 'video_activities': {
      const body =
        keysOnly(d, VIDEO_KEYS) &&
        isStr(d, 'title') &&
        isStr(d, 'youtubeUrl') &&
        intAtLeast0(d, 'questionCount') &&
        isInt(d, 'updatedAt') &&
        nullableTimeOk(d, 'deletedAt');
      return create
        ? ed &&
            body &&
            idPinned(r) &&
            incomingIs(r, 'sharedBy') &&
            nonEmptyStr(d, 'syncGroupId') &&
            sharerFieldsOk(d)
        : ed && body && allUnchanged(r, ['id', 'syncGroupId', ...SHARED_BY]);
    }

    case 'rubrics': {
      const body =
        keysOnly(d, RUBRIC_KEYS) &&
        isStr(d, 'title') &&
        isList(d, 'criteria') &&
        isInt(d, 'updatedAt') &&
        nullableTimeOk(d, 'deletedAt');
      return create
        ? ed &&
            body &&
            idPinned(r) &&
            incomingIs(r, 'sharedBy') &&
            sharerFieldsOk(d) &&
            isInt(d, 'createdAt')
        : ed && body && allUnchanged(r, ['id', ...SHARED_BY, 'createdAt']);
    }

    case 'flashcard_sets':
      return create
        ? ed &&
            flashcardSetCommon(d) &&
            idPinned(r) &&
            incomingIs(r, 'sharedBy') &&
            sharerFieldsOk(d) &&
            isInt(d, 'createdAt')
        : ed &&
            flashcardSetCommon(d) &&
            allUnchanged(r, ['id', ...SHARED_BY, 'createdAt']);

    case 'flashcard_results':
      return (
        ed &&
        keysOnly(d, FLASHCARD_RESULT_KEYS) &&
        idPinned(r) &&
        incomingIs(r, 'sharedBy') &&
        (create || existingIs(r, 'sharedBy')) &&
        isStr(d, 'setId') &&
        isStr(d, 'setTitle') &&
        oneOf(d, 'kind', ['check', 'study']) &&
        isStr(d, 'classLabel') &&
        isInt(d, 'students') &&
        isInt(d, 'completed') &&
        isNum(d, 'averagePercent') &&
        listMax(d, 'cards', 1000) &&
        sharerFieldsOk(d) &&
        isInt(d, 'updatedAt')
      );

    case 'assignments':
      return create
        ? ed &&
            assignmentCommon(d) &&
            idPinned(r) &&
            incomingIs(r, 'sharedBy') &&
            isStr(d, 'quizId') &&
            nonEmptyStr(d, 'syncGroupId') &&
            sharerFieldsOk(d)
        : ed &&
            assignmentCommon(d) &&
            allUnchanged(r, ['id', 'quizId', 'syncGroupId', ...SHARED_BY]);

    case 'docs':
      return create
        ? ed &&
            docCommon(d) &&
            idPinned(r) &&
            has(d, 'createdBy') &&
            d.createdBy === uid &&
            isStr(d, 'createdByName') &&
            timeOk(d, 'createdAt')
        : ed &&
            docCommon(d) &&
            allUnchanged(r, ['id', 'createdBy', 'createdAt']);
  }
  return false;
}

// ── Payload handling shared by the callable and the parity test ──

/** Stand-ins for serverTimestamp() and deleteField(), which a callable payload can't carry. */
export const SENTINEL_KEY = '__plcSentinel';
export type Sentinel = 'serverTime' | 'deleteField';

export function sentinelOf(v: unknown): Sentinel | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const s = (v as Data)[SENTINEL_KEY];
  return s === 'serverTime' || s === 'deleteField' ? s : null;
}

export interface PlcContentWrite {
  op: 'set' | 'update' | 'delete';
  coll: PlcContentCollection;
  id: string;
  data?: Data;
}

export interface ContentWriteDeps {
  serverTime: () => unknown;
  deleteField: () => unknown;
  /** What request.time reads as while validating. */
  now: () => unknown;
}

/** The doc the rules would see as request.resource.data, and the payload Firestore writes. */
export function resolveWrite(
  w: PlcContentWrite,
  existing: Data | null,
  deps: ContentWriteDeps
): { incoming: Data; payload: Data } {
  const incoming: Data = w.op === 'update' ? { ...(existing ?? {}) } : {};
  const payload: Data = {};
  const now = deps.now();
  for (const [k, v] of Object.entries(w.data ?? {})) {
    const s = sentinelOf(v);
    if (s === 'deleteField') {
      delete incoming[k];
      payload[k] = deps.deleteField();
    } else if (s === 'serverTime') {
      incoming[k] = now;
      payload[k] = deps.serverTime();
    } else if (v !== undefined) {
      incoming[k] = v;
      payload[k] = v;
    }
  }
  return { incoming, payload };
}
