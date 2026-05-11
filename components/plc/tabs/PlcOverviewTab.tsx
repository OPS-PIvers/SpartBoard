import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Pencil, RotateCcw, Check } from 'lucide-react';
import { Plc } from '@/types';
import { useDialog } from '@/context/useDialog';
import { usePlcOverviewLayout } from '@/hooks/usePlcOverviewLayout';
import { PlcBentoGrid } from '../overview/PlcBentoGrid';
import { PlcGridLayout } from '../grid/PlcGridLayout';
import type { PlcDashboardTabId } from '../PlcDashboard';

const GRID_V2_FLAG_KEY = 'spart.plcDashboard.gridV2';

/**
 * Resolve the gridV2 feature flag. Phase 1 ships the new drag-resizable
 * grid behind this flag so the v1 bento path stays the default while we
 * dogfood the new behavior. Toggle by setting
 * `localStorage.setItem('spart.plcDashboard.gridV2', 'true')`.
 */
function isGridV2Enabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(GRID_V2_FLAG_KEY) === 'true';
  } catch {
    return false;
  }
}

interface PlcOverviewTabProps {
  plc: Plc;
  onNavigateTab: (tabId: PlcDashboardTabId) => void;
}

/**
 * Wraps the PLC Overview bento grid with the edit-mode toggle + reset
 * controls. Layout state owned by `usePlcOverviewLayout` and persisted
 * per-user.
 */
export const PlcOverviewTab: React.FC<PlcOverviewTabProps> = ({
  plc,
  onNavigateTab,
}) => {
  const { t } = useTranslation();
  const { showConfirm } = useDialog();
  const { layout, loading, updateLayout, resetLayout } = usePlcOverviewLayout(
    plc.id
  );
  const [editMode, setEditMode] = useState(false);

  // Phase 1: gridV2 flag, opt-in via localStorage. Live-update when the
  // flag toggles in another tab so QA doesn't need to reload.
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
                  'Drag tiles by the grip, click the corner to resize, click the eye to hide.',
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
