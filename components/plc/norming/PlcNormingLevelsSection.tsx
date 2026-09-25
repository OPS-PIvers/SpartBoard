// PLC Settings: names for the norming levels (leads and co-leads edit, everyone else reads).
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Plc, PlcNormingLevelLabels } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { usePlcs } from '@/hooks/usePlcs';
import { isPlcLeadOrCoLead } from '@/utils/plc';
import {
  DEFAULT_NORMING_LABELS,
  NORMING_LABEL_MAX,
  normingLabelFor,
  parseNormingLevelLabels,
} from '@/utils/plcNorming';
import { NormingLevelSymbol } from './NormingLevelSymbol';

const RENAMEABLE = ['high', 'medium', 'low'] as const;

const LabelsEditor: React.FC<{ plc: Plc }> = ({ plc }) => {
  const { t } = useTranslation();
  const { updatePlcNormingLabels } = usePlcs({ enabled: false });
  const { addToast } = useDashboard();
  const [draft, setDraft] = useState<
    Record<(typeof RENAMEABLE)[number], string>
  >(() => ({
    high: plc.normingLevelLabels?.high ?? '',
    medium: plc.normingLevelLabels?.medium ?? '',
    low: plc.normingLevelLabels?.low ?? '',
  }));
  const [busy, setBusy] = useState(false);

  const save = async (next: PlcNormingLevelLabels | null) => {
    if (busy) return;
    setBusy(true);
    try {
      await updatePlcNormingLabels(plc.id, next);
      addToast(
        t('plcNorming.settings.saved', {
          defaultValue: 'Norming levels saved',
        }),
        'success'
      );
    } catch (err) {
      addToast(
        err instanceof Error
          ? err.message
          : t('plcNorming.settings.saveFailed', {
              defaultValue: 'Failed to save the norming levels',
            }),
        'error'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="mt-3 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save(parseNormingLevelLabels(draft) ?? null);
      }}
    >
      {RENAMEABLE.map((level) => (
        <label
          key={level}
          className="flex items-center gap-2 text-xs font-semibold text-slate-600"
        >
          <span className="w-12 shrink-0 text-slate-500">
            <NormingLevelSymbol level={level} className="w-3 h-3" />
          </span>
          <input
            type="text"
            maxLength={NORMING_LABEL_MAX}
            value={draft[level]}
            placeholder={DEFAULT_NORMING_LABELS[level]}
            aria-label={t('plcNorming.settings.nameFor', {
              defaultValue: 'Name for {{level}}',
              level: DEFAULT_NORMING_LABELS[level],
            })}
            onChange={(e) =>
              setDraft((d) => ({ ...d, [level]: e.target.value }))
            }
            className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-brand-blue-primary focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/30"
          />
        </label>
      ))}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand-blue-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-blue-dark disabled:opacity-60"
        >
          {t('plcNorming.settings.save', { defaultValue: 'Save names' })}
        </button>
        {plc.normingLevelLabels && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void save(null)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {t('plcNorming.settings.reset', {
              defaultValue: 'Use default names',
            })}
          </button>
        )}
      </div>
    </form>
  );
};

export const PlcNormingLevelsSection: React.FC<{ plc: Plc }> = ({ plc }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canEdit = user ? isPlcLeadOrCoLead(plc, user.uid) : false;
  const summary = (['high', 'medium', 'low', 'review'] as const)
    .map((l) => normingLabelFor(l, plc.normingLevelLabels))
    .join(', ');

  return (
    <div className="border-t border-slate-200 pt-4">
      <h3 className="text-sm font-bold text-slate-800">
        {t('plcNorming.settings.heading', { defaultValue: 'Norming levels' })}
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        {canEdit
          ? t('plcNorming.settings.leadDescription', {
              defaultValue: 'Review always means "unsure how to grade."',
            })
          : t('plcNorming.settings.memberDescription', {
              defaultValue: 'Set by the lead.',
            })}
      </p>
      <p className="mt-2 text-sm font-semibold text-slate-700">{summary}</p>
      {canEdit && (
        <LabelsEditor
          key={JSON.stringify(plc.normingLevelLabels ?? null)}
          plc={plc}
        />
      )}
    </div>
  );
};
