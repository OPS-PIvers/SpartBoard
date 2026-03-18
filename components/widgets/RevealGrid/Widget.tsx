import React, { useState } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, RevealGridConfig, DEFAULT_GLOBAL_STYLE } from '@/types';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { Toggle } from '@/components/common/Toggle';
import { getFontClass } from '@/utils/styles';

export const RevealGridWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, activeDashboard } = useDashboard();
  const config = widget.config as RevealGridConfig;
  const globalStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;
  const [isShowAnswersMode, setIsShowAnswersMode] = useState(false);

  // Fallback to defaults if needed
  const cards = config.cards ?? [];
  const columns = config.columns ?? 3;
  const fontFamily = config.fontFamily ?? 'global';
  const fontClass = getFontClass(fontFamily, globalStyle.fontFamily);

  const handleCardClick = (cardId: string) => {
    const updatedCards = cards.map((card) =>
      card.id === cardId ? { ...card, isRevealed: !card.isRevealed } : card
    );
    updateWidget(widget.id, { config: { ...config, cards: updatedCards } });
  };

  return (
    <WidgetLayout
      header={
        <div className="flex justify-between items-center w-full">
          <span className="font-bold text-gray-700">Vocabulary Review</span>
          {/* Local toggle, doesn't sync to the smartboard */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-600 font-medium">
              Show Answers
            </span>
            <Toggle
              checked={isShowAnswersMode}
              onChange={() => setIsShowAnswersMode(!isShowAnswersMode)}
              size="sm"
            />
          </div>
        </div>
      }
      content={
        <div
          className={`grid gap-4 h-full w-full ${fontClass}`}
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {cards.map((card) => (
            <div
              key={card.id}
              className="relative perspective-1000 cursor-pointer group"
              onClick={() => handleCardClick(card.id)}
            >
              {/* The CSS Flip Container */}
              <div
                className={`w-full h-full transition-transform duration-500 preserve-3d ${card.isRevealed ? 'rotate-y-180' : ''}`}
              >
                {/* FRONT OF CARD */}
                <div
                  className="absolute w-full h-full backface-hidden flex flex-col items-center justify-center rounded-xl border-2 shadow-sm"
                  style={{
                    backgroundColor:
                      card.bgColor ?? config.defaultCardColor ?? '#dbeafe',
                    borderColor: '#bfdbfe',
                  }}
                >
                  <span
                    className="font-bold text-center break-words w-full"
                    style={{
                      fontSize: 'min(24px, 6cqmin)',
                      padding: 'min(16px, 4cqmin)',
                    }}
                  >
                    {card.frontContent}
                  </span>

                  {/* THE MAGIC: X-Ray Answer Overlay */}
                  {isShowAnswersMode && !card.isRevealed && (
                    <div
                      className="absolute bottom-2 left-2 right-2 bg-yellow-100/90 rounded border border-yellow-300 text-yellow-800 text-center shadow-sm z-10"
                      style={{
                        padding: 'min(8px, 2cqmin)',
                        fontSize: 'min(14px, 3.5cqmin)',
                      }}
                    >
                      <span
                        className="uppercase tracking-wider block opacity-75 mb-1"
                        style={{ fontSize: 'min(12px, 3cqmin)' }}
                      >
                        Answer
                      </span>
                      <span className="break-words font-medium">
                        {card.backContent}
                      </span>
                    </div>
                  )}
                </div>

                {/* BACK OF CARD (The actual reveal) */}
                <div
                  className="absolute w-full h-full backface-hidden rotate-y-180 flex items-center justify-center rounded-xl border-2 shadow-sm"
                  style={{
                    backgroundColor: config.defaultCardBackColor ?? '#dcfce7',
                    borderColor: 'rgba(0,0,0,0.1)',
                  }}
                >
                  <span
                    className="text-center break-words w-full text-slate-800 font-medium"
                    style={{
                      fontSize: 'min(20px, 5cqmin)',
                      padding: 'min(16px, 4cqmin)',
                    }}
                  >
                    {card.backContent}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      }
    />
  );
};
