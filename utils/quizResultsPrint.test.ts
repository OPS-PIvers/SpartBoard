import { describe, it, expect, vi } from 'vitest';
import type { QuizQuestion, QuizResponse, QuizStimulus } from '@/types';
import { computeStudentDrilldown } from '@/utils/quizStudentDrilldown';
import { applyPreset } from '@/utils/quizResultsPrintPresets';
import {
  buildResultsPrintHtml,
  countPrintedPages,
  padBlocksForDuplex,
  printQuizResults,
  sortResultsPrintStudents,
  type QuizResultsPrintOptions,
  type ResultsPrintJob,
  type ResultsPrintStudent,
} from '@/utils/quizStudentReportPrint';

const q = (
  id: string,
  type: QuizQuestion['type'],
  correctAnswer: string,
  extra: Partial<QuizQuestion> = {}
): QuizQuestion =>
  ({
    id,
    type,
    text: `Question ${id}`,
    correctAnswer,
    incorrectAnswers: [],
    timeLimit: 0,
    points: 1,
    ...extra,
  }) as unknown as QuizQuestion;

const response = (
  answers: Record<string, string>,
  extra: Partial<QuizResponse> = {}
): QuizResponse =>
  ({
    studentUid: 's1',
    status: 'completed',
    submittedAt: Date.UTC(2026, 8, 23, 15),
    answers: Object.entries(answers).map(([questionId, answer]) => ({
      questionId,
      answer,
      answeredAt: 1,
    })),
    ...extra,
  }) as unknown as QuizResponse;

const mc = q('q1', 'MC', 'Paris', {
  text: 'Capital of France?',
  incorrectAnswers: ['Rome', 'Oslo'],
});

const student = (
  over: Partial<ResultsPrintStudent> & { r?: QuizResponse } = {},
  questions: QuizQuestion[] = [mc],
  choiceOrder?: Record<string, string[]>
): ResultsPrintStudent => {
  const { r = response({ q1: 'Rome' }), ...rest } = over;
  return {
    key: 'k1',
    name: 'Ada Lovelace',
    sortName: 'Lovelace Ada',
    pin: '1111',
    period: 'Period 1',
    status: 'completed',
    drilldown: computeStudentDrilldown(questions, r, undefined, {
      choiceOrder,
    }),
    targets: [],
    lettered: !!choiceOrder,
    ...rest,
  };
};

const job = (
  students: ResultsPrintStudent[],
  stimuli: QuizStimulus[] = []
): ResultsPrintJob => ({
  quizTitle: 'Capitals',
  stimuli,
  periodOrder: ['Period 1', 'Period 2'],
  students,
});

const opts = (over: Partial<QuizResultsPrintOptions> = {}) => ({
  ...applyPreset('student-copy'),
  ...over,
});

const render = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
};

describe('buildResultsPrintHtml — key and marks', () => {
  it('never marks the correct option while the key is off', () => {
    const html = buildResultsPrintHtml(job([student()]), opts());
    expect(html).not.toContain('Correct answer');
    const picked = render(html).querySelector('li.opt.picked');
    expect(picked?.textContent).toContain('Rome');
    expect(picked?.textContent).toContain('✗');
    // Only the student's own pick carries a mark.
    expect(render(html).querySelectorAll('li.opt .tick')).toHaveLength(1);
  });

  it('shows the key on missed questions only, or on every question', () => {
    const questions = [mc, q('q2', 'FIB', 'blue')];
    const s = student({ r: response({ q1: 'Rome', q2: 'blue' }) }, questions);
    const missed = render(
      buildResultsPrintHtml(job([s]), opts({ keyMode: 'missed' }))
    );
    expect(
      missed.querySelector('.keytag')?.parentElement?.textContent
    ).toContain('Paris');
    expect(missed.textContent).not.toContain('Accepted answer');

    const all = render(
      buildResultsPrintHtml(job([s]), opts({ keyMode: 'all' }))
    );
    expect(all.textContent).toContain('Accepted answer: blue');
  });

  it('prints responses only with no marks, score or key', () => {
    const html = buildResultsPrintHtml(
      job([student()]),
      applyPreset('responses-only')
    );
    expect(html).not.toContain('✗');
    expect(html).not.toContain('Score:');
    expect(html).not.toContain('Teacher comments');
    expect(html).toContain('Rome');
  });

  it('prints only the chosen answer when questions are off', () => {
    const html = buildResultsPrintHtml(
      job([student()]),
      opts({ includeQuestions: false })
    );
    expect(html).not.toContain('Capital of France?');
    expect(html).not.toContain('Oslo');
    expect(render(html).querySelector('.answer')?.textContent).toBe('Rome');
  });

  it('letters paper options in batch order and leaves online ones unlettered', () => {
    const paper = render(
      buildResultsPrintHtml(
        job([student({}, [mc], { q1: ['Oslo', 'Rome', 'Paris'] })]),
        opts()
      )
    );
    expect(
      Array.from(paper.querySelectorAll('li.opt')).map((li) =>
        li.textContent?.replace(/\s+/g, ' ').trim()
      )
    ).toEqual(['○ A. Oslo', '● B. Rome ✗', '○ C. Paris']);

    const online = render(buildResultsPrintHtml(job([student()]), opts()));
    expect(online.querySelector('.letter')).toBeNull();
  });

  it('marks each Matching pair and gives the correct match only with the key', () => {
    const m = q('m', 'Matching', 'cat:meow|dog:woof', {
      allowPartialCredit: true,
    });
    const s = student({ r: response({ m: 'cat:meow|dog:meow' }) }, [m]);
    const off = render(buildResultsPrintHtml(job([s]), opts()));
    expect(
      Array.from(off.querySelectorAll('ul.pairs li')).map((li) =>
        li.textContent?.trim()
      )
    ).toEqual(['cat → meow ✓', 'dog → meow ✗']);
    const on = render(
      buildResultsPrintHtml(job([s]), opts({ keyMode: 'missed' }))
    );
    expect(on.textContent).toContain('(correct: woof)');
    expect(on.textContent).not.toContain('(correct: meow)');
  });

  it('shows the Ordering key only when the key is on', () => {
    const o = q('o', 'Ordering', 'a|b|c');
    const s = student({ r: response({ o: 'b|a|c' }) }, [o]);
    const off = buildResultsPrintHtml(job([s]), opts());
    expect(off).toContain('Your order: 1. b; 2. a; 3. c');
    expect(off).not.toContain('Correct order');
    expect(
      buildResultsPrintHtml(job([s]), opts({ keyMode: 'missed' }))
    ).toContain('Correct order: 1. a; 2. b; 3. c');
  });
});

describe('buildResultsPrintHtml — written answers', () => {
  const written = q('w', 'free-response', '', {
    points: 4,
    rubricSnapshot: {
      id: 'r',
      title: 'R',
      createdAt: 1,
      updatedAt: 1,
      criteria: [
        {
          id: 'c1',
          name: 'Evidence',
          levels: [{ id: 'l1', label: 'Strong', points: 3 }],
        },
      ],
    },
  });
  const graded = (grade: Record<string, unknown>) =>
    student(
      {
        r: response({ w: '<p>My essay</p>' }, {
          grading: {
            w: { pointsAwarded: 3, gradedAt: 1, gradedBy: 't', ...grade },
          },
        } as Partial<QuizResponse>),
      },
      [written]
    );

  it('prints the formatted answer, comment, rubric and numbered highlights', () => {
    const s = graded({
      overallComment: 'Good work',
      gradingSnapshot: '<p>My essay</p>',
      rubricScores: [
        { criterionId: 'c1', levelId: 'l1', points: 3, note: 'Two quotes' },
      ],
      annotations: [
        {
          id: 'a',
          from: 3,
          to: 8,
          comment: 'Clear',
          authorUid: 't',
          createdAt: 1,
        },
      ],
    });
    const html = buildResultsPrintHtml(job([s]), applyPreset('graded-copy'));
    expect(html).toContain(
      '<p>My <mark class="hl hl-yellow">essay</mark><sup class="fn">1</sup></p>'
    );
    expect(html).toContain('<li value="1">Clear</li>');
    expect(html).toContain('Teacher comment:</strong> Good work');
    expect(html).toContain('Strong · 3 pts');
    expect(html).toContain('Two quotes');
    expect(html).toContain('Points: 3 / 4');
  });

  it('skips highlights timed against a recording', () => {
    const s = graded({
      gradingSnapshot: '<p>My essay</p>',
      annotationUnit: 'ms',
      annotations: [
        { id: 'a', from: 3, to: 8, comment: 'x', authorUid: 't', createdAt: 1 },
      ],
    });
    const html = buildResultsPrintHtml(job([s]), applyPreset('graded-copy'));
    expect(html).not.toContain('<mark');
    expect(html).not.toContain('class="notes"');
  });

  it('keeps feedback off the student copy and says when grading is pending', () => {
    const s = graded({ overallComment: 'Good work' });
    expect(buildResultsPrintHtml(job([s]), opts())).not.toContain('Good work');

    const pending = student({ r: response({ w: '<p>Draft</p>' }) }, [written]);
    const html = buildResultsPrintHtml(
      job([pending]),
      applyPreset('graded-copy')
    );
    expect(html).toContain('Not yet graded');
    expect(html).toContain('so far');
  });
});

describe('buildResultsPrintHtml — students and pages', () => {
  it('sorts by period, then family name, whatever order it was handed', () => {
    const order = sortResultsPrintStudents(
      [
        { key: 'a', period: 'Period 2', sortName: 'Adams Zoe' },
        { key: 'b', period: null, sortName: 'Aaron Al' },
        { key: 'c', period: 'Period 1', sortName: 'Young Bo' },
        { key: 'd', period: 'Period 1', sortName: 'Baker Cy' },
      ],
      ['Period 1', 'Period 2']
    );
    expect(order.map((s) => s.key)).toEqual(['d', 'c', 'a', 'b']);
  });

  it('prints a separator page with a blank back before each period when there are several', () => {
    const html = buildResultsPrintHtml(
      job([
        student({ key: 'b', period: 'Period 2', sortName: 'B' }),
        student({ key: 'a', period: 'Period 1', sortName: 'A' }),
        student({ key: 'c', period: 'Period 1', sortName: 'C' }),
      ]),
      opts()
    );
    const div = render(html);
    const blocks = Array.from(div.querySelectorAll('[data-print-block]')).map(
      (b) =>
        b.getAttribute('data-print-block') === 'separator'
          ? `sep:${b.querySelector('.sep-period')?.textContent}:${b.querySelector('.sep-count')?.textContent}`
          : 'student'
    );
    expect(blocks).toEqual([
      'sep:Period 1:2 students',
      'student',
      'student',
      'sep:Period 2:1 student',
      'student',
    ]);
    expect(div.querySelectorAll('.sep + .pad')).toHaveLength(2);

    const single = buildResultsPrintHtml(job([student()]), opts());
    expect(single).not.toContain('data-print-block="separator"');
  });

  it('prints a blank name line with the PIN when no roster name resolves', () => {
    const html = buildResultsPrintHtml(
      job([student({ name: null, pin: '1234', period: 'Period 3' })]),
      opts()
    );
    expect(html).toContain('Name: ____');
    expect(html).toContain('PIN 1234 · Period 3');
    expect(html).toContain('Submitted Sep 23, 2026');
  });

  it('prints each picture and passage once, before the first question using it', () => {
    const stimuli: QuizStimulus[] = [
      { id: 'img', type: 'image', url: 'https://x/pic.png', label: 'Map' },
      { id: 'txt', type: 'text', url: '', text: 'Once <upon>', label: 'P' },
      { id: 'vid', type: 'video', url: 'https://x/v.mp4', label: 'Clip' },
    ];
    const questions = [
      q('q1', 'FIB', 'a', { stimulusIds: ['img', 'txt'] }),
      q('q2', 'FIB', 'b', { stimulusIds: ['img', 'vid'] }),
    ];
    const s = student({ r: response({ q1: 'a', q2: 'b' }) }, questions);
    const on = buildResultsPrintHtml(
      job([s], stimuli),
      opts({ includeStimuli: true })
    );
    expect(on.match(/<img /g)).toHaveLength(1);
    expect(on).toContain('Once &lt;upon&gt;');
    expect(on).toContain('Video: Clip');
    expect(on.indexOf('Video: Clip')).toBeGreaterThan(
      on.indexOf('Question q1')
    );
    expect(
      buildResultsPrintHtml(job([s], stimuli), opts({ includeStimuli: false }))
    ).not.toContain('<img');
  });

  it('counts a unit pushed past a page end onto the next page', () => {
    const block = document.createElement('section');
    const unit = (top: number, height: number) => {
      const el = document.createElement('div');
      el.setAttribute('data-unit', '');
      el.getBoundingClientRect = () => ({ top, height }) as DOMRect;
      block.appendChild(el);
    };
    block.getBoundingClientRect = () => ({ top: 0, height: 0 }) as DOMRect;
    unit(0, 600);
    expect(countPrintedPages(block, 1000)).toBe(1);
    // Starts on page one but would cross its end: pushed whole to page two.
    unit(600, 500);
    expect(countPrintedPages(block, 1000)).toBe(2);
    unit(1100, 600);
    expect(countPrintedPages(block, 1000)).toBe(3);
  });

  it('adds a blank page after a student whose pages come out odd, never after the last', () => {
    document.body.innerHTML = buildResultsPrintHtml(
      job([
        student({ key: 'a', sortName: 'A' }),
        student({ key: 'b', sortName: 'B' }),
      ]),
      opts()
    );
    padBlocksForDuplex(document);
    const blocks = document.querySelectorAll('[data-print-block]');
    // jsdom lays nothing out, so each student measures one page.
    expect(blocks[0].nextElementSibling?.className).toBe('pad');
    expect(blocks[1].nextElementSibling).toBeNull();
    expect(document.body.style.width).toBe('');
  });

  it('pads through the print hook only when the toggle is on', async () => {
    const fakeDoc = document.implementation.createHTMLDocument('p');
    const print = vi.fn();
    const print2 = vi.fn();
    const win = {
      document: Object.assign(fakeDoc, {
        write: (html: string) => {
          fakeDoc.documentElement.innerHTML = html;
        },
        open: () => undefined,
        close: () => undefined,
      }),
      focus: vi.fn(),
      print,
      close: vi.fn(),
    } as unknown as Window;
    const two = job([
      student({ key: 'a', sortName: 'A' }),
      student({ key: 'b', sortName: 'B' }),
    ]);
    printQuizResults(two, opts(), () => win);
    await vi.waitFor(() => expect(print).toHaveBeenCalled());
    expect(fakeDoc.querySelectorAll('.pad')).toHaveLength(1);

    const win2 = { ...win, print: print2 } as unknown as Window;
    printQuizResults(two, opts({ duplexPadding: false }), () => win2);
    expect(print2).toHaveBeenCalled();
    expect(fakeDoc.querySelectorAll('.pad')).toHaveLength(0);
  });
});

describe('buildResultsPrintHtml — bubble-sheet reprints', () => {
  const reprint = {
    batchId: 'batch-1',
    seat: 3,
    questionCount: 1,
    choiceCount: 3,
    columnsPerPage: 2 as const,
    pageCount: 1,
    filled: [1],
    correct: [0],
    unclear: [false],
  };
  const paper = (key: string, sortName: string) =>
    student({ key, sortName, sheet: reprint }, [mc], {
      q1: ['Paris', 'Rome', 'Oslo'],
    });

  const kinds = (html: string) =>
    Array.from(render(html).querySelectorAll('[data-print-block]')).map(
      (b) =>
        `${b.getAttribute('data-print-block')}:${b.getAttribute('data-student')}`
    );

  it('prints the sheet for paper students and the report for online ones', () => {
    const html = buildResultsPrintHtml(
      job([paper('a', 'A'), student({ key: 'b', sortName: 'B' })]),
      applyPreset('bubble-sheet')
    );
    expect(kinds(html)).toEqual(['sheet:a', 'student:b']);
    expect(html).toContain('bub filled');
    expect(html).toContain('Score: 0 / 1 (0%)');
  });

  it('prints the sheet first, then the report, for Both', () => {
    const html = buildResultsPrintHtml(
      job([paper('a', 'A')]),
      opts({ layout: 'both' })
    );
    expect(kinds(html)).toEqual(['sheet:a', 'student:a']);
  });

  it('pads after a student’s sheet and report together, not between them', () => {
    document.body.innerHTML = buildResultsPrintHtml(
      job([paper('a', 'A'), paper('b', 'B'), paper('c', 'C')]),
      opts({ layout: 'both' })
    );
    padBlocksForDuplex(document);
    // One sheet page plus one report page is even: no blanks at all.
    expect(document.querySelectorAll('.pad')).toHaveLength(0);

    document.body.innerHTML = buildResultsPrintHtml(
      job([paper('a', 'A'), paper('b', 'B')]),
      applyPreset('bubble-sheet')
    );
    padBlocksForDuplex(document);
    const blocks = document.querySelectorAll('[data-print-block]');
    expect(blocks[0].nextElementSibling?.className).toBe('pad');
    expect(document.querySelectorAll('.pad')).toHaveLength(1);
  });
});
