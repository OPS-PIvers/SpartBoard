import { describe, expect, it } from 'vitest';
import { parseRosterFileBody } from './useRosters';

describe('parseRosterFileBody standing accommodations', () => {
  it('keeps answer choices, modified questions and supports', () => {
    const body = parseRosterFileBody({
      version: 2,
      students: [{ id: 'a', firstName: 'A', lastName: 'B', pin: '01' }],
      defaultOverridesByStudentId: {
        a: {
          answerChoices: 2,
          modifiedQuestions: true,
          supports: [
            { kind: 'text', title: 'Words', text: 'cat, dog' },
            { kind: 'link', title: 'Site', url: 'https://example.com' },
            { kind: 'bogus', title: 'x' },
          ],
        },
        b: { answerChoices: 4, modifiedQuestions: 'yes' },
      },
    });
    expect(body.defaultOverridesByStudentId.a).toEqual({
      answerChoices: 2,
      modifiedQuestions: true,
      supports: [
        { kind: 'text', title: 'Words', text: 'cat, dog' },
        { kind: 'link', title: 'Site', url: 'https://example.com' },
      ],
    });
    expect(body.defaultOverridesByStudentId.b).toEqual({});
  });
});
