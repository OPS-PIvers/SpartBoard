/**
 * The AI reader's client half. The mapping matters because the review table
 * and the create step work off `ExtractedQuiz` alone — anything the map drops
 * is a question, an option or a picture the teacher never sees.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  aiQuizToExtracted,
  blobToBase64,
  graftDocxImages,
  readQuizDocumentWithAi,
  type AiExtractedQuiz,
} from '@/utils/quizDocumentImport/aiReader';
import type {
  ExtractedImage,
  ExtractedQuestion,
} from '@/utils/quizDocumentImport/types';

vi.mock('@/utils/quizDocumentImport/docxReader', () => ({
  readDocx: vi.fn(),
}));
import { readDocx } from '@/utils/quizDocumentImport/docxReader';

function aiQuiz(over: Partial<AiExtractedQuiz> = {}): AiExtractedQuiz {
  return {
    title: 'Chapter 3 Test',
    questions: [
      {
        number: 1,
        text: 'What is the capital of France?',
        type: 'MC',
        options: [
          { letter: 'a', text: 'Paris' },
          { letter: 'b', text: 'Rome' },
        ],
        correctAnswer: 'Paris',
        warnings: [],
      },
    ],
    warnings: [],
    ...over,
  };
}

const docxFile = () =>
  new Blob(['PK'], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

describe('aiQuizToExtracted', () => {
  it('maps a question onto the shared shape', () => {
    const quiz = aiQuizToExtracted(aiQuiz(), 'Fallback');
    expect(quiz.title).toBe('Chapter 3 Test');
    expect(quiz.questions).toEqual([
      {
        number: 1,
        ref: { section: 1, item: 1 },
        text: 'What is the capital of France?',
        type: 'MC',
        options: [
          { letter: 'A', text: 'Paris' },
          { letter: 'B', text: 'Rome' },
        ],
        correctAnswer: 'Paris',
        imageIds: [],
        warnings: [],
      },
    ]);
  });

  it('falls back to the document name when the model gave no title', () => {
    expect(aiQuizToExtracted(aiQuiz({ title: '  ' }), 'Fallback').title).toBe(
      'Fallback'
    );
  });

  it('keeps an empty answer rather than inventing one (D5)', () => {
    const quiz = aiQuizToExtracted(
      aiQuiz({
        questions: [
          {
            number: 4,
            text: 'Name the three branches.',
            type: 'free-response',
            options: [],
            correctAnswer: '',
            warnings: ['The document gave no answer for this question.'],
          },
        ],
      }),
      'Fallback'
    );
    expect(quiz.questions[0].correctAnswer).toBe('');
    expect(quiz.questions[0].warnings).toEqual([
      'The document gave no answer for this question.',
    ]);
  });

  it('turns a type it does not know into a written response', () => {
    const quiz = aiQuizToExtracted(
      aiQuiz({
        questions: [
          {
            number: 1,
            text: 'Pick all that apply.',
            // Nothing stops a future model answering with a type this build
            // has never heard of; a written response is always editable.
            type: 'MultiSelect' as never,
            options: [{ letter: 'A', text: 'One' }],
            correctAnswer: 'One',
            warnings: [],
          },
        ],
      }),
      'Fallback'
    );
    expect(quiz.questions[0].type).toBe('free-response');
    expect(quiz.questions[0].options).toEqual([]);
  });

  it('keeps a choose-all question and its options only while choose-all is on', () => {
    const ma = aiQuiz({
      questions: [
        {
          number: 1,
          text: 'Which are mammals?',
          type: 'MA',
          options: [
            { letter: 'A', text: 'Whale' },
            { letter: 'B', text: 'Shark' },
            { letter: 'C', text: 'Bat' },
          ],
          correctAnswer: 'Whale|Bat',
          warnings: [],
        },
      ],
    });
    const on = aiQuizToExtracted(ma, 'Fallback', { multiAnswer: true });
    expect(on.questions[0].type).toBe('MA');
    expect(on.questions[0].options).toHaveLength(3);
    expect(on.questions[0].correctAnswer).toBe('Whale|Bat');
    expect(aiQuizToExtracted(ma, 'Fallback').questions[0].type).toBe(
      'free-response'
    );
  });

  it('numbers a question the model left unnumbered', () => {
    const quiz = aiQuizToExtracted(
      aiQuiz({
        questions: [
          {
            number: undefined as never,
            text: 'First',
            type: 'free-response',
            options: [],
            correctAnswer: '',
            warnings: [],
          },
        ],
      }),
      'Fallback'
    );
    expect(quiz.questions[0].number).toBe(1);
  });

  it('survives a response with no questions array at all', () => {
    const quiz = aiQuizToExtracted(
      { title: 'T', warnings: [] } as unknown as AiExtractedQuiz,
      'Fallback'
    );
    expect(quiz.questions).toEqual([]);
  });
});

describe('graftDocxImages', () => {
  const images: ExtractedImage[] = [
    { id: 'img-1', blob: new Blob(['a']), contentType: 'image/png', name: 'a' },
    { id: 'img-2', blob: new Blob(['b']), contentType: 'image/png', name: 'b' },
  ];
  const anchored: ExtractedQuestion[] = [
    {
      number: 1,
      text: '',
      type: 'MC',
      options: [],
      correctAnswer: '',
      imageIds: ['img-1'],
      warnings: [],
    },
  ];

  it('matches a picture to the AI question with the same number', () => {
    const quiz = graftDocxImages(
      aiQuizToExtracted(aiQuiz(), 'T'),
      anchored,
      images
    );
    expect(quiz.questions[0].imageIds).toEqual(['img-1']);
  });

  it('drops a picture no question points at', () => {
    const quiz = graftDocxImages(
      aiQuizToExtracted(aiQuiz(), 'T'),
      anchored,
      images
    );
    // img-2 would upload to Drive and never be shown.
    expect(quiz.images.map((i) => i.id)).toEqual(['img-1']);
  });

  it('leaves a question alone when the browser reader found no picture for it', () => {
    const quiz = graftDocxImages(
      aiQuizToExtracted(aiQuiz({ questions: [] }), 'T'),
      anchored,
      images
    );
    expect(quiz.images).toEqual([]);
  });
});

describe('blobToBase64', () => {
  it('encodes without the data-URL prefix', async () => {
    const encoded = await blobToBase64(new Blob(['hello']));
    expect(encoded).toBe('aGVsbG8=');
  });
});

describe('readQuizDocumentWithAi', () => {
  it('sends the PDF type and returns the mapped quiz', async () => {
    const extract = vi.fn(() => Promise.resolve(aiQuiz()));
    const quiz = await readQuizDocumentWithAi(
      new Blob(['%PDF'], { type: 'application/pdf' }),
      { fileName: 'Chapter 3 Test.pdf', extract }
    );

    expect(extract).toHaveBeenCalledWith({
      fileName: 'Chapter 3 Test.pdf',
      mimeType: 'application/pdf',
      data: expect.any(String),
    });
    expect(quiz.questions).toHaveLength(1);
  });

  it('says nothing about pictures when the reader found none', async () => {
    const quiz = await readQuizDocumentWithAi(
      new Blob(['%PDF'], { type: 'application/pdf' }),
      { fileName: 'test.pdf', extract: () => Promise.resolve(aiQuiz()) }
    );
    expect(quiz.warnings).toEqual([]);
    expect(quiz.images).toEqual([]);
  });

  it('brings a Word file’s pictures through (no regression on the browser reader)', async () => {
    vi.mocked(readDocx).mockResolvedValue({
      lines: [
        { text: '1. What is the capital of France?', imageIds: ['img-1'] },
      ],
      images: [
        {
          id: 'img-1',
          blob: new Blob(['a']),
          contentType: 'image/png',
          name: 'a',
        },
      ],
    });

    const quiz = await readQuizDocumentWithAi(docxFile(), {
      fileName: 'test.docx',
      extract: () => Promise.resolve(aiQuiz()),
    });

    expect(quiz.questions[0].imageIds).toEqual(['img-1']);
    expect(quiz.images.map((i) => i.id)).toEqual(['img-1']);
  });

  it('keeps the questions when the pictures cannot be read', async () => {
    vi.mocked(readDocx).mockRejectedValue(new Error('Corrupt archive.'));

    const quiz = await readQuizDocumentWithAi(docxFile(), {
      fileName: 'test.docx',
      extract: () => Promise.resolve(aiQuiz()),
    });

    expect(quiz.questions).toHaveLength(1);
    expect(quiz.warnings.join(' ')).toContain('couldn’t be brought in');
  });

  it('refuses a file that is neither a PDF nor a Word file', async () => {
    await expect(
      readQuizDocumentWithAi(new Blob(['x'], { type: 'text/plain' }), {
        fileName: 'notes.txt',
        extract: () => Promise.resolve(aiQuiz()),
      })
    ).rejects.toThrow(/PDF, a Word file/);
  });
});

describe('PDF figures (D13)', () => {
  const figure = { page: 1, x: 0.1, y: 0.2, width: 0.4, height: 0.3 };
  const withFigure = (figures = [figure]) =>
    aiQuiz({
      questions: [{ ...aiQuiz().questions[0], figures }],
    });
  const pdf = () => new Blob(['%PDF'], { type: 'application/pdf' });
  const cropper = () =>
    Promise.resolve({
      pageCount: 2,
      pageSize: () => Promise.resolve({ width: 800, height: 1000 }),
      crop: () => Promise.resolve(new Blob(['png'], { type: 'image/png' })),
    });

  it('crops the figure and links it to its question', async () => {
    const quiz = await readQuizDocumentWithAi(pdf(), {
      fileName: 'test.pdf',
      extract: () => Promise.resolve(withFigure()),
      cropper,
    });

    expect(quiz.images).toHaveLength(1);
    expect(quiz.questions[0].imageIds).toEqual([quiz.images[0].id]);
    expect(quiz.warnings).toEqual([]);
  });

  it('links one picture to both questions that named it (D14)', async () => {
    const ai = aiQuiz({
      questions: [
        { ...aiQuiz().questions[0], number: 1, figures: [figure] },
        { ...aiQuiz().questions[0], number: 2, figures: [{ ...figure }] },
      ],
    });

    const quiz = await readQuizDocumentWithAi(pdf(), {
      fileName: 'test.pdf',
      extract: () => Promise.resolve(ai),
      cropper,
    });

    // One upload, two questions pointing at it.
    expect(quiz.images).toHaveLength(1);
    expect(quiz.questions[0].imageIds).toEqual(quiz.questions[1].imageIds);
  });

  it('says the pictures are not brought in when there is no cropper', async () => {
    const quiz = await readQuizDocumentWithAi(pdf(), {
      fileName: 'test.pdf',
      extract: () => Promise.resolve(withFigure()),
    });
    expect(quiz.warnings.join(' ')).toContain('Pictures in a PDF');
    expect(quiz.images).toEqual([]);
  });

  it('keeps the questions when the PDF cannot be opened for cropping', async () => {
    const quiz = await readQuizDocumentWithAi(pdf(), {
      fileName: 'test.pdf',
      extract: () => Promise.resolve(withFigure()),
      cropper: () => Promise.reject(new Error('corrupt')),
    });

    // The questions were already read; losing them over a picture would be
    // the worse trade.
    expect(quiz.questions).toHaveLength(1);
    expect(quiz.warnings.join(' ')).toContain('couldn’t be brought in');
  });
});

describe('the key at the back of the document', () => {
  const pdf = () => new Blob(['%PDF'], { type: 'application/pdf' });
  const unanswered = () =>
    aiQuiz({
      questions: [{ ...aiQuiz().questions[0], correctAnswer: '' }],
    });

  it('fills an answer the model left blank from a test-bank section', async () => {
    const quiz = await readQuizDocumentWithAi(pdf(), {
      fileName: 'test.pdf',
      extract: () => Promise.resolve(unanswered()),
      readPdfLines: () =>
        Promise.resolve([
          { text: 'Answer Section' },
          { text: 'MULTIPLE CHOICE' },
          { text: '1. ANS: B PTS: 1' },
        ]),
    });
    expect(quiz.questions[0].correctAnswer).toBe('Rome');
  });

  it('keeps the model’s answers when the text layer cannot be read', async () => {
    const quiz = await readQuizDocumentWithAi(pdf(), {
      fileName: 'test.pdf',
      extract: () => Promise.resolve(aiQuiz()),
      readPdfLines: () => Promise.reject(new Error('no text layer')),
    });
    expect(quiz.questions[0].correctAnswer).toBe('Paris');
    expect(quiz.warnings).toEqual([]);
  });

  it('reads a Word file’s key from the lines it already opened', async () => {
    vi.mocked(readDocx).mockResolvedValueOnce({
      lines: [
        { text: '1. What is the capital of France?' },
        { text: 'a. Paris' },
        { text: 'b. Rome' },
        { text: 'Answer Key' },
        { text: '1. A' },
      ],
      images: [],
    });
    const quiz = await readQuizDocumentWithAi(docxFile(), {
      fileName: 'test.docx',
      extract: () => Promise.resolve(unanswered()),
    });
    expect(quiz.questions[0].correctAnswer).toBe('Paris');
  });
});
