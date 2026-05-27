import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Eraser,
  Highlighter,
  Loader2,
  MousePointer2,
  Pen,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { NotebookObjectLink, NotebookSection } from '@/types';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { PageEditor, LinkRequest } from './PageEditor';
import { PEN_COLORS, PEN_WIDTHS, Tool } from './pageEditorTypes';
import { PageJumpMenu } from './PageJumpMenu';
import { LinkTargetPicker } from './LinkTargetPicker';

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
  /** Existing object→page links for the active notebook (all pages). */
  objectLinks?: NotebookObjectLink[];
  saveStatus: 'idle' | 'saving' | 'error';
  onEditChange: (svg: string) => void;
  onPageChange: (page: number) => void;
  /** Add or update a link from a single object to a target page. */
  onSaveObjectLink?: (link: NotebookObjectLink) => void;
  /** Remove an existing link by id. */
  onRemoveObjectLink?: (linkId: string) => void;
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
  objectLinks,
  saveStatus,
  onEditChange,
  onPageChange,
  onSaveObjectLink,
  onRemoveObjectLink,
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
  // Tool state lives at the workspace level so the toolbar can sit in the
  // chrome (matching the DrawingWidget's bottom-rail layout) instead of
  // floating over the page like the previous SMART-style palette.
  const [tool, setTool] = useState<Tool>('select');
  const [penColor, setPenColor] = useState<string>(PEN_COLORS[0]);
  const [penWidth, setPenWidth] = useState<number>(PEN_WIDTHS[1]);
  // Set when the user clicks the link FAB on a selected object. The
  // LinkTargetPicker reads this to know which object's link it's editing
  // and which hotspot box to record on save.
  const [linkRequest, setLinkRequest] = useState<LinkRequest | null>(null);

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
            <>
              <PageEditor
                key={currentPage}
                svg={svgToEdit}
                tool={tool}
                penColor={penColor}
                penWidth={penWidth}
                onChange={onEditChange}
                onRequestLink={setLinkRequest}
              />
              {linkRequest && (
                <LinkTargetPicker
                  pageUrls={pageUrls}
                  sections={sections}
                  sourcePage={currentPage}
                  currentTarget={
                    objectLinks?.find(
                      (l) =>
                        l.objectId === linkRequest.objectId &&
                        l.sourcePage === currentPage
                    )?.targetPage ?? null
                  }
                  onSelect={(targetPage) => {
                    // Reuse the existing link's id when updating so the
                    // Firestore record gets overwritten in place rather
                    // than accumulating duplicate hotspots.
                    const existing = objectLinks?.find(
                      (l) =>
                        l.objectId === linkRequest.objectId &&
                        l.sourcePage === currentPage
                    );
                    onSaveObjectLink?.({
                      id: existing?.id ?? crypto.randomUUID(),
                      objectId: linkRequest.objectId,
                      sourcePage: currentPage,
                      targetPage,
                      ...linkRequest.box,
                    });
                    setLinkRequest(null);
                  }}
                  onRemove={() => {
                    const existing = objectLinks?.find(
                      (l) =>
                        l.objectId === linkRequest.objectId &&
                        l.sourcePage === currentPage
                    );
                    if (existing) onRemoveObjectLink?.(existing.id);
                    setLinkRequest(null);
                  }}
                  onClose={() => setLinkRequest(null)}
                />
              )}
            </>
          )}
        </div>
      }
      footer={
        <div className="shrink-0 border-t border-slate-200 bg-white">
          <Toolbar
            tool={tool}
            penColor={penColor}
            penWidth={penWidth}
            onToolChange={setTool}
            onColorChange={setPenColor}
            onWidthChange={setPenWidth}
          />
          <div
            className="relative flex items-center justify-center"
            style={{
              padding: 'min(10px, 2.5cqmin)',
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
        </div>
      }
    />
  );
};

/**
 * Notebook editor toolbar — bottom strip just above page nav, sharing the
 * DrawingWidget's dark-chrome / segmented-control look so the two editors
 * feel like cousins. PageEditor stays presentational; tool state lives in
 * the workspace.
 */
const TOOL_BUTTONS: ReadonlyArray<{
  tool: Tool;
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
}> = [
  { tool: 'select', Icon: MousePointer2, label: 'Select' },
  { tool: 'pen', Icon: Pen, label: 'Pen' },
  { tool: 'highlighter', Icon: Highlighter, label: 'Highlighter' },
  { tool: 'eraser', Icon: Eraser, label: 'Eraser' },
];

const WIDTH_LABELS = ['Thin', 'Medium', 'Thick'] as const;

const Toolbar: React.FC<{
  tool: Tool;
  penColor: string;
  penWidth: number;
  onToolChange: (t: Tool) => void;
  onColorChange: (c: string) => void;
  onWidthChange: (w: number) => void;
}> = ({
  tool,
  penColor,
  penWidth,
  onToolChange,
  onColorChange,
  onWidthChange,
}) => {
  const inkActive = tool === 'pen' || tool === 'highlighter';
  return (
    <div
      className="bg-slate-900/95 backdrop-blur"
      style={{ padding: 'min(8px, 2cqmin) min(12px, 2.5cqmin)' }}
    >
      <div
        className="mx-auto flex items-center justify-center"
        style={{ gap: 'min(12px, 2.5cqmin)', maxWidth: '720px' }}
      >
        {/* Tool segmented control */}
        <div
          role="group"
          aria-label="Drawing tool"
          className="flex items-stretch rounded-lg bg-slate-950/40 ring-1 ring-white/5"
          style={{ gap: 'min(2px, 0.5cqmin)', padding: 'min(4px, 1cqmin)' }}
        >
          {TOOL_BUTTONS.map(({ tool: t, Icon, label }) => {
            const isActive = tool === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => onToolChange(t)}
                aria-pressed={isActive}
                title={label}
                aria-label={label}
                className={`flex items-center justify-center rounded-md transition-colors ${
                  isActive
                    ? 'bg-brand-blue-primary text-white shadow-sm'
                    : 'text-slate-300 hover:bg-white/10'
                }`}
                style={{
                  width: 'min(32px, 7cqmin)',
                  height: 'min(28px, 6cqmin)',
                }}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>

        {/* Color swatches — only meaningful for ink tools; dim them otherwise
            so the eraser/select state doesn't suggest a "current color". */}
        <div
          className={`flex items-center transition-opacity ${
            inkActive ? 'opacity-100' : 'opacity-40'
          }`}
          style={{ gap: 'min(6px, 1.5cqmin)' }}
        >
          {PEN_COLORS.map((c) => {
            const isActive = penColor === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => onColorChange(c)}
                disabled={!inkActive}
                title={`Color ${c}`}
                aria-label={`Color ${c}`}
                aria-pressed={isActive}
                className={`rounded-full transition-transform ${
                  isActive
                    ? 'scale-110 ring-2 ring-white'
                    : 'ring-1 ring-white/30 hover:scale-105'
                } ${inkActive ? 'cursor-pointer' : 'cursor-default'}`}
                style={{
                  width: 'min(20px, 4.5cqmin)',
                  height: 'min(20px, 4.5cqmin)',
                  backgroundColor: c,
                }}
              />
            );
          })}
        </div>

        {/* Stroke width dots — same opacity treatment. */}
        <div
          className={`flex items-center transition-opacity ${
            inkActive ? 'opacity-100' : 'opacity-40'
          }`}
          style={{ gap: 'min(2px, 0.5cqmin)' }}
        >
          {PEN_WIDTHS.map((w, i) => {
            const isActive = penWidth === w;
            return (
              <button
                key={w}
                type="button"
                onClick={() => onWidthChange(w)}
                disabled={!inkActive}
                title={WIDTH_LABELS[i]}
                aria-label={WIDTH_LABELS[i]}
                aria-pressed={isActive}
                className={`flex items-center justify-center rounded-md transition-colors ${
                  isActive
                    ? 'bg-white/20'
                    : inkActive
                      ? 'hover:bg-white/10'
                      : ''
                }`}
                style={{
                  width: 'min(28px, 6cqmin)',
                  height: 'min(28px, 6cqmin)',
                }}
              >
                <span
                  className="rounded-full bg-white"
                  style={{ width: w + 2, height: w + 2 }}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
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
