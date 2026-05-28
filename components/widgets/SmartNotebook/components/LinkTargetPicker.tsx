import React, { useEffect, useMemo, useRef } from 'react';
import { ArrowRight, Link2, Unlink2, X } from 'lucide-react';
import { NotebookSection } from '@/types';
import { useClickOutside } from '@/hooks/useClickOutside';

interface LinkTargetPickerProps {
  /** Pages available as link targets, in order. */
  pageUrls: string[];
  sections?: NotebookSection[];
  /** Source page (highlighted as "this page" so teachers don't link to it). */
  sourcePage: number;
  /** Existing target page if updating an existing link, otherwise null. */
  currentTarget: number | null;
  onSelect: (page: number) => void;
  /** Optional — only shown when currentTarget is non-null. */
  onRemove?: () => void;
  /** Optional — only shown when currentTarget is non-null. Closes the picker
   *  and navigates the editor to the target page. */
  onJumpToTarget?: () => void;
  onClose: () => void;
}

interface PageGroup {
  title: string;
  pages: number[];
}

/**
 * Centered modal that lets a teacher pick a destination page for the object
 * link they're authoring. Reuses the PageJumpMenu thumbnail aesthetic but
 * renders as a focused overlay (backdrop + ESC dismiss) so it feels like a
 * deliberate action rather than a navigation popover.
 */
export const LinkTargetPicker: React.FC<LinkTargetPickerProps> = ({
  pageUrls,
  sections,
  sourcePage,
  currentTarget,
  onSelect,
  onRemove,
  onJumpToTarget,
  onClose,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  useClickOutside(panelRef, onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Auto-scroll to the existing target (or source, as a fallback anchor) so
  // teachers can update an existing link without hunting through 76 thumbs.
  useEffect(() => {
    const anchorPage = currentTarget ?? sourcePage;
    panelRef.current
      ?.querySelector<HTMLElement>(`[data-page="${anchorPage}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [currentTarget, sourcePage]);

  const groups = useMemo<PageGroup[]>(() => {
    if (sections && sections.length > 0) {
      return sections.map((s) => ({
        title: s.title,
        pages: Array.from({ length: s.pageCount }, (_, i) => s.startIndex + i),
      }));
    }
    return [{ title: '', pages: pageUrls.map((_, i) => i) }];
  }, [sections, pageUrls]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose link target page"
      className="absolute inset-0 z-30 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm"
    >
      <div
        ref={panelRef}
        className="bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col"
        style={{
          width: 'min(440px, 92cqmin)',
          maxHeight: 'min(520px, 80cqmin)',
        }}
      >
        <div
          className="flex items-center justify-between border-b border-slate-200"
          style={{ padding: 'min(16px, 3cqmin)' }}
        >
          <div
            className="flex items-center"
            style={{ gap: 'min(8px, 2cqmin)' }}
          >
            <Link2
              className="text-indigo-600"
              style={{
                width: 'min(16px, 4cqmin)',
                height: 'min(16px, 4cqmin)',
              }}
            />
            <span
              className="font-black text-slate-700 uppercase tracking-widest"
              style={{ fontSize: 'min(12px, 3cqmin)' }}
            >
              Link to page
            </span>
          </div>
          <div
            className="flex items-center"
            style={{ gap: 'min(6px, 1.5cqmin)' }}
          >
            {currentTarget !== null && onJumpToTarget && (
              <button
                onClick={onJumpToTarget}
                className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors flex items-center"
                style={{
                  padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
                  gap: 'min(4px, 1cqmin)',
                }}
                title={`Go to page ${currentTarget + 1}`}
              >
                <ArrowRight
                  style={{
                    width: 'min(13px, 3.2cqmin)',
                    height: 'min(13px, 3.2cqmin)',
                  }}
                />
                <span
                  className="font-bold uppercase tracking-tight"
                  style={{ fontSize: 'min(10px, 2.5cqmin)' }}
                >
                  Go to page {currentTarget + 1}
                </span>
              </button>
            )}
            {currentTarget !== null && onRemove && (
              <button
                onClick={onRemove}
                className="bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors flex items-center"
                style={{
                  padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
                  gap: 'min(4px, 1cqmin)',
                }}
                title="Remove link"
              >
                <Unlink2
                  style={{
                    width: 'min(13px, 3.2cqmin)',
                    height: 'min(13px, 3.2cqmin)',
                  }}
                />
                <span
                  className="font-bold uppercase tracking-tight"
                  style={{ fontSize: 'min(10px, 2.5cqmin)' }}
                >
                  Remove
                </span>
              </button>
            )}
            <button
              onClick={onClose}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
              style={{ padding: 'min(6px, 1.5cqmin)' }}
              aria-label="Close"
            >
              <X
                style={{
                  width: 'min(14px, 3.5cqmin)',
                  height: 'min(14px, 3.5cqmin)',
                }}
              />
            </button>
          </div>
        </div>

        <div
          className="overflow-y-auto custom-scrollbar"
          style={{ padding: 'min(12px, 3cqmin)' }}
        >
          {groups.map((group, gi) => (
            <div key={`${group.title}-${gi}`}>
              {group.title && (
                <div
                  className="font-black uppercase tracking-widest text-slate-400 sticky top-0 bg-white"
                  style={{
                    fontSize: 'min(10px, 2.5cqmin)',
                    padding: 'min(4px, 1cqmin) 0',
                  }}
                >
                  {group.title}
                </div>
              )}
              <div
                className="grid grid-cols-4"
                style={{
                  gap: 'min(8px, 2cqmin)',
                  marginBottom: 'min(8px, 2cqmin)',
                }}
              >
                {group.pages.map((page) => {
                  const isSource = page === sourcePage;
                  const isTarget = page === currentTarget;
                  return (
                    <button
                      key={page}
                      data-page={page}
                      onClick={() => {
                        if (isSource) return; // can't link a page to itself
                        onSelect(page);
                      }}
                      disabled={isSource}
                      className={`relative rounded-lg overflow-hidden transition-all ${
                        isSource
                          ? 'ring-1 ring-slate-200 opacity-40 cursor-not-allowed'
                          : isTarget
                            ? 'ring-2 ring-indigo-600 shadow-md hover:shadow-lg'
                            : 'ring-1 ring-slate-200 hover:ring-2 hover:ring-indigo-400'
                      }`}
                      style={{ aspectRatio: '4 / 3' }}
                      aria-label={
                        isSource
                          ? `Page ${page + 1} (this page)`
                          : `Link to page ${page + 1}`
                      }
                    >
                      <img
                        src={pageUrls[page]}
                        alt=""
                        loading="lazy"
                        draggable={false}
                        className="w-full h-full object-cover bg-slate-50 pointer-events-none"
                      />
                      <div
                        className={`absolute bottom-0 left-0 right-0 text-center font-bold ${
                          isTarget
                            ? 'bg-indigo-600 text-white'
                            : isSource
                              ? 'bg-slate-200 text-slate-500'
                              : 'bg-white/90 text-slate-700'
                        }`}
                        style={{
                          fontSize: 'min(10px, 2.5cqmin)',
                          padding: 'min(2px, 0.5cqmin)',
                        }}
                      >
                        {isSource ? 'This page' : page + 1}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LinkTargetPicker;
