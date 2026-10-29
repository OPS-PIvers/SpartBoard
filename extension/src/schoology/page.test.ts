import { describe, expect, it } from 'vitest';
import {
  courseOf,
  isClassicQuizPage,
  materialsItems,
  pageTitle,
  schoologyPage,
} from './page';

const doc = (html: string, title = '') => {
  const d = new DOMParser().parseFromString(html, 'text/html');
  d.title = title;
  return d;
};

describe('schoologyPage', () => {
  it('knows the quiz, assessment and Materials pages', () => {
    expect(
      schoologyPage(
        'https://orono.schoology.com/assignment/8629405092/assessment_questions'
      )
    ).toEqual({ kind: 'testQuiz', itemId: '8629405092' });
    expect(
      schoologyPage(
        'https://orono.schoology.com/course/7595131723/assessments/8629413961'
      )
    ).toEqual({
      kind: 'assessment',
      sectionId: '7595131723',
      itemId: '8629413961',
    });
    expect(
      schoologyPage(
        'https://orono.schoology.com/course/7595131723/materials?f=998122482'
      )
    ).toEqual({ kind: 'materials', sectionId: '7595131723' });
  });

  it('ignores other pages and other sites', () => {
    expect(
      schoologyPage('https://orono.schoology.com/assignment/86/info')
    ).toBeNull();
    expect(schoologyPage('https://orono.schoology.com/home')).toBeNull();
    expect(
      schoologyPage('https://schoology.com.evil.test/assignment/1')
    ).toBeNull();
    expect(schoologyPage('http://orono.schoology.com/assignment/1')).toBeNull();
    expect(schoologyPage('not a url')).toBeNull();
  });
});

describe('page details', () => {
  const header =
    '<div class="course-title"><a href="/course/7595131723">Model Course: Hour 1</a>&nbsp;<a href="/course/7595131723/materials/assessments">Tests/Quizzes</a></div>';

  it('reads the course from the header and the title without the suffix', () => {
    expect(courseOf(doc(header))).toEqual({
      sectionId: '7595131723',
      name: 'Model Course: Hour 1',
    });
    expect(courseOf(doc('<p></p>'))).toBeNull();
    expect(pageTitle(doc('', 'Sample Test/Quiz | Schoology'))).toBe(
      'Sample Test/Quiz'
    );
  });

  it('tells a Test/Quiz from a plain assignment', () => {
    expect(
      isClassicQuizPage(
        doc('<a href="/assignment/5/assessment_questions">Questions</a>'),
        '5'
      )
    ).toBe(true);
    expect(
      isClassicQuizPage(doc('<a href="/assignment/5/submissions">x</a>'), '5')
    ).toBe(false);
  });

  it('lists only the quizzes in a Materials folder', () => {
    const rows = `<table>
      <tr id="n-1" class="dr type-document"><td><a href="/x">Handout</a></td></tr>
      <tr id="n-2" class="dr type-assignment"><td><span class="item-icon assessment-icon"></span><div class="item-title"><a href="/assignment/2">Unit quiz</a></div></td></tr>
      <tr id="n-3" class="dr type-assignment"><td><span class="item-icon assignment-icon"></span><a href="/assignment/3">Essay</a></td></tr>
      <tr id="n-4" class="dr type-common-assessment"><td><a href="/course/9/assessments/4">Final</a></td></tr>
      <tr id="f-5" class="material-row-folder"><td><a href="/course/9/materials?f=5">Folder</a></td></tr>
    </table>`;
    expect(materialsItems(doc(rows), '9')).toEqual([
      { kind: 'testQuiz', itemId: '2', sectionId: '9', title: 'Unit quiz' },
      { kind: 'assessment', itemId: '4', sectionId: '9', title: 'Final' },
    ]);
  });
});
