import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidElement } from 'react';
import { importedFrq } from '@/tests/utils/quizDocumentImport/versionFixtures';
import {
  VERSIONS_NEED_AI,
  type VersionImportBuild,
} from '@/utils/quizDocumentImport/versionPlan';
import { QuizVersionReview } from '../components/QuizVersionReview';
import {
  createQuizImportAdapter,
  type QuizImportAdapterDeps,
} from './quizImportAdapter';

vi.mock('@/utils/ai', () => ({ generateQuiz: vi.fn() }));
vi.mock('@/utils/quizDriveService', () => ({
  QuizDriveService: { getQuizTemplateTSV: vi.fn(() => '') },
}));
const readTestAndKey = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/utils/quizDocumentImport/readTestAndKey', () => ({
  readTestAndKey: (...args: unknown[]): unknown => readTestAndKey(...args),
}));

const deps = (
  over: Partial<QuizImportAdapterDeps> = {}
): QuizImportAdapterDeps => ({
  saveQuiz: vi.fn(),
  importFromSheet: vi.fn(),
  importFromCSV: vi.fn(),
  createQuizTemplate: vi.fn(),
  ensureDriveScope: vi.fn(),
  pickSheet: vi.fn(),
  canImportDocuments: true,
  aiExtract: vi.fn(),
  ...over,
});

const doc = {
  kind: 'document' as const,
  file: new Blob([new Uint8Array([1])]),
  fileName: 'Bohl Unit 3 FRQ (2025).pdf',
};

describe('createQuizImportAdapter with versions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks for versions only while the flag is on', async () => {
    readTestAndKey.mockResolvedValue({
      title: 'T',
      questions: [],
      images: [],
      warnings: [],
    });
    const aiExtractVersions = vi.fn();
    await createQuizImportAdapter(deps({ aiExtractVersions })).parse(doc);
    expect(readTestAndKey.mock.calls[0][1]).not.toHaveProperty(
      'aiExtractVersions'
    );
    await createQuizImportAdapter(
      deps({ aiExtractVersions, importVersions: true })
    ).parse(doc);
    expect(readTestAndKey.mock.calls[1][1]).toMatchObject({
      aiExtractVersions,
    });
  });

  it('reviews a test with versions and saves its folder, bank and quizzes', async () => {
    const testSet = await importedFrq();
    readTestAndKey.mockResolvedValue({
      title: testSet.title,
      questions: [],
      images: testSet.images,
      warnings: [],
      testSet,
    });
    const saveVersionImport = vi.fn();
    const onDocumentImages = vi.fn();
    const adapter = createQuizImportAdapter(
      deps({
        importVersions: true,
        aiExtractVersions: vi.fn(),
        saveVersionImport,
        onDocumentImages,
      })
    );
    const parsed = await adapter.parse(doc);
    expect(onDocumentImages).toHaveBeenCalledWith(testSet.images);
    expect(parsed.warnings).toContain('Rubric 2: Possible typo: "Chrsitian".');
    expect(adapter.suggestTitle?.(parsed.data)).toBe('Bohl Unit 3 FRQ (2025)');

    const review = adapter.renderReview?.(parsed.data, vi.fn());
    expect(isValidElement(review) && review.type).toBe(QuizVersionReview);
    expect(adapter.validate(parsed.data)).toEqual({ ok: true, errors: [] });

    await adapter.save(parsed.data, 'Unit 3 FRQ folder');
    const build = saveVersionImport.mock.calls[0][0] as VersionImportBuild;
    expect(build.folderTitle).toBe('Unit 3 FRQ folder');
    expect(build.bank?.questions).toHaveLength(6);
    expect(build.quizzes.map((p) => p.quiz.title)).toEqual([
      'Unit 3 FRQ',
      'Unit 3 FRQ Retake',
      'Unit 3 FRQ Split',
    ]);
  });

  it('says versions need the AI reader when a plain read shows version marks (V13)', async () => {
    readTestAndKey.mockResolvedValue({
      title: 'Unit 3 FRQ',
      readBy: 'plain',
      questions: [
        {
          number: 1,
          text: 'Version A Use the maps.',
          type: 'free-response',
          options: [],
          correctAnswer: '',
          imageIds: [],
          warnings: [],
        },
        {
          number: 2,
          text: 'Version B Use the maps.',
          type: 'free-response',
          options: [],
          correctAnswer: '',
          imageIds: [],
          warnings: [],
        },
      ],
      images: [],
      warnings: [],
    });
    const on = await createQuizImportAdapter(
      deps({ importVersions: true })
    ).parse(doc);
    expect(on.warnings[0]).toBe(VERSIONS_NEED_AI);
    const off = await createQuizImportAdapter(deps()).parse(doc);
    expect(off.warnings).not.toContain(VERSIONS_NEED_AI);
  });

  it('splits versions in the plain read only with the plain flag, and offers AI after it', async () => {
    const testSet = await importedFrq();
    readTestAndKey.mockResolvedValue({
      title: testSet.title,
      readBy: 'plain',
      questions: [],
      images: testSet.images,
      warnings: [],
      testSet,
    });
    await createQuizImportAdapter(deps({ importVersions: true })).parse(doc);
    expect(readTestAndKey.mock.calls[0][1]).not.toHaveProperty('plainVersions');
    // The flag means nothing without the versions flag it rides on.
    await createQuizImportAdapter(deps({ plainVersions: true })).parse(doc);
    expect(readTestAndKey.mock.calls[1][1]).not.toHaveProperty('plainVersions');

    const plain = await createQuizImportAdapter(
      deps({
        importVersions: true,
        plainVersions: true,
        aiExtractVersions: vi.fn(),
      })
    ).parse({ ...doc, useAi: false });
    expect(readTestAndKey.mock.calls[2][1]).toMatchObject({
      plainVersions: true,
    });
    expect(plain.note).toBe('Converted without AI.');
    expect(plain.aiRetry).toBe(true);

    const noAi = await createQuizImportAdapter(
      deps({ importVersions: true, plainVersions: true, aiExtract: undefined })
    ).parse(doc);
    expect(noAi.aiRetry).toBeUndefined();
  });
});
