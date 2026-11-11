// District library origin marker (QUIZ_MCA_PRACTICE.md M27-M30): library content stays read-only when linked and never goes on a share link.
import type { QuizMetadata } from '@/types';

export const DISTRICT_READ_ONLY_MESSAGE =
  'District library quizzes are read-only. Make your own copy to edit it.';

export const DISTRICT_SHARE_REFUSAL =
  "This quiz uses District library questions, which stay inside the district, so it can't go on a share link. Share it with your PLC instead.";

/** Library id of a teacher's linked copy, so adding the same item twice finds the first copy. */
export const districtLinkedQuizId = (itemId: string): string =>
  `district-${itemId}`;

interface Marked {
  districtItemId?: unknown;
}

interface MarkedContent {
  questions?: readonly Marked[];
  bankSlots?: readonly Marked[];
}

const markOf = (m: Marked | null | undefined): string | null =>
  m && typeof m.districtItemId === 'string' && m.districtItemId !== ''
    ? m.districtItemId
    : null;

/** Library item ids the content came from: marked questions and slots that draw from library banks. */
export function districtItemIdsOf(content: MarkedContent): string[] {
  const out = new Set<string>();
  for (const q of content.questions ?? []) {
    const id = markOf(q);
    if (id) out.add(id);
  }
  for (const slot of content.bankSlots ?? []) {
    const id = markOf(slot);
    if (id) out.add(id);
  }
  return [...out].sort();
}

export type DistrictMetaFields = Pick<
  QuizMetadata,
  'districtOrigin' | 'districtLinkedItemId'
>;

/** Marker fields to write with quiz metadata; the origin only grows, so removing library questions never clears it. */
export function districtMetaFields(
  content: MarkedContent,
  existing?: DistrictMetaFields | null,
  linkedItemId?: string | null
): DistrictMetaFields {
  const origin = new Set([
    ...(existing?.districtOrigin ?? []),
    ...districtItemIdsOf(content),
  ]);
  if (linkedItemId) origin.add(linkedItemId);
  const linked =
    linkedItemId === null
      ? undefined
      : (linkedItemId ?? existing?.districtLinkedItemId);
  return {
    ...(origin.size > 0 ? { districtOrigin: [...origin].sort() } : {}),
    ...(linked ? { districtLinkedItemId: linked } : {}),
  };
}

/** True for a teacher's linked, read-only copy of a library quiz. */
export const isDistrictLinkedCopy = (
  meta: Pick<QuizMetadata, 'districtLinkedItemId'> | null | undefined
): boolean => !!meta?.districtLinkedItemId;

/** True when the quiz, its draw banks or its metadata carry library content. */
export function hasDistrictContent(
  content: MarkedContent,
  banks: Iterable<MarkedContent & Marked> = [],
  origin: readonly string[] = []
): boolean {
  if (origin.length > 0) return true;
  if (districtItemIdsOf(content).length > 0) return true;
  for (const bank of banks) {
    if (markOf(bank) || districtItemIdsOf(bank).length > 0) return true;
  }
  return false;
}

/** Throws the share refusal for library content (M30: no share links). */
export function assertShareableOutsideLibrary(
  content: MarkedContent,
  banks?: Iterable<MarkedContent & Marked>,
  origin?: readonly string[]
): void {
  if (hasDistrictContent(content, banks, origin)) {
    throw new Error(DISTRICT_SHARE_REFUSAL);
  }
}

/** Responses that answered a question the newer version drops; "Sync to latest" warns before losing them from scoring. */
export function responsesAnsweringRemoved(
  previousIds: readonly string[],
  nextIds: readonly string[],
  responses: readonly { answers?: readonly { questionId: string }[] }[]
): { removed: string[]; responseCount: number } {
  const next = new Set(nextIds);
  const removed = previousIds.filter((id) => !next.has(id));
  if (removed.length === 0) return { removed, responseCount: 0 };
  const gone = new Set(removed);
  const responseCount = responses.filter((r) =>
    (r.answers ?? []).some((a) => gone.has(a.questionId))
  ).length;
  return { removed, responseCount };
}

/** The removed-questions warning before Sync to latest: District library copies only, and never when bank draws are involved, whose served ids never match the canonical's fixed questions. */
export function shouldCheckSyncRemovals(input: {
  linkedCopy: boolean;
  assignmentDrewFromBanks: boolean;
  canonicalHasDraws: boolean;
}): boolean {
  return (
    input.linkedCopy &&
    !input.assignmentDrewFromBanks &&
    !input.canonicalHasDraws
  );
}
