import React from 'react';
import { useTranslation } from 'react-i18next';
import { LEARNER_SPEEDS, type LearnerSpeed } from '../../utils/motion';

interface Props {
  speed: LearnerSpeed;
  onChange: (speed: LearnerSpeed) => void;
}

const LABELS: Record<LearnerSpeed, string> = {
  0.5: '0.5×',
  1: '1×',
  1.5: '1.5×',
};

/** Footer segmented control for learner playback speed. */
export const SpeedControl: React.FC<Props> = ({ speed, onChange }) => {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('glPlayer.playbackSpeed')}
      className="flex items-center rounded-full bg-white/10 border border-white/15"
      style={{ padding: 'min(2px, 0.5cqmin)' }}
    >
      {LEARNER_SPEEDS.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={s === speed}
          aria-label={t('glPlayer.speedOption', { speed: LABELS[s] })}
          onClick={() => onChange(s)}
          className={`rounded-full font-bold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90 ${
            s === speed
              ? 'bg-white text-slate-900'
              : 'text-slate-200 hover:bg-white/15'
          }`}
          style={{
            padding: 'min(4px, 1cqmin) min(8px, 2cqmin)',
            fontSize: 'var(--gl-text-small, min(12px, 3.2cqmin))',
          }}
        >
          {LABELS[s]}
        </button>
      ))}
    </div>
  );
};
