import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { WIDGET_DEFAULTS } from '@/config/widgetDefaults';
import { useImportInbox, type ImportInbox } from '@/hooks/useImportInbox';
import { useQuizDocumentImportGate } from '@/hooks/useQuizDocumentImportGate';
import { useImportConversionSettings } from '@/hooks/useImportConversionSettings';
import { useViewAsOutward } from '@/hooks/useViewAsOutward';
import type { ConversionInput } from '@/utils/import/aiConversion';
import { BoardImportFlow } from './conversion/BoardImportFlow';
import {
  IMPORT_INBOX_EVENT,
  IMPORT_INBOX_PARAM,
  type ImportTarget,
} from '@/utils/import/contract';
import { ImportScreen } from './ImportScreen';
import { ImportInboxNotice } from '@/components/layout/ImportInboxNotice';
import {
  closeImportScreen,
  offerImportHandoff,
  openImportScreen,
  useImportScreenRequest,
  type ImportDropPoint,
  type ImportScreenRequest,
  type PendingSource,
} from './importHandoff';
import { conversionInputFor, importRoute, usesAi } from './importTargets';

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

interface BoardJob {
  id: string;
  input: ConversionInput;
  sentId?: string;
}

/** Shows Import on the board and sends the teacher's pick to a review screen or onto the board (D3, D4). */
export const ImportScreenHost: React.FC<ImportScreenHostProps> = (props) => {
  const request = useImportScreenRequest();
  const { user } = useAuth();
  const inbox = useImportInbox(user?.uid, true);
  const [boardJob, setBoardJob] = useState<BoardJob | null>(null);
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
          onStartBoard={setBoardJob}
          {...props}
        />
      )}
      {boardJob && (
        <BoardImportFlow
          key={boardJob.id}
          input={boardJob.input}
          onClose={() => setBoardJob(null)}
          onCreated={() => {
            const sentId = boardJob.sentId;
            if (!sentId) return;
            void inbox.remove(sentId).catch((err: unknown) => {
              console.error('[Import] could not remove a sent page', err);
            });
          }}
        />
      )}
    </>
  );
};

const OpenImportScreen: React.FC<
  ImportScreenHostProps & {
    request: ImportScreenRequest;
    inbox: ImportInbox;
    onStartBoard: (job: BoardJob) => void;
  }
> = ({ request, inbox, placeAt, placePdf, placeNotebook, onStartBoard }) => {
  const { canAccessWidget, canAccessFeature } = useAuth();
  const outward = useViewAsOutward();
  // AI Conversions: the org switch, the AI flag, and never from a read-only view-as tab (the server checks again).
  const aiOn =
    useImportConversionSettings().enabled &&
    canAccessFeature('gemini-functions') &&
    !outward.locked;
  const {
    activeDashboard,
    addWidget,
    updateWidget,
    addToast,
    isActiveBoardReadOnly,
  } = useDashboard();
  const canReadQuizDocuments = useQuizDocumentImportGate();
  const schoology = canAccessFeature('schoology-quiz-import');

  // The same gates the Quiz widget puts on its own import, so Import never offers what the review would refuse.
  const allowed = (target: ImportTarget, source: PendingSource): boolean => {
    const route = importRoute(target);
    if (!route) return false;
    if (route.widgetType && !canAccessWidget(route.widgetType)) return false;
    // A board from a page is Magic Layout's engine, so it follows that flag.
    if (target === 'board') return canAccessFeature('dashboard-layout');
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
    if (!r?.widgetType) return;
    const widgetType = r.widgetType;
    const point = request.dropPoint;
    // Outside a drop, reuse one already on this board.
    const existing = point
      ? undefined
      : activeDashboard?.widgets.find((w) => w.type === widgetType);
    let widgetId = existing?.id;
    if (existing?.minimized) updateWidget(existing.id, { minimized: false });
    if (!widgetId) {
      if (refuseReadOnly()) return;
      widgetId = crypto.randomUUID();
      const defaults = WIDGET_DEFAULTS[widgetType];
      addWidget(widgetType, {
        id: widgetId,
        ...(point ? placeAt(point, defaults.w ?? 400, defaults.h ?? 400) : {}),
      });
    }
    const sentId = source.inboxItem?.id;
    offerImportHandoff({
      widgetId,
      widgetType,
      target,
      source,
      ...(sentId ? { onSaved: () => removeSent(sentId) } : {}),
    });
  };

  // AI picks confirm in a view-as tab first, since importConvertV1 is outward.
  const convert = async (
    source: PendingSource,
    target: ImportTarget
  ): Promise<void> => {
    const r = importRoute(target);
    const input = conversionInputFor(source);
    if (!r || !input) return;
    closeImportScreen();
    if (outward.active && !(await outward.confirm('Import with AI'))) return;
    if (r.landing === 'board') {
      onStartBoard({
        id: crypto.randomUUID(),
        input,
        ...(source.inboxItem ? { sentId: source.inboxItem.id } : {}),
      });
      return;
    }
    review({ ...source, conversion: input }, target);
  };

  const route = (source: PendingSource, target: ImportTarget): void => {
    const r = importRoute(target);
    if (!r) return;
    if (usesAi(target, source, aiOn)) {
      void convert(source, target);
      return;
    }
    closeImportScreen();
    if (r.landing === 'review') {
      review(source, target);
      return;
    }
    if (r.landing === 'board') return;
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

  return (
    <ImportScreen
      isOpen
      onClose={closeImportScreen}
      initialSource={request.source}
      inboxItems={inbox.items}
      onRemoveInboxItem={removeSent}
      allowed={allowed}
      aiOn={aiOn}
      onContinue={route}
    />
  );
};
