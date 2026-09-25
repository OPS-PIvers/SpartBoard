import type {
  ProjectGroup,
  ProjectGroupImportEntry,
  ProjectStep,
  ProjectStepState,
  ProjectWorkLink,
} from '@/types';
import { SCOREBOARD_COLORS } from '@/config/scoreboard';

/** The hard ceiling on steps; the board draws every one (D31). */
export const MAX_STEPS = 32;

export const STEP_STATE_ORDER: ProjectStepState[] = [
  'notStarted',
  'inProgress',
  'readyForReview',
  'done',
];

export const STEP_STATE_LABELS: Record<ProjectStepState, string> = {
  notStarted: 'Not started',
  inProgress: 'Working',
  readyForReview: 'Ready for review',
  done: 'Done',
};

/** One line per step (D16); a line keeps its id while its text is unchanged. */
export function parseStepLines(
  text: string,
  existing: ProjectStep[] = []
): ProjectStep[] {
  const unclaimed = [...existing];
  const claim = (title: string): ProjectStep | undefined => {
    const index = unclaimed.findIndex((step) => step.title === title);
    if (index === -1) return undefined;
    return unclaimed.splice(index, 1)[0];
  };

  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, MAX_STEPS)
    .map((title) => {
      const matched = claim(title);
      return matched ?? { id: crypto.randomUUID(), title };
    });
}

export const stepLinesFrom = (steps: ProjectStep[]): string =>
  steps.map((step) => step.title).join('\n');

/** Denormalized for `firestore.rules`, which cannot walk a nested list. */
export const approvalStepIdsFrom = (steps: ProjectStep[]): string[] =>
  steps.filter((step) => step.requiresApproval).map((step) => step.id);

export const stepStateOf = (
  group: Pick<ProjectGroup, 'stepStates'>,
  stepId: string
): ProjectStepState => group.stepStates?.[stepId] ?? 'notStarted';

/** D1 — position comes from step states. */
export function completedStepCount(
  group: Pick<ProjectGroup, 'stepStates'>,
  steps: ProjectStep[]
): number {
  return steps.filter((step) => stepStateOf(group, step.id) === 'done').length;
}

/** The state a student may move a step into. Approval steps stop short of done (D2/D3). */
export function studentStateOptions(step: ProjectStep): ProjectStepState[] {
  return step.requiresApproval
    ? STEP_STATE_ORDER.filter((state) => state !== 'done')
    : STEP_STATE_ORDER;
}

/** Groups keep the order the teacher gave them (D38 removed the help flag that jumped the queue). */
export function sortGroupsForBoard<
  T extends Pick<ProjectGroup, 'order' | 'name'>,
>(groups: T[]): T[] {
  return [...groups].sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.name.localeCompare(b.name);
  });
}

/** D6 — no ClassLink or test class means `local:<rosterId>`, which no student claim matches. */
export function projectClassIdFor(
  roster:
    | { id: string; classlinkClassId?: string; testClassId?: string }
    | undefined
): string | null {
  if (!roster) return null;
  // Empty string, not just undefined: that is the shape a hand-built roster has.
  const classlink = roster.classlinkClassId?.trim() ?? '';
  if (classlink.length > 0) return classlink;
  // A test-class student's sign-in claim carries the test class slug.
  const testClass = roster.testClassId?.trim() ?? '';
  return testClass.length > 0 ? testClass : `local:${roster.id}`;
}

/** D32 — the board renders only the groups in its picked class. */
export function groupsForClass<T extends Pick<ProjectGroup, 'classId'>>(
  groups: T[],
  classId: string | null | undefined
): T[] {
  if (!classId) return [];
  return groups.filter((group) => group.classId === classId);
}

const HTTP_URL = /^https?:\/\//i;

/** Work links are teacher- and student-typed, so only http(s) ever gets stored. */
export function normalizeWorkLinkUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = HTTP_URL.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function makeWorkLink(
  url: string,
  addedByUid: string,
  options: { label?: string; stepId?: string } = {}
): ProjectWorkLink | null {
  const normalized = normalizeWorkLinkUrl(url);
  if (!normalized) return null;
  const link: ProjectWorkLink = {
    id: crypto.randomUUID(),
    url: normalized,
    addedByUid,
    addedAt: Date.now(),
  };
  const label = options.label?.trim();
  if (label) link.label = label;
  if (options.stepId) link.stepId = options.stepId;
  return link;
}

/** D33 — a group's default color, dealt from the Scoreboard palette by order. */
export const defaultGroupColor = (index: number): string =>
  SCOREBOARD_COLORS[
    ((index % SCOREBOARD_COLORS.length) + SCOREBOARD_COLORS.length) %
      SCOREBOARD_COLORS.length
  ];

/** The palette color after `color`, for the Manage groups swatch. */
export const nextGroupColor = (color: string | undefined): string =>
  defaultGroupColor(SCOREBOARD_COLORS.findIndex((c) => c === color) + 1);

/** D43 — display names for the classes an import touches, from the teacher's rosters. */
export function classNamesForEntries(
  entries: Pick<ProjectGroupImportEntry, 'classId'>[],
  rosters: {
    id: string;
    name: string;
    classlinkClassId?: string;
    testClassId?: string;
  }[]
): Record<string, string> {
  const wanted = new Set(entries.map((e) => e.classId));
  const names: Record<string, string> = {};
  for (const roster of rosters) {
    const classId = projectClassIdFor(roster);
    const name = roster.name?.trim();
    if (classId && name && wanted.has(classId)) names[classId] = name;
  }
  return names;
}

/** D45 — shown wherever a class is picked whose students cannot open the project. */
export const NO_STUDENT_SIGN_IN_WARNING =
  "Students can't open this project because this roster isn't linked to ClassLink. You can still track progress yourself.";

/** D45 — false when no student on the roster could ever open the project. */
export function rosterHasStudentSignIn(
  roster:
    | {
        id: string;
        classlinkClassId?: string;
        testClassId?: string;
        students: { classLinkSourcedId?: string; email?: string }[];
      }
    | undefined
): boolean {
  if (!roster) return false;
  const classId = projectClassIdFor(roster);
  if (!classId || classId.startsWith('local:')) return false;
  const testClass = !roster.classlinkClassId?.trim();
  // An empty roster has nobody to warn about yet.
  if (roster.students.length === 0) return true;
  return roster.students.some(
    (s) =>
      Boolean(s.classLinkSourcedId) || (testClass && Boolean(s.email?.trim()))
  );
}
