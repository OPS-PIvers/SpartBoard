/**
 * The reader's front door (docs/plans/QUIZ_DOCUMENT_IMPORT.md D1, D11, D15,
 * D18): what it accepts, what it names the quiz, and what it tells the
 * teacher it couldn't do.
 */
import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';
import {
  DocumentTooLargeError,
  MAX_DOCUMENT_BYTES,
  documentKind,
  readQuizDocument,
  titleFromFileName,
} from '@/utils/quizDocumentImport';
import { readPdf } from '@/utils/quizDocumentImport/pdfReader';
import type {
  PdfDocumentLike,
  PdfTextItem,
} from '@/utils/quizDocumentImport/pdfReader';

const W =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

async function docxOf(paragraphs: string[]): Promise<Blob> {
  const zip = new JSZip();
  const body = paragraphs
    .map((t) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`)
    .join('');
  zip.file(
    'word/document.xml',
    `<?xml version="1.0"?><w:document ${W}><w:body>${body}</w:body></w:document>`
  );
  return zip.generateAsync({ type: 'blob' });
}

const item = (str: string, x: number, y: number): PdfTextItem => ({
  str,
  transform: [1, 0, 0, 1, x, y],
});

const pdfDeps = (pages: PdfTextItem[][]) => ({
  loadPdf: (): Promise<PdfDocumentLike> =>
    Promise.resolve({
      numPages: pages.length,
      getPage: (n: number) =>
        Promise.resolve({
          getTextContent: () => Promise.resolve({ items: pages[n - 1] }),
        }),
    }),
});

describe('documentKind', () => {
  it.each([
    ['application/pdf', 'test.pdf', 'pdf'],
    ['', 'test.pdf', 'pdf'],
    ['', 'Unit 3 Test.DOCX', 'docx'],
    ['', 'notes.txt', null],
    ['', 'sheet.csv', null],
  ])('reads %s / %s as %s', (type, name, expected) => {
    expect(documentKind(new Blob([''], { type }), name)).toBe(expected);
  });
});

describe('titleFromFileName', () => {
  it.each([
    ['Unit 3 Test.docx', 'Unit 3 Test'],
    ['chapter_5_review.pdf', 'chapter 5 review'],
    ['.pdf', 'Imported Quiz'],
  ])('names a quiz after %s', (name, expected) => {
    expect(titleFromFileName(name)).toBe(expected);
  });
});

describe('readQuizDocument', () => {
  it('reads a Word test end to end', async () => {
    const quiz = await readQuizDocument(
      await docxOf([
        '1. Which planet is closest to the sun?',
        'A. Mercury',
        'B. Venus',
        'Answer Key',
        '1. A',
      ]),
      { fileName: 'Unit 3 Test.docx' }
    );

    expect(quiz.title).toBe('Unit 3 Test');
    expect(quiz.questions).toHaveLength(1);
    expect(quiz.questions[0].correctAnswer).toBe('Mercury');
    expect(quiz.warnings).toEqual([]);
  });

  it('reads a PDF test and says pictures were left behind', async () => {
    const quiz = await readQuizDocument(new Blob(['%PDF-']), {
      fileName: 'quiz.pdf',
      pdf: pdfDeps([
        [
          item('1. Which planet is closest to the sun?', 0, 700),
          item('A. Mercury', 0, 680),
          item('B. Venus', 0, 660),
        ],
      ]),
    });

    expect(quiz.questions).toHaveLength(1);
    expect(quiz.images).toEqual([]);
    expect(quiz.warnings.join(' ')).toMatch(/pictures in a pdf aren/i);
  });

  it('warns that an OCR-read page may need checking', async () => {
    const quiz = await readQuizDocument(new Blob(['%PDF-']), {
      fileName: 'scan.pdf',
      pdf: {
        ...pdfDeps([[]]),
        recognizePage: vi.fn().mockResolvedValue('1. Scanned?\nA. Yes\nB. No'),
      },
    });
    expect(quiz.questions).toHaveLength(1);
    expect(quiz.warnings.join(' ')).toMatch(/read by eye/i);
  });

  it('refuses a file type it cannot read', async () => {
    await expect(
      readQuizDocument(new Blob(['hello']), { fileName: 'notes.txt' })
    ).rejects.toThrow(/PDF, a Word file/i);
  });

  it('refuses an oversized file before reading any of it', async () => {
    const huge = new Blob(['x']);
    Object.defineProperty(huge, 'size', { value: MAX_DOCUMENT_BYTES + 1 });
    const loadPdf = vi.fn();
    await expect(
      readQuizDocument(huge, { fileName: 'huge.pdf', pdf: { loadPdf } })
    ).rejects.toThrow(DocumentTooLargeError);
    expect(loadPdf).not.toHaveBeenCalled();
  });

  it('refuses a PDF longer than the page limit', async () => {
    const pages = Array.from({ length: 21 }, (_, i) => [
      item(`${i + 1}. A question long enough to count as text`, 0, 700),
    ]);
    await expect(
      readQuizDocument(new Blob(['%PDF-']), {
        fileName: 'long.pdf',
        pdf: pdfDeps(pages),
      })
    ).rejects.toThrow(/20 pages or fewer/i);
  });

  // The limit is the document's page count, not the number of pages that
  // happened to produce text: a page whose text layer is empty and that OCR
  // cannot recover never reaches `lines`, so counting those would let a long
  // document through.
  it('refuses a long PDF most of whose pages yielded nothing', async () => {
    const pages = [
      ...Array.from({ length: 13 }, (_, i) => [
        item(`${i + 1}. A question long enough to count as text`, 0, 700),
      ]),
      ...Array.from({ length: 12 }, () => [] as PdfTextItem[]),
    ];
    expect(pages).toHaveLength(25);

    await expect(
      readQuizDocument(new Blob(['%PDF-']), {
        fileName: 'mostly-blank.pdf',
        // No recognizer, so the 12 empty pages produce no lines at all.
        pdf: pdfDeps(pages),
      })
    ).rejects.toThrow(/25 pages/i);
  });

  it('refuses an over-long PDF before parsing a single page', async () => {
    const getPage = vi.fn();
    await expect(
      readPdf(
        new Blob(['%PDF-']),
        {
          loadPdf: () => Promise.resolve({ numPages: 40, getPage }),
        },
        { maxPages: 20 }
      )
    ).rejects.toThrow(DocumentTooLargeError);
    expect(getPage).not.toHaveBeenCalled();
  });

  it('drops a Word picture no question points at', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      `<?xml version="1.0"?><w:document ${W} xmlns:r="r" xmlns:a="a"><w:body>` +
        `<w:p><w:drawing><a:blip r:embed="rId5"/></w:drawing></w:p>` +
        `</w:body></w:document>`
    );
    zip.file(
      'word/_rels/document.xml.rels',
      '<?xml version="1.0"?><Relationships><Relationship Id="rId5" Target="media/orphan.png"/></Relationships>'
    );
    zip.file('word/media/orphan.png', 'PNGDATA');

    // The picture sits above any numbered question, so nothing claims it.
    const quiz = await readQuizDocument(
      await zip.generateAsync({ type: 'blob' }),
      { fileName: 'orphan.docx' }
    );
    expect(quiz.questions).toEqual([]);
    expect(quiz.images).toEqual([]);
    expect(quiz.warnings).toEqual([]);
  });

  it('says a Word picture a question uses is not brought in yet', async () => {
    const zip = new JSZip();
    zip.file(
      'word/document.xml',
      `<?xml version="1.0"?><w:document ${W} xmlns:r="r" xmlns:a="a"><w:body>` +
        `<w:p><w:r><w:t>1. Which shape is this?</w:t></w:r></w:p>` +
        `<w:p><w:drawing><a:blip r:embed="rId5"/></w:drawing></w:p>` +
        `<w:p><w:r><w:t>A. Circle</w:t></w:r></w:p>` +
        `<w:p><w:r><w:t>B. Square</w:t></w:r></w:p>` +
        `</w:body></w:document>`
    );
    zip.file(
      'word/_rels/document.xml.rels',
      '<?xml version="1.0"?><Relationships><Relationship Id="rId5" Target="media/shape.png"/></Relationships>'
    );
    zip.file('word/media/shape.png', 'PNGDATA');

    const quiz = await readQuizDocument(
      await zip.generateAsync({ type: 'blob' }),
      { fileName: 'shapes.docx' }
    );

    // The bytes ride along for the slice that uploads them; until then the
    // teacher is told rather than left wondering where the picture went.
    expect(quiz.images).toHaveLength(1);
    expect(quiz.warnings).toEqual([
      "A picture in this file isn't brought in yet — add it to the questions that need it in the editor.",
    ]);
  });
});
