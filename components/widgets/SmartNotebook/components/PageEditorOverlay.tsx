import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BringToFront,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  Eraser,
  Highlighter,
  Loader2,
  Minus,
  MousePointer2,
  MoveUpRight,
  PaintBucket,
  Pen,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  SendToBack,
  Shapes,
  Square,
  Trash2,
  Type,
  Upload,
  X,
} from 'lucide-react';
import { NotebookObjectLink, NotebookSection } from '@/types';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import {
  PageEditor,
  LinkRequest,
  ClonedLinkInfo,
  PageEditorImperativeApi,
  PageBackgroundChange,
} from './PageEditor';
import { PEN_COLORS, PEN_WIDTHS, Tool } from './pageEditorTypes';
import { PageJumpMenu } from './PageJumpMenu';
import { LinkTargetPicker } from './LinkTargetPicker';
import { useClickOutside } from '@/hooks/useClickOutside';

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
  /**
   * Persist new links produced by a duplicate or paste of linked objects.
   * Optional helper alongside onSaveObjectLink: a batch path lets the host
   * coalesce multiple writes (e.g. one Firestore update for all the pasted
   * hotspots) instead of one round-trip per object.
   */
  onSaveObjectLinksBatch?: (links: NotebookObjectLink[]) => void;
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
  onSaveObjectLinksBatch,
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
  // Text and eraser have their own size dimension — font-size for text,
  // hit-radius for the eraser. Kept separate from penWidth so switching
  // between Pen and Text (or Eraser) doesn't blow away the previous
  // tool's calibrated size.
  const [textSize, setTextSize] = useState<number>(36);
  const [eraserSize, setEraserSize] = useState<number>(24);
  // Set when the user clicks the link FAB on a selected object. The
  // LinkTargetPicker reads this to know which object's link it's editing
  // and which hotspot box to record on save.
  const [linkRequest, setLinkRequest] = useState<LinkRequest | null>(null);
  // Mirror of PageEditor's selection count so the toolbar can disable its
  // layer-order buttons when nothing is selected. We don't lift the full
  // selection state up — only the cardinality, which is all the toolbar
  // needs to render correctly.
  const [hasSelection, setHasSelection] = useState(false);
  const [backgroundPickerOpen, setBackgroundPickerOpen] = useState(false);
  // Imperative handle into the live PageEditor so the toolbar (which lives
  // in this parent) can trigger selection-scoped actions without the
  // selection itself having to flow up here.
  const editorApiRef = useRef<PageEditorImperativeApi | null>(null);

  // Reset state when the page changes (adjust-state-while-rendering, so the
  // loading effect below stays free of synchronous setState).
  const [prevPage, setPrevPage] = useState(currentPage);
  if (currentPage !== prevPage) {
    setPrevPage(currentPage);
    setFetchedSvg(null);
    setError(null);
    setJumpMenuOpen(false);
    setHasSelection(false);
    setBackgroundPickerOpen(false);
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

  // objectId → target page map for links on the current source page, so the
  // editor can resolve Ctrl/Cmd+click without re-scanning the link array per
  // pointer event.
  const linkedObjectTargets = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    for (const link of objectLinks ?? []) {
      if (link.sourcePage === currentPage) map[link.objectId] = link.targetPage;
    }
    return map;
  }, [objectLinks, currentPage]);

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
        <div className="relative flex-1 h-full w-full bg-slate-100">
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
                textSize={textSize}
                eraserSize={eraserSize}
                linkedObjectTargets={linkedObjectTargets}
                imperativeApiRef={editorApiRef}
                onSelectionChange={(sel) => setHasSelection(sel.length > 0)}
                onChange={onEditChange}
                onRequestLink={setLinkRequest}
                onFollowLink={onPageChange}
                onClonedLinks={(clones: ClonedLinkInfo[]) => {
                  if (clones.length === 0) return;
                  const links: NotebookObjectLink[] = clones.map((c) => ({
                    id: crypto.randomUUID(),
                    objectId: c.newObjectId,
                    sourcePage: currentPage,
                    targetPage: c.targetPage,
                    xFrac: c.box.xFrac,
                    yFrac: c.box.yFrac,
                    wFrac: c.box.wFrac,
                    hFrac: c.box.hFrac,
                  }));
                  if (onSaveObjectLinksBatch) {
                    onSaveObjectLinksBatch(links);
                  } else {
                    // Fallback: per-link save, accepting an extra Firestore
                    // write per clone for older host wiring.
                    for (const link of links) onSaveObjectLink?.(link);
                  }
                }}
              />
              {linkRequest &&
                (() => {
                  const existingTarget =
                    objectLinks?.find(
                      (l) =>
                        l.objectId === linkRequest.objectId &&
                        l.sourcePage === currentPage
                    )?.targetPage ?? null;
                  return (
                    <LinkTargetPicker
                      pageUrls={pageUrls}
                      sections={sections}
                      sourcePage={currentPage}
                      currentTarget={existingTarget}
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
                      onJumpToTarget={
                        existingTarget !== null
                          ? () => {
                              setLinkRequest(null);
                              onPageChange(existingTarget);
                            }
                          : undefined
                      }
                      onClose={() => setLinkRequest(null)}
                    />
                  );
                })()}
              {backgroundPickerOpen && (
                <BackgroundPicker
                  onApply={(change) => {
                    editorApiRef.current?.setBackground(change);
                    setBackgroundPickerOpen(false);
                  }}
                  onClose={() => setBackgroundPickerOpen(false)}
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
            textSize={textSize}
            eraserSize={eraserSize}
            hasSelection={hasSelection}
            onToolChange={setTool}
            onColorChange={setPenColor}
            onWidthChange={setPenWidth}
            onTextSizeChange={setTextSize}
            onEraserSizeChange={setEraserSize}
            onReorder={(direction) => editorApiRef.current?.reorder(direction)}
            onOpenBackgroundPicker={() => setBackgroundPickerOpen(true)}
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
/**
 * Top-level toolbar buttons. Shape variants live behind a single "Shapes"
 * popover entry so the bar stays compact; the popover sets the active
 * shape sub-tool directly. Select / Eraser take no options, so they
 * don't carry a popover. Pen / Highlighter / Text expose color (and width
 * where it's meaningful) via their per-button popover, matching the
 * DrawingWidget's pattern that teachers already know from the whiteboard.
 */
type PopoverKey = 'pen' | 'highlighter' | 'text' | 'shapes' | 'eraser';

const SHAPE_SUB_TOOLS: ReadonlyArray<{
  tool: 'rect' | 'circle' | 'line' | 'arrow';
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
}> = [
  { tool: 'rect', Icon: Square, label: 'Rectangle' },
  { tool: 'circle', Icon: Circle, label: 'Circle' },
  { tool: 'line', Icon: Minus, label: 'Line' },
  { tool: 'arrow', Icon: MoveUpRight, label: 'Arrow' },
];

const SHAPE_TOOL_KEYS: ReadonlySet<Tool> = new Set([
  'rect',
  'circle',
  'line',
  'arrow',
]);

const Toolbar: React.FC<{
  tool: Tool;
  penColor: string;
  penWidth: number;
  textSize: number;
  eraserSize: number;
  hasSelection: boolean;
  onToolChange: (t: Tool) => void;
  onColorChange: (c: string) => void;
  onWidthChange: (w: number) => void;
  onTextSizeChange: (s: number) => void;
  onEraserSizeChange: (s: number) => void;
  onReorder: (direction: 'forward' | 'backward' | 'front' | 'back') => void;
  onOpenBackgroundPicker: () => void;
}> = ({
  tool,
  penColor,
  penWidth,
  textSize,
  eraserSize,
  hasSelection,
  onToolChange,
  onColorChange,
  onWidthChange,
  onTextSizeChange,
  onEraserSizeChange,
  onReorder,
  onOpenBackgroundPicker,
}) => {
  const [popover, setPopover] = useState<PopoverKey | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useClickOutside(containerRef, () => setPopover(null));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPopover(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Map a top-level tool button to (a) which tool it activates and
  // (b) which popover it opens. Selecting Shapes opens the popover but
  // does NOT change the active tool — the shape sub-button inside the
  // popover does that. Select has no popover.
  const handleToolClick = (
    key: 'select' | 'pen' | 'highlighter' | 'eraser' | 'text' | 'shapes'
  ) => {
    if (key === 'select') {
      onToolChange(key);
      setPopover(null);
      return;
    }
    if (key === 'shapes') {
      setPopover((p) => (p === 'shapes' ? null : 'shapes'));
      return;
    }
    onToolChange(key);
    setPopover((p) => (p === key ? null : key));
  };

  const isShapeActive = SHAPE_TOOL_KEYS.has(tool);
  const activeShape = isShapeActive
    ? SHAPE_SUB_TOOLS.find((s) => s.tool === tool)
    : null;
  const ShapesIcon = activeShape?.Icon ?? Shapes;

  // Per-tool button row builder. Returns JSX (not a component) to satisfy
  // the static-components rule while keeping the markup readable. Active
  // state covers both "this tool is currently selected" and (for Shapes)
  // "the active tool is one of my sub-tools".
  type ToolButtonKey =
    | 'select'
    | 'pen'
    | 'highlighter'
    | 'eraser'
    | 'text'
    | 'shapes';
  const renderToolButton = (
    keyId: ToolButtonKey,
    Icon: React.ComponentType<{ className?: string }>,
    label: string,
    isActive: boolean,
    hasPopover: boolean
  ) => (
    <button
      key={keyId}
      type="button"
      onClick={() => handleToolClick(keyId)}
      aria-pressed={isActive}
      aria-haspopup={hasPopover ? 'dialog' : undefined}
      aria-expanded={hasPopover ? popover === keyId : undefined}
      title={label}
      aria-label={label}
      className={`flex items-center justify-center rounded-md transition-colors ${
        isActive
          ? 'bg-brand-blue-primary text-white shadow-sm'
          : 'text-slate-300 hover:bg-white/10'
      }`}
      style={{
        width: 'min(36px, 8cqmin)',
        height: 'min(32px, 7cqmin)',
      }}
    >
      <Icon className="h-4 w-4" />
    </button>
  );

  return (
    <div
      ref={containerRef}
      className="relative bg-slate-900/95 backdrop-blur"
      style={{ padding: 'min(8px, 2cqmin) min(12px, 2.5cqmin)' }}
    >
      <div
        className="mx-auto flex flex-wrap items-center justify-center"
        style={{
          gap: 'min(12px, 2.5cqmin)',
          rowGap: 'min(6px, 1.5cqmin)',
          maxWidth: '720px',
        }}
      >
        {/* Tool segmented control — 6 entries, popover holds the options */}
        <div
          role="group"
          aria-label="Drawing tool"
          className="flex items-stretch rounded-lg bg-slate-950/40 ring-1 ring-white/5"
          style={{ gap: 'min(2px, 0.5cqmin)', padding: 'min(4px, 1cqmin)' }}
        >
          {renderToolButton(
            'select',
            MousePointer2,
            'Select',
            tool === 'select',
            false
          )}
          {renderToolButton('pen', Pen, 'Pen', tool === 'pen', true)}
          {renderToolButton(
            'highlighter',
            Highlighter,
            'Highlighter',
            tool === 'highlighter',
            true
          )}
          {renderToolButton(
            'eraser',
            Eraser,
            'Eraser',
            tool === 'eraser',
            true
          )}
          {renderToolButton('text', Type, 'Text', tool === 'text', true)}
          {renderToolButton(
            'shapes',
            ShapesIcon,
            activeShape ? `Shapes — ${activeShape.label}` : 'Shapes',
            isShapeActive,
            true
          )}
        </div>

        {/* Layer-order group — disabled visual when nothing is selected. */}
        <div
          role="group"
          aria-label="Layer order"
          className={`flex items-stretch rounded-lg bg-slate-950/40 ring-1 ring-white/5 transition-opacity ${
            hasSelection ? 'opacity-100' : 'opacity-40'
          }`}
          style={{ gap: 'min(2px, 0.5cqmin)', padding: 'min(4px, 1cqmin)' }}
        >
          {(
            [
              {
                dir: 'front',
                Icon: BringToFront,
                label: 'Bring to front (Cmd+Shift+])',
              },
              {
                dir: 'forward',
                Icon: ChevronUp,
                label: 'Bring forward (Cmd+])',
              },
              {
                dir: 'backward',
                Icon: ChevronDown,
                label: 'Send backward (Cmd+[)',
              },
              {
                dir: 'back',
                Icon: SendToBack,
                label: 'Send to back (Cmd+Shift+[)',
              },
            ] as const
          ).map(({ dir, Icon, label }) => (
            <button
              key={dir}
              type="button"
              onClick={() => onReorder(dir)}
              disabled={!hasSelection}
              title={label}
              aria-label={label}
              className="flex items-center justify-center rounded-md text-slate-300 hover:bg-white/10 transition-colors disabled:cursor-default"
              style={{
                width: 'min(28px, 6cqmin)',
                height: 'min(28px, 6cqmin)',
              }}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>

        {/* Background — always available since it's a page-level action. */}
        <button
          type="button"
          onClick={onOpenBackgroundPicker}
          title="Page background"
          aria-label="Page background"
          className="flex items-center rounded-md text-slate-300 hover:bg-white/10 transition-colors"
          style={{
            padding: 'min(4px, 1cqmin) min(10px, 2cqmin)',
            gap: 'min(6px, 1.5cqmin)',
            height: 'min(36px, 8cqmin)',
          }}
        >
          <PaintBucket className="h-4 w-4" />
          <span
            className="font-bold uppercase tracking-tight"
            style={{ fontSize: 'min(11px, 2.6cqmin)' }}
          >
            Background
          </span>
        </button>
      </div>

      {/* Popover — anchored above the toolbar, centered horizontally.
          bg-slate-900/95 is intentionally NOT bg-slate-900/98 — Tailwind
          only ships standard opacity steps (0, 5, 10, 20, ..., 95, 100);
          /98 falls through to no-bg and the popover renders transparent. */}
      {popover && (
        <div
          role="dialog"
          aria-label={`${popover} options`}
          className="absolute z-20 left-1/2 -translate-x-1/2 rounded-xl bg-slate-900/95 backdrop-blur-md shadow-2xl border border-white/10"
          style={{
            bottom: 'calc(100% + 8px)',
            padding: 'min(12px, 2.5cqmin)',
            minWidth: '300px',
          }}
        >
          {popover === 'shapes' && (
            <div
              className="flex items-stretch rounded-lg bg-slate-950/60 ring-1 ring-white/5"
              style={{
                gap: 'min(2px, 0.5cqmin)',
                padding: 'min(4px, 1cqmin)',
                marginBottom: 'min(12px, 2.5cqmin)',
              }}
            >
              {SHAPE_SUB_TOOLS.map(({ tool: subTool, Icon, label }) => {
                const isActive = tool === subTool;
                return (
                  <button
                    key={subTool}
                    type="button"
                    onClick={() => {
                      onToolChange(subTool);
                      // Keep popover open so teachers can also tweak the
                      // shape's color/width after picking the variant.
                    }}
                    aria-pressed={isActive}
                    title={label}
                    aria-label={label}
                    className={`flex-1 flex items-center justify-center rounded-md transition-colors ${
                      isActive
                        ? 'bg-brand-blue-primary text-white shadow-sm'
                        : 'text-slate-300 hover:bg-white/10'
                    }`}
                    style={{ height: 'min(36px, 8cqmin)' }}
                  >
                    <Icon className="h-5 w-5" />
                  </button>
                );
              })}
            </div>
          )}

          {/* Color row — hidden when the active popover is the eraser
              (eraser doesn't paint, so it has no current color). */}
          {popover !== 'eraser' && (
            <div
              className="flex items-center"
              style={{ gap: 'min(8px, 2cqmin)', flexWrap: 'wrap' }}
            >
              {PEN_COLORS.map((c) => {
                const isActive = penColor === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onColorChange(c)}
                    title={`Color ${c}`}
                    aria-label={`Color ${c}`}
                    aria-pressed={isActive}
                    className={`rounded-full transition-transform ${
                      isActive
                        ? 'scale-110 ring-2 ring-white shadow-sm'
                        : 'ring-1 ring-white/30 hover:scale-110'
                    }`}
                    style={{
                      width: 'min(24px, 5cqmin)',
                      height: 'min(24px, 5cqmin)',
                      backgroundColor: c,
                    }}
                  />
                );
              })}
              <label
                className="flex items-center justify-center rounded-full bg-slate-800/60 ring-1 ring-white/30 text-slate-300 hover:bg-slate-700 cursor-pointer transition-colors"
                style={{
                  width: 'min(24px, 5cqmin)',
                  height: 'min(24px, 5cqmin)',
                }}
                title="Custom color"
              >
                <span className="text-base leading-none" aria-hidden>
                  +
                </span>
                <input
                  type="color"
                  value={penColor}
                  onChange={(e) => onColorChange(e.target.value)}
                  className="sr-only"
                  aria-label="Custom color"
                />
              </label>
            </div>
          )}

          {/* Size slider — replaces the previous thin/medium/thick presets
              with a continuous range. The active dimension depends on the
              popover: pen/highlighter/shapes drive strokeWidth, text
              drives fontSize, eraser drives hit-radius. */}
          {(() => {
            let value: number;
            let setValue: (v: number) => void;
            let min: number;
            let max: number;
            let label: string;
            let suffix: string;
            if (popover === 'text') {
              value = textSize;
              setValue = onTextSizeChange;
              min = 12;
              max = 96;
              label = 'Text size';
              suffix = 'pt';
            } else if (popover === 'eraser') {
              value = eraserSize;
              setValue = onEraserSizeChange;
              min = 4;
              max = 80;
              label = 'Eraser size';
              suffix = 'px';
            } else {
              value = penWidth;
              setValue = onWidthChange;
              min = 1;
              max = 40;
              label = 'Stroke width';
              suffix = 'px';
            }
            // Visual swatch on the left previews the current size. Capped
            // visually at 28px so a huge value doesn't blow up the popover,
            // while the numeric label on the right tells the truth.
            const swatchSize = Math.max(4, Math.min(28, value));
            return (
              <div
                className="flex items-center"
                style={{
                  gap: 'min(10px, 2cqmin)',
                  marginTop:
                    popover !== 'eraser' ? 'min(12px, 2.5cqmin)' : '0px',
                }}
              >
                <span
                  aria-hidden
                  className="block rounded-full bg-white shrink-0"
                  style={{
                    width: `${swatchSize}px`,
                    height: `${swatchSize}px`,
                  }}
                />
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={1}
                  value={value}
                  onChange={(e) => setValue(parseInt(e.target.value, 10))}
                  aria-label={label}
                  className="flex-1 h-1.5 rounded-full bg-slate-700 appearance-none cursor-pointer accent-brand-blue-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-light"
                />
                <span className="font-mono text-xs text-slate-300 w-12 text-right tabular-nums">
                  {value}
                  {suffix}
                </span>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

/**
 * Page-background picker. Centered modal mirroring LinkTargetPicker's
 * shape (backdrop + click-outside + ESC) so the editor's secondary
 * dialogs all feel like the same dialect. Three modes:
 *   1. Solid color
 *   2. Solid color + repeating pattern (lines/grid/dots)
 *   3. Uploaded image, embedded as a data URL so the page SVG remains
 *      self-contained
 * "Apply" commits to the live SVG via PageEditor's imperative API; the
 * autosave debounce picks it up from the resulting emitChange.
 */
const BACKGROUND_COLORS = [
  '#ffffff',
  '#f8fafc',
  '#fef3c7',
  '#dbeafe',
  '#dcfce7',
  '#fce7f3',
  '#1f2937',
];

const BackgroundPicker: React.FC<{
  onApply: (change: PageBackgroundChange) => void;
  onClose: () => void;
}> = ({ onApply, onClose }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  useClickOutside(panelRef, onClose);
  const [mode, setMode] = useState<'color' | 'pattern' | 'image'>('color');
  const [color, setColor] = useState<string>(BACKGROUND_COLORS[0]);
  const [pattern, setPattern] = useState<'lines' | 'grid' | 'dots'>('grid');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setImageDataUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const apply = () => {
    if (mode === 'color') onApply({ kind: 'color', color });
    else if (mode === 'pattern') onApply({ kind: 'pattern', pattern, color });
    else if (imageDataUrl) onApply({ kind: 'image', dataUrl: imageDataUrl });
  };

  const modeBtn = (target: 'color' | 'pattern' | 'image', label: string) => (
    <button
      type="button"
      onClick={() => setMode(target)}
      aria-pressed={mode === target}
      className={`rounded-lg font-bold uppercase tracking-tight transition-colors ${
        mode === target
          ? 'bg-indigo-600 text-white shadow-sm'
          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
      }`}
      style={{
        padding: 'min(6px, 1.5cqmin) min(12px, 2.5cqmin)',
        fontSize: 'min(11px, 2.6cqmin)',
      }}
    >
      {label}
    </button>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Page background"
      className="absolute inset-0 z-30 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm"
    >
      <div
        ref={panelRef}
        className="bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col"
        style={{
          width: 'min(440px, 92cqmin)',
          maxHeight: 'min(560px, 86cqmin)',
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
            <PaintBucket
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
              Page background
            </span>
          </div>
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

        <div
          className="flex"
          style={{
            gap: 'min(8px, 2cqmin)',
            padding: 'min(12px, 3cqmin)',
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          {modeBtn('color', 'Color')}
          {modeBtn('pattern', 'Pattern')}
          {modeBtn('image', 'Image')}
        </div>

        <div
          className="flex-1 overflow-y-auto"
          style={{ padding: 'min(16px, 3.5cqmin)' }}
        >
          {(mode === 'color' || mode === 'pattern') && (
            <div>
              <div
                className="font-black uppercase tracking-widest text-slate-400"
                style={{
                  fontSize: 'min(10px, 2.5cqmin)',
                  marginBottom: 'min(8px, 2cqmin)',
                }}
              >
                Base color
              </div>
              <div
                className="flex flex-wrap items-center"
                style={{ gap: 'min(8px, 2cqmin)' }}
              >
                {BACKGROUND_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    aria-label={`Color ${c}`}
                    aria-pressed={color === c}
                    className={`rounded-full transition-transform ${
                      color === c
                        ? 'scale-110 ring-2 ring-indigo-600'
                        : 'ring-1 ring-slate-300 hover:scale-105'
                    }`}
                    style={{
                      width: 'min(28px, 6cqmin)',
                      height: 'min(28px, 6cqmin)',
                      backgroundColor: c,
                    }}
                  />
                ))}
                <input
                  type="color"
                  aria-label="Custom color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="rounded-md border border-slate-300 cursor-pointer"
                  style={{
                    width: 'min(34px, 7cqmin)',
                    height: 'min(28px, 6cqmin)',
                  }}
                />
              </div>
            </div>
          )}
          {mode === 'pattern' && (
            <div style={{ marginTop: 'min(16px, 3.5cqmin)' }}>
              <div
                className="font-black uppercase tracking-widest text-slate-400"
                style={{
                  fontSize: 'min(10px, 2.5cqmin)',
                  marginBottom: 'min(8px, 2cqmin)',
                }}
              >
                Pattern
              </div>
              <div
                className="grid grid-cols-3"
                style={{ gap: 'min(8px, 2cqmin)' }}
              >
                {(
                  [
                    { key: 'lines', label: 'Lines' },
                    { key: 'grid', label: 'Grid' },
                    { key: 'dots', label: 'Dots' },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPattern(key)}
                    aria-pressed={pattern === key}
                    className={`rounded-xl border-2 overflow-hidden transition-all ${
                      pattern === key
                        ? 'border-indigo-600 shadow-md'
                        : 'border-slate-200 hover:border-indigo-300'
                    }`}
                    style={{ aspectRatio: '3 / 2' }}
                    aria-label={label}
                    title={label}
                  >
                    <PatternPreview pattern={key} color={color} />
                    <div
                      className={`text-center font-bold ${
                        pattern === key
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-50 text-slate-700'
                      }`}
                      style={{
                        fontSize: 'min(10px, 2.5cqmin)',
                        padding: 'min(2px, 0.5cqmin)',
                      }}
                    >
                      {label}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {mode === 'image' && (
            <div className="flex flex-col items-center">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl transition-colors"
                style={{
                  padding: 'min(10px, 2.5cqmin) min(20px, 4cqmin)',
                  gap: 'min(8px, 2cqmin)',
                }}
              >
                <Upload
                  style={{
                    width: 'min(16px, 4cqmin)',
                    height: 'min(16px, 4cqmin)',
                  }}
                />
                <span
                  className="font-bold uppercase tracking-tight"
                  style={{ fontSize: 'min(12px, 3cqmin)' }}
                >
                  Choose image
                </span>
              </button>
              {imageDataUrl && (
                <img
                  src={imageDataUrl}
                  alt="Background preview"
                  className="rounded-xl border border-slate-200"
                  style={{
                    marginTop: 'min(16px, 3.5cqmin)',
                    maxWidth: '100%',
                    maxHeight: '200px',
                    objectFit: 'contain',
                  }}
                />
              )}
            </div>
          )}
        </div>

        <div
          className="flex justify-end border-t border-slate-200"
          style={{
            padding: 'min(12px, 3cqmin)',
            gap: 'min(8px, 2cqmin)',
          }}
        >
          <button
            onClick={onClose}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors font-bold uppercase tracking-tight"
            style={{
              padding: 'min(8px, 2cqmin) min(16px, 3cqmin)',
              fontSize: 'min(11px, 2.6cqmin)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={apply}
            disabled={mode === 'image' && !imageDataUrl}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-bold uppercase tracking-tight disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              padding: 'min(8px, 2cqmin) min(16px, 3cqmin)',
              fontSize: 'min(11px, 2.6cqmin)',
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Small SVG-pattern preview for the picker tiles. Authored inline so the
 * tile previews share the exact same pattern geometry the editor injects
 * into the page SVG via setBackground.
 */
const PatternPreview: React.FC<{
  pattern: 'lines' | 'grid' | 'dots';
  color: string;
}> = ({ pattern, color }) => {
  const id = `bg-preview-${pattern}`;
  return (
    <svg
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      style={{ display: 'block', background: color }}
    >
      <defs>
        <pattern id={id} width="14" height="14" patternUnits="userSpaceOnUse">
          {pattern === 'lines' && (
            <line
              x1="0"
              y1="14"
              x2="14"
              y2="14"
              stroke="#94a3b8"
              strokeWidth="1"
            />
          )}
          {pattern === 'grid' && (
            <path
              d="M 14 0 L 0 0 0 14"
              fill="none"
              stroke="#cbd5e1"
              strokeWidth="1"
            />
          )}
          {pattern === 'dots' && (
            <circle cx="7" cy="7" r="1.2" fill="#94a3b8" />
          )}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
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
