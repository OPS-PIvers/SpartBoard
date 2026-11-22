import { describe, expect, it } from 'vitest';
import type { QuizStimulus } from '@/types';
import {
  attachPaperTestStimuli,
  paperTestStimulus,
  stimulusForLine,
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
    stim({
      id: 'i',
      type: 'image',
      url: 'https://x/a.png',
      placement: 'inline',
    }),
  ];
  const questions = new Map([
    ['q1', { id: 'q1', stimulusIds: [] }],
    ['q2', { id: 'q2', stimulusIds: ['p', 'i'] }],
    ['q3', { id: 'q3', stimulusIds: ['p'] }],
    ['q4', { id: 'q4', stimulusIds: ['missing'] }],
  ]);
  const files = { images: { i: 'https://x/a.png' }, pages: {} };

  it('prints a shared stimulus once, above the first question that uses it', () => {
    const out = attachPaperTestStimuli(
      [
        { questionId: 'q1', row: 1 },
        { questionId: 'q3', row: 2 },
        { questionId: 'q2', row: 3 },
        { questionId: 'q4', row: 4 },
      ],
      questions,
      stimuli,
      files
    );
    expect(out.has('q1')).toBe(false);
    expect(out.get('q3')?.block).toEqual({
      forRows: [2, 3],
      items: [{ kind: 'text', text: 'Passage' }],
    });
    // The in-question picture prints in its question; the passage is already above.
    expect(out.get('q2')).toEqual({
      inline: [{ kind: 'image', src: 'https://x/a.png' }],
    });
    expect(out.has('q4')).toBe(false);
  });
});

describe('stimulusForLine', () => {
  it('names the questions a stimulus goes with', () => {
    expect(stimulusForLine([3])).toBe('For question 3');
    expect(stimulusForLine([3, 4])).toBe('For questions 3 and 4');
    expect(stimulusForLine([3, 4, 5])).toBe('For questions 3 to 5');
    expect(stimulusForLine(['2', '4', '7', '8', '9'])).toBe(
      'For questions 2, 4 and 7 to 9'
    );
  });
});

describe('stimuli on the test paper', () => {
  it('prints the block before its first question and escapes teacher text', () => {
    const html = buildPaperTestHtml({
      quizTitle: 'Reading',
      questions: [
        {
          row: 1,
          text: 'Who is the hero?',
          choices: ['Ann', 'Bo'],
          stimuli: {
            forRows: [1, 2],
            items: [
              { kind: 'text', title: 'The <Fox>', text: 'A & B' },
              { kind: 'link', title: 'Video', url: 'https://youtu.be/a' },
            ],
          },
        },
        {
          row: 2,
          text: 'Pick the picture',
          choices: ['Yes', 'No'],
          inlineStimuli: [{ kind: 'image', src: 'https://x/a.png' }],
        },
      ],
    });
    expect(html.indexOf('For questions 1 and 2')).toBeLessThan(
      html.indexOf('Who is the hero?')
    );
    expect(html).toContain('<h3>The &lt;Fox&gt;</h3>');
    expect(html).toContain('A &amp; B');
    expect(html).toContain('<strong>Video:</strong> https://youtu.be/a');
    expect(html).toContain('<div class="q-stim"><div class="stim-item"><img');
  });
});
