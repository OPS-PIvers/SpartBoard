import React, { useEffect } from 'react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { WIDGET_DEFAULTS } from '@/config/widgetDefaults';
import { useImportInbox } from '@/hooks/useImportInbox';
import type { ImportTarget } from '@/utils/import/contract';
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

const INBOX_PARAM = 'importInbox';

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
export const ImportScreenHost: React.FC<ImportScreenHostProps> = ({
  placeAt,
  placePdf,
  placeNotebook,
}) => {
  const { user, canAccessWidget } = useAuth();
  const { activeDashboard, addWidget, updateWidget, addToast } = useDashboard();
  const request = useImportScreenRequest();
  // Listens only while the window is open, so the flag adds no idle listener.
  const inbox = useImportInbox(user?.uid, !!request);
  // The extension's "Open in SpartBoard" lands on /?importInbox=1 after a Send.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get(INBOX_PARAM) !== '1') return;
    url.searchParams.delete(INBOX_PARAM);
    window.history.replaceState(window.history.state, '', url.toString());
    openImportScreen();
  }, []);

  const allowed = (target: ImportTarget): boolean => {
    const route = importRoute(target);
    return !!route && canAccessWidget(route.widgetType);
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

  const route = (
    req: ImportScreenRequest,
    source: PendingSource,
    target: ImportTarget
  ): void => {
    const r = importRoute(target);
    if (!r) return;
    closeImportScreen();
    const point = req.dropPoint;

    if (r.landing === 'place') {
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
      if (source.inboxItem) removeSent(source.inboxItem.id);
      return;
    }

    // Reuse the widget that asked, or (outside a drop) one already on this board.
    const widgets = activeDashboard?.widgets ?? [];
    const existing =
      widgets.find(
        (w) => w.id === req.fromWidgetId && w.type === r.widgetType
      ) ?? (point ? undefined : widgets.find((w) => w.type === r.widgetType));
    let widgetId = existing?.id;
    if (existing?.minimized) updateWidget(existing.id, { minimized: false });
    if (!widgetId) {
      if (!activeDashboard) {
        addToast('Open a board to import.', 'error');
        return;
      }
      widgetId = crypto.randomUUID();
      const defaults = WIDGET_DEFAULTS[r.widgetType];
      addWidget(r.widgetType, {
        id: widgetId,
        ...(point ? placeAt(point, defaults.w ?? 400, defaults.h ?? 400) : {}),
      });
    }
    offerImportHandoff({
      widgetId,
      widgetType: r.widgetType,
      target,
      source,
    });
  };

  if (!request) return null;
  return (
    <ImportScreen
      // A fresh screen per open, so a new drop never inherits the last pick.
      key={request.openId}
      isOpen
      onClose={closeImportScreen}
      initialSource={request.source}
      presetTarget={request.presetTarget}
      inboxItems={inbox.items}
      onRemoveInboxItem={removeSent}
      allowed={allowed}
      onContinue={(source, target) => route(request, source, target)}
    />
  );
};
