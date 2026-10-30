import { describe, expect, it } from 'vitest';
import {
  courseOf,
  isClassicBankPage,
  isClassicQuizPage,
  materialsItems,
  pageTitle,
  resourcesCrumbs,
  resourcesItems,
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

describe('question banks in Resources', () => {
  it('reads the folder from the address, including after in-page moves', () => {
    expect(
      schoologyPage(
        'https://orono.schoology.com/resources/my/7637440413?f=358645304'
      )
    ).toEqual({
      kind: 'resources',
      collectionId: '7637440413',
      folderId: '358645304',
    });
    expect(
      schoologyPage(
        'https://orono.schoology.com/resources/my/7637440413?f=358645304#/resources/my/7637440413?f=358645270'
      )
    ).toMatchObject({ folderId: '358645270' });
    expect(
      schoologyPage(
        'https://orono.schoology.com/resources#/resources/7637440413'
      )
    ).toEqual({ kind: 'resources', collectionId: '7637440413' });
    expect(
      schoologyPage(
        'https://orono.schoology.com/common-assessment-question-banks/191500786?f=358645270'
      )
    ).toEqual({ kind: 'questionBank', bank: 'item', itemId: '191500786' });
    expect(schoologyPage('https://orono.schoology.com/resources')).toBeNull();
  });

  const crumb = `<div id="collection-title"><a href="/resources/my/7">MCAs</a> <span class="arrow"></span> <a class="breadcrumb-link" href="/resources/my/7?f=1">High School</a> <span class="arrow"></span> <span class="active"><span class="inline-icon"></span>Algebra</span></div>`;

  it('lists both kinds of bank in a folder, and the trail above it', () => {
    const page = doc(`${crumb}<table id="collection-view-contents"><tbody>
      <tr id="f-358645304" class="collection-template-item-row collection-row-folder"><td class="collection-item-icon"><span class="inline-icon testquiz-question-bank-icon"></span></td><td class="collection-item-title"><a href="/resources/my/7?f=358645304">9.2.1.9</a></td></tr>
      <tr id="t-1" class="collection-template-item-row collection-row-template"><td class="collection-item-icon"><span class="inline-icon common-assessment-question-bank-icon"></span></td><td class="collection-item-title"><a href="/common-assessment-question-banks/191500786?f=358645270">9.2.1.1</a></td></tr>
      <tr id="f-2" class="collection-template-item-row collection-row-folder"><td class="collection-item-icon"><span class="inline-icon folder-icon"></span></td><td class="collection-item-title"><a href="/resources/my/7?f=2">Plain folder</a></td></tr>
    </tbody></table>`);
    expect(resourcesCrumbs(page)).toEqual(['MCAs', 'High School', 'Algebra']);
    expect(resourcesItems(page, '7')).toEqual([
      {
        kind: 'questionBank',
        bank: 'classic',
        itemId: '358645304',
        collectionId: '7',
        title: '9.2.1.9',
      },
      {
        kind: 'questionBank',
        bank: 'item',
        itemId: '191500786',
        title: '9.2.1.1',
      },
    ]);
    expect(isClassicBankPage(page)).toBe(false);
    expect(
      isClassicBankPage(doc('<table class="collection-question-bank"></table>'))
    ).toBe(true);
  });
});
