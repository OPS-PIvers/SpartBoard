import React, { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, X } from 'lucide-react';
import type { InternalToolType, TourWidgetLayout, WidgetType } from '@/types';
import { TOOLS } from '@/config/tools';
import { useToolLabel } from '@/hooks/useToolLabel';
import { DashboardContext } from '@/context/DashboardContextValue';
import { DialogContext } from '@/context/DialogContextValue';
import {
  boardLayoutOf,
  buildRecordedLayouts,
} from '../recorder/recordedLayouts';

interface StudioTourSetupProps {
  widgets: readonly WidgetType[];
  onChange: (widgets: WidgetType[]) => void;
  layouts?: readonly TourWidgetLayout[];
  onLayoutsChange?: (layouts: TourWidgetLayout[]) => void;
}

const INTERNAL_TOOLS: readonly InternalToolType[] = [
  'record',
  'magic',
  'remote',
];
const WIDGET_TYPES = TOOLS.map((tool) => tool.type).filter(
  (type): type is WidgetType =>
    !(INTERNAL_TOOLS as readonly string[]).includes(type)
);

/** "Widgets this tour adds": the tour's setup widgets as removable chips, plus an add picker. */
export const StudioTourSetup: React.FC<StudioTourSetupProps> = ({
  widgets,
  onChange,
  layouts = [],
  onLayoutsChange,
}) => {
  const { t } = useTranslation();
  const dialog = useContext(DialogContext);
  const board = (
    useContext(DashboardContext)?.activeDashboard?.widgets ?? []
  ).filter((w) => !w.transient);
  // Replaces the tour's recorded layouts with this board's, after a confirm.
  const captureLayout = async () => {
    if (!onLayoutsChange || board.length === 0) return;
    const message = t('glStudio.tourLayoutConfirm');
    const ok = dialog
      ? await dialog.showConfirm(message, {
          title: t('glStudio.tourLayoutCapture'),
          confirmLabel: t('glStudio.tourLayoutCaptureConfirm'),
        })
      : window.confirm(message);
    if (ok)
      onLayoutsChange(buildRecordedLayouts(boardLayoutOf(board), []).layouts);
  };
  const toolLabel = useToolLabel();
  const labelOf = (type: WidgetType) => toolLabel(type) || type;
  const unique = [...new Set(widgets)];
  const addable = WIDGET_TYPES.filter((type) => !unique.includes(type)).sort(
    (a, b) => labelOf(a).localeCompare(labelOf(b))
  );

  return (
    <section
      aria-labelledby="gl-studio-tour-setup-title"
      className="flex flex-col gap-2"
      data-testid="gl-studio-tour-setup"
    >
      <div>
        <h3
          id="gl-studio-tour-setup-title"
          className="text-xs font-bold text-slate-600"
        >
          {t('glStudio.tourSetupTitle')}
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          {t('glStudio.tourSetupHint')}
        </p>
      </div>
      {unique.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {unique.map((type) => (
            <li
              key={type}
              className="flex items-center gap-1 rounded-full border border-slate-300 bg-white py-0.5 pl-2.5 pr-1 text-xs font-semibold text-slate-700"
            >
              {labelOf(type)}
              <button
                type="button"
                onClick={() => onChange(unique.filter((w) => w !== type))}
                aria-label={t('glStudio.tourSetupRemove', {
                  widget: labelOf(type),
                })}
                className="rounded-full p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">{t('glStudio.tourSetupNone')}</p>
      )}
      <select
        value=""
        aria-label={t('glStudio.tourSetupAdd')}
        onChange={(e) => {
          const type = WIDGET_TYPES.find((w) => w === e.target.value);
          if (type) onChange([...unique, type]);
        }}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
      >
        <option value="">{t('glStudio.tourSetupAdd')}</option>
        {addable.map((type) => (
          <option key={type} value={type}>
            {labelOf(type)}
          </option>
        ))}
      </select>
      {onLayoutsChange && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">
            {layouts.length > 0
              ? t('glStudio.tourLayoutCount', { count: layouts.length })
              : t('glStudio.tourLayoutNone')}
          </span>
          <button
            type="button"
            onClick={() => void captureLayout()}
            disabled={board.length === 0}
            title={t('glStudio.tourLayoutHint')}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
          >
            <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />
            {t('glStudio.tourLayoutCapture')}
          </button>
        </div>
      )}
    </section>
  );
};
