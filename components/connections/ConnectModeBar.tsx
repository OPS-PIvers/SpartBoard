import React, { Suspense, lazy, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useDashboard } from '@/context/useDashboard';
import {
  cancelConnectMode,
  connectionsUi,
  useConnectionsUi,
} from '@/context/connectionsUiStore';
import { draftFromPicks, type PickedWidget } from '@/utils/connectionEngine';
import type { SequenceConnection, WidgetConnection } from '@/types';
import { tourAttr } from '@/config/tourAnchors';
// The step editor loads only when a teacher opens it.
const ConnectionEditorModal = lazy(() =>
  import('./ConnectionEditorModal').then((m) => ({
    default: m.ConnectionEditorModal,
  }))
);

// Appends new picks to a draft's Sequence, or starts one.
const mergeDraft = (
  existing: WidgetConnection[],
  added: ReturnType<typeof draftFromPicks>
): WidgetConnection[] => {
  const seq = existing.find(
    (c): c is SequenceConnection => c.kind === 'sequence'
  );
  const others = existing.filter((c) => c !== seq);
  if (seq && added.sequence) {
    return [
      { ...seq, steps: [...seq.steps, ...added.sequence.steps] },
      ...others,
      ...added.follows,
    ];
  }
  return [
    ...(seq ? [seq] : []),
    ...(added.sequence ? [added.sequence] : []),
    ...others,
    ...added.follows,
  ];
};

/** Banner and Cancel/Done bar for Connect mode, plus the step editor it opens. */
export const ConnectModeBar: React.FC = () => {
  const { t } = useTranslation();
  const { activeDashboard, addToast } = useDashboard();
  const mode = useConnectionsUi((s) => s.connectMode);
  const editor = useConnectionsUi((s) => s.editor);

  // Leaving the board ends Connect mode.
  const boardId = activeDashboard?.id;
  useEffect(() => {
    const m = connectionsUi.get().connectMode;
    if (m && m.boardId !== boardId) connectionsUi.set({ connectMode: null });
  }, [boardId]);

  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelConnectMode();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  const done = () => {
    if (!mode || !activeDashboard) return;
    const byId = new Map(activeDashboard.widgets.map((w) => [w.id, w]));
    const picks: PickedWidget[] = mode.picks.flatMap((id) => {
      const w = byId.get(id);
      return w
        ? [{ id, type: w.type, config: w.config as Record<string, unknown> }]
        : [];
    });
    if (mode.draft) {
      // Added widgets join the open draft as further steps.
      const added = draftFromPicks(picks, { minSteps: 1 });
      connectionsUi.set({
        connectMode: null,
        editor: {
          ...mode.draft,
          connections: mergeDraft(mode.draft.connections, added),
        },
      });
      return;
    }
    const draft = draftFromPicks(picks);
    const connections = [
      ...(draft.sequence ? [draft.sequence] : []),
      ...draft.follows,
    ];
    if (connections.length === 0) {
      addToast(
        t('connections.nothingToConnect', {
          defaultValue: 'Those widgets have nothing to do together yet.',
        }),
        'info'
      );
      connectionsUi.set({ connectMode: null });
      return;
    }
    connectionsUi.set({
      connectMode: null,
      editor: { boardId: mode.boardId, connections, replaces: [] },
    });
  };

  const minPicks = mode?.draft ? 1 : 2;
  const ready = !!mode && mode.picks.length >= minPicks;

  return (
    <>
      {mode &&
        createPortal(
          <>
            <div className="fixed top-6 left-1/2 -translate-x-1/2 z-toast px-6 py-3 bg-brand-blue-primary/95 backdrop-blur-xl text-white rounded-full shadow-2xl font-sans text-sm font-medium pointer-events-none text-center">
              {t('connections.tapInOrder', {
                defaultValue:
                  'Tap widgets in the order they should go. Tap the first one again to repeat.',
              })}
            </div>
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-toast flex items-center gap-3 px-6 py-3 bg-white/90 backdrop-blur-xl rounded-full shadow-2xl border border-white/50">
              <button
                type="button"
                onClick={cancelConnectMode}
                {...tourAttr('dashboard.connect-cancel')}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={!ready}
                {...tourAttr('dashboard.connect-done')}
                onClick={done}
                className={`px-5 py-2 text-sm font-semibold rounded-full transition-colors ${
                  ready
                    ? 'bg-brand-blue-primary text-white hover:bg-brand-blue-dark'
                    : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                }`}
              >
                {t('connections.doneCount', {
                  count: mode.picks.length,
                  defaultValue: 'Done ({{count}})',
                })}
              </button>
            </div>
          </>,
          document.body
        )}
      {editor && activeDashboard && editor.boardId === activeDashboard.id && (
        <Suspense fallback={null}>
          <ConnectionEditorModal draft={editor} board={activeDashboard} />
        </Suspense>
      )}
    </>
  );
};
