import { describe, expect, it } from 'vitest';
import {
  InputSignalCollector,
  addSignals,
  describeInputSignals,
  formatFindingQuestions,
  inputFindingsByAttempt,
  readAttemptSignals,
} from '@/utils/inputSignals';

const ids = (c: InputSignalCollector, answers?: { answeredAt: number }[]) =>
  describeInputSignals(c.snapshot(), answers).map((f) => f.id);

/** A hand: speeds up, slows down, wobbles off the line. */
function humanMove(
  c: InputSignalCollector,
  from: [number, number],
  to: [number, number]
) {
  const steps = 24;
  for (let i = 1; i <= steps; i += 1) {
    const p = (1 - Math.cos((Math.PI * i) / steps)) / 2;
    const wobble = Math.sin(i * 1.7) * 6 * Math.sin(Math.PI * p);
    c.pointerMove(
      from[0] + (to[0] - from[0]) * p + wobble,
      from[1] + (to[1] - from[1]) * p - wobble
    );
  }
}

const SPOTS: [number, number][] = [
  [100, 100],
  [420, 380],
  [150, 520],
  [600, 200],
  [300, 640],
];

describe('InputSignalCollector pointer', () => {
  it('does not flag clicks reached by moving the mouse', () => {
    const c = new InputSignalCollector(true);
    c.pointerDown(...SPOTS[0]);
    for (let i = 1; i < SPOTS.length; i += 1) {
      humanMove(c, SPOTS[i - 1], SPOTS[i]);
      c.pointerDown(...SPOTS[i]);
    }
    expect(c.snapshot()._).toEqual({ clicks: 5 });
    expect(ids(c)).toEqual([]);
  });

  it('flags clicks that land far away with no travel', () => {
    const c = new InputSignalCollector(true);
    for (const spot of SPOTS) c.pointerDown(...spot);
    expect(c.snapshot()._).toEqual({ clicks: 5, jumpClicks: 4 });
    expect(ids(c)).toEqual(['jump-clicks']);
  });

  it('does not count a second click on the same spot as a jump', () => {
    const c = new InputSignalCollector(true);
    c.pointerDown(200, 200);
    c.pointerDown(203, 201);
    expect(c.snapshot()._).toEqual({ clicks: 2 });
  });

  it('flags a straight constant-speed path', () => {
    const c = new InputSignalCollector(true);
    c.pointerDown(0, 0);
    for (let n = 1; n <= 3; n += 1) {
      for (let i = 1; i <= 20; i += 1) c.pointerMove(n * 300, i * 15);
      c.pointerDown(n * 300, 300);
      for (let i = 19; i >= 0; i -= 1) c.pointerMove(n * 300, i * 15);
      c.pointerDown(n * 300, 0);
    }
    expect(c.snapshot()._.lineClicks).toBeGreaterThanOrEqual(3);
    expect(ids(c)).toContain('line-clicks');
  });
});

/** Types `n` letters; `gap` and `dwell` give each key's timing in ms. */
function type(
  c: InputSignalCollector,
  n: number,
  gap: (i: number) => number,
  dwell: (i: number) => number
) {
  const field = {};
  let t = 5_000;
  for (let i = 0; i < n; i += 1) {
    t += gap(i);
    const code = `Key${i % 26}`;
    c.keyDown({ code, t, char: true, field });
    c.textInput(1, t + 1, 'typed');
    c.keyUp(code, t + dwell(i));
  }
}

describe('InputSignalCollector typing', () => {
  it('does not flag uneven, human-speed typing', () => {
    const c = new InputSignalCollector(true);
    type(
      c,
      120,
      (i) => 90 + ((i * 53) % 260),
      (i) => 60 + ((i * 17) % 70)
    );
    expect(ids(c)).toEqual([]);
  });

  it('flags keys released instantly and a perfectly even rhythm', () => {
    const c = new InputSignalCollector(true);
    type(
      c,
      120,
      () => 80,
      () => 1
    );
    expect(ids(c)).toEqual(['instant-keys', 'even-typing']);
  });

  it('flags impossible speed', () => {
    const c = new InputSignalCollector(true);
    type(
      c,
      120,
      () => 5,
      () => 40
    );
    expect(ids(c)).toEqual(['fast-typing']);
  });

  it('flags text that arrives with no key presses', () => {
    const c = new InputSignalCollector(true);
    c.textInput(180, 9_000, 'typed');
    expect(c.snapshot()._).toEqual({ chars: 180, unkeyedChars: 180 });
    expect(ids(c)).toEqual(['unkeyed-text']);
  });

  it('ignores key timing and keyless text on a touch device', () => {
    const c = new InputSignalCollector(false);
    type(
      c,
      60,
      () => 150,
      () => 0
    );
    c.textInput(40, 60_000, 'typed');
    const counts = c.snapshot()._;
    expect(counts.instantKeys).toBeUndefined();
    expect(counts.unkeyedChars).toBeUndefined();
  });

  it('counts composed text as typed', () => {
    const c = new InputSignalCollector(true);
    c.textInput(30, 9_000, 'composed');
    expect(c.snapshot()._).toEqual({ chars: 30 });
  });

  it('counts a paste that lands, including one the editor re-inserts as text', () => {
    const c = new InputSignalCollector(true);
    c.paste(50, 1_000);
    c.textInput(null, 1_001, 'pasted');
    c.paste(70, 2_000);
    c.textInput(70, 2_000, 'typed');
    expect(c.snapshot()._).toEqual({ pastes: 2, pastedChars: 120 });
    expect(ids(c)).toEqual(['pasted']);
  });

  it('reports a blocked paste as a try', () => {
    const c = new InputSignalCollector(true);
    c.paste(50, 1_000);
    expect(ids(c)).toEqual(['paste-attempts']);
  });
});

describe('questions and saving', () => {
  it('files counts under the id of the question on screen', () => {
    const c = new InputSignalCollector(true);
    c.scripted();
    c.setQuestion('q-a');
    c.scripted();
    c.setQuestion('q-b');
    c.scripted();
    c.scripted();
    expect(c.snapshot()).toEqual({
      _: { scripted: 1 },
      'q-a': { scripted: 1 },
      'q-b': { scripted: 2 },
    });
    const [finding] = describeInputSignals(c.snapshot());
    expect(finding.id).toBe('scripted');
    expect(finding.questions).toEqual(['q-a', 'q-b']);
  });

  it('is dirty only after something was counted', () => {
    const c = new InputSignalCollector(true);
    c.pointerMove(1, 1);
    expect(c.takeDirty()).toBe(false);
    c.pointerDown(1, 1);
    expect(c.takeDirty()).toBe(true);
    expect(c.takeDirty()).toBe(false);
  });

  it('adds this page load to an earlier one', () => {
    expect(
      addSignals(
        { '0': { clicks: 2 }, '1': { keys: 4 } },
        { '1': { keys: 1, chars: 1 } }
      )
    ).toEqual({ '0': { clicks: 2 }, '1': { keys: 5, chars: 1 } });
  });

  it('drops anything malformed a student could have written', () => {
    const forged = {
      '0': {
        '2': { clicks: 3, jumpClicks: -4, keys: 'many', extra: 9 },
        'no pe': { clicks: 1 },
        '5': 'x',
      },
      '1': 'x',
    };
    expect(readAttemptSignals(forged, 0)).toEqual({ '2': { clicks: 3 } });
    expect(readAttemptSignals(forged, 1)).toEqual({});
    expect(readAttemptSignals('junk', 0)).toEqual({});
  });
});

describe('answer timing', () => {
  const at = (gaps: number[]) => {
    let t = 1_000_000;
    return [{ answeredAt: t }, ...gaps.map((g) => ({ answeredAt: (t += g) }))];
  };

  it('flags answers that arrive at a fixed interval', () => {
    const answers = at([8000, 8100, 7950, 8050, 8000, 7900]);
    expect(describeInputSignals({}, answers).map((f) => f.id)).toEqual([
      'even-answers',
    ]);
  });

  it('does not flag uneven answers or too few of them', () => {
    expect(
      describeInputSignals({}, at([4000, 21000, 9000, 30000, 6000, 15000]))
    ).toEqual([]);
    expect(describeInputSignals({}, at([8000, 8000, 8000]))).toEqual([]);
  });
});

describe('inputFindingsByAttempt', () => {
  it('lists each attempt that has findings, latest first', () => {
    const signals = {
      '0': { '0': { scripted: 1 } },
      '1': { '0': { clicks: 4 } },
      '2': { '1': { pastes: 1 } },
    };
    const out = inputFindingsByAttempt(signals, 2);
    expect(out.map((a) => a.attempt)).toEqual([2, 0]);
    expect(out[0].findings[0].id).toBe('paste-attempts');
  });

  it('is empty with no signals', () => {
    expect(inputFindingsByAttempt(undefined, 0)).toEqual([]);
  });
});

describe('formatFindingQuestions', () => {
  const order = ['a', 'b', 'c', 'd'];

  it('numbers questions by the quiz order, not the order the student saw', () => {
    expect(formatFindingQuestions(['d', 'b'], order)).toBe(' (Q2, Q4)');
  });

  it('counts questions it cannot place instead of numbering them', () => {
    expect(formatFindingQuestions(['b', 'zz'], order)).toBe(' (Q2, +1 more)');
    expect(formatFindingQuestions(['b', 'c'], undefined)).toBe(
      ' (on 2 questions)'
    );
    expect(formatFindingQuestions([], order)).toBe('');
  });
});
