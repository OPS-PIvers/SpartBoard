import React from 'react';
import type {
  ImportAdapter,
  ImportValidationResult,
} from '@/components/common/library/types';
import { ImportedPagesPreview } from '@/components/common/ImportedPagesPreview';
import type { ParsedNotebook } from '@/utils/notebookParser';
import {
  PAGE_SOURCE_ACCEPT,
  pageSourceKind,
  type PageImage,
  type PageImagesResult,
} from '@/utils/import/pageImages';

export interface NotebookSlidesImport {
  title: string;
  pages: PageImage[];
  /** Object URLs of `pages`, for the preview. */
  previewUrls: string[];
}

export interface NotebookSlidesImportDeps {
  readPages: (file: File) => Promise<PageImagesResult>;
  save: (parsed: ParsedNotebook) => Promise<void>;
  /** Makes a preview URL for a page; the widget records them so it can revoke them. */
  previewUrl?: (blob: Blob) => string;
}

const escapeXml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const blobToDataUri = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error ?? new Error('Could not read a page picture.'));
    reader.readAsDataURL(blob);
  });

/** A self-contained, editable SVG page: the picture as background, its text in `<desc>` for later search and read-aloud. */
export async function pageToNotebookSvg(page: PageImage): Promise<string> {
  const { width, height } = page;
  const href = await blobToDataUri(page.blob);
  const desc = page.text ? `<desc>${escapeXml(page.text)}</desc>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `${desc}<g class="background"><image x="0" y="0" width="${width}" height="${height}" ` +
    `href="${href}" xlink:href="${href}"/></g><g class="foreground"></g></svg>`
  );
}

export async function toParsedNotebook(
  data: NotebookSlidesImport,
  title: string
): Promise<ParsedNotebook> {
  const pages = await Promise.all(
    data.pages.map(async (page) => ({
      blob: new Blob([await pageToNotebookSvg(page)], {
        type: 'image/svg+xml',
      }),
      extension: 'svg',
    }))
  );
  return { title, pages, assets: [] };
}

const fileTitle = (name: string) =>
  name.replace(/\.[^./\\]+$/, '').trim() || 'Slides';

/** Reads a PDF or PowerPoint into Notebook pages for the shared ImportWizard. */
export async function readNotebookSlides(
  file: File,
  readPages: NotebookSlidesImportDeps['readPages'],
  previewUrl: (blob: Blob) => string = (blob) => URL.createObjectURL(blob)
) {
  const { pages, warnings } = await readPages(file);
  const data: NotebookSlidesImport = {
    title: fileTitle(file.name),
    pages,
    previewUrls: pages.map((p) => previewUrl(p.blob)),
  };
  return { data, warnings };
}

export function validateNotebookSlides(
  data: NotebookSlidesImport
): ImportValidationResult {
  return data.pages.length > 0
    ? { ok: true, errors: [] }
    : { ok: false, errors: ['This file has no pages.'] };
}

export function createNotebookSlidesImportAdapter(
  deps: NotebookSlidesImportDeps
): ImportAdapter<NotebookSlidesImport> {
  return {
    widgetLabel: 'Notebook',
    supportedSources: [],
    extraUpload: { accept: PAGE_SOURCE_ACCEPT, hint: 'PDF or PowerPoint' },
    parse: (source) => {
      if (source.kind !== 'file' || !pageSourceKind(source.file)) {
        return Promise.reject(
          new Error('Choose a PDF or PowerPoint (.pptx) file.')
        );
      }
      return readNotebookSlides(source.file, deps.readPages, deps.previewUrl);
    },
    validate: validateNotebookSlides,
    renderPreview: (data) => (
      <ImportedPagesPreview
        pages={data.pages.map((page, i) => ({
          src: data.previewUrls[i],
          text: page.text,
        }))}
      />
    ),
    suggestTitle: (data) => data.title,
    save: async (data, title) => deps.save(await toParsedNotebook(data, title)),
  };
}
