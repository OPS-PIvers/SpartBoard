// Schoology LTI 1.3 — push scores into gradebook columns SpartBoard creates
// (docs/plans/SCHOOLOGY_TOOL_COLUMNS.md D4–D7, D12–D13). Network, Firestore and
// secrets come in through `ToolColumnDeps`, so the callables in
// toolColumnEndpoints.ts stay thin and this logic is testable on its own.

import type { NrpsMember } from './nrps';
import { deriveRole } from './jwt';
import {
  isSchoologyServiceUrl,
  lineItemColumnId,
  schoologySectionUrls,
  type LineItem,
  type NewLineItem,
} from './lineItems';
import type { AgsScore } from './ags';
import {
  SCHOOLOGY_EXCEPTION,
  schoologyUidFromSub,
  type ColumnGrade,
  type Enrollment,
  type ExceptionWrite,
  type GradingCategory,
} from '../schoology/restClient';

/** How long a create claim blocks a second create before it counts as abandoned. */
export const CREATE_LEASE_MS = 60_000;
const SCORE_CONCURRENCY = 8;
export const MISSING_COMMENT = 'Missing';

/** Benign skip reasons; the client counts these apart from failures. */
export const SKIP = {
  NOT_IN_SECTION: 'not in Schoology section',
  PIN: 'pin student',
  UNCHANGED: 'unchanged',
  FLAGGED: 'flagged in Schoology',
  GRADED_THERE: 'graded in Schoology',
  NO_CATEGORY: 'no Schoology category',
  NO_COLUMN: 'no Schoology column',
  DUPLICATE: 'duplicate student',
} as const;

export interface ToolColumnRecord {
  lineitemUrl: string;
  /** Schoology's REST id for the column (the line item URL's last segment). */
  columnId: string | null;
  scoreMaximum: number;
  categoryId: string | null;
  /** `ltiStudentUid(sub)` → fingerprint of the last value written. */
  lastPushed: Record<string, string>;
}

export interface ColumnStore {
  get(contextId: string): Promise<ToolColumnRecord | null>;
  /** Claim the right to create; 'exists' returns the record a parallel call finished. */
  claimCreate(
    contextId: string,
    now: number
  ): Promise<
    | { state: 'claimed' }
    | { state: 'busy' }
    | { state: 'exists'; record: ToolColumnRecord }
  >;
  releaseClaim(contextId: string): Promise<void>;
  save(contextId: string, record: ToolColumnRecord): Promise<void>;
  clear(contextId: string): Promise<void>;
  recordPush(
    contextId: string,
    lastPushed: Record<string, string>,
    scoreMaximum: number
  ): Promise<void>;
  setCategoryId(contextId: string, categoryId: string): Promise<void>;
  getPref(contextId: string): Promise<string | null>;
  setPref(contextId: string, categoryId: string): Promise<void>;
}

/** REST calls, already bound to the API credentials. Null when REST isn't configured. */
export interface RestOps {
  listGradingCategories(sectionId: string): Promise<GradingCategory[]>;
  createGradingCategories(
    sectionId: string,
    categories: { title: string; weight: number }[]
  ): Promise<GradingCategory[]>;
  setColumnCategory(
    sectionId: string,
    columnId: string,
    categoryId: string
  ): Promise<void>;
  getColumnCategory(
    sectionId: string,
    columnId: string
  ): Promise<string | null>;
  listColumnGrades(sectionId: string, columnId: string): Promise<ColumnGrade[]>;
  setExceptions(sectionId: string, rows: ExceptionWrite[]): Promise<boolean[]>;
  listEnrollments(sectionId: string): Promise<Enrollment[]>;
}

export interface ToolColumnDeps {
  now(): number;
  token(): Promise<string>;
  listLineItems(
    lineitemsUrl: string,
    token: string,
    filter: { resourceId?: string }
  ): Promise<LineItem[]>;
  createLineItem(
    lineitemsUrl: string,
    token: string,
    item: NewLineItem
  ): Promise<LineItem>;
  updateLineItemMaximum(
    lineitemUrl: string,
    token: string,
    scoreMaximum: number
  ): Promise<'updated' | 'unchanged' | 'not-found'>;
  postScore(opts: {
    lineitemUrl: string;
    accessToken: string;
    score: AgsScore;
    timestamp: string;
  }): Promise<{ ok: boolean; status: number; isRedirect: boolean }>;
  nrpsMembers(membershipUrl: string, token: string): Promise<NrpsMember[]>;
  subUid(sub: string): string;
  /** `ltiStudentUid(sub)` → the ClassLink uid a student was bridged to. */
  bridgeUids(subUids: string[]): Promise<Map<string, string>>;
  /** Lowercased email → SpartBoard uid for a ClassLink class. */
  oneRosterUids(classlinkClassId: string): Promise<Map<string, string>>;
  rest: RestOps | null;
  store: ColumnStore;
}

export interface GradeEntry {
  pseudonymUid: string;
  pointsEarned?: number;
  missing?: boolean;
}

export interface PushResult {
  pseudonymUid: string;
  ok: boolean;
  status?: number;
  reason?: string;
  missing?: boolean;
  /** Set when Missing fell back to a text comment because the flag couldn't be written. */
  missingComment?: boolean;
  isRedirect?: boolean;
}

export interface TargetSection {
  contextId: string;
  title: string | null;
  classlinkClassId: string | null;
}

export type SectionStatus =
  | 'pushed'
  | 'needs-category'
  | 'no-column'
  | 'busy'
  | 'failed';

export interface SectionOutcome {
  contextId: string;
  title: string | null;
  status: SectionStatus;
  columnCreated: boolean;
  /** The column exists but sits in no category, so Schoology hides it. */
  needsCategory: boolean;
  results: PushResult[];
}

export interface PushSectionInput {
  section: TargetSection;
  resourceId: string;
  label: string;
  maxPoints: number;
  grades: GradeEntry[];
  /** An explicit "Push to Schoology" may create the column; Publish = Push may not. */
  create: boolean;
  /** The category the teacher picked for a new column, or to repair one in no category. */
  categoryId: string | null;
}

/** `spartboard:{kind}:{sessionId}`, the line item's resource id. */
export const toolColumnResourceId = (kind: string, sessionId: string): string =>
  `spartboard:${kind}:${sessionId}`;

const isActiveLearner = (m: NrpsMember): boolean =>
  (!m.status || m.status.toLowerCase() === 'active') &&
  deriveRole(m.roles) === 'student';

const skipAll = (
  grades: GradeEntry[],
  reason: string,
  ok = false
): PushResult[] =>
  grades.map((g) => ({ pseudonymUid: g.pseudonymUid, ok, reason }));

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return out;
}

type ColumnResult =
  | { kind: 'ready'; record: ToolColumnRecord; created: boolean }
  | { kind: 'skip'; status: SectionStatus; reason: string };

/** Find or create the section's column, keeping its total equal to `maxPoints`. */
async function ensureColumn(
  deps: ToolColumnDeps,
  input: PushSectionInput,
  token: string
): Promise<ColumnResult> {
  const { contextId } = input.section;
  const existing = await deps.store.get(contextId);
  if (existing && isSchoologyServiceUrl(existing.lineitemUrl)) {
    const r = await deps.updateLineItemMaximum(
      existing.lineitemUrl,
      token,
      input.maxPoints
    );
    if (r !== 'not-found')
      return { kind: 'ready', record: existing, created: false };
    // The teacher deleted the column in Schoology; an explicit push recreates it once.
    await deps.store.clear(contextId);
  }
  if (!input.create) {
    return { kind: 'skip', status: 'no-column', reason: SKIP.NO_COLUMN };
  }

  // With REST reachable a new column needs a real category, or Schoology hides it.
  let categoryId: string | null = null;
  if (deps.rest) {
    let categories: GradingCategory[] | null = null;
    try {
      categories = await deps.rest.listGradingCategories(contextId);
    } catch (err) {
      console.warn(
        '[toolColumns] category list failed; creating without:',
        err
      );
    }
    if (categories) {
      if (
        !input.categoryId ||
        !categories.some((c) => c.id === input.categoryId)
      ) {
        return {
          kind: 'skip',
          status: 'needs-category',
          reason: SKIP.NO_CATEGORY,
        };
      }
      categoryId = input.categoryId;
    }
  }

  const claim = await deps.store.claimCreate(contextId, deps.now());
  if (claim.state === 'exists') {
    return { kind: 'ready', record: claim.record, created: false };
  }
  if (claim.state === 'busy') {
    return { kind: 'skip', status: 'busy', reason: 'column being created' };
  }
  try {
    const { lineitemsUrl } = schoologySectionUrls(contextId);
    // A crash after POST leaves an orphan column; find it by resource id first.
    const [found] = await deps.listLineItems(lineitemsUrl, token, {
      resourceId: input.resourceId,
    });
    const item =
      found ??
      (await deps.createLineItem(lineitemsUrl, token, {
        label: input.label,
        resourceId: input.resourceId,
        scoreMaximum: input.maxPoints,
      }));
    if (found && found.scoreMaximum !== input.maxPoints) {
      await deps.updateLineItemMaximum(item.id, token, input.maxPoints);
    }
    const columnId = lineItemColumnId(item.id);
    let savedCategory: string | null = null;
    if (deps.rest && categoryId && columnId) {
      try {
        await deps.rest.setColumnCategory(contextId, columnId, categoryId);
        savedCategory = categoryId;
      } catch (err) {
        console.warn('[toolColumns] setting the column category failed:', err);
      }
    }
    const record: ToolColumnRecord = {
      lineitemUrl: item.id,
      columnId,
      scoreMaximum: input.maxPoints,
      categoryId: savedCategory,
      lastPushed: {},
    };
    await deps.store.save(contextId, record);
    if (categoryId) await deps.store.setPref(contextId, categoryId);
    return { kind: 'ready', record, created: !found };
  } catch (err) {
    await deps.store.releaseClaim(contextId).catch(() => undefined);
    throw err;
  }
}

/** Repair a column left in category 0 (its categories were deleted later). */
async function checkCategory(
  deps: ToolColumnDeps,
  contextId: string,
  record: ToolColumnRecord,
  pickedCategoryId: string | null
): Promise<boolean> {
  if (!deps.rest || !record.columnId) return false;
  let current: string | null;
  try {
    current = await deps.rest.getColumnCategory(contextId, record.columnId);
  } catch (err) {
    console.warn('[toolColumns] column category read failed:', err);
    return false;
  }
  if (current !== '0') return false;
  if (!pickedCategoryId) return true;
  try {
    const categories = await deps.rest.listGradingCategories(contextId);
    if (!categories.some((c) => c.id === pickedCategoryId)) return true;
    await deps.rest.setColumnCategory(
      contextId,
      record.columnId,
      pickedCategoryId
    );
    await deps.store.setCategoryId(contextId, pickedCategoryId);
    await deps.store.setPref(contextId, pickedCategoryId);
    return false;
  } catch (err) {
    console.warn('[toolColumns] category repair failed:', err);
    return true;
  }
}

interface MatchedEntry {
  index: number;
  entry: GradeEntry;
  sub: string;
  subUid: string;
  fingerprint: string;
}

/** Map the section's learners onto SpartBoard response uids (D7). */
async function matchMembers(
  deps: ToolColumnDeps,
  section: TargetSection,
  token: string
): Promise<Map<string, { sub: string; subUid: string }>> {
  const { membershipUrl } = schoologySectionUrls(section.contextId);
  const learners = (await deps.nrpsMembers(membershipUrl, token)).filter(
    isActiveLearner
  );
  const subUids = learners.map((m) => deps.subUid(m.userId));
  const bridged = await deps
    .bridgeUids(subUids)
    .catch(() => new Map<string, string>());
  let byEmail = new Map<string, string>();
  if (section.classlinkClassId) {
    try {
      byEmail = await deps.oneRosterUids(section.classlinkClassId);
    } catch (err) {
      console.warn('[toolColumns] OneRoster lookup failed:', err);
    }
  }
  const out = new Map<string, { sub: string; subUid: string }>();
  learners.forEach((m, i) => {
    const target = { sub: m.userId, subUid: subUids[i] };
    const keys = [
      subUids[i],
      bridged.get(subUids[i]),
      m.email ? byEmail.get(m.email) : undefined,
    ];
    for (const k of keys) if (k && !out.has(k)) out.set(k, target);
  });
  return out;
}

const fingerprintOf = (entry: GradeEntry, maxPoints: number): string | null => {
  if (entry.missing === true) return 'm';
  if (
    typeof entry.pointsEarned !== 'number' ||
    !Number.isFinite(entry.pointsEarned)
  ) {
    return null;
  }
  return `s:${Math.max(0, Math.min(maxPoints, entry.pointsEarned))}`;
};

/** Push one section: ensure its column, then write only the cells that changed (D12). */
export async function pushSection(
  deps: ToolColumnDeps,
  input: PushSectionInput
): Promise<SectionOutcome> {
  const { section } = input;
  const base = {
    contextId: section.contextId,
    title: section.title,
    columnCreated: false,
    needsCategory: false,
  };
  const token = await deps.token();
  const column = await ensureColumn(deps, input, token);
  if (column.kind === 'skip') {
    return {
      ...base,
      status: column.status,
      needsCategory: column.status === 'needs-category',
      results: skipAll(input.grades, column.reason),
    };
  }
  const { record } = column;
  const needsCategory = await checkCategory(
    deps,
    section.contextId,
    record,
    input.categoryId
  );
  const members = await matchMembers(deps, section, token);

  const results: PushResult[] = input.grades.map((g) => ({
    pseudonymUid: g.pseudonymUid,
    ok: false,
    reason: 'invalid entry',
  }));
  const toScore: MatchedEntry[] = [];
  const toMiss: MatchedEntry[] = [];
  const claimedSubs = new Set<string>();
  input.grades.forEach((entry, index) => {
    const uid = entry.pseudonymUid;
    const skip = (reason: string) => {
      results[index] = { pseudonymUid: uid, ok: false, reason };
    };
    const fingerprint = fingerprintOf(entry, input.maxPoints);
    if (!uid || fingerprint === null) return;
    if (uid.startsWith('pin-')) return skip(SKIP.PIN);
    const member = members.get(uid);
    if (!member) return skip(SKIP.NOT_IN_SECTION);
    if (claimedSubs.has(member.subUid)) return skip(SKIP.DUPLICATE);
    claimedSubs.add(member.subUid);
    if (record.lastPushed[member.subUid] === fingerprint) {
      return skip(SKIP.UNCHANGED);
    }
    const matched = { index, entry, ...member, fingerprint };
    (entry.missing === true ? toMiss : toScore).push(matched);
  });

  const pushed: Record<string, string> = {};
  const timestamp = new Date(deps.now()).toISOString();
  const postComment = async (m: MatchedEntry): Promise<void> => {
    const r = await deps.postScore({
      lineitemUrl: record.lineitemUrl,
      accessToken: token,
      score: {
        userId: m.sub,
        scoreMaximum: input.maxPoints,
        comment: MISSING_COMMENT,
      },
      timestamp,
    });
    results[m.index] = {
      pseudonymUid: m.entry.pseudonymUid,
      ok: r.ok,
      status: r.status,
      isRedirect: r.isRedirect,
      missing: true,
      missingComment: true,
    };
    // 'mc' differs from 'm', so a later push retries the real flag.
    if (r.ok) pushed[m.subUid] = 'mc';
  };

  await mapLimit(toScore, SCORE_CONCURRENCY, async (m) => {
    const r = await deps.postScore({
      lineitemUrl: record.lineitemUrl,
      accessToken: token,
      score: {
        userId: m.sub,
        scoreGiven: Number(m.fingerprint.slice(2)),
        scoreMaximum: input.maxPoints,
      },
      timestamp,
    });
    results[m.index] = {
      pseudonymUid: m.entry.pseudonymUid,
      ok: r.ok,
      status: r.status,
      isRedirect: r.isRedirect,
    };
    if (r.ok) pushed[m.subUid] = m.fingerprint;
  });

  if (toMiss.length > 0) {
    const fallback = await markMissing(
      deps,
      section.contextId,
      record,
      toMiss,
      results,
      pushed
    );
    await mapLimit(fallback, SCORE_CONCURRENCY, postComment);
  }

  if (
    Object.keys(pushed).length > 0 ||
    record.scoreMaximum !== input.maxPoints
  ) {
    await deps.store.recordPush(section.contextId, pushed, input.maxPoints);
  }
  return {
    ...base,
    status: 'pushed',
    columnCreated: column.created,
    needsCategory,
    results,
  };
}

/** Set Schoology's Missing flag through REST; returns the entries that need the comment fallback. */
async function markMissing(
  deps: ToolColumnDeps,
  contextId: string,
  record: ToolColumnRecord,
  entries: MatchedEntry[],
  results: PushResult[],
  pushed: Record<string, string>
): Promise<MatchedEntry[]> {
  if (!deps.rest || !record.columnId) return entries;
  const columnId = record.columnId;
  let enrollmentByUid: Map<string, string>;
  let cells: Map<string, ColumnGrade>;
  try {
    const [enrollments, grades] = await Promise.all([
      deps.rest.listEnrollments(contextId),
      deps.rest.listColumnGrades(contextId, columnId),
    ]);
    enrollmentByUid = new Map(
      enrollments.filter((e) => !e.isAdmin).map((e) => [e.uid, e.enrollmentId])
    );
    cells = new Map(grades.map((g) => [g.enrollmentId, g]));
  } catch (err) {
    console.warn('[toolColumns] REST read for Missing failed:', err);
    return entries;
  }

  const fallback: MatchedEntry[] = [];
  const rows: { entry: MatchedEntry; enrollmentId: string }[] = [];
  for (const m of entries) {
    const uid = schoologyUidFromSub(m.sub);
    const enrollmentId = uid ? enrollmentByUid.get(uid) : undefined;
    if (!enrollmentId) {
      fallback.push(m);
      continue;
    }
    const cell = cells.get(enrollmentId);
    // The teacher's own flag or hand-entered grade wins over Missing; a score SpartBoard wrote doesn't.
    const ours =
      cell?.grade !== null &&
      record.lastPushed[m.subUid] === `s:${cell?.grade}`;
    const reason =
      cell && cell.exception !== SCHOOLOGY_EXCEPTION.NONE
        ? SKIP.FLAGGED
        : cell && cell.grade !== null && !ours
          ? SKIP.GRADED_THERE
          : null;
    if (reason) {
      results[m.index] = {
        pseudonymUid: m.entry.pseudonymUid,
        ok: false,
        reason,
      };
      continue;
    }
    rows.push({ entry: m, enrollmentId });
  }
  if (rows.length === 0) return fallback;

  let oks: boolean[];
  try {
    oks = await deps.rest.setExceptions(
      contextId,
      rows.map((r) => ({
        columnId,
        enrollmentId: r.enrollmentId,
        exception: SCHOOLOGY_EXCEPTION.MISSING,
      }))
    );
  } catch (err) {
    console.warn('[toolColumns] setting Missing failed:', err);
    oks = rows.map(() => false);
  }
  rows.forEach((r, i) => {
    if (!oks[i]) {
      fallback.push(r.entry);
      return;
    }
    results[r.entry.index] = {
      pseudonymUid: r.entry.entry.pseudonymUid,
      ok: true,
      missing: true,
    };
    pushed[r.entry.subUid] = 'm';
  });
  return fallback;
}

const REASON_RANK: Record<string, number> = {
  [SKIP.NOT_IN_SECTION]: 0,
  [SKIP.NO_COLUMN]: 1,
  [SKIP.NO_CATEGORY]: 2,
  [SKIP.DUPLICATE]: 3,
  [SKIP.PIN]: 4,
  [SKIP.UNCHANGED]: 5,
  [SKIP.GRADED_THERE]: 6,
  [SKIP.FLAGGED]: 7,
};

const rank = (r: PushResult): number => {
  if (r.ok) return 100;
  if (r.reason && r.reason in REASON_RANK) return REASON_RANK[r.reason];
  // A real failure outranks every benign skip so it's reported for retry.
  return 50;
};

/** One result per entry across every section; each student belongs to one section. */
export function mergeSectionResults(
  grades: GradeEntry[],
  outcomes: SectionOutcome[]
): PushResult[] {
  return grades.map((g, i) => {
    let best: PushResult | null = null;
    for (const o of outcomes) {
      const r = o.results[i];
      if (r && (!best || rank(r) > rank(best))) best = r;
    }
    return (
      best ?? {
        pseudonymUid: g.pseudonymUid,
        ok: false,
        reason: SKIP.NOT_IN_SECTION,
      }
    );
  });
}

export interface CategoryProposal {
  title: string;
  weight: number;
}

/** Validate a teacher's categories: 1–10 named rows, whole weights, totalling 100. */
export function validateCategoryProposal(
  raw: unknown
): CategoryProposal[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 10) return null;
  const out: CategoryProposal[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const o = (r ?? {}) as { title?: unknown; weight?: unknown };
    const title = typeof o.title === 'string' ? o.title.trim() : '';
    const weight = o.weight;
    if (
      !title ||
      title.length > 60 ||
      typeof weight !== 'number' ||
      !Number.isInteger(weight) ||
      weight < 0 ||
      weight > 100 ||
      seen.has(title.toLowerCase())
    ) {
      return null;
    }
    seen.add(title.toLowerCase());
    out.push({ title, weight });
  }
  return out.reduce((s, c) => s + c.weight, 0) === 100 ? out : null;
}
