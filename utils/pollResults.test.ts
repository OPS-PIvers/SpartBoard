import { describe, expect, it } from 'vitest';
import type { PollQuestion } from '@/types';
import {
  pollResultsCsv,
  hiddenWordKey,
  summarizeLocalPoll,
  summarizePoll,
} from '@/utils/pollResults';

const choice: PollQuestion = {
  id: 'q1',
  question: 'Best fruit?',
  options: [
    { id: 'a', label: 'Apple', votes: 0, correct: true },
    { id: 'b', label: 'Banana', votes: 0 },
  ],
};
const scale: PollQuestion = {
  id: 'q2',
  question: 'How sure?',
  kind: 'scale',
  options: [1, 2, 3, 4, 5].map((n) => ({
    id: `s${n}`,
    label: String(n),
    votes: 0,
  })),
};
const words: PollQuestion = {
  id: 'q3',
  question: 'One word?',
  kind: 'words',
  options: [],
};
const text: PollQuestion = {
  id: 'q4',
  question: 'Why?',
  kind: 'text',
  options: [],
};

describe('summarizePoll', () => {
  it('counts votes, percent, average and typed answers per question', () => {
    const [c, s, w, t] = summarizePoll(
      [choice, scale, words, text],
      [
        { id: '0_u1', questionIndex: 0, optionIndex: 0 },
        { id: '0_u2', questionIndex: 0, optionIndex: 1 },
        { id: '0_u3', questionIndex: 0, optionIndex: 1 },
        { id: '1_u1', questionIndex: 1, optionIndex: 3 },
        { id: '1_u2', questionIndex: 1, optionIndex: 4 },
      ],
      [
        { id: '2_u1', questionIndex: 2, text: 'Sunny ', votedAt: 1 },
        { id: '2_u2', questionIndex: 2, text: 'sunny', votedAt: 2 },
        { id: '2_u3', questionIndex: 2, text: 'cold', votedAt: 3 },
        { id: '3_u1', questionIndex: 3, text: 'first', votedAt: 1 },
        { id: '3_u2', questionIndex: 3, text: 'second', votedAt: 2 },
        { id: '3_u3', questionIndex: 3, text: '  ', votedAt: 3 },
      ]
    );
    expect(c.answered).toBe(3);
    expect(c.options).toEqual([
      { label: 'Apple', count: 1, percent: 33, correct: true },
      { label: 'Banana', count: 2, percent: 67, correct: false },
    ]);
    expect(c.average).toBeNull();
    expect(s.average).toBe(4.5);
    expect(w.answered).toBe(3);
    expect(w.texts).toEqual([
      { text: 'sunny', count: 2 },
      { text: 'cold', count: 1 },
    ]);
    expect(t.texts.map((x) => x.text)).toEqual(['second', 'first']);
    expect(t.answered).toBe(2);
  });

  it('shows zero percent for a question nobody answered', () => {
    const [c] = summarizePoll([choice], [], []);
    expect(c.answered).toBe(0);
    expect(c.options.map((o) => o.percent)).toEqual([0, 0]);
  });
});

describe('summarizeLocalPoll', () => {
  it('reads the board tallies', () => {
    const [c] = summarizeLocalPoll([
      {
        ...choice,
        options: [
          { id: 'a', label: 'Apple', votes: 3 },
          { id: 'b', label: 'Banana', votes: 1 },
        ],
      },
    ]);
    expect(c.answered).toBe(4);
    expect(c.options.map((o) => o.percent)).toEqual([75, 25]);
  });
});

describe('pollResultsCsv', () => {
  it('writes options, the scale average and typed answers', () => {
    const csv = pollResultsCsv(
      summarizePoll(
        [choice, scale, text],
        [
          { id: '0_u1', questionIndex: 0, optionIndex: 0 },
          { id: '1_u1', questionIndex: 1, optionIndex: 2 },
        ],
        [{ id: '2_u1', questionIndex: 2, text: 'He said "no"', votedAt: 1 }]
      )
    );
    const lines = csv.split('\n');
    expect(lines[0]).toBe('"Question","Answer","Count","Percent","Correct"');
    expect(lines[1]).toBe('"Best fruit?","Apple","1","100","Yes"');
    expect(lines).toContain('"How sure?","Average","3.0","",""');
    expect(lines).toContain('"Why?","He said ""no""","1","100",""');
  });

  it('stops a spreadsheet running an answer as a formula', () => {
    const csv = pollResultsCsv(
      summarizePoll(
        [text],
        [],
        [{ id: '0_u1', questionIndex: 0, text: '=HYPERLINK("x")', votedAt: 1 }]
      )
    );
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe('hidden answers', () => {
  it('leaves answers and words the teacher hid out of the list', () => {
    const [w, t] = summarizePoll(
      [words, text],
      [],
      [
        { id: '0_u1', questionIndex: 0, text: 'rude', votedAt: 1 },
        { id: '0_u2', questionIndex: 0, text: 'fun', votedAt: 2 },
        { id: '1_u1', questionIndex: 1, text: 'keep', votedAt: 1 },
        { id: '1_u2', questionIndex: 1, text: 'hide me', votedAt: 2 },
      ],
      [hiddenWordKey('q3', 'rude'), 'q4:1_u2']
    );
    expect(w.texts).toEqual([{ text: 'fun', count: 1 }]);
    expect(t.texts.map((x) => x.text)).toEqual(['keep']);
    expect(t.answered).toBe(2);
  });
});

describe('hiddenWordKey', () => {
  it('never stores the typed word itself', () => {
    const key = hiddenWordKey('q3', 'sam jones');
    expect(key.startsWith('q3#')).toBe(true);
    expect(key).not.toContain('sam');
    expect(key).toBe(hiddenWordKey('q3', 'sam jones'));
    expect(key).not.toBe(hiddenWordKey('q3', 'sam jone'));
  });
});
