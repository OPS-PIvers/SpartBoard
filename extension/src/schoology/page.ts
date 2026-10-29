// Which Schoology pages get a Send to SpartBoard button (SCHOOLOGY_QUIZ_IMPORT Q4, Q5), from the URL and the page itself.

export type SchoologyItemKind = 'testQuiz' | 'assessment';

export type SchoologyPage =
  | { kind: SchoologyItemKind; itemId: string; sectionId?: string }
  | { kind: 'materials'; sectionId: string };

/** One quiz the Send button reads. */
export interface SchoologyItem {
  kind: SchoologyItemKind;
  itemId: string;
  sectionId?: string;
  title: string;
}

const CLASSIC =
  /^\/assignment\/(\d+)(?:\/(?:assessment_questions|assessment|assessment_settings))?\/?$/;
const ASSESSMENT = /^\/course\/(\d+)\/assessments\/(\d+)\/?$/;
const MATERIALS = /^\/course\/(\d+)\/materials\/?$/;

export const isSchoologyHost = (host: string): boolean =>
  /^[a-z0-9-]+\.schoology\.com$/i.test(host);

/** The page kind from its URL alone; the content script still checks the page before showing a button. */
export function schoologyPage(url: string): SchoologyPage | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || !isSchoologyHost(parsed.hostname))
    return null;
  const path = parsed.pathname;
  const classic = CLASSIC.exec(path);
  if (classic) return { kind: 'testQuiz', itemId: classic[1] };
  const assessment = ASSESSMENT.exec(path);
  if (assessment)
    return {
      kind: 'assessment',
      sectionId: assessment[1],
      itemId: assessment[2],
    };
  const materials = MATERIALS.exec(path);
  if (materials) return { kind: 'materials', sectionId: materials[1] };
  return null;
}

/** The course link in the page header: its section id and name. */
export function courseOf(
  doc: Document
): { sectionId: string; name: string } | null {
  const link = doc.querySelector<HTMLAnchorElement>(
    '.course-title a[href^="/course/"]'
  );
  const sectionId = /^\/course\/(\d+)/.exec(link?.getAttribute('href') ?? '');
  const name = link?.textContent?.trim() ?? '';
  return sectionId && name ? { sectionId: sectionId[1], name } : null;
}

/** A plain assignment shares the `/assignment/{id}` URL; only a Test/Quiz links to its questions. */
export const isClassicQuizPage = (doc: Document, itemId: string): boolean =>
  !!doc.querySelector(
    `a[href*="/assignment/${itemId}/assessment_questions"], .component-summary-wrapper`
  );

/** The page title without Schoology's suffix. */
export const pageTitle = (doc: Document): string =>
  doc.title.replace(/\s*\|\s*Schoology\s*$/i, '').trim();

/** The Tests/Quizzes and Assessments listed in the Materials folder on screen. */
export function materialsItems(
  doc: Document,
  sectionId: string
): SchoologyItem[] {
  const items: SchoologyItem[] = [];
  for (const row of Array.from(doc.querySelectorAll('tr[id^="n-"]'))) {
    const itemId = /^n-(\d+)$/.exec(row.id)?.[1];
    const title =
      row.querySelector('.item-title a, a')?.textContent?.trim() ?? '';
    if (!itemId || !title) continue;
    if (row.classList.contains('type-common-assessment')) {
      items.push({ kind: 'assessment', itemId, sectionId, title });
    } else if (
      row.classList.contains('type-assignment') &&
      row.querySelector('.assessment-icon')
    ) {
      items.push({ kind: 'testQuiz', itemId, sectionId, title });
    }
  }
  return items;
}
