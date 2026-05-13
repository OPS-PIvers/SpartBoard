import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2, Pencil, RotateCcw, Check } from 'lucide-react';
import { Plc, PlcBentoTileKind } from '@/types';
import { useDialog } from '@/context/useDialog';
import { usePlcOverviewLayout } from '@/hooks/usePlcOverviewLayout';
import { PlcBentoGrid } from '../overview/PlcBentoGrid';
import { PlcGridLayout } from '../grid/PlcGridLayout';
import type { PlcDashboardTabId } from '../PlcDashboard';

const GRID_V2_FLAG_KEY = 'spart.plcDashboard.gridV2';

/**
 * Resolve the gridV2 feature flag. Phase 5 (post-dogfooding) flipped the
 * default to ON, turning the localStorage flag into an opt-OUT: only the
 * literal string `'false'` suppresses v2. Any other value — including
 * unset, `'true'`, or junk left over from QA — yields v2. This keeps the
 * `'storage'` event-driven live-toggle working so QA can flip it in
 * another tab without a reload.
 */
function isGridV2Enabled(): boolean {
  // SSR / no-window environments (vitest jsdom-less paths, future SSR):
  // converge on the same default as a successful localStorage read so a
  // test that doesn't set up a window doesn't silently exercise the v1
  // path. Phase 5 default is ON; only the explicit string `'false'`
  // opts out.
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(GRID_V2_FLAG_KEY) !== 'false';
  } catch {
    // localStorage access can throw in sandboxed iframes / private mode
    // restrictions — fall back to the same default.
    return true;
  }
}

interface PlcOverviewTabProps {
  plc: Plc;
  onNavigateTab: (tabId: PlcDashboardTabId) => void;
  /** v2 grid only: fullscreen-expand a single tile. */
  onExpandTile?: (kind: PlcBentoTileKind) => void;
}

/**
 * Wraps the PLC Overview bento grid with the edit-mode toggle + reset
 * controls. Layout state owned by `usePlcOverviewLayout` and persisted
 * per-user.
 */
export const PlcOverviewTab: React.FC<PlcOverviewTabProps> = ({
  plc,
  onNavigateTab,
  onExpandTile,
}) => {
  const { t } = useTranslation();
  const { showConfirm } = useDialog();
  const { layout, loading, error, updateLayout, resetLayout } =
    usePlcOverviewLayout(plc.id);
  const [editMode, setEditMode] = useState(false);

  // Phase 5: gridV2 defaults to ON; localStorage `'false'` is the only
  // opt-out. Live-update when the flag toggles in another tab so QA
  // doesn't need to reload.
  const [gridV2, setGridV2] = useState(isGridV2Enabled);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === GRID_V2_FLAG_KEY) setGridV2(isGridV2Enabled());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const handleReset = async () => {
    const confirmed = await showConfirm(
      t('plcDashboard.overview.confirmReset', {
        defaultValue:
          'Reset your bento layout to the default arrangement? Tile sizes and order will be restored.',
      }),
      {
        title: t('plcDashboard.overview.confirmResetTitle', {
          defaultValue: 'Reset layout',
        }),
        confirmLabel: t('plcDashboard.overview.reset', {
          defaultValue: 'Reset',
        }),
      }
    );
    if (!confirmed) return;
    try {
      await resetLayout();
    } catch {
      // logError already fired inside the hook; the snapshot will recover
      // the on-disk state if Firestore eventually rejected.
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px] text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            {t('plcDashboard.overview.layoutLoadError', {
              defaultValue:
                "We couldn't load your saved layout. Showing defaults — changes won't be saved until this clears.",
            })}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            {t('plcDashboard.overview.heading', {
              defaultValue: 'Overview',
            })}
          </h3>
          {editMode && (
            <p className="text-xxs text-slate-500 mt-1">
              {t('plcDashboard.overview.editHint', {
                defaultValue:
                  'Drag tiles by the grip, drag the corners or edges to resize, click the eye to hide.',
              })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {editMode && (
            <button
              type="button"
              onClick={() => void handleReset()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-xxs font-bold uppercase tracking-wider rounded-lg transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t('plcDashboard.overview.reset', { defaultValue: 'Reset' })}
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditMode((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xxs font-bold uppercase tracking-wider rounded-lg transition-colors ${
              editMode
                ? 'bg-brand-blue-primary text-white hover:bg-brand-blue-dark'
                : 'bg-white border border-slate-200 hover:border-brand-blue-primary text-slate-700 hover:text-brand-blue-primary'
            }`}
            aria-pressed={editMode}
          >
            {editMode ? (
              <>
                <Check className="w-3.5 h-3.5" />
                {t('plcDashboard.overview.doneEditing', {
                  defaultValue: 'Done',
                })}
              </>
            ) : (
              <>
                <Pencil className="w-3.5 h-3.5" />
                {t('plcDashboard.overview.editLayout', {
                  defaultValue: 'Edit layout',
                })}
              </>
            )}
          </button>
        </div>
      </div>

      {gridV2 ? (
        <PlcGridLayout
          plc={plc}
          layout={layout}
          editMode={editMode}
          onLayoutChange={updateLayout}
          onNavigateTab={onNavigateTab}
          onExpandTile={onExpandTile}
        />
      ) : (
        <PlcBentoGrid
          plc={plc}
          layout={layout}
          editMode={editMode}
          onLayoutChange={updateLayout}
          onNavigateTab={onNavigateTab}
        />
      )}
    </div>
  );
};
