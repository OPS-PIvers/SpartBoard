import React from 'react';
import { useTranslation } from 'react-i18next';
import { focusRing } from '@/components/common/lightChrome';
import { LEARNER_SPEEDS, type LearnerSpeed } from '../../utils/motion';
import { TouchHitBox } from './TouchHitBox';
import { tourAttr } from '@/config/tourAnchors';

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
      className="flex items-center rounded-full bg-slate-100 border border-slate-200"
      style={{ padding: 'min(2px, 0.5cqmin)' }}
    >
      {LEARNER_SPEEDS.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={s === speed}
          aria-label={t('glPlayer.speedOption', { speed: LABELS[s] })}
          {...tourAttr('gl-player.speed-option')}
          onClick={() => onChange(s)}
          className={`relative rounded-full font-bold tabular-nums transition-colors ${focusRing} ${
            s === speed
              ? 'bg-brand-blue-primary text-white'
              : 'text-slate-700 hover:bg-slate-200'
          }`}
          style={{
            padding: 'min(4px, 1cqmin) min(8px, 2cqmin)',
            fontSize: 'var(--gl-text-small, min(12px, 3.2cqmin))',
          }}
        >
          <TouchHitBox width="100%" />
          {LABELS[s]}
        </button>
      ))}
    </div>
  );
};
