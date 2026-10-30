import React, { useEffect } from 'react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { WIDGET_DEFAULTS } from '@/config/widgetDefaults';
import { useImportInbox } from '@/hooks/useImportInbox';
import { useQuizDocumentImportGate } from '@/hooks/useQuizDocumentImportGate';
import {
  IMPORT_INBOX_EVENT,
  IMPORT_INBOX_PARAM,
  type ImportTarget,
} from '@/utils/import/contract';
import { ImportScreen } from './ImportScreen';
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
  if (!request) return null;
  // Mounted only while open, so its listeners cost nothing the rest of the time.
  return <OpenImportScreen key={request.openId} request={request} {...props} />;
};

const OpenImportScreen: React.FC<
  ImportScreenHostProps & { request: ImportScreenRequest }
> = ({ request, placeAt, placePdf, placeNotebook }) => {
  const { user, canAccessWidget, canAccessFeature } = useAuth();
  const {
    activeDashboard,
    addWidget,
    updateWidget,
    addToast,
    isActiveBoardReadOnly,
  } = useDashboard();
  const inbox = useImportInbox(user?.uid, true);
  const canReadQuizDocuments = useQuizDocumentImportGate();
  const schoology = canAccessFeature('schoology-quiz-import');

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

  // Hands a Source (empty for the widget's own import options) to a review screen.
  const review = (source: PendingSource, target: ImportTarget): void => {
    const r = importRoute(target);
    if (!r) return;
    const point = request.dropPoint;
    // Reuse the widget that asked, or (outside a drop) one already on this board.
    const widgets = activeDashboard?.widgets ?? [];
    const existing =
      widgets.find(
        (w) => w.id === request.fromWidgetId && w.type === r.widgetType
      ) ?? (point ? undefined : widgets.find((w) => w.type === r.widgetType));
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
    const sentId = source.inboxItem?.id;
    offerImportHandoff({
      widgetId,
      widgetType: r.widgetType,
      target,
      source,
      ...(sentId ? { onSaved: () => removeSent(sentId) } : {}),
    });
  };

  const route = (source: PendingSource, target: ImportTarget): void => {
    const r = importRoute(target);
    if (!r) return;
    closeImportScreen();
    if (r.landing === 'review') {
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
    const sentId = source.inboxItem?.id;
    if (placed && sentId) removeSent(sentId);
  };

  // A widget's own Import button can still reach its picker, templates and AI options.
  const presetTarget = request.presetTarget;
  const preset = presetTarget ? importRoute(presetTarget) : null;
  const widgetOptions =
    request.fromWidgetId && presetTarget && preset?.landing === 'review'
      ? {
          label: preset.label,
          open: () => {
            closeImportScreen();
            review({}, presetTarget);
          },
        }
      : undefined;

  return (
    <ImportScreen
      isOpen
      onClose={closeImportScreen}
      initialSource={request.source}
      presetTarget={presetTarget}
      inboxItems={inbox.items}
      onRemoveInboxItem={removeSent}
      allowed={allowed}
      widgetOptions={widgetOptions}
      onContinue={route}
    />
  );
};
