import React, { RefObject, useEffect, useMemo, useRef } from 'react';
import { NotebookSection } from '@/types';
import { useClickOutside } from '@/hooks/useClickOutside';

interface PageJumpMenuProps {
  pageUrls: string[];
  sections?: NotebookSection[];
  currentPage: number;
  onSelect: (page: number) => void;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
}

interface PageGroup {
  title: string;
  pages: number[];
}

/**
 * Popover that lists every page of the active notebook as a thumbnail grid so
 * teachers can jump straight to a page instead of stepping through dozens of
 * slides. Thumbnails are the same page URLs the Viewer already loads, so once
 * a notebook has been opened in this session the browser cache covers most
 * fetches; `loading="lazy"` keeps the first-open burst small.
 */
export const PageJumpMenu: React.FC<PageJumpMenuProps> = ({
  pageUrls,
  sections,
  currentPage,
  onSelect,
  onClose,
  triggerRef,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, onClose, [triggerRef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Bring the current page's thumb into view when the menu opens. Without this
  // a teacher on page 60 of 76 would land on a popover scrolled to page 1.
  useEffect(() => {
    menuRef.current
      ?.querySelector<HTMLElement>('[data-current="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, []);

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
      ref={menuRef}
      role="dialog"
      aria-label="Jump to page"
      className="absolute left-1/2 -translate-x-1/2 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-y-auto custom-scrollbar z-30"
      style={{
        bottom: 'calc(100% + min(8px, 2cqmin))',
        width: 'min(380px, 90cqmin)',
        maxHeight: 'min(360px, 55cqmin)',
        padding: 'min(12px, 3cqmin)',
      }}
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
              const isCurrent = page === currentPage;
              return (
                <button
                  key={page}
                  data-current={isCurrent}
                  onClick={() => {
                    onSelect(page);
                    onClose();
                  }}
                  className={`relative rounded-lg overflow-hidden transition-all hover:ring-2 hover:ring-indigo-400 ${
                    isCurrent
                      ? 'ring-2 ring-indigo-600 shadow-md'
                      : 'ring-1 ring-slate-200'
                  }`}
                  style={{ aspectRatio: '4 / 3' }}
                  aria-label={`Go to page ${page + 1}`}
                  aria-current={isCurrent ? 'page' : undefined}
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
                      isCurrent
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white/90 text-slate-700'
                    }`}
                    style={{
                      fontSize: 'min(10px, 2.5cqmin)',
                      padding: 'min(2px, 0.5cqmin)',
                    }}
                  >
                    {page + 1}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default PageJumpMenu;
