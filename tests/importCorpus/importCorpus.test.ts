/**
 * The private regression corpus (docs/plans/QUIZ_IMPORT_RELIABILITY.md R27).
 * Real teacher files live only in the gitignored folder below; the committed
 * expectations hold file hashes and counts, never content. Run it with
 * `pnpm run test:import-corpus`; record new files with UPDATE_IMPORT_CORPUS=1.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  documentKind,
  readAnswerKeyFile,
  readQuizDocument,
} from '@/utils/quizDocumentImport';
import { nodePdfDeps } from './nodePdfDeps';

const ROOT = resolve(__dirname, '..', 'fixtures');
const CORPUS = join(ROOT, 'private-quiz-import');
const EXPECTED = join(ROOT, 'quiz-import-corpus.expected.json');
const UPDATE = process.env.UPDATE_IMPORT_CORPUS === '1';

/** A file whose name says it is a key is read as a key file. */
const KEY_NAME = /key|answer|scoring|guide/i;

interface TestCounts {
  kind: 'test';
  questions: number;
  optionsPerQuestion: number[];
  keyed: number;
  sections: number;
  flagged: number;
}

interface KeyCounts {
  kind: 'key';
  keyEntries: number;
}

type Counts = TestCounts | KeyCounts;

type Expected = Record<string, Counts>;

const loadExpected = (): Expected =>
  existsSync(EXPECTED)
    ? (JSON.parse(readFileSync(EXPECTED, 'utf8')) as { files: Expected }).files
    : {};

async function countsFor(name: string, bytes: Buffer): Promise<Counts> {
  const file = new File([new Uint8Array(bytes)], name);
  const pdf =
    documentKind(file, name) === 'pdf'
      ? await nodePdfDeps(new Uint8Array(bytes))
      : undefined;
  if (KEY_NAME.test(name)) {
    const key = await readAnswerKeyFile(file, {
      fileName: name,
      ...(pdf ? { pdf } : {}),
    });
    return { kind: 'key', keyEntries: key.size };
  }
  const quiz = await readQuizDocument(file, {
    fileName: name,
    ...(pdf ? { pdf } : {}),
  });
  const sections = new Set(
    quiz.questions.map(
      (q) => (q as { ref?: { section?: number } }).ref?.section ?? 'none'
    )
  );
  return {
    kind: 'test',
    questions: quiz.questions.length,
    optionsPerQuestion: quiz.questions.map((q) => q.options.length),
    keyed: quiz.questions.filter((q) => q.correctAnswer.trim()).length,
    sections: sections.size,
    flagged: quiz.questions.filter((q) => q.warnings.length > 0).length,
  };
}

describe('private quiz import corpus', () => {
  it('matches the recorded counts for every file present', async () => {
    const expected = loadExpected();
    const files = existsSync(CORPUS)
      ? readdirSync(CORPUS).filter((f) => !f.startsWith('.'))
      : [];
    const seen = new Set<string>();
    const recorded: Expected = { ...expected };
    const notes: string[] = [];

    for (const name of files) {
      const bytes = readFileSync(join(CORPUS, name));
      const hash = createHash('sha256').update(bytes).digest('hex');
      seen.add(hash);
      const actual = await countsFor(name, bytes);
      if (UPDATE) {
        recorded[hash] = actual;
        continue;
      }
      if (!expected[hash]) {
        notes.push(
          `${name}: not recorded yet (run with UPDATE_IMPORT_CORPUS=1)`
        );
        continue;
      }
      expect(actual, name).toEqual(expected[hash]);
    }

    const missing = Object.keys(expected).filter((h) => !seen.has(h));
    if (missing.length > 0) {
      notes.push(
        `${missing.length} recorded file(s) not present here, skipped.`
      );
    }
    if (UPDATE) {
      writeFileSync(
        EXPECTED,
        `${JSON.stringify({ files: recorded }, null, 2)}\n`
      );
    }
    if (notes.length > 0) console.warn(`[import-corpus]\n${notes.join('\n')}`);
  }, 120_000);
});
