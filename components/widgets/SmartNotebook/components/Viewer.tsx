import React, { useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Eye,
  EyeOff,
  FileText,
  Pencil,
  Plus,
  Trash2,
  Share2,
  X,
} from 'lucide-react';
import { NotebookItem, PlacedNotebookAsset } from '@/types';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { PageCanvas } from './PageCanvas';
import { PageJumpMenu } from './PageJumpMenu';
import { ReorderPageControl } from './ReorderPageControl';
import {
  effectiveHiddenPages,
  nextVisiblePage,
  normalizeHiddenPages,
  visiblePageIndices,
  visiblePositionOf,
} from '@/utils/notebookPages';

interface ViewerProps {
  activeNotebook: NotebookItem;
  hasAssets: boolean | undefined;
  showAssets: boolean;
  setShowAssets: (show: boolean) => void;
  handleClose: () => void;
  onShare?: (e: React.MouseEvent) => void;
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  handleDragStart: (e: React.DragEvent, url: string) => void;
  placedAssets: PlacedNotebookAsset[];
  onPlaceAsset: (url: string, xFrac: number, yFrac: number) => void;
  onUpdatePlacedAsset: (
    id: string,
    patch: Partial<Pick<PlacedNotebookAsset, 'xFrac' | 'yFrac' | 'wFrac'>>
  ) => void;
  onRemovePlacedAsset: (id: string) => void;
  onEditPage?: () => void;
  onAddPage?: () => void;
  onDeletePage?: () => void;
  onMovePage?: (dir: -1 | 1) => void;
  canMoveEarlier?: boolean;
  canMoveLater?: boolean;
  /** Hide/unhide the current page from presenting. */
  onToggleHiddenPage?: () => void;
  pageOpBusy?: boolean;
}

export const Viewer: React.FC<ViewerProps> = ({
  activeNotebook,
  hasAssets,
  showAssets,
  setShowAssets,
  handleClose,
  onShare,
  currentPage,
  setCurrentPage,
  handleDragStart,
  placedAssets,
  onPlaceAsset,
  onUpdatePlacedAsset,
  onRemovePlacedAsset,
  onEditPage,
  onAddPage,
  onDeletePage,
  onMovePage,
  canMoveEarlier = false,
  canMoveLater = false,
  onToggleHiddenPage,
  pageOpBusy = false,
}) => {
  const [jumpMenuOpen, setJumpMenuOpen] = useState(false);
  const jumpTriggerRef = useRef<HTMLButtonElement>(null);
  const iconStyle = {
    width: 'min(16px, 4cqmin)',
    height: 'min(16px, 4cqmin)',
  };
  const toolBtnClass =
    'rounded-xl bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition-all shadow-sm disabled:opacity-40';
  const toolBtnStyle = { padding: 'min(8px, 2cqmin)' };
  // Optional lesson grouping (derived from the notebook's manifest at import,
  // for both raw .notebook and converted .spartnb files). Find which lesson
  // the current page falls in.
  // Hidden pages (answer keys) are skipped by prev/next and excluded from the
  // page counter/progress, but stay reachable from the jump menu.
  const totalPages = activeNotebook.pageUrls.length;
  const hiddenPages = effectiveHiddenPages(
    activeNotebook.hiddenPages,
    totalPages
  );
  // Raw (non-effective) hidden state drives the badge/toggle so an
  // all-hidden notebook still shows the page as hidden instead of unhiding
  // it on click; prev/next/counter/progress use the effective set above.
  const isCurrentHidden = normalizeHiddenPages(
    activeNotebook.hiddenPages,
    totalPages
  ).includes(currentPage);
  const visibleCount = visiblePageIndices(totalPages, hiddenPages).length;
  const visiblePosition = visiblePositionOf(
    currentPage,
    totalPages,
    hiddenPages
  );
  const prevVisible = nextVisiblePage(currentPage, -1, totalPages, hiddenPages);
  const nextVisible = nextVisiblePage(currentPage, 1, totalPages, hiddenPages);

  const sections = activeNotebook.sections;
  const currentSectionIndex =
    sections?.findIndex(
      (s) =>
        currentPage >= s.startIndex && currentPage < s.startIndex + s.pageCount
    ) ?? -1;
  const currentSection =
    sections && currentSectionIndex >= 0 ? sections[currentSectionIndex] : null;

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
              Page {visiblePosition} of {visibleCount}
              {isCurrentHidden && (
                <>
                  {'  ·  '}
                  <span className="text-amber-600">Hidden page</span>
                </>
              )}
              {currentSection && (
                <>
                  {'  ·  '}
                  <span className="text-indigo-500">
                    {currentSection.title}
                  </span>
                </>
              )}
            </p>
          </div>

          <div
            className="flex items-center"
            style={{ gap: 'min(8px, 2cqmin)' }}
          >
            {sections && sections.length > 1 && (
              <select
                aria-label="Jump to lesson"
                value={currentSectionIndex >= 0 ? currentSectionIndex : 0}
                onChange={(e) =>
                  setCurrentPage(sections[Number(e.target.value)].startIndex)
                }
                className="rounded-xl bg-white text-slate-700 font-bold uppercase tracking-tight border border-slate-200 shadow-sm cursor-pointer hover:bg-slate-50 transition-all"
                style={{
                  fontSize: 'min(11px, 2.8cqmin)',
                  padding: 'min(8px, 2cqmin) min(10px, 2.5cqmin)',
                  maxWidth: '44cqmin',
                }}
              >
                {sections.map((s, i) => (
                  <option key={`${s.title}-${s.startIndex}`} value={i}>
                    {s.title}
                  </option>
                ))}
              </select>
            )}
            {onMovePage && (
              <ReorderPageControl
                onMovePage={onMovePage}
                pageOpBusy={pageOpBusy}
                canMoveEarlier={canMoveEarlier}
                canMoveLater={canMoveLater}
                iconStyle={iconStyle}
              />
            )}
            {onAddPage && (
              <button
                onClick={onAddPage}
                disabled={pageOpBusy}
                className={toolBtnClass}
                style={toolBtnStyle}
                title="Add blank page"
              >
                <Plus style={iconStyle} />
              </button>
            )}
            {onToggleHiddenPage && (
              <button
                onClick={onToggleHiddenPage}
                disabled={pageOpBusy}
                className={toolBtnClass}
                style={toolBtnStyle}
                title={
                  isCurrentHidden
                    ? 'Show this page when presenting'
                    : 'Hide this page when presenting'
                }
                aria-label={
                  isCurrentHidden
                    ? 'Show this page when presenting'
                    : 'Hide this page when presenting'
                }
                aria-pressed={isCurrentHidden}
              >
                {isCurrentHidden ? (
                  <EyeOff style={iconStyle} />
                ) : (
                  <Eye style={iconStyle} />
                )}
              </button>
            )}
            {onDeletePage && (
              <button
                onClick={onDeletePage}
                disabled={pageOpBusy}
                className={toolBtnClass}
                style={toolBtnStyle}
                title="Delete page"
              >
                <Trash2 style={iconStyle} />
              </button>
            )}
            {onEditPage && (
              <button
                onClick={onEditPage}
                className={toolBtnClass}
                style={toolBtnStyle}
                title="Edit page"
              >
                <Pencil style={iconStyle} />
              </button>
            )}
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
            {onShare && (
              <button
                onClick={onShare}
                className={toolBtnClass}
                style={toolBtnStyle}
                title="Share notebook (copies a paste-able link)"
                aria-label="Share notebook"
              >
                <Share2 style={iconStyle} />
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
        <div className="relative flex-1 w-full h-full flex overflow-hidden bg-slate-100">
          {isCurrentHidden && (
            <div
              className="absolute z-20 flex items-center rounded-lg bg-slate-900/80 text-white font-bold uppercase tracking-widest pointer-events-none"
              style={{
                top: 'min(8px, 2cqmin)',
                left: 'min(8px, 2cqmin)',
                gap: 'min(4px, 1cqmin)',
                padding: 'min(4px, 1cqmin) min(8px, 2cqmin)',
                fontSize: 'min(10px, 2.5cqmin)',
              }}
            >
              <EyeOff
                aria-hidden
                style={{
                  width: 'min(12px, 3cqmin)',
                  height: 'min(12px, 3cqmin)',
                }}
              />
              Hidden page
            </div>
          )}
          {/* Slide + placed-asset overlay */}
          <PageCanvas
            pageUrl={activeNotebook.pageUrls[currentPage]}
            pageNumber={currentPage + 1}
            placedAssets={placedAssets}
            onPlaceAsset={onPlaceAsset}
            onUpdatePlacedAsset={onUpdatePlacedAsset}
            onRemovePlacedAsset={onRemovePlacedAsset}
            objectLinks={activeNotebook.objectLinks?.filter(
              (l) => l.sourcePage === currentPage
            )}
            onFollowLink={(targetPage) => {
              const clamped = Math.max(
                0,
                Math.min(activeNotebook.pageUrls.length - 1, targetPage)
              );
              setCurrentPage(clamped);
            }}
          />

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
                  Drag onto the page
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
            disabled={prevVisible === null}
            onClick={() => prevVisible !== null && setCurrentPage(prevVisible)}
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
            className="relative flex flex-col items-center"
            style={{ minWidth: '80px' }}
          >
            <button
              ref={jumpTriggerRef}
              onClick={() => setJumpMenuOpen((o) => !o)}
              className="flex items-center rounded-lg hover:bg-slate-100 transition-colors"
              style={{
                gap: 'min(4px, 1cqmin)',
                padding: 'min(4px, 1cqmin) min(8px, 2cqmin)',
              }}
              aria-haspopup="dialog"
              aria-expanded={jumpMenuOpen}
              title="Jump to page"
            >
              <span
                className="font-black text-slate-700 tracking-widest uppercase"
                style={{ fontSize: 'min(12px, 3cqmin)' }}
              >
                {visiblePosition} / {visibleCount}
              </span>
              <ChevronUp
                className={`text-slate-400 transition-transform ${jumpMenuOpen ? '' : 'rotate-180'}`}
                style={{
                  width: 'min(12px, 3cqmin)',
                  height: 'min(12px, 3cqmin)',
                }}
              />
            </button>
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
                  width: `${(visiblePosition / Math.max(1, visibleCount)) * 100}%`,
                }}
              />
            </div>
            {jumpMenuOpen && (
              <PageJumpMenu
                pageUrls={activeNotebook.pageUrls}
                sections={sections}
                hiddenPages={hiddenPages}
                currentPage={currentPage}
                onSelect={(page) => setCurrentPage(page)}
                onClose={() => setJumpMenuOpen(false)}
                triggerRef={jumpTriggerRef}
              />
            )}
          </div>
          <button
            disabled={nextVisible === null}
            onClick={() => nextVisible !== null && setCurrentPage(nextVisible)}
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
