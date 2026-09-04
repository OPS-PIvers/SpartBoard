import { ParsedNotebook, parseNotebookFile } from './notebookParser';
import { convertOlfToBundle, isOlfFile } from './olfConverter';

/** What an import actually produced, for the "here's what happened" toast. */
export interface ImportSummary {
  pageCount: number;
  hiddenPageCount: number;
  /** Element type (or reason) → how many `.olf` objects were dropped. */
  skipped: Record<string, number>;
  warnings: string[];
}

export interface ImportedNotebook {
  parsed: ParsedNotebook;
  summary: ImportSummary;
}

/** Extensions the board drop target and the library Import button accept. */
export const NOTEBOOK_IMPORT_EXTENSIONS = ['.olf', '.notebook', '.spartnb'];

export const isNotebookImportFile = (name: string): boolean =>
  /\.(olf|notebook|spartnb)$/i.test(name.trim());

/**
 * Single entry point for every notebook import. `.olf` files are converted to a
 * `.spartnb` bundle first (the parser only understands bundles and raw SMART
 * notebooks); everything else goes straight to the parser unchanged.
 */
export const importNotebookFile = async (
  file: File
): Promise<ImportedNotebook> => {
  if (isOlfFile(file.name)) {
    const converted = await convertOlfToBundle(file);
    const bundle = new File([converted.blob], `${converted.title}.spartnb`, {
      type: 'application/zip',
    });
    const parsed = await parseNotebookFile(bundle);
    return {
      parsed,
      summary: {
        pageCount: parsed.pages.length,
        hiddenPageCount: converted.hiddenPageCount,
        skipped: converted.skipped,
        warnings: converted.warnings,
      },
    };
  }

  const parsed = await parseNotebookFile(file);
  return {
    parsed,
    summary: {
      pageCount: parsed.pages.length,
      hiddenPageCount: parsed.hiddenPages?.length ?? 0,
      skipped: {},
      warnings: [],
    },
  };
};

const plural = (count: number, word: string): string =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

/** One-line, human-readable result. Zero-valued clauses are omitted. */
export const formatImportSummary = (summary: ImportSummary): string => {
  const hidden =
    summary.hiddenPageCount > 0 ? ` (${summary.hiddenPageCount} hidden)` : '';
  const sentences = [`Imported ${plural(summary.pageCount, 'page')}${hidden}.`];

  const skippedTotal = Object.values(summary.skipped).reduce(
    (total, n) => total + n,
    0
  );
  if (skippedTotal > 0) {
    sentences.push(`Skipped ${plural(skippedTotal, 'unsupported object')}.`);
  }
  sentences.push(...summary.warnings);
  return sentences.join(' ');
};
