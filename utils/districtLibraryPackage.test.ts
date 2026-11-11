import { describe, expect, it } from 'vitest';
import {
  DISTRICT_PACKAGE_FORMAT,
  collectPicturePaths,
  isSafePicturePath,
  packagePictureContentType,
  replacePicturePaths,
  validateDistrictPackage,
  type DistrictPackageEntry,
} from './districtLibraryPackage';

const BANK_ID = '5f0c1a2b-0000-5000-8000-000000000001';

const question = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'MC',
  text: `Question ${id}`,
  timeLimit: 0,
  correctAnswer: 'A',
  incorrectAnswers: ['B', 'C'],
  ...extra,
});

const bankFile = () => ({
  id: BANK_ID,
  title: 'Grade 8 science: Phenomenon 1',
  questions: [question('q1', { stimulusIds: ['s1'] }), question('q2')],
  stimuli: [
    {
      id: 's1',
      type: 'image',
      url: 'pictures/s1.png',
      label: 'Phenomenon 1: Tab A',
      tabLabel: 'Tab A',
    },
  ],
  language: 'en-US',
  createdAt: 1,
  updatedAt: 1,
});

const bankEntry = (
  extra: Partial<DistrictPackageEntry> = {}
): DistrictPackageEntry => ({
  kind: 'questionBank',
  id: BANK_ID,
  title: 'Grade 8 science: Phenomenon 1',
  path: 'banks/phenomenon-1.bank.json',
  questionCount: 2,
  pictures: ['pictures/s1.png', 'pictures/chart-1.png'],
  questions: [
    {
      id: 'q1',
      attribution: 'Minnesota Department of Education, released MCA item 1',
      resultsPicture: 'pictures/chart-1.png',
    },
  ],
  ...extra,
});

const manifest = (entries: unknown[]) => ({
  format: DISTRICT_PACKAGE_FORMAT,
  version: 1,
  title: 'MCA IV science grade 8',
  generatedAt: 1762819200000,
  source: { name: 'Minnesota Department of Education' },
  entries,
});

const ZIP = [
  'package.json',
  'banks/phenomenon-1.bank.json',
  'pictures/s1.png',
  'pictures/chart-1.png',
];

const run = (
  entries: unknown[] = [bankEntry()],
  file: unknown = bankFile(),
  zip: string[] = ZIP
) =>
  validateDistrictPackage(manifest(entries), zip, {
    'banks/phenomenon-1.bank.json': file,
  });

describe('validateDistrictPackage', () => {
  it('accepts the layout the MCA script writes', () => {
    const result = run();
    if (!result.ok) expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('passes the new question and stimulus fields through untouched', () => {
    const fib = question('q3', {
      type: 'FIB',
      correctAnswer: 'heat',
      blankType: 'dropdown',
      blankChoices: [{ choices: ['heat', 'light'] }],
      wordBank: ['heat', 'light'],
      wordBankReuse: false,
      explanation: 'Energy moves from hot to cold.',
      optionExplanations: { A: 'Right', B: 'Wrong' },
      dok: 3,
      someFutureField: { nested: true },
    });
    const file = bankFile();
    file.questions.push(fib);
    const result = run([bankEntry({ questionCount: 3 })], file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const saved = result.contents.files[BANK_ID];
    expect(saved.questions[2]).toEqual(fib);
    expect(saved.stimuli?.[0].tabLabel).toBe('Tab A');
  });

  it('rejects the wrong format and a newer version', () => {
    expect(
      validateDistrictPackage(
        { ...manifest([bankEntry()]), format: 'x' },
        ZIP,
        {}
      ).ok
    ).toBe(false);
    expect(
      validateDistrictPackage(
        { ...manifest([bankEntry()]), version: 2 },
        ZIP,
        {}
      ).ok
    ).toBe(false);
  });

  it('rejects repeated entry ids and repeated question ids', () => {
    expect(run([bankEntry(), bankEntry()]).ok).toBe(false);
    const file = bankFile();
    file.questions.push(question('q1'));
    expect(run([bankEntry()], file).ok).toBe(false);
  });

  it('rejects an id with a slash', () => {
    const file = { ...bankFile(), id: 'a/b' };
    expect(run([bankEntry({ id: 'a/b' })], file).ok).toBe(false);
  });

  it('rejects a file whose id differs from its entry', () => {
    expect(run([bankEntry()], { ...bankFile(), id: 'other' }).ok).toBe(false);
  });

  it('rejects a question that points at a missing stimulus', () => {
    const file = bankFile();
    file.questions.push(question('q9', { stimulusIds: ['nope'] }));
    expect(run([bankEntry()], file).ok).toBe(false);
  });

  it('rejects a picture missing from the zip, outside pictures/ or of the wrong type', () => {
    expect(run([bankEntry()], bankFile(), ZIP.slice(0, 3)).ok).toBe(false);
    expect(
      run([bankEntry({ pictures: ['../evil.png', 'pictures/chart-1.png'] })]).ok
    ).toBe(false);
    expect(
      run([
        bankEntry({ pictures: ['pictures/s1.svg', 'pictures/chart-1.png'] }),
      ]).ok
    ).toBe(false);
  });

  it('rejects a picture the file uses but its entry does not list', () => {
    const file = bankFile();
    file.stimuli[0].url = 'pictures/other.png';
    expect(run([bankEntry()], file, [...ZIP, 'pictures/other.png']).ok).toBe(
      false
    );
  });

  it('rejects a results picture that is not among the entry pictures', () => {
    const entry = bankEntry({
      questions: [{ id: 'q1', resultsPicture: 'pictures/nope.png' }],
    });
    expect(run([entry]).ok).toBe(false);
  });

  it('warns about unused pictures and a wrong question count', () => {
    const result = run([bankEntry({ questionCount: 5 })], bankFile(), [
      ...ZIP,
      'pictures/extra.png',
    ]);
    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBe(2);
  });

  it('checks quiz bank slots against question banks in the same package', () => {
    const quizEntry: DistrictPackageEntry = {
      kind: 'quiz',
      id: 'quiz-1',
      title: 'Practice test',
      path: 'quizzes/practice.quiz.json',
      questionCount: 1,
      pictures: [],
    };
    const quiz = (bankId: string) => ({
      id: 'quiz-1',
      title: 'Practice test',
      questions: [question('qq1')],
      bankSlots: [{ id: 'slot-1', bankId, mode: 'random', count: 2 }],
    });
    const zip = [...ZIP, 'quizzes/practice.quiz.json'];
    const files = (bankId: string) => ({
      'banks/phenomenon-1.bank.json': bankFile(),
      'quizzes/practice.quiz.json': quiz(bankId),
    });
    expect(
      validateDistrictPackage(
        manifest([bankEntry(), quizEntry]),
        zip,
        files(BANK_ID)
      ).ok
    ).toBe(true);
    expect(
      validateDistrictPackage(
        manifest([bankEntry(), quizEntry]),
        zip,
        files('other')
      ).ok
    ).toBe(false);
  });

  it('rejects an undeclared picture written inside question text', () => {
    const file = bankFile();
    file.questions[1] = question('q2', {
      text: 'Use the map. <img src="pictures/map.png">',
    });
    const result = run([bankEntry()], file, [...ZIP, 'pictures/map.png']);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join(' ')).toMatch(/map\.png/);
  });

  it('rejects unknown question types and graded questions without a key', () => {
    const file = bankFile();
    file.questions[1] = question('q2', { type: 'Essay' });
    expect(run([bankEntry()], file).ok).toBe(false);
    const noKey = bankFile();
    noKey.questions[1] = question('q2', { correctAnswer: '  ' });
    expect(run([bankEntry()], noKey).ok).toBe(false);
    const flagged = bankFile();
    flagged.questions[1] = question('q2', { needsKey: true });
    expect(run([bankEntry()], flagged).ok).toBe(false);
    const written = bankFile();
    written.questions[1] = question('q2', {
      type: 'free-response',
      correctAnswer: '',
    });
    expect(run([bankEntry()], written).ok).toBe(true);
  });

  it('rejects choose-all and multi-blank keys that cannot be graded', () => {
    const withQ = (extra: Record<string, unknown>) => {
      const file = bankFile();
      file.questions[1] = question('q2', extra);
      return run([bankEntry()], file).ok;
    };
    const SEP = '\u001F';
    expect(
      withQ({ type: 'MA', correctAnswer: 'A|C', incorrectAnswers: ['B', 'D'] })
    ).toBe(true);
    expect(
      withQ({ type: 'MA', correctAnswer: 'A|B', incorrectAnswers: ['B', 'D'] })
    ).toBe(false);
    expect(
      withQ({ type: 'MA', correctAnswer: 'A|A', incorrectAnswers: ['B'] })
    ).toBe(false);
    expect(
      withQ({
        type: 'MA',
        correctAnswer: 'A|C',
        incorrectAnswers: ['B'],
        optionOrder: [0, 1, 5],
      })
    ).toBe(false);
    expect(
      withQ({ type: 'MC', correctAnswer: 'A', incorrectAnswers: ['A', 'B'] })
    ).toBe(false);
    expect(
      withQ({
        type: 'FIB',
        text: 'Heat flows from ____ to ____.',
        correctAnswer: `hot${SEP}cold`,
        incorrectAnswers: [],
      })
    ).toBe(true);
    expect(
      withQ({
        type: 'FIB',
        text: 'Heat flows from ____ to cold.',
        correctAnswer: `hot${SEP}cold`,
        incorrectAnswers: [],
      })
    ).toBe(false);
    expect(
      withQ({
        type: 'FIB',
        text: 'Heat flows from ____ to ____.',
        correctAnswer: `hot${SEP} `,
        incorrectAnswers: [],
      })
    ).toBe(false);
  });

  it('rejects FIB keys that do not fit their blanks, dropdowns or word bank', () => {
    const fib = (extra: Record<string, unknown>) => {
      const file = bankFile();
      file.questions[1] = question('q2', {
        type: 'FIB',
        incorrectAnswers: [],
        ...extra,
      });
      return run([bankEntry()], file).ok;
    };
    // One-part key for a stem with two written blanks.
    expect(fib({ text: 'From ____ to ____.', correctAnswer: 'hot' })).toBe(
      false
    );
    expect(fib({ text: 'Heat flows from ____.', correctAnswer: 'hot' })).toBe(
      true
    );
    // Dropdown: the answer must be one of that blank's choices.
    expect(
      fib({
        text: 'Heat flows from ____.',
        correctAnswer: 'hot',
        blankType: 'dropdown',
        blankChoices: [{ choices: ['hot', 'cold'] }],
      })
    ).toBe(true);
    expect(
      fib({
        text: 'Heat flows from ____.',
        correctAnswer: 'warm',
        blankType: 'dropdown',
        blankChoices: [{ choices: ['hot', 'cold'] }],
      })
    ).toBe(false);
    expect(
      fib({
        text: 'Heat flows from ____.',
        correctAnswer: 'hot',
        blankType: 'dropdown',
      })
    ).toBe(false);
    // Drag: the answer must be in the word bank.
    expect(
      fib({
        text: 'Heat flows from ____.',
        correctAnswer: 'hot',
        blankType: 'drag',
        wordBank: ['hot', 'cold'],
      })
    ).toBe(true);
    expect(
      fib({
        text: 'Heat flows from ____.',
        correctAnswer: 'warm',
        blankType: 'drag',
        wordBank: ['hot', 'cold'],
      })
    ).toBe(false);
  });

  it('rejects an entry file over the size cap', () => {
    const file = bankFile();
    file.questions[1] = question('q2', { text: 'x'.repeat(950_000) });
    expect(run([bankEntry()], file).ok).toBe(false);
  });

  describe('quiz draws and layout', () => {
    const quizEntry: DistrictPackageEntry = {
      kind: 'quiz',
      id: 'quiz-1',
      title: 'Practice test',
      path: 'quizzes/practice.quiz.json',
      questionCount: 1,
      pictures: [],
    };
    const zip = [...ZIP, 'quizzes/practice.quiz.json'];
    const check = (quiz: Record<string, unknown>) =>
      validateDistrictPackage(manifest([bankEntry(), quizEntry]), zip, {
        'banks/phenomenon-1.bank.json': bankFile(),
        'quizzes/practice.quiz.json': {
          id: 'quiz-1',
          title: 'Practice test',
          questions: [question('qq1')],
          ...quiz,
        },
      });
    const slot = (id: string, count = 1) => ({
      id,
      bankId: BANK_ID,
      mode: 'random',
      count,
    });

    it('refuses a draw larger than its bank', () => {
      expect(check({ bankSlots: [slot('d1', 2)] }).ok).toBe(true);
      expect(check({ bankSlots: [slot('d1', 3)] }).ok).toBe(false);
    });

    it('refuses repeated draw ids, and a draw id that is a question id', () => {
      expect(check({ bankSlots: [slot('d1'), slot('d1')] }).ok).toBe(false);
      expect(check({ bankSlots: [slot('qq1')] }).ok).toBe(false);
    });

    it('checks order and sections against the questions and draws', () => {
      const good = {
        bankSlots: [slot('d1')],
        sections: [{ id: 'sec1', title: 'Part 1' }],
        order: [
          { kind: 'section', id: 'sec1' },
          { kind: 'question', id: 'qq1' },
          { kind: 'slot', id: 'd1' },
        ],
      };
      expect(check(good).ok).toBe(true);
      expect(check({ ...good, order: good.order.slice(0, 2) }).ok).toBe(false);
      expect(
        check({
          ...good,
          order: [...good.order, { kind: 'question', id: 'ghost' }],
        }).ok
      ).toBe(false);
      expect(check({ ...good, order: [...good.order, good.order[1]] }).ok).toBe(
        false
      );
      expect(check({ sections: good.sections }).ok).toBe(false);
    });
  });

  it('rejects an empty package and a missing entry file', () => {
    expect(validateDistrictPackage(manifest([]), ZIP, {}).ok).toBe(false);
    expect(validateDistrictPackage(null, ZIP, {}).ok).toBe(false);
    expect(validateDistrictPackage(manifest([bankEntry()]), ZIP, {}).ok).toBe(
      false
    );
  });
});

describe('picture paths', () => {
  it('collects picture paths anywhere in the tree', () => {
    const refs = collectPicturePaths({
      a: 'pictures/a.png',
      b: [{ c: 'pictures/b.jpg' }, 'plain text'],
      d: { e: 'pictures/a.png' },
    });
    expect(refs.sort()).toEqual(['pictures/a.png', 'pictures/b.jpg']);
  });

  it('collects picture paths written inside question text', () => {
    expect(
      collectPicturePaths({ text: 'Look: <img src="pictures/c.png" alt="">' })
    ).toEqual(['pictures/c.png']);
  });

  it('replaces whole paths and paths inside text without touching the input', () => {
    const input = {
      url: 'pictures/a.png',
      list: ['pictures/b.png', 3, null],
      text: 'see pictures/a.png',
      html: '<img src="pictures/b.png"> and <img src="pictures/zz.png">',
      word: 'mypictures/a.png',
    };
    const out = replacePicturePaths(
      input,
      new Map([
        ['pictures/a.png', 'https://cdn/a'],
        ['pictures/b.png', 'https://cdn/b'],
      ])
    );
    expect(out).toEqual({
      url: 'https://cdn/a',
      list: ['https://cdn/b', 3, null],
      text: 'see https://cdn/a',
      html: '<img src="https://cdn/b"> and <img src="pictures/zz.png">',
      word: 'mypictures/a.png',
    });
    expect(input.url).toBe('pictures/a.png');
  });

  it('knows safe paths and content types', () => {
    expect(isSafePicturePath('pictures/a.png')).toBe(true);
    expect(isSafePicturePath('pictures/../a.png')).toBe(false);
    expect(isSafePicturePath('a.png')).toBe(false);
    expect(packagePictureContentType('pictures/a.JPG')).toBe('image/jpeg');
    expect(packagePictureContentType('pictures/a.svg')).toBeNull();
  });
});
