import { describe, expect, it, vi } from 'vitest';
import {
  COMPACT_QUESTIONS,
  cleanMessage,
  questionMessage,
  renderPreview,
  rubricDraftMessage,
  type PreviewActions,
} from '@/mcpApps/preview/render';
import { isNewer } from '@/mcpApps/preview/supersede';
import type {
  QuestionView,
  QuizView,
  RubricView,
} from '@/mcpApps/preview/types';

const question = (
  n: number,
  extra: Partial<QuestionView> = {}
): QuestionView => ({
  n,
  id: `q${n}`,
  type: 'multiple_choice',
  text: `Question ${n}`,
  points: 1,
  changed: false,
  correct_answer: 'Right',
  incorrect_answers: ['Wrong'],
  rubric: null,
  ...extra,
});

const quiz = (extra: Partial<QuizView> = {}): QuizView => ({
  view: 'quiz',
  kind: 'quiz',
  id: 'abc',
  title: 'Cells',
  shared_with_plc: false,
  updated_at: 10,
  total_points: 5,
  missing_answer_keys: 0,
  sections: 0,
  passages: 0,
  bank_pulls: 0,
  removed_questions: 0,
  open_url: 'https://spartboard.web.app',
  questions: [1, 2, 3, 4, 5].map((n) => question(n)),
  ...extra,
});

function actions(): PreviewActions & { sent: string[] } {
  const sent: string[] = [];
  return {
    sent,
    ask: vi.fn((text: string) => {
      sent.push(text);
      return Promise.resolve(true);
    }),
    focus: vi.fn(),
    expand: vi.fn(),
    open: vi.fn(),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('quiz preview card', () => {
  it('shows the first questions inline and expands for the rest', () => {
    const root = document.createElement('div');
    const a = actions();
    renderPreview(root, quiz(), a, { compact: true, superseded: false });
    expect(root.querySelectorAll('.question')).toHaveLength(COMPACT_QUESTIONS);
    const more = [...root.querySelectorAll('button')].find((b) =>
      b.textContent?.startsWith('Show all 5')
    );
    more?.click();
    expect(a.expand).toHaveBeenCalled();
    renderPreview(root, quiz(), a, { compact: false, superseded: false });
    expect(root.querySelectorAll('.question')).toHaveLength(5);
  });

  it('draws teacher text as text, never as markup', () => {
    const root = document.createElement('div');
    renderPreview(
      root,
      quiz({
        title: '<img src=x onerror=alert(1)>',
        questions: [question(1, { text: '<b>bold</b> ⟦x^2⟧' })],
      }),
      actions(),
      { compact: false, superseded: false }
    );
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('b')).toBeNull();
    expect(root.querySelector('h1')?.textContent).toBe(
      '<img src=x onerror=alert(1)>'
    );
    expect(root.querySelector('.math')?.textContent).toBe('x^2');
  });

  it('marks the correct choice and updated questions', () => {
    const root = document.createElement('div');
    renderPreview(
      root,
      quiz({ questions: [question(1, { changed: true })] }),
      actions(),
      { compact: false, superseded: false }
    );
    expect(root.querySelector('.choices .correct')?.textContent).toContain(
      'Right'
    );
    expect(root.querySelector('.question.changed .badge.new')).not.toBeNull();
  });

  it('sends a question change with the quiz and question named', async () => {
    const root = document.createElement('div');
    const a = actions();
    renderPreview(root, quiz(), a, { compact: true, superseded: false });
    const first = root.querySelector('.question') as HTMLElement;
    (first.querySelector('.ask button.link') as HTMLButtonElement).click();
    const input = first.querySelector('.ask-form input') as HTMLInputElement;
    input.value = 'make the distractors harder';
    expect(first.querySelector('form')).toBeNull();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await flush();
    expect(a.sent).toEqual([
      'From the preview card: in the quiz "Cells" (quiz_id abc), change question 1: make the distractors harder',
    ]);
    expect(first.querySelector('.status')?.textContent).toBe('Sent to Claude.');
  });

  it('offers a rubric draft on a free-response question without one', async () => {
    const root = document.createElement('div');
    const a = actions();
    const fr = question(1, { type: 'free_response', text: 'Explain osmosis.' });
    renderPreview(root, quiz({ questions: [fr] }), a, {
      compact: false,
      superseded: false,
    });
    const draft = [...root.querySelectorAll('button')].find(
      (b) => b.textContent === 'Draft a rubric with Claude'
    );
    draft?.click();
    await flush();
    expect(a.sent[0]).toBe(rubricDraftMessage(quiz(), fr));
    expect(a.sent[0]).toContain('attach it to that question');
  });

  it('shows an attached rubric as a grid, highest level first', () => {
    const root = document.createElement('div');
    const fr = question(1, {
      type: 'free_response',
      rubric: {
        title: 'Claim',
        description: '',
        max_points: 4,
        shown_to_students: false,
        criteria: [
          {
            name: 'Claim',
            description: '',
            examples: [],
            levels: [
              { label: 'Missing', points: 0, description: '' },
              { label: 'Clear', points: 4, description: 'States it.' },
            ],
          },
        ],
      },
    });
    renderPreview(root, quiz({ questions: [fr] }), actions(), {
      compact: false,
      superseded: false,
    });
    expect(root.querySelector('.rubric-box summary')?.textContent).toBe(
      'Rubric: Claim · 4 pts · hidden from students'
    );
    const cells = [...root.querySelectorAll('.rubric td .level')].map(
      (c) => c.textContent
    );
    expect(cells).toEqual(['Clear · 4', 'Missing · 0']);
  });

  it('disables asking on a superseded or PLC-shared card', () => {
    for (const [opts, extra] of [
      [{ compact: true, superseded: true }, {}],
      [{ compact: true, superseded: false }, { shared_with_plc: true }],
    ] as const) {
      const root = document.createElement('div');
      renderPreview(root, quiz(extra), actions(), opts);
      const asks = root.querySelectorAll<HTMLButtonElement>('.ask button.link');
      expect([...asks].every((b) => b.disabled)).toBe(true);
    }
  });
});

describe('rubric preview card', () => {
  it('lists every criterion with its own change box', () => {
    const root = document.createElement('div');
    const rubric: RubricView = {
      view: 'rubric',
      rubric_id: 'r1',
      updated_at: 1,
      title: 'Lab report',
      description: '',
      max_points: 7,
      criteria: ['Claim', 'Evidence'].map((name) => ({
        name,
        description: '',
        examples: [],
        levels: [
          { label: 'Low', points: 0, description: '' },
          { label: 'High', points: 3, description: '' },
        ],
      })),
    };
    renderPreview(root, rubric, actions(), {
      compact: true,
      superseded: false,
    });
    expect(root.querySelectorAll('.rubric tr')).toHaveLength(2);
    expect(
      [...root.querySelectorAll('.criteria-asks .ask button.link')].map(
        (b) => b.textContent
      )
    ).toEqual(['Change "Claim"…', 'Change "Evidence"…']);
  });
});

describe('messages', () => {
  it('trims what the host would refuse', () => {
    expect(cleanMessage(`a\n\n\n\n\nb${' '.repeat(80)}c\u200B`)).toBe(
      'a\n\n\nb c'
    );
  });

  it('caps a long ask', () => {
    const text = questionMessage(quiz(), question(1), 'x'.repeat(5000));
    expect(text.length).toBeLessThan(2200);
  });
});

describe('isNewer', () => {
  const base = { key: 'quiz:1', version: 5, mountedAt: 5, instance: 'b' };
  it('prefers the newer saved version over a later card', () => {
    expect(isNewer({ ...base, version: 6, mountedAt: 1 }, base)).toBe(true);
  });
  it('breaks a tie by when the card mounted, then by instance', () => {
    expect(isNewer({ ...base, mountedAt: 6 }, base)).toBe(true);
    expect(isNewer({ ...base, instance: 'a' }, base)).toBe(false);
  });
});
