import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Clipboard,
  ClipboardPaste,
  Copy,
  Film,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  SortableList,
  type SortableListDragHandleProps,
} from '@/components/common/SortableList';
import {
  GL_MEDIA_ACCEPT,
  thumbnailUrl,
  type GuidedLearningMediaKind,
} from '@/utils/guidedLearningMedia';
import { CaptureMenuButton } from '../editorShared/CaptureMenuButton';
import { ScreenCaptureModal, type CaptureMode } from '../ScreenCaptureModal';
import type { GuidedLearningEditorController } from '../useGuidedLearningEditorState';
import { useDialog } from '@/context/useDialog';
import { StudioMenu } from './StudioMenu';
import { modShortcutLabel } from './useStudioShortcuts';
import { useFileDrop } from './useFileDrop';

interface SlideItem {
  id: string;
  index: number;
  url: string;
  thumb: string;
  kind: GuidedLearningMediaKind;
}

const getSlideId = (s: SlideItem) => s.id;

const CurrentSlideContext = React.createContext<{
  index: number;
  counts: number[];
}>({ index: 0, counts: [] });

interface SlideThumbProps {
  slide: SlideItem;
  handle: SortableListDragHandleProps;
  onSelect: (index: number) => void;
  onDelete: (index: number) => void;
  onDuplicate: (index: number) => void;
  onPaste: (index: number) => void;
  /** Steps waiting on the clipboard. */
  pasteCount: number;
}

const SlideThumbBody = React.memo(function SlideThumbBody({
  slide,
  handle,
  onSelect,
  onDelete,
  onDuplicate,
  onPaste,
  pasteCount,
  current,
  count,
}: SlideThumbProps & { current: boolean; count: number }) {
  const { t } = useTranslation();
  const n = slide.index + 1;
  return (
    <div className="group relative">
      <button
        type="button"
        {...handle.attributes}
        onPointerDown={
          handle.listeners?.onPointerDown as
            | React.PointerEventHandler<HTMLButtonElement>
            | undefined
        }
        onClick={() => onSelect(slide.index)}
        aria-current={current}
        aria-label={t('glStudio.slideSummary', {
          n,
          count: count,
        })}
        className={`relative block aspect-video w-full cursor-grab touch-none overflow-hidden rounded-lg border-2 bg-slate-900 active:cursor-grabbing ${
          current
            ? 'border-brand-blue-primary'
            : 'border-transparent hover:border-slate-300'
        } ${handle.isDragging ? 'opacity-60' : ''}`}
      >
        {slide.kind === 'video' ? (
          <video
            src={slide.url}
            muted
            preload="metadata"
            className="pointer-events-none h-full w-full object-contain"
          />
        ) : (
          <img
            src={slide.thumb}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className="pointer-events-none h-full w-full object-contain"
          />
        )}
        <span className="absolute left-1 top-1 flex items-center gap-1 rounded bg-slate-900/80 px-1.5 text-xxs font-bold text-white">
          {slide.kind === 'video' && (
            <Film className="h-3 w-3" aria-hidden="true" />
          )}
          {n}
        </span>
        <span className="absolute bottom-1 left-1 rounded bg-white/90 px-1.5 text-xxs font-bold text-slate-700">
          {t('glStudio.stepCount', {
            count: count,
          })}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onDelete(slide.index)}
        aria-label={t('glStudio.deleteSlideN', { n })}
        title={t('glStudio.deleteSlideN', { n })}
        className="absolute right-1 top-1 rounded-md bg-white/90 p-1 text-slate-600 opacity-0 shadow-sm transition-opacity hover:text-red-700 focus:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <div className="absolute bottom-1 right-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 has-[[aria-expanded=true]]:opacity-100 [@media(hover:none)]:opacity-100">
        <StudioMenu
          label={t('glStudio.slideActionsN', { n })}
          testId={`gl-studio-slide-menu-${slide.index}`}
          triggerClassName="rounded-md bg-white/90 p-1 text-slate-600 shadow-sm hover:text-slate-900"
          items={[
            {
              id: 'duplicate',
              label: t('glStudio.duplicateSlide'),
              icon: Copy,
              hint: current ? modShortcutLabel('d') : undefined,
              onSelect: () => onDuplicate(slide.index),
            },
            {
              id: 'paste',
              label: t('glStudio.pasteStepsHere'),
              icon: ClipboardPaste,
              disabled: pasteCount === 0,
              onSelect: () => onPaste(slide.index),
            },
          ]}
        />
      </div>
    </div>
  );
});

// Only the thumbnails whose state changed re-render when the current slide moves.
const SlideThumb: React.FC<SlideThumbProps> = (props) => {
  const { index, counts } = useContext(CurrentSlideContext);
  const i = props.slide.index;
  return (
    <SlideThumbBody {...props} current={i === index} count={counts[i] ?? 0} />
  );
};

const SlideList = React.memo(function SlideList({
  slides,
  onReorder,
  renderItem,
}: {
  slides: SlideItem[];
  onReorder: (next: SlideItem[], movedId: string) => void;
  renderItem: (
    slide: SlideItem,
    handle: SortableListDragHandleProps
  ) => React.ReactNode;
}) {
  return (
    <SortableList
      items={slides}
      getId={getSlideId}
      onReorder={onReorder}
      className="flex flex-col gap-2"
      renderItem={renderItem}
    />
  );
});

type FilmstripState = Pick<
  GuidedLearningEditorController,
  | 'imageUrls'
  | 'imageKinds'
  | 'slideThumbnails'
  | 'currentImageIndex'
  | 'setCurrentImageIndex'
  | 'deleteImage'
  | 'duplicateSlide'
  | 'pasteSteps'
  | 'clipboardStepCount'
  | 'uploading'
  | 'uploadProgress'
  | 'uploadFromFiles'
  | 'uploadFromClipboard'
  | 'addCapturedMedia'
>;

interface FilmstripBodyProps extends FilmstripState {
  stepCounts: number[];
  /** `order[i]` is the old index of the slide now at `i`; `moved` is the dragged slide's old index. */
  onReorderSlides: (order: number[], moved: number) => void;
  collapsed: boolean;
  onToggleCollapsed?: () => void;
}

const sameProps = (a: FilmstripBodyProps, b: FilmstripBodyProps) =>
  (Object.keys(a) as (keyof FilmstripBodyProps)[]).every((k) =>
    k === 'stepCounts'
      ? a.stepCounts.length === b.stepCounts.length &&
        a.stepCounts.every((c, i) => c === b.stepCounts[i])
      : Object.is(a[k], b[k])
  );

// Step edits leave the slides as they were, so typing skips the whole strip.
const FilmstripBody = React.memo(function FilmstripBody({
  imageUrls,
  imageKinds,
  slideThumbnails,
  currentImageIndex,
  setCurrentImageIndex,
  onReorderSlides,
  deleteImage,
  duplicateSlide,
  pasteSteps,
  clipboardStepCount,
  uploading,
  uploadProgress,
  uploadFromFiles,
  uploadFromClipboard,
  addCapturedMedia,
  stepCounts,
  collapsed,
  onToggleCollapsed,
}: FilmstripBodyProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [captureMode, setCaptureMode] = useState<CaptureMode | null>(null);
  const drop = useFileDrop((files) => void uploadFromFiles(files));

  // Slide URLs can repeat, so items are keyed by position and reordered by index.
  const slides = useMemo<SlideItem[]>(
    () =>
      imageUrls.map((url, index) => ({
        id: `slide-${index}`,
        index,
        url,
        thumb: thumbnailUrl(url, slideThumbnails),
        kind: imageKinds[index] ?? 'image',
      })),
    [imageUrls, imageKinds, slideThumbnails]
  );
  const currentSlide = useMemo(
    () => ({ index: currentImageIndex, counts: stepCounts }),
    [currentImageIndex, stepCounts]
  );
  const onReorder = useCallback(
    (next: SlideItem[], movedId: string) => {
      const moved = next.find((s) => s.id === movedId);
      if (moved)
        onReorderSlides(
          next.map((s) => s.index),
          moved.index
        );
    },
    [onReorderSlides]
  );
  const renderSlide = useCallback(
    (slide: SlideItem, handle: SortableListDragHandleProps) => (
      <SlideThumb
        slide={slide}
        handle={handle}
        onSelect={setCurrentImageIndex}
        onDelete={deleteImage}
        onDuplicate={duplicateSlide}
        onPaste={pasteSteps}
        pasteCount={clipboardStepCount}
      />
    ),
    [
      setCurrentImageIndex,
      deleteImage,
      duplicateSlide,
      pasteSteps,
      clipboardStepCount,
    ]
  );

  // Ctrl/⌘+V anywhere outside a text field adds the clipboard image as a slide.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
        f.type.startsWith('image/')
      );
      if (files.length === 0) return;
      e.preventDefault();
      void uploadFromFiles(files);
    };
    window.addEventListener('paste', onPaste, true);
    return () => window.removeEventListener('paste', onPaste, true);
  }, [uploadFromFiles]);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    await uploadFromFiles(files);
    e.target.value = '';
  };

  const dropOverlay = drop.active && (
    <div className="pointer-events-none absolute inset-1 flex items-center justify-center rounded-xl border-2 border-dashed border-brand-blue-primary bg-brand-blue-primary/10 p-3 text-center text-xs font-bold text-brand-blue-primary">
      {t('glStudio.dropToAdd')}
    </div>
  );

  if (collapsed) {
    return (
      <nav
        aria-label={t('glStudio.slides')}
        data-testid="gl-studio-filmstrip"
        data-collapsed="true"
        className="relative flex min-h-0 flex-col items-center gap-2 border-r border-slate-200 bg-white py-3"
        {...drop.handlers}
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={false}
          aria-label={t('glStudio.showSlides')}
          title={t('glStudio.showSlides')}
          data-testid="gl-studio-filmstrip-toggle"
          className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
        >
          <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
        </button>
        {imageUrls.length > 0 && (
          <span className="text-center text-xxs font-bold tabular-nums text-slate-600">
            {t('glStudio.slidePosition', {
              n: currentImageIndex + 1,
              total: imageUrls.length,
            })}
          </span>
        )}
        {uploadProgress && (
          <Loader2
            role="img"
            className="h-4 w-4 animate-spin text-brand-blue-primary"
            aria-label={t('glStudio.uploadingFile', {
              name: uploadProgress.fileName,
              current: uploadProgress.current,
              total: uploadProgress.total,
            })}
          />
        )}
        {dropOverlay}
      </nav>
    );
  }

  return (
    <nav
      aria-label={t('glStudio.slides')}
      data-testid="gl-studio-filmstrip"
      className="relative flex min-h-0 flex-col border-r border-slate-200 bg-white"
      {...drop.handlers}
    >
      <div className="flex shrink-0 items-center gap-2 py-2 pl-3 pr-1.5">
        <h2 className="text-xxs font-bold uppercase tracking-wider text-slate-500">
          {t('glStudio.slides')}
        </h2>
        <span className="min-w-0 flex-1 truncate text-right text-xxs text-slate-400">
          {imageUrls.length > 1 && t('glStudio.dragToReorder')}
        </span>
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-expanded
            aria-label={t('glStudio.hideSlides')}
            title={t('glStudio.hideSlides')}
            data-testid="gl-studio-filmstrip-toggle"
            className="shrink-0 rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
          >
            <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 custom-scrollbar">
        {slides.length === 0 && !uploading && (
          <p className="rounded-lg border-2 border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-500">
            {t('glStudio.filmstripEmpty')}
          </p>
        )}
        <CurrentSlideContext.Provider value={currentSlide}>
          <SlideList
            slides={slides}
            onReorder={onReorder}
            renderItem={renderSlide}
          />
        </CurrentSlideContext.Provider>
        {uploadProgress && (
          <p className="mt-2 flex items-center gap-1.5 text-xxs font-bold text-brand-blue-primary">
            <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
            <span className="truncate">
              {t('glStudio.uploadingFile', {
                name: uploadProgress.fileName,
                current: uploadProgress.current,
                total: uploadProgress.total,
              })}
            </span>
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-1.5 border-t border-slate-200 p-3">
        <input
          ref={fileInputRef}
          type="file"
          accept={GL_MEDIA_ACCEPT}
          multiple
          className="hidden"
          onChange={handleFiles}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-blue-primary px-3 py-1.5 text-sm font-bold text-white transition-colors hover:bg-brand-blue-dark"
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          {t('glStudio.addMedia')}
        </button>
        <div className="flex [&_button]:w-full [&_button]:justify-center [&>*]:flex-1">
          <CaptureMenuButton onPick={setCaptureMode} />
        </div>
        <button
          type="button"
          onClick={() => void uploadFromClipboard()}
          title={t('glStudio.pasteHint')}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 transition-colors hover:border-slate-400"
        >
          <Clipboard className="h-4 w-4" aria-hidden="true" />
          {t('glStudio.paste')}
        </button>
      </div>
      {dropOverlay}
      {captureMode && (
        <ScreenCaptureModal
          mode={captureMode}
          onAddMedia={addCapturedMedia}
          onClose={() => setCaptureMode(null)}
        />
      )}
    </nav>
  );
}, sameProps);

interface StudioFilmstripProps {
  state: GuidedLearningEditorController;
  /** Deletes a slide; the Studio passes one that offers Undo. */
  onDeleteSlide?: (index: number) => void;
  /** Folded to a narrow rail that shows only the current slide. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

/** Left column: slide thumbnails to pick, reorder, add and delete. */
export const StudioFilmstrip: React.FC<StudioFilmstripProps> = ({
  state,
  onDeleteSlide,
  collapsed = false,
  onToggleCollapsed,
}) => {
  const { t } = useTranslation();
  const { showConfirm } = useDialog();
  const { steps, imageUrls, reorderImages, slideMoveReordersSteps } = state;
  // Asks only when taking the slide's steps along would change play order.
  const onReorderSlides = useCallback(
    (order: number[], moved: number) => {
      if (!slideMoveReordersSteps(order, moved)) {
        reorderImages(order);
        return;
      }
      void showConfirm(t('glStudio.moveStepsBody'), {
        title: t('glStudio.moveStepsTitle'),
        confirmLabel: t('glStudio.moveStepsYes'),
        cancelLabel: t('glStudio.moveStepsNo'),
      }).then((yes) => reorderImages(order, yes ? moved : undefined));
    },
    [showConfirm, t, reorderImages, slideMoveReordersSteps]
  );
  const stepCounts = useMemo(() => {
    const counts = new Array<number>(imageUrls.length).fill(0);
    for (const s of steps) {
      if (s.imageIndex >= 0 && s.imageIndex < counts.length)
        counts[s.imageIndex]++;
    }
    return counts;
  }, [steps, imageUrls.length]);
  return (
    <FilmstripBody
      imageUrls={imageUrls}
      imageKinds={state.imageKinds}
      slideThumbnails={state.slideThumbnails}
      currentImageIndex={state.currentImageIndex}
      setCurrentImageIndex={state.setCurrentImageIndex}
      onReorderSlides={onReorderSlides}
      deleteImage={onDeleteSlide ?? state.deleteImage}
      duplicateSlide={state.duplicateSlide}
      pasteSteps={state.pasteSteps}
      clipboardStepCount={state.clipboardStepCount}
      uploading={state.uploading}
      uploadProgress={state.uploadProgress}
      uploadFromFiles={state.uploadFromFiles}
      uploadFromClipboard={state.uploadFromClipboard}
      addCapturedMedia={state.addCapturedMedia}
      stepCounts={stepCounts}
      collapsed={collapsed}
      onToggleCollapsed={onToggleCollapsed}
    />
  );
};
