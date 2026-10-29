// Reads one Schoology quiz in the teacher's own session with plain GETs (SCHOOLOGY_QUIZ_IMPORT "Page probe"); nothing is submitted.

import { readAssessment } from './assessmentReader';
import {
  classicFormEntries,
  classicQuestionList,
  readClassicQuiz,
  type ClassicQuestionInput,
  type FormEntries,
} from './classicReader';
import { pageTitle, resourcesCrumbs, type SchoologyItem } from './page';
import { SchoologyReadError, type SchoologyRead } from './readResult';

export interface ReadDeps {
  /** A same-site GET with the teacher's cookies. */
  get: (path: string) => Promise<Response>;
  origin: string;
  /** Spaces the requests out so a long quiz stays well inside Schoology's rate. */
  pause: () => Promise<void>;
  onProgress?: (done: number, total: number) => void;
}

async function getOk(deps: ReadDeps, path: string): Promise<Response> {
  await deps.pause();
  let res: Response;
  try {
    res = await deps.get(path);
  } catch {
    throw new SchoologyReadError('Schoology did not answer.');
  }
  if (!res.ok)
    throw new SchoologyReadError(
      res.status === 403
        ? 'you can only send quizzes you can edit.'
        : `Schoology answered ${res.status}.`
    );
  return res;
}

const html = (text: string) =>
  new DOMParser().parseFromString(text, 'text/html');

export async function readClassicFromSchoology(
  itemId: string,
  deps: ReadDeps
): Promise<SchoologyRead> {
  const base = `/assignment/${itemId}`;
  const listHtml = await (
    await getOk(deps, `${base}/assessment_questions`)
  ).text();
  const rows = classicQuestionList(listHtml);
  if (rows.length === 0)
    throw new SchoologyReadError('no questions were found.');
  const questions: ClassicQuestionInput[] = [];
  for (const [i, row] of rows.entries()) {
    deps.onProgress?.(i, rows.length);
    const form = await (
      await getOk(
        deps,
        `${base}/assessment_questions/edit_question/${row.questionId}`
      )
    ).text();
    questions.push({ type: row.type, entries: classicFormEntries(form) });
  }
  deps.onProgress?.(rows.length, rows.length);
  let settings: FormEntries | undefined;
  try {
    settings = classicFormEntries(
      await (await getOk(deps, `${base}/assessment_settings`)).text()
    );
  } catch {
    // Settings are optional; the quiz still comes across without them.
  }
  return readClassicQuiz({
    title: pageTitle(html(listHtml)),
    questions,
    settings,
    origin: deps.origin,
  });
}

/** The editor's internal id, which the assessment page embeds in its own HTML. */
export function assessmentIdIn(pageHtml: string): string | null {
  return /"assessmentId"\s*:\s*(\d+)/.exec(pageHtml)?.[1] ?? null;
}

export async function readAssessmentFromSchoology(
  sectionId: string,
  itemId: string,
  deps: ReadDeps
): Promise<SchoologyRead> {
  deps.onProgress?.(0, 3);
  const page = await (
    await getOk(deps, `/course/${sectionId}/assessments/${itemId}`)
  ).text();
  const assessmentId = assessmentIdIn(page);
  if (!assessmentId)
    throw new SchoologyReadError('the assessment editor was not found.');
  deps.onProgress?.(1, 3);
  const assessment: unknown = await (
    await getOk(deps, `/iapi2/test-quiz/${assessmentId}`)
  )
    .json()
    .catch(() => null);
  const versionId = (
    assessment as {
      data?: { commonAssessment?: { active_version_id?: unknown } };
    }
  )?.data?.commonAssessment?.active_version_id;
  if (typeof versionId !== 'number' && typeof versionId !== 'string')
    throw new SchoologyReadError('the assessment has no saved version.');
  deps.onProgress?.(2, 3);
  const components: unknown = await (
    await getOk(deps, `/iapi2/test-quiz/${versionId}/components`)
  )
    .json()
    .catch(() => null);
  deps.onProgress?.(3, 3);
  return readAssessment({ assessment, components, origin: deps.origin });
}

/** A Resources folder as its in-page navigation loads it: Schoology sends the folder's HTML inside JSON. */
async function resourcesFolder(
  collectionId: string,
  folderId: string,
  deps: ReadDeps
): Promise<Document> {
  const reply: unknown = await (
    await getOk(deps, `/resources/my/${collectionId}?f=${folderId}&ajax=1`)
  )
    .json()
    .catch(() => null);
  const output = (reply as { output?: unknown } | null)?.output;
  if (typeof output !== 'string')
    throw new SchoologyReadError('the Resources folder was not found.');
  return html(output);
}

const EDIT_LINK = /^\/resources\/(?:my\/)?\d+\/edit\/\d+(?:\?resources=1)?$/;

/** A classic question bank: its folder lists each question with an edit form like a Test/Quiz's. */
export async function readClassicBankFromSchoology(
  collectionId: string,
  folderId: string,
  deps: ReadDeps
): Promise<SchoologyRead> {
  const folder = await resourcesFolder(collectionId, folderId, deps);
  const crumbs = resourcesCrumbs(folder);
  const rows: { type: string; path: string }[] = [];
  for (const row of Array.from(
    folder.querySelectorAll('tr.collection-template-item-row')
  )) {
    const type = Array.from(row.classList)
      .find((c) => c.startsWith('component-type-'))
      ?.slice('component-type-'.length);
    const path =
      row.querySelector('a.action-edit-template')?.getAttribute('href') ?? '';
    if (type && EDIT_LINK.test(path)) rows.push({ type, path });
  }
  if (rows.length === 0)
    throw new SchoologyReadError('no questions were found.');
  const questions: ClassicQuestionInput[] = [];
  for (const [i, row] of rows.entries()) {
    deps.onProgress?.(i, rows.length);
    const form = await (await getOk(deps, row.path)).text();
    questions.push({ type: row.type, entries: classicFormEntries(form) });
  }
  deps.onProgress?.(rows.length, rows.length);
  return {
    ...readClassicQuiz({
      title: crumbs.at(-1) ?? 'Schoology question bank',
      questions,
      origin: deps.origin,
    }),
    settings: {},
    folderPath: crumbs.slice(0, -1),
  };
}

/** The JSON object starting at `start`, read brace by brace so braces inside strings don't end it. */
export function jsonObjectAt(text: string, start: number): unknown {
  if (text[start] !== '{') return null;
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1)) as unknown;
      } catch {
        return null;
      }
    }
  }
  return null;
}

interface ItemBankProps {
  breadcrumbs?: { label?: unknown }[];
  questionBank?: {
    title?: unknown;
    collection_nid?: unknown;
    folder_id?: unknown;
  };
}

/** The item bank page's own props: its title, collection, folder and trail. */
export function itemBankPropsIn(pageHtml: string): ItemBankProps | null {
  const at = pageHtml.indexOf('{"breadcrumbs":');
  const props = at < 0 ? null : jsonObjectAt(pageHtml, at);
  return props && typeof props === 'object' ? (props as ItemBankProps) : null;
}

const idText = (v: unknown): string | null =>
  (typeof v === 'number' || typeof v === 'string') && /^\d+$/.test(String(v))
    ? String(v)
    : null;

/** An item bank (Assessment questions in Resources), read as Assessment question records. */
export async function readItemBankFromSchoology(
  bankId: string,
  deps: ReadDeps
): Promise<SchoologyRead> {
  deps.onProgress?.(0, 2);
  const props = itemBankPropsIn(
    await (
      await getOk(deps, `/common-assessment-question-banks/${bankId}`)
    ).text()
  );
  if (!props) throw new SchoologyReadError('the question bank was not found.');
  deps.onProgress?.(1, 2);
  const list: unknown = await (
    await getOk(
      deps,
      `/iapi2/common-assessment-question-banks/${bankId}/question-list`
    )
  )
    .json()
    .catch(() => null);
  const all = (list as { data?: { questions?: unknown } } | null)?.data
    ?.questions;
  if (!Array.isArray(all))
    throw new SchoologyReadError(
      'Schoology sent the question bank in a shape this reader does not know.'
    );
  const live = (all as { status?: unknown; deleted_at?: unknown }[]).filter(
    (q) => q?.status === 'active' && !q.deleted_at
  );
  deps.onProgress?.(2, 2);
  const title =
    typeof props.questionBank?.title === 'string'
      ? props.questionBank.title
      : '';
  const read = readAssessment({
    assessment: { data: { commonAssessment: { title } } },
    components: {
      data: {
        components: live.map((q) => ({ metadata: { question_domain: q } })),
      },
    },
    origin: deps.origin,
  });
  const collectionId = idText(props.questionBank?.collection_nid);
  const folderId = idText(props.questionBank?.folder_id);
  // The page's own trail starts at "Resources"; the folder's trail names the collection.
  let folderPath = (props.breadcrumbs ?? [])
    .map((b) => (typeof b.label === 'string' ? b.label.trim() : ''))
    .slice(1, -1)
    .filter(Boolean);
  if (collectionId && folderId) {
    try {
      const crumbs = resourcesCrumbs(
        await resourcesFolder(collectionId, folderId, deps)
      );
      if (crumbs.length) folderPath = crumbs;
    } catch {
      // The page's own trail is close enough.
    }
  }
  return { ...read, settings: {}, folderPath };
}

export function readFromSchoology(
  item: SchoologyItem,
  deps: ReadDeps
): Promise<SchoologyRead> {
  if (item.kind === 'testQuiz')
    return readClassicFromSchoology(item.itemId, deps);
  if (item.kind === 'questionBank') {
    if (item.bank === 'item')
      return readItemBankFromSchoology(item.itemId, deps);
    if (!item.collectionId)
      return Promise.reject(
        new SchoologyReadError('the Resources folder was not found.')
      );
    return readClassicBankFromSchoology(item.collectionId, item.itemId, deps);
  }
  if (!item.sectionId)
    return Promise.reject(new SchoologyReadError('the course was not found.'));
  return readAssessmentFromSchoology(item.sectionId, item.itemId, deps);
}
