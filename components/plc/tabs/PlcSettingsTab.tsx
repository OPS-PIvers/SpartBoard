import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Mail, Printer, Trash2 } from 'lucide-react';
import {
  DEFAULT_PLC_FEATURE_SETTINGS,
  Plc,
  PlcFeatureSettings,
  getPlcFeatures,
  getPlcGroupType,
} from '@/types';
import { usePlcs } from '@/hooks/usePlcs';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { PlcTrashBody } from '@/components/plc/settings/PlcTrashBody';
import { PlcMeetingCadenceSection } from '@/components/plc/settings/PlcMeetingCadenceSection';
import { PlcNormingLevelsSection } from '@/components/plc/norming/PlcNormingLevelsSection';
import { PlcGradebookSection } from '@/components/plc/settings/PlcGradebookSection';
import { MentoringPairingsSettings } from '@/components/plc/teams/mentoring/MentoringPairingsSettings';
import { isPlcLeadOrCoLead } from '@/utils/plc';
import { TeamCalendarSettings } from '@/components/plc/teams/building/TeamCalendarSettings';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';

interface PlcSettingsTabProps {
  plc: Plc;
}

interface FeatureRow {
  key: keyof PlcFeatureSettings;
  icon: typeof Printer;
  titleKey: string;
  titleDefault: string;
}

// Pages are set in the layout editor, so only non-page switches stay here.
const FEATURE_ROWS: readonly FeatureRow[] = [
  {
    key: 'printForTeammates',
    icon: Printer,
    titleKey: 'plcDashboard.settings.printForTeammates.title',
    titleDefault: 'Print response sheets for a teammate',
  },
] as const;

export const PlcSettingsTab: React.FC<PlcSettingsTabProps> = ({ plc }) => {
  const { t } = useTranslation();
  const { updatePlcFeatures, updatePlcDigestOptIn } = usePlcs({
    enabled: false,
  });
  const { addToast } = useDashboard();
  const { canAccessFeature, user } = useAuth();
  const features = getPlcFeatures(plc);
  const [busyKey, setBusyKey] = useState<keyof PlcFeatureSettings | null>(null);
  // Trash is a collapsed subsection inside Settings (Decision §6.1) — it mounts
  // its own (heavy-ish) listeners only once expanded.
  const [trashOpen, setTrashOpen] = useState(false);
  const trashRef = useRef<HTMLDivElement>(null);

  const toggleTrash = () => {
    const opening = !trashOpen;
    setTrashOpen(opening);
    if (!opening) return;
    // Settings is long; bring the expanded Trash into view once it renders.
    requestAnimationFrame(() => {
      trashRef.current?.scrollIntoView?.({
        block: 'nearest',
        behavior: 'smooth',
      });
    });
  };
  // Opt-in weekly digest (Decision 2.3). The flag lives on the PLC root doc;
  // any member can flip it. `digestOptIn` defaults to false (absent ⇒ off).
  const digestOptIn = plc.digestOptIn === true;
  const [digestBusy, setDigestBusy] = useState(false);

  const handleDigestToggle = async () => {
    if (digestBusy) return;
    setDigestBusy(true);
    try {
      await updatePlcDigestOptIn(plc.id, !digestOptIn);
    } catch (err) {
      addToast(
        err instanceof Error
          ? err.message
          : t('plcDashboard.settings.digest.saveFailed', {
              defaultValue: 'Failed to update digest setting',
            }),
        'error'
      );
    } finally {
      setDigestBusy(false);
    }
  };

  const handleToggle = async (key: keyof PlcFeatureSettings) => {
    if (busyKey) return;
    setBusyKey(key);
    const next: PlcFeatureSettings = {
      ...DEFAULT_PLC_FEATURE_SETTINGS,
      ...features,
      [key]: features[key] === false,
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

  // Assessment settings (printing, meetings, norming, gradebook) apply only to PLC teams.
  const isPlcTeam = getPlcGroupType(plc) === 'plc';
  const rows = isPlcTeam ? FEATURE_ROWS : [];

  return (
    <div className="flex flex-col gap-4 [&>*:first-child]:border-t-0 [&>*:first-child]:pt-0">
      {rows.length > 0 && (
        <div className="flex flex-col gap-2">
          {rows.map((row) => {
            const Icon = row.icon;
            const enabled = features[row.key] !== false;
            const isBusy = busyKey === row.key;
            // While any toggle is in-flight, lock out every row so the UI
            // visibly matches the in-handler `if (busyKey) return` guard.
            // Otherwise an unrelated row would look interactive but silently
            // ignore clicks.
            const anyBusy = busyKey !== null;
            return (
              <button
                {...tourFieldAttr(
                  'plc-settings.feature-switch',
                  'plc',
                  row.key
                )}
                key={row.key}
                type="button"
                role="switch"
                aria-checked={enabled}
                onClick={() => void handleToggle(row.key)}
                disabled={anyBusy}
                className={`flex items-center gap-3 p-3 bg-white border rounded-xl text-left transition-colors ${
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
                </div>
                <div
                  aria-hidden="true"
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
      )}

      {isPlcTeam && <PlcMeetingCadenceSection plc={plc} />}

      {isPlcTeam && <PlcNormingLevelsSection plc={plc} />}

      {isPlcTeam && canAccessFeature('gradebook') && (
        <PlcGradebookSection plc={plc} />
      )}

      {getPlcGroupType(plc) === 'mentoring' &&
        !!user &&
        isPlcLeadOrCoLead(plc, user.uid) && (
          <MentoringPairingsSettings plc={plc} />
        )}
      <TeamCalendarSettings plc={plc} />

      {/* Notifications — opt-in weekly email digest (Decision 2.3). Any
          member can flip it; default OFF. */}
      <div className="border-t border-slate-200 pt-4">
        <h3 className="text-sm font-bold text-slate-800">
          {t('plcDashboard.settings.digest.heading', {
            defaultValue: 'Notifications',
          })}
        </h3>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          {t('plcDashboard.settings.digest.groupDescription', {
            defaultValue: 'Control how this team stays in the loop.',
          })}
        </p>
        <button
          {...tourAttr('plc-settings.digest')}
          type="button"
          onClick={() => void handleDigestToggle()}
          disabled={digestBusy}
          role="switch"
          aria-checked={digestOptIn}
          className={`mt-3 w-full flex items-start gap-3 p-3 bg-white border rounded-xl text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary focus-visible:ring-offset-1 ${
            digestOptIn
              ? 'border-brand-blue-light/60 hover:border-brand-blue-primary'
              : 'border-slate-200 hover:border-slate-300'
          } ${digestBusy ? 'opacity-60 cursor-wait' : ''}`}
        >
          <div
            className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
              digestOptIn
                ? 'bg-brand-blue-lighter text-brand-blue-primary'
                : 'bg-slate-100 text-slate-400'
            }`}
          >
            <Mail className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-slate-800">
              {t('plcDashboard.settings.digest.title', {
                defaultValue: 'Weekly email digest',
              })}
            </div>
            <div className="text-xxs text-slate-500 leading-relaxed mt-0.5">
              {t('plcDashboard.settings.digest.groupOptInDescription', {
                defaultValue:
                  'Send every member one weekly email summarizing what happened in the team. Off by default; any member can change this.',
              })}
            </div>
          </div>
          <div
            aria-hidden="true"
            className={`shrink-0 relative w-10 h-5 rounded-full transition-colors ${
              digestOptIn ? 'bg-brand-blue-primary' : 'bg-slate-300'
            }`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${
                digestOptIn ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </div>
        </button>
      </div>

      {/* Trash (Decision §6.1) — collapsed by default; expanding mounts the
          PlcTrashBody listeners. */}
      <div ref={trashRef} className="border-t border-slate-200 pt-4">
        <button
          {...tourAttr('plc-settings.trash-toggle')}
          type="button"
          onClick={toggleTrash}
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
