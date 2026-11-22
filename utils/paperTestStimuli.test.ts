import { describe, expect, it } from 'vitest';
import type { QuizStimulus } from '@/types';
import {
  attachPaperTestStimuli,
  paperTestStimulus,
  resourceLetter,
  resourceLine,
  teammateQuizStimuli,
  teammateTestPaper,
} from './paperTestStimuli';
import { buildPaperTestHtml } from './paperTestPrint';

const NO_FILES = { images: {}, pages: {} };
const stim = (over: Partial<QuizStimulus> & { id: string }): QuizStimulus => ({
  type: 'text',
  url: '',
  label: '',
  ...over,
});

describe('paperTestStimulus', () => {
  it('prints a passage and a word bank as their text', () => {
    expect(
      paperTestStimulus(
        stim({ id: 'p', text: ' Once upon a time ', tabLabel: 'Story' }),
        NO_FILES
      )
    ).toEqual({ kind: 'text', title: 'Story', text: 'Once upon a time' });
    expect(
      paperTestStimulus(
        stim({
          id: 'w',
          type: 'word-bank',
          text: 'affect\neffect\n\naccept',
          wordBankColumns: 2,
        }),
        NO_FILES
      )
    ).toEqual({
      kind: 'word-bank',
      groups: [['affect', 'effect'], ['accept']],
      columns: 2,
    });
  });

  it('prints fetched pictures and pages, and a link for what paper cannot show', () => {
    const img = stim({ id: 'i', type: 'image', driveFileId: 'f1' });
    expect(
      paperTestStimulus(img, { images: { i: 'blob:x' }, pages: {} })
    ).toEqual({ kind: 'image', src: 'blob:x' });
    const pdf = stim({ id: 'd', type: 'pdf', driveFileId: 'f2' });
    expect(
      paperTestStimulus(pdf, { images: {}, pages: { d: ['blob:1', 'blob:2'] } })
    ).toEqual({ kind: 'pages', srcs: ['blob:1', 'blob:2'] });
    // A PDF that would not load still points students at it.
    expect(paperTestStimulus(pdf, NO_FILES)).toEqual({
      kind: 'link',
      title: 'PDF',
      url: 'https://drive.google.com/file/d/f2/view',
    });
    expect(
      paperTestStimulus(
        stim({ id: 'y', type: 'youtube', url: 'https://youtu.be/abc' }),
        NO_FILES
      )
    ).toEqual({ kind: 'link', title: 'Video', url: 'https://youtu.be/abc' });
    expect(
      paperTestStimulus(
        stim({
          id: 'g',
          type: 'gdoc-embed',
          url: 'https://docs.google.com/presentation/d/123/edit',
        }),
        NO_FILES
      )
    ).toMatchObject({ kind: 'link', title: 'Google Slides' });
  });

  it('prints nothing for a calculator or an empty passage', () => {
    expect(
      paperTestStimulus(stim({ id: 'c', type: 'calculator' }), NO_FILES)
    ).toBeNull();
    expect(paperTestStimulus(stim({ id: 'e', text: '  ' }), NO_FILES)).toBe(
      null
    );
  });
});

describe('attachPaperTestStimuli', () => {
  const stimuli = [
    stim({ id: 'p', text: 'Passage' }),
    stim({ id: 'w', type: 'word-bank', text: 'a\nb' }),
    stim({
      id: 'i',
      type: 'image',
      url: 'https://x/a.png',
      placement: 'inline',
    }),
    stim({ id: 'short', text: 'Short', paperPlacement: 'question' }),
    stim({ id: 'big', text: 'Long article', paperPlacement: 'resource' }),
  ];
  const questions = new Map([
    ['q1', { id: 'q1', stimulusIds: ['w'] }],
    ['q2', { id: 'q2', stimulusIds: ['p', 'i', 'short'] }],
    ['q3', { id: 'q3', stimulusIds: ['p', 'short', 'big'] }],
    ['q4', { id: 'q4', stimulusIds: ['missing', 'i'] }],
  ]);
  const files = { images: { i: 'https://x/a.png' }, pages: {} };
  const printed = [
    { questionId: 'q1', row: 1 },
    { questionId: 'q3', row: 2 },
    { questionId: 'q2', row: 3 },
    { questionId: 'q4', row: 4 },
  ];

  it('prints a one-question stimulus in its question and lettered resources for shared ones', () => {
    const { questions: out, resources } = attachPaperTestStimuli(
      printed,
      questions,
      stimuli,
      files
    );
    expect(out.get('q1')).toEqual({
      stimuli: [{ kind: 'word-bank', groups: [['a', 'b']], columns: 1 }],
    });
    // Lettered in the order students first meet them.
    expect(resources.map((r) => r.letter)).toEqual(['A', 'B']);
    expect(resources[0].item).toEqual({ kind: 'text', text: 'Passage' });
    expect(resources[1].item).toEqual({ kind: 'text', text: 'Long article' });
    expect(out.get('q3')).toEqual({
      stimuli: [{ kind: 'text', text: 'Short' }],
      resources: ['A', 'B'],
    });
    // An in-question picture stays in each question, even when shared.
    expect(out.get('q2')).toEqual({
      stimuli: [
        { kind: 'image', src: 'https://x/a.png' },
        { kind: 'text', text: 'Short' },
      ],
      resources: ['A'],
    });
    expect(out.get('q4')).toEqual({
      stimuli: [{ kind: 'image', src: 'https://x/a.png' }],
    });
  });

  it('counts only printed questions when picking the default', () => {
    const { questions: out, resources } = attachPaperTestStimuli(
      [{ questionId: 'q2', row: 1 }],
      questions,
      stimuli,
      files
    );
    expect(resources).toEqual([]);
    expect(out.get('q2')?.stimuli).toHaveLength(3);
  });
});

describe('resource lines and letters', () => {
  it('names the resources a question uses', () => {
    expect(resourceLine(['A'])).toBe('Use Resource A.');
    expect(resourceLine(['A', 'B'])).toBe('Use Resources A and B.');
    expect(resourceLine(['A', 'B', 'C'])).toBe('Use Resources A, B and C.');
    expect(resourceLetter(0)).toBe('A');
    expect(resourceLetter(25)).toBe('Z');
    expect(resourceLetter(26)).toBe('AA');
  });
});

describe('stimuli on the test paper', () => {
  it('prints question text, then stimuli, then choices, and resources after the questions', () => {
    const html = buildPaperTestHtml({
      quizTitle: 'Reading',
      questions: [
        {
          row: 1,
          text: 'Who is the hero?',
          choices: ['Ann', 'Bo'],
          stimuli: [{ kind: 'text', title: 'The <Fox>', text: 'A & B' }],
        },
        {
          row: 2,
          text: 'Pick one',
          choices: ['Yes', 'No'],
          resources: ['A'],
        },
      ],
      resources: [
        {
          letter: 'A',
          item: { kind: 'link', title: 'Video', url: 'https://youtu.be/a' },
        },
      ],
    });
    const text = html.indexOf('Who is the hero?');
    const stimulus = html.indexOf('A &amp; B');
    const choice = html.indexOf('Ann');
    expect(text).toBeLessThan(stimulus);
    expect(stimulus).toBeLessThan(choice);
    expect(html).toContain('<h3>The &lt;Fox&gt;</h3>');
    expect(html).toContain('<p class="use-res">Use Resource A.</p>');
    expect(html.indexOf('<h2>Resource A</h2>')).toBeGreaterThan(
      html.indexOf('Pick one')
    );
    expect(html).toContain('<strong>Video:</strong> https://youtu.be/a');
  });
});

describe('long stimuli in a question', () => {
  it('lets a question with a long passage split across pages', () => {
    const html = buildPaperTestHtml({
      quizTitle: 'R',
      questions: [
        {
          row: 1,
          text: 'Short',
          choices: ['a', 'b'],
          stimuli: [{ kind: 'text', text: 'word '.repeat(200) }],
        },
        {
          row: 2,
          text: 'Short too',
          choices: ['a', 'b'],
          stimuli: [{ kind: 'text', text: 'A short note.' }],
        },
      ],
    });
    expect(html.match(/<li class="tall">/g)).toHaveLength(1);
  });
});

describe('teammate test paper', () => {
  const quiz = teammateQuizStimuli({
    questions: [
      { id: 'q1', stimulusIds: ['p', 7] },
      { id: 'q2', stimulusIds: ['p', 'n'] },
      { id: 'q3' },
      'junk',
    ],
    stimuli: [
      { id: 'p', type: 'text', text: 'Shared passage' },
      { id: 'n', type: 'text', text: 'Only here' },
      { id: 'bad', type: 3 },
      null,
    ],
  });

  it('keeps only well formed stimuli and question links', () => {
    expect(quiz.stimuli.map((s) => s.id)).toEqual(['p', 'n']);
    expect(quiz.questionsById.get('q1')?.stimulusIds).toEqual(['p']);
    expect(quiz.questionsById.has('q3')).toBe(false);
  });

  it('adds stimuli to rows by question and drops the question id', () => {
    const { questions, resources } = teammateTestPaper(
      [
        { row: 1, questionId: 'q1', text: 'One', choices: ['a'] },
        { row: 2, questionId: 'q2', text: 'Two', choices: ['a'] },
        { row: 3, text: 'Old server row', choices: ['a'] },
      ],
      quiz,
      NO_FILES
    );
    expect(resources).toEqual([
      { letter: 'A', item: { kind: 'text', text: 'Shared passage' } },
    ]);
    expect(questions[0]).toEqual({
      row: 1,
      text: 'One',
      choices: ['a'],
      resources: ['A'],
    });
    expect(questions[1]).toMatchObject({
      stimuli: [{ kind: 'text', text: 'Only here' }],
      resources: ['A'],
    });
    expect(questions[2]).toEqual({
      row: 3,
      text: 'Old server row',
      choices: ['a'],
    });
  });

  it('prints as before when the quiz has no stimuli', () => {
    const rows = [{ row: 1, questionId: 'q1', text: 'One', choices: ['a'] }];
    expect(
      teammateTestPaper(rows, teammateQuizStimuli(undefined), NO_FILES)
    ).toEqual({
      questions: [{ row: 1, text: 'One', choices: ['a'] }],
      resources: [],
    });
  });
});
