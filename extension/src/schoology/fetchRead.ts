// Reads one Schoology quiz in the teacher's own session with plain GETs (SCHOOLOGY_QUIZ_IMPORT "Page probe"); nothing is submitted.

import { readAssessment } from './assessmentReader';
import {
  classicFormEntries,
  classicQuestionList,
  readClassicQuiz,
  type ClassicQuestionInput,
  type FormEntries,
} from './classicReader';
import { pageTitle, type SchoologyItem } from './page';
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

export function readFromSchoology(
  item: SchoologyItem,
  deps: ReadDeps
): Promise<SchoologyRead> {
  if (item.kind === 'testQuiz')
    return readClassicFromSchoology(item.itemId, deps);
  if (!item.sectionId)
    return Promise.reject(new SchoologyReadError('the course was not found.'));
  return readAssessmentFromSchoology(item.sectionId, item.itemId, deps);
}
