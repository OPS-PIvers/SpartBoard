/**
 * Layouts found by reading a folder of real teacher tests against the reader:
 * choices typed along one line, a choice list shared by several questions,
 * true/false statements, a page header under the last choice, choices
 * wrapped in two columns, and a number printed alone beside its picture.
 */
import { describe, it, expect } from 'vitest';
import { parseDocument } from '@/utils/quizDocumentImport/parseQuestions';
import {
  placePictureLines,
  type PageBox,
  type PositionedLine,
} from '@/utils/quizDocumentImport/pdfPictures';
import type { DocLine } from '@/utils/quizDocumentImport/types';

const plain = (text: string): DocLine[] =>
  text.split('\n').map((line) => ({ text: line }));

/** A PDF line: one segment per `[text, x]`, on `page` at baseline `y`. */
const pdf = (
  page: number,
  y: number,
  parts: Array<[string, number]>,
  bold = false
): DocLine => ({
  text: parts.map(([text]) => text).join(' '),
  segments: parts.map(([text, x]) => ({
    text,
    x,
    xEnd: x + text.length * 5,
  })),
  page,
  y,
  ...(bold ? { emphasized: true } : {}),
});

describe('choices typed one after another on a line', () => {
  it('splits them when each marker is the next letter', () => {
    const { questions } = parseDocument(
      plain(`1. A form for recording transactions in order.
A. Journalizing B. Journal
C. Memorandum
2. What is a check a bank refused to pay?
A) Voided check B) Dishonored check C) Canceled check`)
    );
    expect(questions[0].options.map((o) => o.text)).toEqual([
      'Journalizing',
      'Journal',
      'Memorandum',
    ]);
    expect(questions[1].options.map((o) => o.text)).toEqual([
      'Voided check',
      'Dishonored check',
      'Canceled check',
    ]);
  });

  it('leaves a choice that names another letter mid-sentence alone', () => {
    const { questions } = parseDocument(
      plain(`1. Which plans work?
a. Plan A and b. Plan B together
b. Neither plan`)
    );
    expect(questions[0].options.map((o) => o.text)).toEqual([
      'Plan A and b. Plan B together',
      'Neither plan',
    ]);
  });
});

describe('one list of choices for several questions', () => {
  const test = `1. Warm up?
a. yes
b. no
USE THE FOLLOWING FOR THE NEXT 3 QUESTIONS
a. Vacuole
b. Cell Wall
c. Ribosomes
2. stores water in a plant cell
3. provides support outside of the cell
4. produces proteins for the cell
5. Which is last?
a. this
b. that
Answer Key
1. A
2. A
3. B
4. C
5. B`;

  it('gives each of those questions the list, and keys it by letter', () => {
    const { questions } = parseDocument(plain(test));
    expect(questions).toHaveLength(5);
    expect(questions[1].text).toBe('stores water in a plant cell');
    expect(questions.slice(1, 4).map((q) => q.correctAnswer)).toEqual([
      'Vacuole',
      'Cell Wall',
      'Ribosomes',
    ]);
    expect(questions[4].options.map((o) => o.text)).toEqual(['this', 'that']);
  });
});

describe('true or false statements', () => {
  it('reads statements under a typed True or False heading as true/false questions', () => {
    const { questions } = parseDocument(
      plain(`I. True or False: Circle the correct response.
1. Vaping is a safe alternative to smoking.
2. Blood circulation decreases when a person smokes.
II. Multiple Choice: Choose the one best answer for each question.
3. Which plant is used to make cigarettes?
a. Tobacco
b. Hemp`)
    );
    expect(questions.map((q) => q.type)).toEqual(['MC', 'MC', 'MC']);
    expect(questions[0].options.map((o) => o.text)).toEqual(['True', 'False']);
    expect(questions[1].text).toBe(
      'Blood circulation decreases when a person smokes.'
    );
    expect(questions[2].ref?.sectionName).toBe('Multiple Choice');
  });

  it('takes the answer from a key that adds the correcting word', () => {
    const { questions } = parseDocument(
      plain(`1. Dehydrogenase is a sugar.
a. True
b. False
2. Channel proteins have a shape.
a. True
b. False
Answer Key
1. F, enzyme
2. T`)
    );
    expect(questions.map((q) => q.correctAnswer)).toEqual(['False', 'True']);
    expect(questions[0].warnings).toEqual([]);
  });
});

describe('what follows the last choice on a page', () => {
  it('keeps the next page’s name line out of the choice', () => {
    const { questions } = parseDocument([
      pdf(1, 300, [['1. Which is right?', 60]]),
      pdf(1, 280, [['a. The first one.', 80]]),
      pdf(1, 260, [['b. The second one.', 80]]),
      pdf(2, 740, [
        ['Name:', 36],
        ['Class:', 360],
      ]),
      pdf(2, 700, [['2. And now?', 60]]),
      pdf(2, 680, [['a. yes', 80]]),
      pdf(2, 660, [['b. no', 80]]),
    ]);
    expect(questions[0].options[1].text).toBe('The second one.');
    expect(questions[1].text).toBe('And now?');
  });

  it('reads a short bold line as the heading of the questions under it', () => {
    const { questions } = parseDocument([
      pdf(1, 300, [['1. Which country?', 60]]),
      pdf(1, 280, [['a. Cuba', 80]]),
      pdf(1, 260, [['b. Brazil', 80]]),
      pdf(2, 740, [['Article: Cuba Goes Dark', 60]], true),
      pdf(2, 700, [['2. What ran out?', 60]]),
      pdf(2, 680, [['a. oil', 80]]),
      pdf(2, 660, [['b. water', 80]]),
    ]);
    expect(questions[0].options[1].text).toBe('Brazil');
    expect(questions[1].text).toBe('What ran out?');
    expect(questions[1].ref?.sectionName).toBe('Article: Cuba Goes Dark');
  });

  it('still joins a sentence that runs over the page break', () => {
    const { questions } = parseDocument([
      pdf(1, 300, [['1. Which is right?', 60]]),
      pdf(1, 280, [['a. The first one', 80]]),
      pdf(1, 260, [['b. The second one, which goes', 80]]),
      pdf(2, 740, [['on to the next page.', 92]]),
      pdf(2, 700, [['2. And now?', 60]]),
      pdf(2, 680, [['a. yes', 80]]),
      pdf(2, 660, [['b. no', 80]]),
    ]);
    expect(questions[0].options[1].text).toBe(
      'The second one, which goes on to the next page.'
    );
  });
});

describe('choices wrapped in two columns', () => {
  it('returns each wrapped piece to the choice above it', () => {
    const { questions } = parseDocument([
      pdf(1, 700, [['1. What does the IV do?', 60]]),
      pdf(1, 680, [
        ['a.', 90],
        ['it is isotonic and could make your', 108],
        ['c.', 302],
        ['it is hypotonic and would make your', 320],
      ]),
      pdf(1, 668, [
        ['cells shrivel up', 108],
        ['cells swell and burst', 320],
      ]),
      pdf(1, 656, [
        ['b.', 90],
        ['it will dry you out', 108],
        ['d.', 302],
        ['nothing', 320],
      ]),
    ]);
    expect(questions[0].options.map((o) => o.text)).toEqual([
      'it is isotonic and could make your cells shrivel up',
      'it will dry you out',
      'it is hypotonic and would make your cells swell and burst',
      'nothing',
    ]);
  });
});

describe('a learning target above its question', () => {
  it('does not take the question under a bold target as the target’s wrap', () => {
    const { questions } = parseDocument([
      pdf(
        1,
        160,
        [
          [
            '18. ELT 3.3-I can identify parts of a cell and explain their role',
            60,
          ],
        ],
        true
      ),
      pdf(1, 148, [
        ['Which parts are found in both plant and animal cells?', 90],
      ]),
      pdf(1, 130, [['a. mitochondria', 90]]),
      pdf(1, 118, [['b. chloroplast', 90]]),
    ]);
    expect(questions[0].text).toBe(
      'Which parts are found in both plant and animal cells?'
    );
    expect(questions[0].suggestedTarget?.code).toBe('ELT 3.3');
  });
});

describe('a number printed alone beside its picture', () => {
  const line = (
    text: string,
    top: number,
    left: number,
    right: number
  ): PositionedLine => ({ line: { text }, top, left, right });
  const picture: PageBox = { x: 0.13, y: 0.45, width: 0.27, height: 0.11 };

  it('puts the picture on that question, not the one above', () => {
    const out = placePictureLines(
      1,
      [
        line('33. An all-or-nothing response is', 0.3, 0.1, 0.45),
        line('d. absorption of neurotransmitters', 0.42, 0.13, 0.45),
        line('34.', 0.448, 0.1, 0.125),
        line('Which description fits area 1 of the graph?', 0.59, 0.13, 0.45),
      ],
      [picture]
    );
    const at = out.findIndex((l) => (l.imageIds?.length ?? 0) > 0);
    expect(out[at - 1].text).toBe('34.');
  });

  it('does the same for a number printed just under the picture', () => {
    const out = placePictureLines(
      1,
      [
        line('c. I and III', 0.1, 0.15, 0.3),
        line('____ 19.', 0.575, 0.06, 0.125),
        line(
          'What type of cell is this picture representing?',
          0.59,
          0.15,
          0.6
        ),
      ],
      [picture]
    );
    const at = out.findIndex((l) => (l.imageIds?.length ?? 0) > 0);
    expect(out[at - 1].text).toBe('____ 19.');
  });
});

describe('what the wizard takes for a passage', () => {
  it('keeps a note about the figures with the questions that point at them', () => {
    const { questions, texts } = parseDocument(
      plain(`1. Warm up?
a. yes
b. no
The far right column in Figure 3 shows the preferred pH for each enzyme in the human digestive system. Figure 4 shows the rate of reaction for three different enzymes at various pH levels. Note that a pH from 0 to 6 is acidic and a pH of 8 to 14 is basic.
2. Using the above figures, which enzyme works in the stomach?
a. pepsin
b. amylase
3. Using the above figures, what happens to pepsin at a pH of 5?
a. it slows
b. it speeds up
4. The energy needed to get a reaction started is the
a. activation energy
b. chemical energy
5. According to Figure 5, which enzyme works in a hot spring?
a. X
b. Y`),
      { passages: true }
    );
    expect(texts).toHaveLength(1);
    expect(questions.map((q) => Boolean(q.sharedTextId))).toEqual([
      false,
      true,
      true,
      false,
      false,
    ]);
  });

  it('does not take the directions heading a test for a passage', () => {
    const { questions, texts } = parseDocument(
      plain(`General Directions
Read each sentence carefully. Pay close attention to the context in which the bold and underlined word is used. Then, select the option (A, B, C, or D) that best defines the word based on the sentence around it.
1. The arid desert had no water.
a. dry
b. wet
2. She was elated by the news.
a. sad
b. happy`),
      { passages: true }
    );
    expect(texts).toEqual([]);
    expect(questions.map((q) => q.sharedTextId)).toEqual([
      undefined,
      undefined,
    ]);
  });
});

describe('one diagram for several questions', () => {
  it('gives a question that asks for a label the picture of the one before it, and says so', () => {
    const { questions } = parseDocument([
      { text: '1. What type of cell is this picture representing?' },
      { text: '', imageIds: ['img-1'] },
      { text: 'a. prokaryotic' },
      { text: 'b. eukaryotic' },
      { text: '2. The cell membrane would be represented by which number?' },
      { text: 'a. 4' },
      { text: 'b. 5' },
      { text: '3. Which organelle makes proteins?' },
      { text: 'a. ribosome' },
      { text: 'b. vacuole' },
    ]);
    expect(questions.map((q) => q.imageIds)).toEqual([
      ['img-1'],
      ['img-1'],
      [],
    ]);
    expect(questions[1].warnings.join(' ')).toMatch(
      /picture from the question/
    );
  });

  it('notes a picture that went to several questions only because it is printed beside them', () => {
    const line = (
      text: string,
      top: number,
      left = 0.1,
      right = 0.6
    ): PositionedLine => ({ line: { text }, top, left, right });
    const chart: PageBox = { x: 0.72, y: 0.12, width: 0.23, height: 0.4 };
    const placed = placePictureLines(
      1,
      [
        line('10. Streak is better than color because color can vary.', 0.08),
        line('a. be light', 0.11),
        line('b. increase', 0.13),
        line('11. What is the hardness of a mineral topaz can scratch?', 0.2),
        line('a. 6', 0.23),
        line('b. 7', 0.25),
        line('12. Which letter on the chart marks talc?', 0.33),
        line('a. A', 0.36),
        line('b. B', 0.38),
      ],
      [chart]
    );
    const { questions } = parseDocument(placed);
    expect(questions.map((q) => q.imageIds.length)).toEqual([1, 1, 1]);
    const noted = questions.map((q) =>
      /beside more than one question/.test(q.warnings.join(' '))
    );
    expect(noted).toEqual([true, true, false]);
  });
});
