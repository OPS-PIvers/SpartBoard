import React from 'react';
import { ChevronLeft, ChevronRight, FileText, X } from 'lucide-react';
import { NotebookItem } from '@/types';
import { WidgetLayout } from '../../WidgetLayout';

interface ViewerProps {
  activeNotebook: NotebookItem;
  hasAssets: boolean | undefined;
  showAssets: boolean;
  setShowAssets: (show: boolean) => void;
  handleClose: () => void;
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  handleDragStart: (e: React.DragEvent, url: string) => void;
}

export const Viewer: React.FC<ViewerProps> = ({
  activeNotebook,
  hasAssets,
  showAssets,
  setShowAssets,
  handleClose,
  currentPage,
  setCurrentPage,
  handleDragStart,
}) => {
  return (
    <WidgetLayout
      padding="p-0"
      header={
        <div
          className="flex items-center justify-between shrink-0"
          style={{ padding: 'min(16px, 3.5cqmin)' }}
        >
          <div>
            <h3
              className="font-black text-slate-700 uppercase tracking-widest truncate"
              style={{ fontSize: 'min(12px, 3cqmin)', maxWidth: '60cqmin' }}
            >
              {activeNotebook.title}
            </h3>
            <p
              className="font-bold text-slate-400 uppercase tracking-tighter"
              style={{
                fontSize: 'min(10px, 2.5cqmin)',
                marginTop: 'min(2px, 0.5cqmin)',
              }}
            >
              Page {currentPage + 1} of {activeNotebook.pageUrls.length}
            </p>
          </div>

          <div className="flex" style={{ gap: 'min(8px, 2cqmin)' }}>
            {hasAssets && (
              <button
                onClick={() => setShowAssets(!showAssets)}
                className={`rounded-xl transition-all shadow-sm border ${
                  showAssets
                    ? 'bg-indigo-600 text-white border-indigo-700'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
                style={{ padding: 'min(8px, 2cqmin)' }}
                title="Toggle Assets"
              >
                <FileText
                  style={{
                    width: 'min(16px, 4cqmin)',
                    height: 'min(16px, 4cqmin)',
                  }}
                />
              </button>
            )}
            <button
              onClick={handleClose}
              className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-lg transition-all border border-slate-700 active:scale-95"
              style={{ padding: 'min(8px, 2cqmin)' }}
            >
              <X
                style={{
                  width: 'min(16px, 4cqmin)',
                  height: 'min(16px, 4cqmin)',
                }}
              />
            </button>
          </div>
        </div>
      }
      content={
        <div className="flex-1 w-full h-full flex overflow-hidden bg-slate-100">
          {/* Slide */}
          <div
            className="flex-1 flex items-center justify-center"
            style={{ padding: 'min(16px, 3.5cqmin)' }}
          >
            <img
              src={activeNotebook.pageUrls[currentPage]}
              alt={`Page ${currentPage + 1}`}
              className="max-w-full max-h-full object-contain shadow-2xl bg-white rounded-sm"
            />
          </div>

          {/* Assets Panel */}
          {showAssets && hasAssets && (
            <div
              className="w-1/3 max-w-[240px] min-w-[160px] bg-white border-l border-slate-200 shadow-xl overflow-y-auto custom-scrollbar z-20 flex flex-col"
              style={{
                padding: 'min(12px, 2.5cqmin)',
                gap: 'min(12px, 2.5cqmin)',
              }}
            >
              <div className="text-center">
                <h4
                  className="font-black text-slate-400 uppercase tracking-widest"
                  style={{
                    fontSize: 'min(10px, 2.5cqmin)',
                    marginBottom: 'min(4px, 1cqmin)',
                  }}
                >
                  Assets
                </h4>
                <p
                  className="font-bold text-indigo-500 uppercase tracking-tighter animate-pulse"
                  style={{ fontSize: 'min(9px, 2.2cqmin)' }}
                >
                  Drag to board
                </p>
              </div>
              <div
                className="grid grid-cols-2"
                style={{ gap: 'min(12px, 2.5cqmin)' }}
              >
                {activeNotebook.assetUrls?.map((url, index) => (
                  <div
                    key={url}
                    draggable
                    onDragStart={(e) => handleDragStart(e, url)}
                    className="aspect-square bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center cursor-grab active:cursor-grabbing hover:border-indigo-300 hover:bg-indigo-50/50 transition-all shadow-sm group"
                  >
                    <img
                      src={url}
                      alt={`Asset ${index}`}
                      className="max-w-full max-h-full p-2 object-contain pointer-events-none group-hover:scale-110 transition-transform"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      }
      footer={
        <div
          className="flex items-center justify-center shrink-0"
          style={{
            padding: 'min(16px, 3.5cqmin)',
            gap: 'min(24px, 5cqmin)',
          }}
        >
          <button
            disabled={currentPage === 0}
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-2xl disabled:opacity-30 disabled:grayscale transition-all shadow-sm active:scale-90"
            style={{ padding: 'min(12px, 2.5cqmin)' }}
          >
            <ChevronLeft
              style={{
                width: 'min(24px, 5cqmin)',
                height: 'min(24px, 5cqmin)',
              }}
            />
          </button>
          <div
            className="flex flex-col items-center"
            style={{ minWidth: '80px' }}
          >
            <span
              className="font-black text-slate-700 tracking-widest uppercase"
              style={{ fontSize: 'min(12px, 3cqmin)' }}
            >
              {currentPage + 1} / {activeNotebook.pageUrls.length}
            </span>
            <div
              className="w-full bg-slate-100 rounded-full overflow-hidden"
              style={{
                height: 'min(4px, 1cqmin)',
                marginTop: 'min(6px, 1.5cqmin)',
              }}
            >
              <div
                className="h-full bg-indigo-500 transition-all duration-300"
                style={{
                  width: `${((currentPage + 1) / activeNotebook.pageUrls.length) * 100}%`,
                }}
              />
            </div>
          </div>
          <button
            disabled={currentPage === activeNotebook.pageUrls.length - 1}
            onClick={() =>
              setCurrentPage((p) =>
                Math.min(activeNotebook.pageUrls.length - 1, p + 1)
              )
            }
            className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-2xl disabled:opacity-30 disabled:grayscale transition-all shadow-sm active:scale-90"
            style={{ padding: 'min(12px, 2.5cqmin)' }}
          >
            <ChevronRight
              style={{
                width: 'min(24px, 5cqmin)',
                height: 'min(24px, 5cqmin)',
              }}
            />
          </button>
        </div>
      }
    />
  );
};
