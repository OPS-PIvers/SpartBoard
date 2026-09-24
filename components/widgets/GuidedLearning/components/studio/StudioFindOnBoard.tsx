import React, { useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle2, Crosshair, XCircle } from 'lucide-react';
import type { GuidedLearningTourBinding, WidgetType } from '@/types';
import { Z_INDEX } from '@/config/zIndex';
import { TOOLS } from '@/config/tools';
import { DashboardContext } from '@/context/DashboardContextValue';
import { findTourAnchor } from '@/components/tours/resolveTourAnchor';
import { anchorNeeds } from '@/components/tours/tourHealth';
import { missingSetupWidgets } from '@/components/tours/tourSession';

export const FIND_FLASH_MS = 1800;

type FindResult =
  | { kind: 'found' }
  | { kind: 'needs-widget'; widgets: WidgetType[] }
  | { kind: 'needs-open-widget' }
  | { kind: 'needs-panel' }
  | { kind: 'not-found' };

/** Why a step's button can't be found on the board as it is now. */
function explainMissing(
  binding: Pick<GuidedLearningTourBinding, 'anchor'>,
  setupWidgets: readonly WidgetType[],
  boardWidgets: readonly { type: WidgetType }[]
): FindResult {
  const needs = anchorNeeds(binding.anchor);
  if (needs === 'widget') {
    const missing = missingSetupWidgets(
      { tourSetup: { widgets: [...setupWidgets] } },
      boardWidgets
    );
    return missing.length > 0
      ? { kind: 'needs-widget', widgets: missing }
      : { kind: 'needs-open-widget' };
  }
  return needs === 'panel' ? { kind: 'needs-panel' } : { kind: 'not-found' };
}

const RESULT_STYLE = {
  found: { icon: CheckCircle2, className: 'text-emerald-800' },
  warn: { icon: AlertCircle, className: 'text-amber-800' },
  missing: { icon: XCircle, className: 'text-red-700' },
} as const;

interface StudioFindOnBoardProps {
  binding: GuidedLearningTourBinding;
  /** The tour's setup widgets, to name the widget a missing button needs. */
  setupWidgets: readonly WidgetType[];
  /** Fades the Studio while the board shows the flashed button. */
  onPeek?: (peeking: boolean) => void;
}

/** "Find on board": looks the step's button up on the real board and flashes it. */
export const StudioFindOnBoard: React.FC<StudioFindOnBoardProps> = ({
  binding,
  setupWidgets,
  onPeek,
}) => {
  const { t } = useTranslation();
  const boardWidgets = useContext(DashboardContext)?.activeDashboard?.widgets;
  const [result, setResult] = useState<FindResult | null>(null);
  const [flash, setFlash] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), FIND_FLASH_MS);
    return () => {
      window.clearTimeout(timer);
      onPeek?.(false);
    };
  }, [flash, onPeek]);

  const find = () => {
    const el = findTourAnchor(binding);
    if (el) {
      setResult({ kind: 'found' });
      setFlash(el.getBoundingClientRect());
      onPeek?.(true);
      return;
    }
    setResult(explainMissing(binding, setupWidgets, boardWidgets ?? []));
  };

  const labelOf = (type: WidgetType) =>
    TOOLS.find((tool) => tool.type === type)?.label ?? type;
  const message =
    result?.kind === 'needs-widget'
      ? t('glStudio.tourFind.needs-widget', {
          widget: result.widgets.map(labelOf).join(', '),
        })
      : result
        ? t(`glStudio.tourFind.${result.kind}`)
        : null;
  const style =
    result?.kind === 'found'
      ? RESULT_STYLE.found
      : result?.kind === 'not-found'
        ? RESULT_STYLE.missing
        : RESULT_STYLE.warn;
  const ResultIcon = style.icon;

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={find}
        className="flex items-center gap-1.5 self-start rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
      >
        <Crosshair className="h-4 w-4" aria-hidden="true" />
        {t('glStudio.tourFind.button')}
      </button>
      <p
        role="status"
        data-testid="gl-studio-find-result"
        className={`flex items-start gap-1.5 text-xs font-semibold ${style.className}`}
      >
        {message && (
          <>
            <ResultIcon
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              aria-hidden="true"
            />
            {message}
          </>
        )}
      </p>
      {flash &&
        createPortal(
          <div
            data-testid="gl-studio-find-flash"
            aria-hidden="true"
            className="pointer-events-none fixed rounded-lg ring-4 ring-brand-blue-primary ring-offset-2"
            style={{
              top: flash.top,
              left: flash.left,
              width: flash.width,
              height: flash.height,
              zIndex: Z_INDEX.tourCallout,
            }}
          />,
          document.body
        )}
    </div>
  );
};
