import React from 'react';
import { useTranslation } from 'react-i18next';
import { POSTER_LEVELS, getLevelData } from '../constants';

const splitLabel = (label: string) => {
  const [number, ...name] = label.split(' - ');
  return { number, name: name.join(' - ') };
};

/** The current level as one big number and name, readable from the back of the room. */
export const LevelNameView: React.FC<{
  volume: number;
  targetLevel: number | null;
}> = ({ volume, targetLevel }) => {
  const { t } = useTranslation();
  const level = getLevelData(volume);
  const { number, name } = splitLabel(level.label);

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center text-slate-900 transition-colors duration-300"
      style={{
        backgroundColor: level.color,
        borderRadius: 'min(16px, 4cqmin)',
        gap: 'min(4px, 1cqmin)',
      }}
    >
      <span
        className="font-black leading-none tabular-nums"
        style={{ fontSize: '40cqmin' }}
      >
        {number}
      </span>
      <span
        className="font-black uppercase tracking-wide leading-tight text-center"
        // Sized by length so the longest name (Conversation) still fits the width.
        style={{
          fontSize: `${Math.min(13, 110 / name.length).toFixed(1)}cqmin`,
        }}
      >
        {name}
      </span>
      {targetLevel !== null && (
        <span
          className="font-bold leading-tight"
          style={{ fontSize: '6cqmin' }}
        >
          {t('widgets.sound.targetIs', {
            level: splitLabel(POSTER_LEVELS[targetLevel].label).name,
          })}
        </span>
      )}
    </div>
  );
};
