import React, { useState } from 'react';
import { Triangle } from 'lucide-react';
import { tourFieldAttr } from '@/config/tourAnchors';
import { resolveBaseTextScale } from '@/config/widgetAppearance';
import type { WidgetData } from '@/types';
import { hexToRgba } from '@/utils/styles';
import { BLOOMS_COLORS, type BloomsLevel } from './constants';
import { BLOOMS_QUESTION_STARTERS } from './questionStarters';

export const BloomsQuestionStarters: React.FC<{
  widgetType: string;
  baseTextSize?: WidgetData['baseTextSize'];
  cardColor?: string;
  cardOpacity?: number;
}> = ({ widgetType, baseTextSize, cardColor, cardOpacity }) => {
  const surfaceBg = cardColor
    ? hexToRgba(cardColor, cardOpacity ?? 1)
    : undefined;
  // Window text size scales the starters; the rail only grows with the widget.
  const textScale = resolveBaseTextScale(baseTextSize);
  const [activeLevel, setActiveLevel] = useState<BloomsLevel>('remember');
  const active =
    BLOOMS_QUESTION_STARTERS.find((l) => l.level === activeLevel) ??
    BLOOMS_QUESTION_STARTERS[0];
  const activeColor = BLOOMS_COLORS[active.level];

  return (
    <div
      className="flex h-full w-full select-none overflow-hidden rounded-(--window-radius,0px)"
      style={{ backgroundColor: surfaceBg }}
    >
      <div
        className="flex flex-col border-r border-slate-200 shrink-0"
        style={{ width: 'min(max(140px, 30cqmin), 30cqw)' }}
      >
        <div
          className="border-b border-slate-200"
          style={{ padding: '2cqmin' }}
        >
          <span
            className="font-black uppercase text-slate-400 tracking-widest block"
            style={{
              fontSize: 'max(9px, 2.2cqmin)',
              marginBottom: '1cqmin',
            }}
          >
            Bloom&apos;s
          </span>
          <div
            className="flex items-center text-slate-700 font-bold uppercase tracking-tight"
            style={{ gap: '1.5cqmin', fontSize: 'max(11px, 3cqmin)' }}
          >
            <Triangle
              className="text-slate-400"
              style={{
                width: 'max(12px, 3.5cqmin)',
                height: 'max(12px, 3.5cqmin)',
              }}
            />
            Levels
          </div>
        </div>

        <div
          className="flex-1 flex flex-col-reverse overflow-y-auto custom-scrollbar"
          style={{ padding: '1.5cqmin', gap: '1.5cqmin' }}
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
                  minHeight: '11cqmin',
                  padding: '1cqmin',
                  borderRadius: '3cqmin',
                  ...(isActive
                    ? { backgroundColor: color, borderColor: color }
                    : { borderBottomColor: color, borderBottomWidth: '3px' }),
                }}
              >
                <span
                  className="font-black leading-none"
                  style={{
                    fontSize: 'max(14px, 4cqmin)',
                    color: isActive ? '#ffffff' : color,
                    marginBottom: '1cqmin',
                  }}
                >
                  {lvl.number}
                </span>
                <span
                  className="font-bold text-center leading-tight uppercase tracking-tight"
                  style={{ fontSize: 'max(10px, 2.8cqmin)' }}
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
        style={{
          padding: '5cqmin',
          fontSize: `max(${13 * textScale}px, ${4.2 * textScale}cqmin)`,
        }}
      >
        <div
          key={active.level}
          className="animate-in fade-in slide-in-from-right-2 duration-300"
        >
          <h3
            className="font-black uppercase tracking-tight leading-snug"
            style={{
              color: activeColor,
              fontSize: '1.19em',
              marginBottom: '0.24em',
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
              fontSize: '0.81em',
              marginBottom: '0.95em',
            }}
          >
            {active.description}
          </p>

          <ul className="flex flex-col" style={{ gap: '0.71em' }}>
            {active.questionStarters.map((starter) => (
              <li
                key={starter}
                className="font-medium text-slate-700 border-l-4 leading-relaxed shadow-xs bg-slate-50 rounded-r-lg"
                style={{
                  borderLeftColor: activeColor,
                  paddingLeft: '0.95em',
                  paddingTop: '0.48em',
                  paddingBottom: '0.48em',
                }}
              >
                {starter}
              </li>
            ))}
          </ul>

          <div
            className="border-t border-slate-200"
            style={{
              marginTop: '1.19em',
              paddingTop: '0.71em',
            }}
          >
            <div
              className="font-black uppercase text-slate-400 tracking-widest"
              style={{
                fontSize: '0.77em',
                marginBottom: '0.36em',
              }}
            >
              Key words
            </div>
            <p
              className="text-slate-700 leading-relaxed"
              style={{ fontSize: '0.81em' }}
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
