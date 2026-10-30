// The one quiz or bank a Schoology page shows, for the universal Send button's Schoology reader (IMPORT D14).

import {
  courseOf,
  isClassicBankPage,
  isClassicQuizPage,
  pageTitle,
  resourcesCrumbs,
  schoologyPage,
  type SchoologyItem,
} from './page';

/** Null on Materials and Resources lists (their own checklist sends those) and on every other page. */
export function singleItem(
  doc: Document,
  url: string
): { item: SchoologyItem; courseName: string | null } | null {
  const page = schoologyPage(url);
  if (!page || page.kind === 'materials') return null;
  if (page.kind === 'resources') {
    if (!page.folderId || !isClassicBankPage(doc)) return null;
    return {
      item: {
        kind: 'questionBank',
        bank: 'classic',
        itemId: page.folderId,
        collectionId: page.collectionId,
        title: resourcesCrumbs(doc).at(-1) ?? 'Question bank',
      },
      courseName: null,
    };
  }
  if (page.kind === 'questionBank')
    return { item: { ...page, title: pageTitle(doc) }, courseName: null };
  if (page.kind === 'testQuiz' && !isClassicQuizPage(doc, page.itemId))
    return null;
  const course = courseOf(doc);
  return {
    item: {
      ...page,
      sectionId: page.sectionId ?? course?.sectionId,
      title: pageTitle(doc),
    },
    courseName: course?.name ?? null,
  };
}
