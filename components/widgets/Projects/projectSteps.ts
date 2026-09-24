import type {
  ProjectGroup,
  ProjectStep,
  ProjectStepState,
  ProjectWorkLink,
} from '@/types';

/** D26 — the board face degrades to counts past 8 groups; 32 is the hard ceiling. */
export const MAX_STEPS = 32;
export const COMFORTABLE_GROUPS = 8;
export const COMFORTABLE_STEPS = 8;

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

/** D1 — position comes from step states, so a help flag never costs a place. */
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

/** D25 — help-flagged groups sort to the top; the rest keep their own order. */
export function sortGroupsForBoard<
  T extends Pick<ProjectGroup, 'needsSupport' | 'order' | 'name'>,
>(groups: T[]): T[] {
  return [...groups].sort((a, b) => {
    if (a.needsSupport !== b.needsSupport) return a.needsSupport ? -1 : 1;
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

/** D14 — the board renders only the groups in the active roster's class. */
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
