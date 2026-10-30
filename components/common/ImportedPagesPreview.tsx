import React from 'react';

export interface ImportedPage {
  src: string;
  /** The page's own text; its first line shows under the picture. */
  text?: string;
}

/** Every imported page as a numbered picture, so the teacher can check them before saving. */
export const ImportedPagesPreview: React.FC<{ pages: ImportedPage[] }> = ({
  pages,
}) => (
  <ol
    aria-label="Imported pages"
    className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto pb-1 sm:grid-cols-4"
  >
    {pages.map((page, index) => {
      const firstLine = page.text?.split('\n')[0]?.trim();
      return (
        <li key={index} className="min-w-0">
          <div className="aspect-video overflow-hidden rounded-md border border-slate-200 bg-slate-100">
            <img
              src={page.src}
              alt={`Page ${index + 1}`}
              className="h-full w-full object-contain"
            />
          </div>
          <p className="mt-1 truncate text-xxs text-slate-500">
            <span className="font-bold text-slate-700">{index + 1}</span>
            {firstLine ? ` · ${firstLine}` : ''}
          </p>
        </li>
      );
    })}
  </ol>
);
