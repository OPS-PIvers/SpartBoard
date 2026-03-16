import React, { RefObject } from 'react';
import { Upload, Book, Trash2, FileText, Loader2 } from 'lucide-react';
import { NotebookItem } from '@/types';
import { getButtonAccessibilityProps } from '@/utils/accessibility';
import { WidgetLayout } from '../../WidgetLayout';

interface LibraryProps {
  notebooks: NotebookItem[];
  isImporting: boolean;
  handleImport: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleSelect: (id: string) => void;
  handleDelete: (e: React.MouseEvent, id: string) => Promise<void>;
  fileInputRef: RefObject<HTMLInputElement | null>;
}

export const Library: React.FC<LibraryProps> = ({
  notebooks,
  isImporting,
  handleImport,
  handleSelect,
  handleDelete,
  fileInputRef,
}) => {
  return (
    <WidgetLayout
      padding="p-0"
      header={
        <div
          className="flex items-center justify-between shrink-0"
          style={{ padding: 'min(20px, 4cqmin)' }}
        >
          <h2
            className="font-black text-slate-700 uppercase tracking-widest flex items-center"
            style={{
              fontSize: 'min(14px, 3.5cqmin)',
              gap: 'min(8px, 2cqmin)',
            }}
          >
            <Book
              className="text-indigo-500"
              style={{
                width: 'min(20px, 5cqmin)',
                height: 'min(20px, 5cqmin)',
              }}
            />{' '}
            Notebooks
          </h2>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black uppercase tracking-widest flex items-center shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 active:scale-95"
            style={{
              padding: 'min(8px, 2cqmin) min(16px, 3.5cqmin)',
              fontSize: 'min(12px, 3cqmin)',
              gap: 'min(8px, 2cqmin)',
            }}
          >
            {isImporting ? (
              <Loader2
                className="animate-spin"
                style={{
                  width: 'min(16px, 4cqmin)',
                  height: 'min(16px, 4cqmin)',
                }}
              />
            ) : (
              <Upload
                style={{
                  width: 'min(16px, 4cqmin)',
                  height: 'min(16px, 4cqmin)',
                }}
              />
            )}
            Import
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImport}
            accept=".notebook"
            className="hidden"
          />
        </div>
      }
      content={
        <div
          className="flex-1 w-full h-full overflow-y-auto custom-scrollbar bg-slate-50/30"
          style={{ padding: 'min(20px, 4cqmin)' }}
        >
          {notebooks.length === 0 ? (
            <div
              className="h-full flex flex-col items-center justify-center text-slate-400"
              style={{
                gap: 'min(16px, 3.5cqmin)',
                paddingTop: 'min(48px, 10cqmin)',
                paddingBottom: 'min(48px, 10cqmin)',
              }}
            >
              <div
                className="bg-white rounded-3xl border border-slate-200 shadow-sm"
                style={{ padding: 'min(24px, 5cqmin)' }}
              >
                <FileText
                  className="opacity-30"
                  style={{
                    width: 'min(40px, 10cqmin)',
                    height: 'min(40px, 10cqmin)',
                  }}
                />
              </div>
              <div className="text-center">
                <p
                  className="font-black uppercase tracking-widest"
                  style={{
                    fontSize: 'min(14px, 3.5cqmin)',
                    marginBottom: 'min(4px, 1cqmin)',
                  }}
                >
                  Library is empty
                </p>
                <p
                  className="font-bold uppercase tracking-tighter opacity-60"
                  style={{ fontSize: 'min(12px, 3cqmin)' }}
                >
                  Import a .notebook file to begin.
                </p>
              </div>
            </div>
          ) : (
            <div
              className="grid grid-cols-2"
              style={{ gap: 'min(16px, 3.5cqmin)' }}
            >
              {notebooks.map((notebook) => {
                const firstPageUrl = notebook.pageUrls?.[0];

                return (
                  <div
                    key={notebook.id}
                    {...getButtonAccessibilityProps(() =>
                      handleSelect(notebook.id)
                    )}
                    className="group relative aspect-[4/3] bg-white rounded-2xl overflow-hidden cursor-pointer hover:ring-2 hover:ring-indigo-500 transition-all border border-slate-200 shadow-sm"
                  >
                    {firstPageUrl ? (
                      <img
                        src={firstPageUrl}
                        className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                        alt={notebook.title}
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center bg-slate-50 text-slate-300 font-black uppercase tracking-widest"
                        style={{ fontSize: 'min(12px, 3cqmin)' }}
                      >
                        No Preview
                      </div>
                    )}
                    <div
                      className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/90 to-transparent"
                      style={{
                        padding:
                          'min(40px, 8cqmin) min(16px, 4cqmin) min(16px, 4cqmin)',
                      }}
                    >
                      <p
                        className="text-white font-black uppercase tracking-tight truncate"
                        style={{ fontSize: 'min(12px, 3cqmin)' }}
                      >
                        {notebook.title}
                      </p>
                      <p
                        className="text-white/60 font-bold uppercase tracking-widest"
                        style={{
                          fontSize: 'min(10px, 2.5cqmin)',
                          marginTop: 'min(2px, 0.5cqmin)',
                        }}
                      >
                        {notebook.pageUrls.length} pages
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleDelete(e, notebook.id)}
                      className="absolute bg-white/90 text-red-500 rounded-xl opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white shadow-xl scale-75 group-hover:scale-100"
                      style={{
                        top: 'min(8px, 2cqmin)',
                        right: 'min(8px, 2cqmin)',
                        padding: 'min(8px, 2cqmin)',
                      }}
                    >
                      <Trash2
                        style={{
                          width: 'min(16px, 4cqmin)',
                          height: 'min(16px, 4cqmin)',
                        }}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      }
    />
  );
};
