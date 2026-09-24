// Grader flag for PLC norming: pick a level to share an anonymized copy; pick it again to unshare.
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Flag } from 'lucide-react';
import type { PlcNormingLevel, PlcNormingLevelLabels } from '@/types';
import { PLC_NORMING_LEVELS, normingLabelFor } from '@/utils/plcNorming';
import { callSetPlcNormingFlag } from '@/hooks/usePlcNorming';
import { NormingLevelSymbol } from './NormingLevelSymbol';

export interface PlcNormingFlagControlProps {
  sessionId: string;
  responseKey: string;
  questionId: string;
  slot: 'primary' | 'addendum';
  /** The teacher's current flag on this answer, if any. */
  level: PlcNormingLevel | null;
  isAudio: boolean;
  labels?: PlcNormingLevelLabels;
  onError?: (message: string) => void;
}

export const PlcNormingFlagControl: React.FC<PlcNormingFlagControlProps> = ({
  sessionId,
  responseKey,
  questionId,
  slot,
  level,
  isAudio,
  labels,
  onError,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [optimistic, setOptimistic] = useState<{
    from: PlcNormingLevel | null;
    to: PlcNormingLevel | null;
  } | null>(null);
  // The listener catching up clears the optimistic value without an effect.
  if (optimistic && !busy && optimistic.from !== level) setOptimistic(null);
  const shown = optimistic ? optimistic.to : level;

  const labelFor = (l: PlcNormingLevel) => normingLabelFor(l, labels);

  const pick = async (next: PlcNormingLevel) => {
    if (busy) return;
    const target = shown === next ? null : next;
    setBusy(true);
    setOptimistic({ from: level, to: target });
    try {
      await callSetPlcNormingFlag({
        sessionId,
        responseKey,
        questionId,
        slot,
        level: target,
      });
      setOpen(false);
    } catch (err) {
      setOptimistic(null);
      onError?.(
        err instanceof Error && err.message
          ? err.message
          : t('plcNorming.flag.failed', {
              defaultValue: 'Could not update the norming flag.',
            })
      );
    } finally {
      setBusy(false);
    }
  };

  const flagLabel = shown
    ? t('plcNorming.flag.flaggedAs', {
        defaultValue: 'Flagged for PLC norming: {{level}}',
        level: labelFor(shown),
      })
    : t('plcNorming.flag.button', { defaultValue: 'Flag for PLC norming' });

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={flagLabel}
        title={flagLabel}
        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
          shown
            ? 'text-slate-700 hover:bg-slate-100'
            : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
        }`}
      >
        <Flag
          className={`w-3.5 h-3.5 ${shown ? 'fill-current' : ''}`}
          aria-hidden="true"
        />
        {shown && <NormingLevelSymbol level={shown} className="w-3 h-3" />}
      </button>
      {open && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-2 shadow-sm max-w-xs">
          <div
            role="group"
            aria-label={t('plcNorming.flag.pickLevel', {
              defaultValue: 'Norming level',
            })}
            className="flex items-center gap-1"
          >
            {PLC_NORMING_LEVELS.map((l) => {
              const active = shown === l;
              return (
                <button
                  key={l}
                  type="button"
                  disabled={busy}
                  onClick={() => void pick(l)}
                  aria-pressed={active}
                  aria-label={labelFor(l)}
                  title={labelFor(l)}
                  className={`inline-flex h-7 min-w-[2rem] items-center justify-center rounded-md border px-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:opacity-50 ${
                    active
                      ? 'border-slate-500 bg-slate-100 text-slate-800'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                  }`}
                >
                  <NormingLevelSymbol level={l} className="w-3 h-3" />
                </button>
              );
            })}
          </div>
          <p className="text-xxs leading-snug text-slate-500">
            {t('plcNorming.flag.privacy', {
              defaultValue:
                "Your PLC sees a copy without the student's name. Check that the answer doesn't name them.",
            })}
          </p>
          {isAudio && (
            <p className="text-xxs font-semibold leading-snug text-slate-600">
              {t('plcNorming.flag.voice', {
                defaultValue: 'Your PLC will hear this recording.',
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
