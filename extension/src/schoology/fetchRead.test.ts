import { describe, expect, it } from 'vitest';
import classic from './fixtures/classicQuiz.json';
import assessment from './fixtures/assessment.json';
import { readAssessment } from './assessmentReader';
import { readClassicQuiz, type FormEntries } from './classicReader';
import {
  assessmentIdIn,
  readAssessmentFromSchoology,
  readClassicFromSchoology,
} from './fetchRead';
import { SchoologyReadError } from './readResult';

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const form = (entries: readonly (readonly string[])[]) =>
  `<form>${entries
    .map(([n, v]) => `<textarea name="${escape(n)}">${escape(v)}</textarea>`)
    .join('')}</form>`;

function fakeSite(pages: Record<string, string | object | undefined>) {
  const asked: string[] = [];
  const get = (path: string) => {
    asked.push(path);
    const body = pages[path];
    if (body === undefined)
      return Promise.resolve(new Response('', { status: 404 }));
    return Promise.resolve(
      new Response(typeof body === 'string' ? body : JSON.stringify(body))
    );
  };
  return {
    asked,
    deps: {
      get,
      origin: 'https://orono.schoology.com',
      pause: () => Promise.resolve(),
    },
  };
}

describe('readClassicFromSchoology', () => {
  const list = `<html><head><title>Sample Test/Quiz | Schoology</title></head><body>${classic.questions
    .map(
      (q, i) =>
        `<div class="component-summary-wrapper component-${q.type}"><a href="/assignment/77/assessment_questions/edit_question/${i + 100}">Edit</a></div>`
    )
    .join('')}</body></html>`;
  const pages: Record<string, string | undefined> = {
    '/assignment/77/assessment_questions': list,
    '/assignment/77/assessment_settings': form(classic.settings),
  };
  classic.questions.forEach((q, i) => {
    pages[`/assignment/77/assessment_questions/edit_question/${i + 100}`] =
      form(q.entries);
  });

  it('reads the list, every question form and the settings, in order', async () => {
    const { asked, deps } = fakeSite(pages);
    const progress: number[] = [];
    const read = await readClassicFromSchoology('77', {
      ...deps,
      onProgress: (done) => progress.push(done),
    });
    expect(read).toEqual(
      readClassicQuiz({
        title: 'Sample Test/Quiz',
        questions: classic.questions.map((q) => ({
          type: q.type,
          entries: q.entries as FormEntries,
        })),
        settings: classic.settings as FormEntries,
        origin: 'https://orono.schoology.com',
      })
    );
    expect(asked[0]).toBe('/assignment/77/assessment_questions');
    expect(asked.at(-1)).toBe('/assignment/77/assessment_settings');
    expect(progress.at(-1)).toBe(classic.questions.length);
  });

  it('still reads the quiz when the settings page fails', async () => {
    const { deps } = fakeSite({
      ...pages,
      '/assignment/77/assessment_settings': undefined,
    });
    await expect(readClassicFromSchoology('77', deps)).resolves.toMatchObject({
      settings: {},
    });
  });

  it("says so when the teacher can't open the quiz", async () => {
    const { deps } = fakeSite({});
    await expect(readClassicFromSchoology('77', deps)).rejects.toBeInstanceOf(
      SchoologyReadError
    );
  });
});

describe('readAssessmentFromSchoology', () => {
  const page =
    '<script>ReactDOM.render(React.createElement(x, {"assessmentId":239515611,"canEdit":true}))</script>';

  it('finds the editor id in the page, then reads the active version', async () => {
    const { asked, deps } = fakeSite({
      '/course/9/assessments/42': page,
      '/iapi2/test-quiz/239515611': assessment.assessment,
      '/iapi2/test-quiz/239532487/components': assessment.components,
    });
    const read = await readAssessmentFromSchoology('9', '42', deps);
    expect(read).toEqual(
      readAssessment({ ...assessment, origin: 'https://orono.schoology.com' })
    );
    expect(asked).toEqual([
      '/course/9/assessments/42',
      '/iapi2/test-quiz/239515611',
      '/iapi2/test-quiz/239532487/components',
    ]);
  });

  it('fails plainly when the page no longer carries the id', async () => {
    expect(assessmentIdIn('<p>nothing</p>')).toBeNull();
    const { deps } = fakeSite({ '/course/9/assessments/42': '<p></p>' });
    await expect(readAssessmentFromSchoology('9', '42', deps)).rejects.toThrow(
      /assessment editor/
    );
  });
});
