import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Loader2,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { NotebookSection } from '@/types';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { PageEditor } from './PageEditor';
import { PageJumpMenu } from './PageJumpMenu';

interface PageEditorOverlayProps {
  title: string;
  /**
   * All page URLs in order. The current page (`pageUrls[currentPage]`) is
   * what the editor loads; the rest power the jump-menu thumbnails.
   */
  pageUrls: string[];
  /**
   * Latest locally-edited SVG for the current page, if the user has been
   * editing it this session. Takes precedence over the Storage URL so
   * jumping pages mid-debounce never loses unsaved changes.
   */
  cachedSvg: string | null;
  currentPage: number;
  sections?: NotebookSection[];
  saveStatus: 'idle' | 'saving' | 'error';
  onEditChange: (svg: string) => void;
  onPageChange: (page: number) => void;
  onAddPage?: () => void;
  onDeletePage?: () => void;
  onMovePage?: (dir: -1 | 1) => void;
  canMoveEarlier?: boolean;
  canMoveLater?: boolean;
  pageOpBusy?: boolean;
  onPresent: () => void;
  onClose: () => void;
}

/**
 * Default-mode workspace for an open notebook: hosts the live SVG editor plus
 * page navigation (prev/next, jump menu, sections) and an autosave indicator.
 * Following SMART Notebook, notebooks open here directly — Present mode is an
 * opt-in toggle that drops back to the read-only Viewer.
 */
export const PageEditorOverlay: React.FC<PageEditorOverlayProps> = ({
  title,
  pageUrls,
  cachedSvg,
  currentPage,
  sections,
  saveStatus,
  onEditChange,
  onPageChange,
  onAddPage,
  onDeletePage,
  onMovePage,
  canMoveEarlier = false,
  canMoveLater = false,
  pageOpBusy = false,
  onPresent,
  onClose,
}) => {
  const pageUrl = pageUrls[currentPage];
  const totalPages = pageUrls.length;
  const [fetchedSvg, setFetchedSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jumpMenuOpen, setJumpMenuOpen] = useState(false);
  const jumpTriggerRef = useRef<HTMLButtonElement>(null);

  // Reset state when the page changes (adjust-state-while-rendering, so the
  // loading effect below stays free of synchronous setState).
  const [prevPage, setPrevPage] = useState(currentPage);
  if (currentPage !== prevPage) {
    setPrevPage(currentPage);
    setFetchedSvg(null);
    setError(null);
    setJumpMenuOpen(false);
  }

  // Load the page SVG text — but only if we don't already have a local cached
  // edit for this page. The cache wins so a mid-debounce page jump (or a
  // jump-back) shows the user's latest work instead of stale Storage content.
  useEffect(() => {
    if (cachedSvg) return;
    let cancelled = false;
    fetch(pageUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setFetchedSvg(text);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.error('Failed to load page for editing', err);
          setError(
            'Could not load this page for editing. (Storage read access may not be configured.)'
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pageUrl, cachedSvg]);

  const svgToEdit = cachedSvg ?? fetchedSvg;

  // Lesson grouping mirrors the Viewer's footer: surface the current section
  // and a jump dropdown so teachers can hop straight to a lesson.
  const currentSectionIndex =
    sections?.findIndex(
      (s) =>
        currentPage >= s.startIndex && currentPage < s.startIndex + s.pageCount
    ) ?? -1;
  const currentSection =
    sections && currentSectionIndex >= 0 ? sections[currentSectionIndex] : null;

  const iconStyle = {
    width: 'min(16px, 4cqmin)',
    height: 'min(16px, 4cqmin)',
  };
  const toolBtnClass =
    'rounded-xl bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition-all shadow-sm disabled:opacity-40';
  const toolBtnStyle = { padding: 'min(8px, 2cqmin)' };

  return (
    <WidgetLayout
      padding="p-0"
      header={
        <div
          className="flex items-center justify-between shrink-0 border-b border-slate-200 bg-white"
          style={{ padding: 'min(12px, 3cqmin)' }}
        >
          <div className="min-w-0 flex-1">
            <div
              className="flex items-center"
              style={{ gap: 'min(8px, 2cqmin)' }}
            >
              <Pencil className="text-indigo-600 shrink-0" style={iconStyle} />
              <h3
                className="font-black text-slate-700 uppercase tracking-widest truncate"
                style={{ fontSize: 'min(12px, 3cqmin)' }}
              >
                {title}
              </h3>
            </div>
            <p
              className="font-bold text-slate-400 uppercase tracking-tighter"
              style={{
                fontSize: 'min(10px, 2.5cqmin)',
                marginTop: 'min(2px, 0.5cqmin)',
              }}
            >
              Editing · Page {currentPage + 1} of {totalPages}
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
            <SaveIndicator status={saveStatus} />
            {sections && sections.length > 1 && (
              <select
                aria-label="Jump to lesson"
                value={currentSectionIndex >= 0 ? currentSectionIndex : 0}
                onChange={(e) =>
                  onPageChange(sections[Number(e.target.value)].startIndex)
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
              <>
                <button
                  onClick={() => onMovePage(-1)}
                  disabled={pageOpBusy || !canMoveEarlier}
                  className={toolBtnClass}
                  style={toolBtnStyle}
                  title="Move page earlier"
                >
                  <ArrowLeft style={iconStyle} />
                </button>
                <button
                  onClick={() => onMovePage(1)}
                  disabled={pageOpBusy || !canMoveLater}
                  className={toolBtnClass}
                  style={toolBtnStyle}
                  title="Move page later"
                >
                  <ArrowRight style={iconStyle} />
                </button>
              </>
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
            <button
              onClick={onPresent}
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm flex items-center transition-all active:scale-95"
              style={{
                padding: 'min(8px, 2cqmin) min(12px, 2.5cqmin)',
                gap: 'min(6px, 1.5cqmin)',
              }}
              title="Switch to present mode"
            >
              <Play
                style={{
                  width: 'min(14px, 3.5cqmin)',
                  height: 'min(14px, 3.5cqmin)',
                }}
              />
              <span
                className="font-bold uppercase tracking-tight"
                style={{ fontSize: 'min(11px, 2.8cqmin)' }}
              >
                Present
              </span>
            </button>
            <button
              onClick={onClose}
              className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-lg transition-all border border-slate-700 active:scale-95"
              style={{ padding: 'min(8px, 2cqmin)' }}
              title="Close notebook"
            >
              <X style={iconStyle} />
            </button>
          </div>
        </div>
      }
      content={
        <div className="flex-1 h-full w-full bg-slate-100">
          {error ? (
            <div
              className="h-full w-full flex flex-col items-center justify-center text-center text-slate-600"
              style={{ gap: 'min(12px, 3cqmin)', padding: 'min(24px, 5cqmin)' }}
            >
              <AlertTriangle
                className="text-red-500"
                style={{
                  width: 'min(32px, 9cqmin)',
                  height: 'min(32px, 9cqmin)',
                }}
              />
              <p
                className="font-semibold max-w-xs"
                style={{ fontSize: 'min(14px, 5.5cqmin)' }}
              >
                {error}
              </p>
            </div>
          ) : !svgToEdit ? (
            <div className="h-full w-full flex items-center justify-center">
              <Loader2
                className="text-indigo-500 animate-spin"
                style={{
                  width: 'min(32px, 9cqmin)',
                  height: 'min(32px, 9cqmin)',
                }}
              />
            </div>
          ) : (
            // PageEditor remounts on currentPage change because we key on it —
            // that's intentional so prepareEditableSvg re-runs against the new
            // page's source instead of trying to diff the SVG tree.
            <PageEditor
              key={currentPage}
              svg={svgToEdit}
              onChange={onEditChange}
            />
          )}
        </div>
      }
      footer={
        <div
          className="relative flex items-center justify-center shrink-0 border-t border-slate-200 bg-white"
          style={{
            padding: 'min(12px, 3cqmin)',
            gap: 'min(24px, 5cqmin)',
          }}
        >
          <button
            disabled={currentPage === 0}
            onClick={() => onPageChange(Math.max(0, currentPage - 1))}
            className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-2xl disabled:opacity-30 disabled:grayscale transition-all shadow-sm active:scale-90"
            style={{ padding: 'min(10px, 2.5cqmin)' }}
            title="Previous page"
          >
            <ChevronLeft
              style={{
                width: 'min(20px, 4.5cqmin)',
                height: 'min(20px, 4.5cqmin)',
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
                {currentPage + 1} / {totalPages}
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
                  width: `${((currentPage + 1) / totalPages) * 100}%`,
                }}
              />
            </div>
            {jumpMenuOpen && (
              <PageJumpMenu
                // Thumbnails point at the committed Storage URLs — a page
                // being edited shows its last-saved thumb until autosave
                // catches up, which is the right thing for at-a-glance nav.
                pageUrls={pageUrls}
                sections={sections}
                currentPage={currentPage}
                onSelect={onPageChange}
                onClose={() => setJumpMenuOpen(false)}
                triggerRef={jumpTriggerRef}
              />
            )}
          </div>

          <button
            disabled={currentPage === totalPages - 1}
            onClick={() =>
              onPageChange(Math.min(totalPages - 1, currentPage + 1))
            }
            className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-2xl disabled:opacity-30 disabled:grayscale transition-all shadow-sm active:scale-90"
            style={{ padding: 'min(10px, 2.5cqmin)' }}
            title="Next page"
          >
            <ChevronRight
              style={{
                width: 'min(20px, 4.5cqmin)',
                height: 'min(20px, 4.5cqmin)',
              }}
            />
          </button>
        </div>
      }
    />
  );
};

const SaveIndicator: React.FC<{ status: 'idle' | 'saving' | 'error' }> = ({
  status,
}) => {
  if (status === 'saving') {
    return (
      <span
        className="flex items-center text-slate-500 font-bold uppercase tracking-tight"
        style={{ gap: 'min(4px, 1cqmin)', fontSize: 'min(11px, 2.8cqmin)' }}
        title="Autosaving"
      >
        <Loader2
          className="animate-spin text-indigo-500"
          style={{
            width: 'min(14px, 3.5cqmin)',
            height: 'min(14px, 3.5cqmin)',
          }}
        />
        Saving…
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span
        className="flex items-center text-red-600 font-bold uppercase tracking-tight"
        style={{ gap: 'min(4px, 1cqmin)', fontSize: 'min(11px, 2.8cqmin)' }}
        title="Autosave failed — edits are kept locally"
      >
        <RotateCcw
          style={{
            width: 'min(14px, 3.5cqmin)',
            height: 'min(14px, 3.5cqmin)',
          }}
        />
        Retrying
      </span>
    );
  }
  return (
    <span
      className="flex items-center text-emerald-600 font-bold uppercase tracking-tight"
      style={{ gap: 'min(4px, 1cqmin)', fontSize: 'min(11px, 2.8cqmin)' }}
      title="All changes saved"
    >
      <CheckCircle2
        style={{
          width: 'min(14px, 3.5cqmin)',
          height: 'min(14px, 3.5cqmin)',
        }}
      />
      Saved
    </span>
  );
};

export default PageEditorOverlay;
