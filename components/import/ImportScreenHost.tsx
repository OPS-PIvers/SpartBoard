import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { WIDGET_DEFAULTS } from '@/config/widgetDefaults';
import { useImportInbox, type ImportInbox } from '@/hooks/useImportInbox';
import { useQuizDocumentImportGate } from '@/hooks/useQuizDocumentImportGate';
import {
  IMPORT_INBOX_EVENT,
  IMPORT_INBOX_PARAM,
  type ImportTarget,
} from '@/utils/import/contract';
import { ImportScreen } from './ImportScreen';
import { ImportInboxNotice } from '@/components/layout/ImportInboxNotice';
import { LazyChunkErrorBoundary } from '@/components/common/LazyChunkErrorBoundary';
import {
  closeImportScreen,
  offerImportHandoff,
  openImportScreen,
  useImportScreenRequest,
  type ImportDropPoint,
  type ImportScreenRequest,
  type PendingSource,
} from './importHandoff';
import { importRoute } from './importTargets';
import { readDroppedPage, type DroppedPage } from './fetchImportPage';
import type { ReferenceWidget } from './reference/referenceLanding';
import { usePhotoReference } from './reference/usePhotoReference';
import { pageSourceKind } from '@/utils/import/pageImages';

// A dropped link read on the server was never a Send, so nothing is removed for it.
const sentIdOf = (source: PendingSource): string | undefined =>
  source.readFromLink ? undefined : source.inboxItem?.id;

// The course checklist pulls in every library it saves to, so it loads only when opened.
const CourseImportHost = lazy(() =>
  import('./course/CourseImportHost').then((m) => ({
    default: m.CourseImportHost,
  }))
);

const QUIZ_DOCUMENT = /\.(pdf|docx|odt|rtf|tst)$/i;
const CARTRIDGE = /\.imscc$/i;

interface ImportScreenHostProps {
  placeAt: (
    point: ImportDropPoint | undefined,
    w: number,
    h: number
  ) => { x: number; y: number };
  placePdf: (file: File, point?: ImportDropPoint) => void;
  placeNotebook: (file: File, point?: ImportDropPoint) => void;
}

/** Shows Import on the board and sends the teacher's pick to a review screen or onto the board (D3, D4). */
export const ImportScreenHost: React.FC<ImportScreenHostProps> = (props) => {
  const request = useImportScreenRequest();
  const { user } = useAuth();
  const [courseFile, setCourseFile] = useState<File | null>(null);
  const inbox = useImportInbox(user?.uid, true);
  // The extension's "Open in SpartBoard" lands on /?importInbox=1 after a Send.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get(IMPORT_INBOX_PARAM) !== '1') return;
    url.searchParams.delete(IMPORT_INBOX_PARAM);
    window.history.replaceState(window.history.state, '', url.toString());
    openImportScreen();
  }, []);
  // In a tab that is already open the extension fires this instead; cancelling it tells the extension it was heard.
  useEffect(() => {
    const onRequest = (event: Event) => {
      event.preventDefault();
      openImportScreen();
    };
    window.addEventListener(IMPORT_INBOX_EVENT, onRequest);
    return () => window.removeEventListener(IMPORT_INBOX_EVENT, onRequest);
  }, []);
  // The notice stays mounted under the window, so a hidden notice stays hidden.
  return (
    <>
      <ImportInboxNotice
        items={inbox.items}
        suppressed={!!request}
        onOpen={() => openImportScreen()}
      />
      {request && (
        <OpenImportScreen
          key={request.openId}
          request={request}
          inbox={inbox}
          onCourse={(file) => {
            closeImportScreen();
            setCourseFile(file);
          }}
          {...props}
        />
      )}
      {courseFile && (
        <LazyChunkErrorBoundary>
          <Suspense fallback={null}>
            <CourseImportHost
              file={courseFile}
              onClose={() => setCourseFile(null)}
            />
          </Suspense>
        </LazyChunkErrorBoundary>
      )}
    </>
  );
};

const OpenImportScreen: React.FC<
  ImportScreenHostProps & {
    request: ImportScreenRequest;
    inbox: ImportInbox;
    onCourse: (file: File) => void;
  }
> = ({ request, inbox, onCourse, placeAt, placePdf, placeNotebook }) => {
  const { canAccessWidget, canAccessFeature } = useAuth();
  const {
    activeDashboard,
    addWidget,
    updateWidget,
    addToast,
    isActiveBoardReadOnly,
  } = useDashboard();
  const canReadQuizDocuments = useQuizDocumentImportGate();
  const photo = usePhotoReference();
  const schoology = canAccessFeature('schoology-quiz-import');
  const dropped = request.source;
  const droppedLink =
    dropped && !dropped.file && !dropped.inboxItem && dropped.url
      ? dropped.url
      : null;
  const [droppedPage, setDroppedPage] = useState<DroppedPage | null>(
    droppedLink && /^https?:\/\//i.test(droppedLink)
      ? { status: 'reading' }
      : null
  );
  const reading = droppedPage?.status === 'reading';
  // A dropped public link is read on the server so its content can become more than an Embed (D17).
  useEffect(() => {
    if (!droppedLink || !reading) return;
    let live = true;
    void readDroppedPage(droppedLink).then((page) => {
      if (live) setDroppedPage(page);
    });
    return () => {
      live = false;
    };
  }, [droppedLink, reading]);

  // The same gates the Quiz widget puts on its own import, so Import never offers what the review would refuse.
  const allowed = (target: ImportTarget, source: PendingSource): boolean => {
    const route = importRoute(target);
    if (!route || !canAccessWidget(route.widgetType)) return false;
    const name = source.file?.name ?? '';
    if (target === 'quiz' && QUIZ_DOCUMENT.test(name))
      return canReadQuizDocuments;
    if (target === 'quiz' && CARTRIDGE.test(name))
      return schoology || canAccessFeature('quiz-imscc-import');
    if (target === 'questionBank' && CARTRIDGE.test(name))
      return schoology || canAccessFeature('question-bank-imscc-import');
    return true;
  };

  const removeSent = (id: string): void => {
    void inbox.remove(id).catch((err: unknown) => {
      console.error('[Import] could not remove a sent page', err);
    });
  };

  const placeWidget = (
    type: 'embed' | 'url',
    point: ImportDropPoint | undefined,
    config: Record<string, unknown>
  ): void => {
    const defaults = WIDGET_DEFAULTS[type];
    const w = defaults.w ?? 400;
    const h = defaults.h ?? 300;
    addWidget(type, {
      ...placeAt(point, w, h),
      config: { ...defaults.config, ...config },
    });
  };

  const refuseReadOnly = (): boolean => {
    if (activeDashboard && !isActiveBoardReadOnly) return false;
    addToast('Open one of your own boards to import.', 'error');
    return true;
  };

  // Hands a Source to a widget's review screen.
  const review = (source: PendingSource, target: ImportTarget): void => {
    const r = importRoute(target);
    if (!r) return;
    const point = request.dropPoint;
    // Outside a drop, reuse one on this board; a Notebook shows the review only in its library.
    const existing = point
      ? undefined
      : activeDashboard?.widgets.find(
          (w) =>
            w.type === r.widgetType &&
            !('activeNotebookId' in w.config && w.config.activeNotebookId)
        );
    let widgetId = existing?.id;
    if (existing?.minimized) updateWidget(existing.id, { minimized: false });
    if (!widgetId) {
      if (refuseReadOnly()) return;
      widgetId = crypto.randomUUID();
      const defaults = WIDGET_DEFAULTS[r.widgetType];
      addWidget(r.widgetType, {
        id: widgetId,
        ...(point ? placeAt(point, defaults.w ?? 400, defaults.h ?? 400) : {}),
      });
    }
    const sentId = sentIdOf(source);
    offerImportHandoff({
      widgetId,
      widgetType: r.widgetType,
      target,
      source,
      ...(sentId ? { onSaved: () => removeSent(sentId) } : {}),
    });
  };

  // Puts a Reference widget on the board without touching the window, which may have reopened meanwhile.
  const putReference = (
    widget: ReferenceWidget,
    source: PendingSource
  ): void => {
    // The window only offers allowed widgets; this catches a permission change while it was open.
    if (!canAccessWidget(widget.type)) return;
    if (refuseReadOnly()) return;
    const defaults = WIDGET_DEFAULTS[widget.type];
    const w = widget.overrides.w ?? defaults.w ?? 400;
    const h = widget.overrides.h ?? defaults.h ?? 300;
    addWidget(widget.type, {
      ...widget.overrides,
      ...placeAt(request.dropPoint, w, h),
    });
    const sentId = sentIdOf(source);
    if (sentId) removeSent(sentId);
  };

  // A Reference widget built by the Embed check.
  const placeReference = (
    widget: ReferenceWidget,
    source: PendingSource
  ): void => {
    closeImportScreen();
    putReference(widget, source);
  };

  const placeSticker = async (file: File, source: PendingSource) => {
    closeImportScreen();
    if (refuseReadOnly()) return;
    const sticker = await photo.toSticker(file);
    if (sticker) putReference(sticker, source);
    else addToast('That picture couldn’t be added.', 'error');
  };

  const route = (source: PendingSource, target: ImportTarget): void => {
    const r = importRoute(target);
    if (!r) return;
    if (target === 'sticker' && source.file) {
      void placeSticker(source.file, source);
      return;
    }
    closeImportScreen();
    // Slides become Notebook pages through the Notebook widget's own review.
    const slides = !!source.file && pageSourceKind(source.file) !== null;
    if (r.landing === 'review' || (target === 'notebook' && slides)) {
      review(source, target);
      return;
    }
    if (refuseReadOnly()) return;
    const point = request.dropPoint;
    let placed = true;
    if (target === 'pdf' && source.file) placePdf(source.file, point);
    else if (target === 'notebook' && source.file)
      placeNotebook(source.file, point);
    else if (target === 'embed' && source.url)
      placeWidget('embed', point, { url: source.url, mode: 'url' });
    else if (target === 'links' && source.url)
      placeWidget('url', point, {
        urls: [
          {
            id: crypto.randomUUID(),
            url: source.url,
            ...(source.title ? { title: source.title } : {}),
          },
        ],
      });
    else placed = false;
    const sentId = sentIdOf(source);
    if (placed && sentId) removeSent(sentId);
  };

  return (
    <ImportScreen
      isOpen
      onClose={closeImportScreen}
      initialSource={request.source}
      droppedPage={droppedPage}
      inboxItems={inbox.items}
      onRemoveInboxItem={removeSent}
      allowed={allowed}
      onContinue={route}
      onPlaceReference={placeReference}
      canAddLink={canAccessWidget('url')}
      onCourse={isActiveBoardReadOnly ? undefined : onCourse}
    />
  );
};
