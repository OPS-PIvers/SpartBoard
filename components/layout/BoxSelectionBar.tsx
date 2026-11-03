import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  clearBoxSelection,
  useBoxSelection,
} from '@/components/common/boxSelectionStore';
import {
  useDashboardActions,
  useDashboardCanvasSelector,
} from '@/context/dashboardCanvasStore';

/** Bottom bar for widgets picked with Ctrl+drag: pin or group them in one step. */
export const BoxSelectionBar: React.FC = () => {
  const { t } = useTranslation();
  const ids = useBoxSelection();
  const widgets = useDashboardCanvasSelector((s) => s.activeDashboard?.widgets);
  const { updateWidgets, groupWidgets, addToast } = useDashboardActions();

  const selected = (widgets ?? []).filter((w) => ids.includes(w.id));
  if (selected.length === 0) return null;

  const pinnable = selected.filter((w) => !w.isLocked);
  const groupable = selected.filter(
    (w) => !w.isPinned && !w.isLocked && !w.minimized
  );
  const allPinned = pinnable.length > 0 && pinnable.every((w) => w.isPinned);

  const pinAll = () => {
    updateWidgets(
      pinnable.map((w) => ({ id: w.id, changes: { isPinned: !allPinned } }))
    );
    clearBoxSelection();
  };
  const groupAll = () => {
    groupWidgets(groupable.map((w) => w.id));
    clearBoxSelection();
    addToast(t('widgetWindow.group.widgetsGrouped'));
  };

  return createPortal(
    <div
      className="fixed bottom-8 left-1/2 -translate-x-1/2 z-toast flex items-center gap-3 px-6 py-3 bg-white/90 backdrop-blur-xl rounded-full shadow-2xl border border-white/50"
      onClick={(e) => e.stopPropagation()}
    >
      {/* no-tour-anchor: the bar only opens after a Ctrl+drag, which a tour cannot perform */}
      <button
        onClick={clearBoxSelection}
        className="min-h-11 px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
      >
        {t('common.cancel')}
      </button>
      {/* no-tour-anchor: the bar only opens after a Ctrl+drag, which a tour cannot perform */}
      <button
        disabled={pinnable.length === 0}
        onClick={pinAll}
        className={`min-h-11 px-5 py-2 text-sm font-semibold rounded-full transition-colors ${
          pinnable.length > 0
            ? 'bg-amber-500 text-white hover:bg-amber-600'
            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
        }`}
      >
        {t(
          allPinned
            ? 'widgetWindow.group.unpinCount'
            : 'widgetWindow.group.pinCount',
          { count: pinnable.length }
        )}
      </button>
      {/* no-tour-anchor: the bar only opens after a Ctrl+drag, which a tour cannot perform */}
      <button
        disabled={groupable.length < 2}
        onClick={groupAll}
        className={`min-h-11 px-5 py-2 text-sm font-semibold rounded-full transition-colors ${
          groupable.length >= 2
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
        }`}
      >
        {t('widgetWindow.group.groupCount', { count: groupable.length })}
      </button>
    </div>,
    document.body
  );
};
