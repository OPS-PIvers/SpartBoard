// Which Schoology pages get a Send to SpartBoard button (SCHOOLOGY_QUIZ_IMPORT Q4, Q5), from the URL and the page itself.

export type SchoologyItemKind = 'testQuiz' | 'assessment' | 'questionBank';

/** A classic Test/Quiz bank is a Resources folder; an item bank holds Assessment questions. */
export type BankType = 'classic' | 'item';

export type SchoologyPage =
  | { kind: 'testQuiz' | 'assessment'; itemId: string; sectionId?: string }
  | { kind: 'questionBank'; bank: 'item'; itemId: string }
  | { kind: 'materials'; sectionId: string }
  | { kind: 'resources'; collectionId: string; folderId?: string };

/** One quiz or bank the Send button reads; a classic bank's `itemId` is its folder id. */
export interface SchoologyItem {
  kind: SchoologyItemKind;
  itemId: string;
  sectionId?: string;
  bank?: BankType;
  collectionId?: string;
  title: string;
}

const CLASSIC =
  /^\/assignment\/(\d+)(?:\/(?:assessment_questions|assessment|assessment_settings))?\/?$/;
const ASSESSMENT = /^\/course\/(\d+)\/assessments\/(\d+)\/?$/;
const MATERIALS = /^\/course\/(\d+)\/materials\/?$/;
const RESOURCES = /^\/resources\/(?:my\/)?(\d+)\/?$/;
const ITEM_BANK = /^\/common-assessment-question-banks\/(\d+)\/?$/;
const ID = /^\d+$/;

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
  // Resources moves between folders in the page, keeping the real address after `#`.
  const route = parsed.hash.startsWith('#/')
    ? new URL(parsed.hash.slice(1), parsed.origin)
    : parsed;
  const path = route.pathname;
  const resources = RESOURCES.exec(path);
  if (resources) {
    const folderId = route.searchParams.get('f') ?? '';
    return {
      kind: 'resources',
      collectionId: resources[1],
      ...(ID.test(folderId) ? { folderId } : {}),
    };
  }
  const itemBank = ITEM_BANK.exec(path);
  if (itemBank)
    return { kind: 'questionBank', bank: 'item', itemId: itemBank[1] };
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

/** A Resources folder that is a classic question bank lists its questions in this table. */
export const isClassicBankPage = (doc: Document): boolean =>
  !!doc.querySelector('table.collection-question-bank');

/** The Resources path shown above a folder, from the collection down to the folder on screen. */
export const resourcesCrumbs = (doc: Document): string[] =>
  Array.from(
    doc.querySelectorAll(
      '#collection-title > a, #collection-title > span.active'
    )
  )
    .map((node) => node.textContent?.trim() ?? '')
    .filter(Boolean);

/** The question banks listed in the Resources folder on screen. */
export function resourcesItems(
  doc: Document,
  collectionId: string
): SchoologyItem[] {
  const items: SchoologyItem[] = [];
  for (const row of Array.from(
    doc.querySelectorAll(
      '#collection-view-contents tr.collection-template-item-row'
    )
  )) {
    const link = row.querySelector('.collection-item-title a');
    const title = link?.textContent?.trim() ?? '';
    if (!title) continue;
    const folderId = /^f-(\d+)$/.exec(row.id)?.[1];
    if (folderId && row.querySelector('.testquiz-question-bank-icon')) {
      items.push({
        kind: 'questionBank',
        bank: 'classic',
        itemId: folderId,
        collectionId,
        title,
      });
      continue;
    }
    const bankId = /^\/common-assessment-question-banks\/(\d+)/.exec(
      link?.getAttribute('href') ?? ''
    )?.[1];
    if (bankId && row.querySelector('.common-assessment-question-bank-icon'))
      items.push({
        kind: 'questionBank',
        bank: 'item',
        itemId: bankId,
        collectionId,
        title,
      });
  }
  return items;
}
