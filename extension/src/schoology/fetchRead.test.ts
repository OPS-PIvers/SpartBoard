import { describe, expect, it } from 'vitest';
import classic from './fixtures/classicQuiz.json';
import assessment from './fixtures/assessment.json';
import { readAssessment } from './assessmentReader';
import { readClassicQuiz, type FormEntries } from './classicReader';
import {
  assessmentIdIn,
  itemBankPropsIn,
  readAssessmentFromSchoology,
  readClassicBankFromSchoology,
  readClassicFromSchoology,
  readItemBankFromSchoology,
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

const crumbs = (names: string[], current: string) =>
  `<div id="collection-title">${names
    .map(
      (n, i) =>
        `<a href="/resources/my/7?f=${i}">${n}</a> <span class="arrow"></span> `
    )
    .join(
      ''
    )}<span class="active"><span class="inline-icon"></span>${current}</span></div>`;

describe('readClassicBankFromSchoology', () => {
  const rows = classic.questions
    .map(
      (q, i) =>
        `<tr class="collection-template-item-row component-summary component-type-${q.type}"><td><a class="action-edit-template" href="/resources/my/7/edit/${i + 100}?resources=1">Edit</a></td></tr>`
    )
    .join('');
  const pages: Record<string, string | object> = {
    '/resources/my/7?f=55&ajax=1': {
      output: `${crumbs(['MCAs', 'Algebra'], '9.2.1.9')}<table class="collection-question-bank"><tbody>${rows}<tr class="collection-template-item-row component-type-fitb"><td><a class="action-edit-template" href="https://evil.test/x">Edit</a></td></tr></tbody></table>`,
    },
  };
  classic.questions.forEach((q, i) => {
    pages[`/resources/my/7/edit/${i + 100}?resources=1`] = form(q.entries);
  });

  it('reads every question form in the folder and files it under the trail', async () => {
    const { asked, deps } = fakeSite(pages);
    const read = await readClassicBankFromSchoology('7', '55', deps);
    expect(read).toEqual({
      ...readClassicQuiz({
        title: '9.2.1.9',
        questions: classic.questions.map((q) => ({
          type: q.type,
          entries: q.entries as FormEntries,
        })),
        origin: 'https://orono.schoology.com',
      }),
      settings: {},
      folderPath: ['MCAs', 'Algebra'],
    });
    expect(asked.some((p) => p.includes('evil'))).toBe(false);
  });
});

describe('readItemBankFromSchoology', () => {
  const domains = assessment.components.data.components.map(
    (c) => c.metadata.question_domain
  );
  const page = `<script>React.createElement(sgyAssessmentManager.ItemBankManager, ${JSON.stringify(
    {
      breadcrumbs: [
        { label: 'Resources', link: '/resources/7' },
        { label: 'Algebra', link: '/resources/7?f=9' },
        { label: '9.2.1.1', link: '#' },
      ],
      questionBank: {
        id: 191500786,
        title: '9.2.1.1 {braces}',
        collection_nid: 7,
        folder_id: 9,
      },
    }
  )}))</script>`;
  const list = {
    data: {
      questions: [
        ...domains.map((d) => ({ ...d, status: 'active', deleted_at: null })),
        { ...domains[0], status: 'retired', deleted_at: null },
      ],
    },
  };

  it('reads the active questions as an assessment would, filed under the folder trail', async () => {
    const { deps } = fakeSite({
      '/common-assessment-question-banks/191500786': page,
      '/iapi2/common-assessment-question-banks/191500786/question-list': list,
      '/resources/my/7?f=9&ajax=1': {
        output: crumbs(['MCAs', 'High School'], 'Algebra'),
      },
    });
    const read = await readItemBankFromSchoology('191500786', deps);
    expect(read.quiz.title).toBe('9.2.1.1 {braces}');
    expect(read.quiz.questions).toHaveLength(domains.length);
    expect(read.folderPath).toEqual(['MCAs', 'High School', 'Algebra']);
    expect(read.settings).toEqual({});
  });

  it("falls back to the page's own trail when the folder can't be read", async () => {
    const { deps } = fakeSite({
      '/common-assessment-question-banks/191500786': page,
      '/iapi2/common-assessment-question-banks/191500786/question-list': list,
    });
    await expect(
      readItemBankFromSchoology('191500786', deps)
    ).resolves.toMatchObject({ folderPath: ['Algebra'] });
    expect(itemBankPropsIn('<p>nothing</p>')).toBeNull();
  });
});
