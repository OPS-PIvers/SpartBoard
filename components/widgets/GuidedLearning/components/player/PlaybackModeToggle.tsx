import React from 'react';
import { useTranslation } from 'react-i18next';
import type { PlaybackMode } from '../../types/stage';

interface Props {
  mode: PlaybackMode;
  onChange: (mode: PlaybackMode) => void;
}

const OPTIONS: { mode: PlaybackMode; label: string; hint: string }[] = [
  { mode: 'watch', label: 'glPlayer.watch', hint: 'glPlayer.watchHint' },
  { mode: 'try', label: 'glPlayer.tryIt', hint: 'glPlayer.tryHint' },
];

/** Footer switch between watching the walkthrough and doing it yourself. */
export const PlaybackModeToggle: React.FC<Props> = ({ mode, onChange }) => {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('glPlayer.playbackMode')}
      className="flex items-center rounded-full bg-white/10 border border-white/15 flex-shrink-0"
      style={{ padding: 'min(2px, 0.5cqmin)' }}
    >
      {OPTIONS.map((o) => (
        <button
          key={o.mode}
          type="button"
          aria-pressed={o.mode === mode}
          title={t(o.hint)}
          onClick={() => onChange(o.mode)}
          className={`rounded-full font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90 ${
            o.mode === mode
              ? 'bg-white text-slate-900'
              : 'text-slate-200 hover:bg-white/15'
          }`}
          style={{
            padding: 'min(4px, 1cqmin) min(10px, 2.4cqmin)',
            fontSize: 'min(12px, 3.2cqmin)',
          }}
        >
          {t(o.label)}
        </button>
      ))}
    </div>
  );
};
