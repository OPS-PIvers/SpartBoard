// PLC assessment page: flagged answers for norming, by question then level; never shows the student.
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getBlob, ref } from 'firebase/storage';
import { Play } from 'lucide-react';
import { storage } from '@/config/firebase';
import type { PlcNormingCopy, PlcNormingLevelLabels } from '@/types';
import {
  usePlcNormingCopies,
  callSetPlcNormingFlag,
} from '@/hooks/usePlcNorming';
import { groupNormingCopies, normingLabelFor } from '@/utils/plcNorming';
import { NormingLevelSymbol } from './NormingLevelSymbol';

/** Fetches through the rules-checked read (never a public download URL) on first play. */
const NormingAudio: React.FC<{ path: string }> = ({ path }) => {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const urlRef = useRef<string | null>(null);
  const load = async () => {
    setState('loading');
    try {
      const blob = await getBlob(ref(storage, path));
      const next = URL.createObjectURL(blob);
      urlRef.current = next;
      setUrl(next);
      setState('idle');
    } catch {
      setState('error');
    }
  };
  React.useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    []
  );
  if (url) return <audio controls autoPlay src={url} className="w-full h-9" />;
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void load()}
        disabled={state === 'loading'}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
      >
        <Play className="w-3.5 h-3.5" aria-hidden="true" />
        {state === 'loading'
          ? t('plcNorming.section.loadingAudio', { defaultValue: 'Loading…' })
          : t('plcNorming.section.play', { defaultValue: 'Play recording' })}
      </button>
      {state === 'error' && (
        <span className="text-xs text-slate-500">
          {t('plcNorming.section.audioFailed', {
            defaultValue: 'Could not load this recording.',
          })}
        </span>
      )}
    </div>
  );
};

const NormingCard: React.FC<{
  copy: PlcNormingCopy;
  canRemove: boolean;
  plcId: string;
  onError?: (message: string) => void;
}> = ({ copy, canRemove, plcId, onError }) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    try {
      await callSetPlcNormingFlag({ plcId, normingId: copy.id, level: null });
    } catch (err) {
      setBusy(false);
      onError?.(
        err instanceof Error && err.message
          ? err.message
          : t('plcNorming.section.removeFailed', {
              defaultValue: 'Could not remove this answer.',
            })
      );
    }
  };
  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3">
      {copy.kind === 'audio' && copy.audioPath ? (
        <NormingAudio path={copy.audioPath} />
      ) : (
        <p className="whitespace-pre-wrap text-sm text-slate-800">
          {copy.answerText}
          {copy.truncated && (
            <span className="text-slate-500">
              {' '}
              {t('plcNorming.section.truncated', {
                defaultValue: '(shortened)',
              })}
            </span>
          )}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {t('plcNorming.section.flaggedBy', {
            defaultValue: 'Flagged by {{name}}',
            name: copy.flaggedByName,
          })}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="rounded px-1.5 py-0.5 font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
          >
            {t('plcNorming.section.remove', { defaultValue: 'Remove' })}
          </button>
        )}
      </div>
    </li>
  );
};

export interface PlcNormingSectionProps {
  plcId: string;
  assessmentId: string;
  currentUid: string | undefined;
  labels?: PlcNormingLevelLabels;
  onError?: (message: string) => void;
}

export const PlcNormingSection: React.FC<PlcNormingSectionProps> = ({
  plcId,
  assessmentId,
  currentUid,
  labels,
  onError,
}) => {
  const { t } = useTranslation();
  const { copies, loading, error } = usePlcNormingCopies(
    plcId,
    assessmentId,
    true
  );
  const groups = groupNormingCopies(copies);

  return (
    <section
      aria-labelledby="plc-norming-heading"
      className="flex flex-col gap-3"
    >
      <div>
        <h3
          id="plc-norming-heading"
          className="text-sm font-bold text-slate-800"
        >
          {t('plcNorming.section.heading', { defaultValue: 'Norming' })}
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          {t('plcNorming.section.description', {
            defaultValue:
              'Answers teammates flagged from their grader, shared without student names. Bring them to your next meeting.',
          })}
        </p>
      </div>
      {loading ? (
        <p className="text-xs text-slate-500">
          {t('plcNorming.section.loading', {
            defaultValue: 'Loading flagged answers…',
          })}
        </p>
      ) : error ? (
        <p className="text-xs text-slate-500">
          {t('plcNorming.section.error', {
            defaultValue: 'Could not load flagged answers.',
          })}
        </p>
      ) : groups.length === 0 ? (
        <p className="text-xs text-slate-500">
          {t('plcNorming.section.empty', {
            defaultValue:
              'Nothing flagged yet. In the grader, use the flag under an answer to share it here.',
          })}
        </p>
      ) : (
        <ol className="flex flex-col gap-4">
          {groups.map((g) => (
            <li key={g.questionId} className="flex flex-col gap-2">
              <h4 className="text-sm font-semibold text-slate-800">
                {t('plcNorming.section.question', {
                  defaultValue: 'Q{{n}}. {{text}}',
                  n: g.questionIndex + 1,
                  text: g.questionText,
                })}
              </h4>
              {g.byLevel.map(({ level, copies: list }) => (
                <div key={level} className="flex flex-col gap-1.5 pl-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <NormingLevelSymbol level={level} className="w-3 h-3" />
                    <span>{normingLabelFor(level, labels)}</span>
                    <span className="font-normal text-slate-400">
                      ({list.length})
                    </span>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {list.map((c) => (
                      <NormingCard
                        key={c.id}
                        copy={c}
                        plcId={plcId}
                        canRemove={
                          !!currentUid && c.flaggedByUid === currentUid
                        }
                        onError={onError}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};
