import React, { useState } from 'react';
import { Triangle } from 'lucide-react';
import { tourFieldAttr } from '@/config/tourAnchors';
import { BLOOMS_COLORS, type BloomsLevel } from './constants';
import { BLOOMS_QUESTION_STARTERS } from './questionStarters';

export const BloomsQuestionStarters: React.FC<{ widgetType: string }> = ({
  widgetType,
}) => {
  const [activeLevel, setActiveLevel] = useState<BloomsLevel>('remember');
  const active =
    BLOOMS_QUESTION_STARTERS.find((l) => l.level === activeLevel) ??
    BLOOMS_QUESTION_STARTERS[0];
  const activeColor = BLOOMS_COLORS[active.level];

  return (
    <div className="flex h-full w-full select-none overflow-hidden rounded-[var(--window-radius,0px)]">
      <div
        className="flex flex-col border-r border-slate-200 shrink-0"
        style={{ width: 'min(180px, 30cqw)' }}
      >
        <div
          className="border-b border-slate-200"
          style={{ padding: 'min(12px, 3cqmin)' }}
        >
          <span
            className="font-black uppercase text-slate-400 tracking-widest block"
            style={{
              fontSize: 'min(10px, 2.2cqmin)',
              marginBottom: 'min(4px, 1cqmin)',
            }}
          >
            Bloom&apos;s
          </span>
          <div
            className="flex items-center text-slate-700 font-bold uppercase tracking-tight"
            style={{ gap: 'min(6px, 1.5cqmin)', fontSize: 'min(12px, 3cqmin)' }}
          >
            <Triangle
              className="text-slate-400"
              style={{
                width: 'min(14px, 3.5cqmin)',
                height: 'min(14px, 3.5cqmin)',
              }}
            />
            Levels
          </div>
        </div>

        <div
          className="flex-1 flex flex-col-reverse overflow-y-auto custom-scrollbar"
          style={{ padding: 'min(8px, 2cqmin)', gap: 'min(8px, 2cqmin)' }}
        >
          {BLOOMS_QUESTION_STARTERS.map((lvl) => {
            const isActive = lvl.level === active.level;
            const color = BLOOMS_COLORS[lvl.level];
            return (
              <button
                key={lvl.level}
                aria-pressed={isActive}
                {...tourFieldAttr(
                  'blooms-taxonomy.level',
                  widgetType,
                  lvl.level
                )}
                onClick={() => setActiveLevel(lvl.level)}
                className={`w-full flex-1 shrink-0 flex flex-col items-center justify-center transition-all border ${
                  isActive
                    ? 'shadow-md text-white scale-100'
                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100 scale-95'
                }`}
                style={{
                  minHeight: 'min(64px, 11cqmin)',
                  padding: 'min(6px, 1.5cqmin)',
                  borderRadius: 'min(12px, 3cqmin)',
                  ...(isActive
                    ? { backgroundColor: color, borderColor: color }
                    : { borderBottomColor: color, borderBottomWidth: '3px' }),
                }}
              >
                <span
                  className="font-black leading-none"
                  style={{
                    fontSize: 'min(28px, 5cqmin)',
                    color: isActive ? '#ffffff' : color,
                    marginBottom: 'min(4px, 1cqmin)',
                  }}
                >
                  {lvl.number}
                </span>
                <span
                  className="font-bold text-center leading-tight uppercase tracking-tight"
                  style={{ fontSize: 'min(14px, 2.8cqmin)' }}
                >
                  {lvl.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto custom-scrollbar"
        style={{ padding: 'min(20px, 5cqmin)' }}
      >
        <div
          key={active.level}
          className="animate-in fade-in slide-in-from-right-2 duration-300"
        >
          <h3
            className="font-black uppercase tracking-tight"
            style={{
              color: activeColor,
              fontSize: 'min(32px, 5cqmin)',
              marginBottom: 'min(4px, 1cqmin)',
            }}
          >
            Level {active.number}:{' '}
            {active.title.split('/').map((part, i) => (
              <React.Fragment key={part}>
                {i > 0 && (
                  <>
                    /<wbr />
                  </>
                )}
                {part}
              </React.Fragment>
            ))}
          </h3>
          <p
            className="text-slate-500 leading-snug"
            style={{
              fontSize: 'min(20px, 3.4cqmin)',
              marginBottom: 'min(16px, 4cqmin)',
            }}
          >
            {active.description}
          </p>

          <ul className="flex flex-col" style={{ gap: 'min(12px, 3cqmin)' }}>
            {active.questionStarters.map((starter) => (
              <li
                key={starter}
                className="font-medium text-slate-700 border-l-4 leading-relaxed shadow-sm bg-slate-50 rounded-r-lg"
                style={{
                  borderLeftColor: activeColor,
                  fontSize: 'min(28px, 4.2cqmin)',
                  paddingLeft: 'min(16px, 4cqmin)',
                  paddingTop: 'min(8px, 2cqmin)',
                  paddingBottom: 'min(8px, 2cqmin)',
                }}
              >
                {starter}
              </li>
            ))}
          </ul>

          <div
            className="border-t border-slate-200"
            style={{
              marginTop: 'min(20px, 5cqmin)',
              paddingTop: 'min(12px, 3cqmin)',
            }}
          >
            <div
              className="font-black uppercase text-slate-400 tracking-widest"
              style={{
                fontSize: 'min(14px, 2.6cqmin)',
                marginBottom: 'min(6px, 1.5cqmin)',
              }}
            >
              Key words
            </div>
            <p
              className="text-slate-700 leading-relaxed"
              style={{ fontSize: 'min(20px, 3.4cqmin)' }}
            >
              {active.keyWords.map((word, i) => (
                <React.Fragment key={word}>
                  {i > 0 && ' '}
                  <span className="whitespace-nowrap">
                    {word}
                    {i < active.keyWords.length - 1 && ' ·'}
                  </span>
                </React.Fragment>
              ))}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
