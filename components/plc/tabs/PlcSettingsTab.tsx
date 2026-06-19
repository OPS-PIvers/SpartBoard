import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  ChevronDown,
  Film,
  ListChecks,
  StickyNote,
  SquareSquare,
  Trash2,
} from 'lucide-react';
import {
  DEFAULT_PLC_FEATURE_SETTINGS,
  Plc,
  PlcFeatureSettings,
  getPlcFeatures,
} from '@/types';
import { usePlcs } from '@/hooks/usePlcs';
import { useDashboard } from '@/context/useDashboard';
import { PlcTrashBody } from '../settings/PlcTrashBody';

interface PlcSettingsTabProps {
  plc: Plc;
}

interface FeatureRow {
  key: keyof PlcFeatureSettings;
  icon: typeof BookOpen;
  titleKey: string;
  titleDefault: string;
  descriptionKey: string;
  descriptionDefault: string;
}

const FEATURE_ROWS: readonly FeatureRow[] = [
  {
    key: 'quizzes',
    icon: BookOpen,
    titleKey: 'plcDashboard.settings.quizzes.title',
    titleDefault: 'Quiz Library',
    descriptionKey: 'plcDashboard.settings.quizzes.description',
    descriptionDefault:
      'Share quizzes with the PLC. Members can sync edits or copy a quiz into their own library.',
  },
  {
    key: 'videoActivities',
    icon: Film,
    titleKey: 'plcDashboard.settings.videoActivities.title',
    titleDefault: 'Video Activities',
    descriptionKey: 'plcDashboard.settings.videoActivities.description',
    descriptionDefault:
      'Share video-based activities and aggregate completion data with the PLC.',
  },
  {
    key: 'notes',
    icon: StickyNote,
    titleKey: 'plcDashboard.settings.notes.title',
    titleDefault: 'Notes',
    descriptionKey: 'plcDashboard.settings.notes.description',
    descriptionDefault: 'A shared notebook for the PLC.',
  },
  {
    key: 'todos',
    icon: ListChecks,
    titleKey: 'plcDashboard.settings.todos.title',
    titleDefault: 'To-Do List',
    descriptionKey: 'plcDashboard.settings.todos.description',
    descriptionDefault: 'A shared checklist so the PLC can track action items.',
  },
  {
    key: 'sharedBoards',
    icon: SquareSquare,
    titleKey: 'plcDashboard.settings.sharedBoards.title',
    titleDefault: 'Shared Boards',
    descriptionKey: 'plcDashboard.settings.sharedBoards.description',
    descriptionDefault: 'Surface dashboards shared with the PLC.',
  },
] as const;

/**
 * Per-PLC dashboard feature toggles. Per spec, every PLC member can flip
 * these — they're shared configuration, not lead-only. Failures roll the
 * UI back to the previous value and surface a toast.
 */
export const PlcSettingsTab: React.FC<PlcSettingsTabProps> = ({ plc }) => {
  const { t } = useTranslation();
  const { updatePlcFeatures } = usePlcs({ enabled: false });
  const { addToast } = useDashboard();
  const features = getPlcFeatures(plc);
  const [busyKey, setBusyKey] = useState<keyof PlcFeatureSettings | null>(null);
  // Trash is a collapsed subsection inside Settings (Decision §6.1) — it mounts
  // its own (heavy-ish) listeners only once expanded.
  const [trashOpen, setTrashOpen] = useState(false);

  const handleToggle = async (key: keyof PlcFeatureSettings) => {
    if (busyKey) return;
    setBusyKey(key);
    const next: PlcFeatureSettings = {
      ...DEFAULT_PLC_FEATURE_SETTINGS,
      ...features,
      [key]: !features[key],
    };
    try {
      await updatePlcFeatures(plc.id, next);
    } catch (err) {
      addToast(
        err instanceof Error
          ? err.message
          : t('plcDashboard.settings.saveFailed', {
              defaultValue: 'Failed to save settings',
            }),
        'error'
      );
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-bold text-slate-800">
          {t('plcDashboard.settings.heading', {
            defaultValue: 'Dashboard Sections',
          })}
        </h3>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          {t('plcDashboard.settings.description', {
            defaultValue:
              "Choose which sections appear in this PLC's dashboard. Any PLC member can update these.",
          })}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {FEATURE_ROWS.map((row) => {
          const Icon = row.icon;
          const enabled = features[row.key];
          const isBusy = busyKey === row.key;
          // While any toggle is in-flight, lock out every row so the UI
          // visibly matches the in-handler `if (busyKey) return` guard.
          // Otherwise an unrelated row would look interactive but silently
          // ignore clicks.
          const anyBusy = busyKey !== null;
          return (
            <button
              key={row.key}
              onClick={() => void handleToggle(row.key)}
              disabled={anyBusy}
              className={`flex items-start gap-3 p-3 bg-white border rounded-xl text-left transition-colors ${
                enabled
                  ? 'border-brand-blue-light/60 hover:border-brand-blue-primary'
                  : 'border-slate-200 hover:border-slate-300'
              } ${isBusy ? 'opacity-60 cursor-wait' : anyBusy ? 'opacity-70' : ''}`}
            >
              <div
                className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                  enabled
                    ? 'bg-brand-blue-lighter text-brand-blue-primary'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-800">
                  {t(row.titleKey, { defaultValue: row.titleDefault })}
                </div>
                <div className="text-xxs text-slate-500 leading-relaxed mt-0.5">
                  {t(row.descriptionKey, {
                    defaultValue: row.descriptionDefault,
                  })}
                </div>
              </div>
              <div
                role="switch"
                aria-checked={enabled}
                className={`shrink-0 relative w-10 h-5 rounded-full transition-colors ${
                  enabled ? 'bg-brand-blue-primary' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${
                    enabled ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* Trash (Decision §6.1) — collapsed by default; expanding mounts the
          PlcTrashBody listeners. */}
      <div className="border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={() => setTrashOpen((o) => !o)}
          aria-expanded={trashOpen}
          aria-controls="plc-settings-trash"
          className="w-full flex items-center justify-between gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-1 rounded-lg"
        >
          <span className="flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-slate-500" aria-hidden="true" />
            <span className="text-sm font-bold text-slate-800">
              {t('plcDashboard.trash.heading', { defaultValue: 'Trash' })}
            </span>
          </span>
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform ${
              trashOpen ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </button>
        {trashOpen && (
          <div id="plc-settings-trash" className="mt-3">
            <PlcTrashBody plc={plc} />
          </div>
        )}
      </div>
    </div>
  );
};
