import { describe, expect, it } from 'vitest';
import {
  PDF_RENDER_DPI,
  isPdf,
  pdfPageFileName,
  pdfPageLabel,
} from './paperSheetPdfPage';

describe('pdfPageLabel', () => {
  it('drops the extension, and the page number for a one-page file', () => {
    expect(pdfPageLabel('Unit 3 review.pdf', 1, 1)).toBe('Unit 3 review');
    expect(pdfPageLabel('Unit 3 review.PDF', 1, 1)).toBe('Unit 3 review');
  });

  it('says which page it came from when there was a choice', () => {
    expect(pdfPageLabel('Unit 3 review.pdf', 2, 5)).toBe(
      'Unit 3 review — page 2'
    );
  });
});

describe('pdfPageFileName', () => {
  it('uploads the page as a PNG, not as the PDF it came from', () => {
    expect(pdfPageFileName('Unit 3 review.pdf', 2)).toBe(
      'Unit_3_review-p2.png'
    );
  });

  it('keeps a name Drive will accept', () => {
    expect(pdfPageFileName('Séance #1/2 (final).pdf', 1)).toBe(
      'S_ance_1_2_final_-p1.png'
    );
  });
});

describe('isPdf', () => {
  it('goes by the type, and by the name when the browser gave none', () => {
    expect(isPdf(new File([''], 'a.pdf', { type: 'application/pdf' }))).toBe(
      true
    );
    expect(isPdf(new File([''], 'a.PDF', { type: '' }))).toBe(true);
    expect(isPdf(new File([''], 'a.png', { type: 'image/png' }))).toBe(false);
  });
});

describe('PDF_RENDER_DPI', () => {
  it('renders at the density the scan side already assumes', () => {
    expect(PDF_RENDER_DPI).toBe(200);
  });
});
