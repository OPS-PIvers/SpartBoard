import React, { useState, useEffect } from 'react';
import { useDashboard } from '@/context/useDashboard';
import {
  WidgetData,
  RevealGridConfig,
  DEFAULT_GLOBAL_STYLE,
  MemoryCard,
} from '@/types';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { Toggle } from '@/components/common/Toggle';
import { getFontClass } from '@/utils/styles';

const shuffleArray = <T,>(array: T[]): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

export const RevealGridWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, activeDashboard } = useDashboard();
  const config = widget.config as RevealGridConfig;
  const globalStyle = activeDashboard?.globalStyle ?? DEFAULT_GLOBAL_STYLE;
  const [isShowAnswersMode, setIsShowAnswersMode] = useState(false);

  // Fallback to defaults if needed
  const configCards = config.cards;
  const cards = React.useMemo(() => configCards ?? [], [configCards]);
  const columns = config.columns ?? 3;
  const fontFamily = config.fontFamily ?? 'global';
  const fontClass = getFontClass(fontFamily, globalStyle.fontFamily);

  // Auto-flip unmatched memory cards after 2 seconds
  useEffect(() => {
    const { isMemoryMode, memoryCards } = config;

    if (!isMemoryMode || !memoryCards) return;

    const revealedCards = memoryCards.filter(
      (c) => c.isRevealed && !c.isMatched
    );

    if (revealedCards.length === 2) {
      const timeoutId = setTimeout(() => {
        const resetCards = memoryCards.map((card) => {
          if (!card.isMatched) {
            return { ...card, isRevealed: false };
          }
          return card;
        });
        updateWidget(widget.id, {
          config: { ...config, memoryCards: resetCards },
        });
      }, 2000);

      return () => clearTimeout(timeoutId);
    }

    return undefined;
  }, [config, updateWidget, widget.id]);

  const handleCardClick = (cardId: string) => {
    const updatedCards = cards.map((card) =>
      card.id === cardId ? { ...card, isRevealed: !card.isRevealed } : card
    );
    updateWidget(widget.id, { config: { ...config, cards: updatedCards } });
  };

  const handleStartMemoryGame = React.useCallback(() => {
    // Collect all valid cards (must have both front and back)
    const validCards = cards.filter((c) => c.frontContent && c.backContent);

    // We shuffle them to ensure randomness
    const shuffledValid = shuffleArray(validCards);

    const memoryDeck: MemoryCard[] = [];
    shuffledValid.forEach((card) => {
      memoryDeck.push({
        id: crypto.randomUUID(),
        originalId: card.id,
        content: card.frontContent,
        type: 'term',
        isRevealed: false,
        isMatched: false,
        bgColor: card.bgColor,
      });
      memoryDeck.push({
        id: crypto.randomUUID(),
        originalId: card.id,
        content: card.backContent,
        type: 'definition',
        isRevealed: false,
        isMatched: false,
        bgColor: card.bgColor,
      });
    });

    // Shuffle the final deck
    const shuffledDeck = shuffleArray(memoryDeck);
    updateWidget(widget.id, {
      config: { ...config, memoryCards: shuffledDeck },
    });
  }, [cards, config, updateWidget, widget.id]);

  const handleMemoryCardClick = (cardId: string) => {
    if (!config.memoryCards) return;

    const cardToFlip = config.memoryCards.find((c) => c.id === cardId);
    if (!cardToFlip || cardToFlip.isRevealed || cardToFlip.isMatched) return;

    const currentlyRevealed = config.memoryCards.filter(
      (c) => c.isRevealed && !c.isMatched
    );

    // Prevent flipping more than 2 at a time
    if (currentlyRevealed.length >= 2) return;

    let updatedCards = config.memoryCards.map((c) =>
      c.id === cardId ? { ...c, isRevealed: true } : c
    );

    const newlyRevealed = updatedCards.filter(
      (c) => c.isRevealed && !c.isMatched
    );

    // Check for match
    if (newlyRevealed.length === 2) {
      if (
        newlyRevealed[0].originalId === newlyRevealed[1].originalId &&
        newlyRevealed[0].type !== newlyRevealed[1].type
      ) {
        updatedCards = updatedCards.map((c) => {
          if (c.id === newlyRevealed[0].id || c.id === newlyRevealed[1].id) {
            return { ...c, isMatched: true };
          }
          return c;
        });
      }
    }

    updateWidget(widget.id, {
      config: { ...config, memoryCards: updatedCards },
    });
  };

  const isMemoryMode = config.isMemoryMode;
  const memoryCards = config.memoryCards ?? [];
  const revealMode = config.revealMode ?? 'flip';

  // Automatically start game if no cards are populated and we are in memory mode
  useEffect(() => {
    // Only auto-start if memoryCards is completely uninitialized (undefined or null)
    // to avoid an infinite loop if the user has 0 valid cards to play with.
    if (isMemoryMode && config.memoryCards === undefined) {
      handleStartMemoryGame();
    }
  }, [isMemoryMode, config.memoryCards, handleStartMemoryGame]);

  return (
    <WidgetLayout
      header={
        <div className="flex justify-between items-center w-full">
          <span className="font-bold text-gray-700">Vocabulary Review</span>
          <div className="flex items-center gap-2">
            {isMemoryMode ? (
              <button
                onClick={handleStartMemoryGame}
                className="bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold py-1 px-3 rounded-lg text-xs transition-colors"
              >
                Start Over
              </button>
            ) : (
              <>
                <span className="text-xs text-gray-600 font-medium">
                  Show Answers
                </span>
                <Toggle
                  checked={isShowAnswersMode}
                  onChange={() => setIsShowAnswersMode(!isShowAnswersMode)}
                  size="sm"
                />
              </>
            )}
          </div>
        </div>
      }
      content={
        <div
          className={`grid gap-4 h-full w-full ${fontClass}`}
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {isMemoryMode
            ? // MEMORY MODE GRID
              memoryCards.map((card, index) => (
                <div
                  key={card.id}
                  className={`relative perspective-1000 cursor-pointer group ${card.isMatched ? 'invisible' : ''}`}
                  onClick={() => handleMemoryCardClick(card.id)}
                >
                  <div
                    className={`w-full h-full transition-all duration-500 ${
                      revealMode === 'flip'
                        ? `preserve-3d ${card.isRevealed ? 'rotate-y-180' : ''}`
                        : ''
                    }`}
                  >
                    {/* FRONT OF CARD (Number) */}
                    <div
                      className={`absolute w-full h-full flex flex-col items-center justify-center rounded-xl border-2 shadow-sm ${
                        revealMode === 'flip'
                          ? 'backface-hidden'
                          : 'transition-opacity duration-500'
                      } ${
                        revealMode === 'fade'
                          ? card.isRevealed
                            ? 'opacity-0'
                            : 'opacity-100'
                          : ''
                      }`}
                      style={{
                        backgroundColor:
                          card.bgColor ?? config.defaultCardColor ?? '#dbeafe',
                        borderColor: '#bfdbfe',
                      }}
                    >
                      <span
                        className="font-bold text-center text-slate-400"
                        style={{
                          fontSize: 'min(32px, 8cqmin)',
                        }}
                      >
                        {index + 1}
                      </span>
                    </div>

                    {/* BACK OF CARD (Content) */}
                    <div
                      className={`absolute w-full h-full flex items-center justify-center rounded-xl border-2 shadow-sm ${
                        revealMode === 'flip'
                          ? 'backface-hidden rotate-y-180'
                          : 'transition-opacity duration-500'
                      } ${
                        revealMode === 'fade'
                          ? card.isRevealed
                            ? 'opacity-100'
                            : 'opacity-0 pointer-events-none'
                          : ''
                      }`}
                      style={{
                        backgroundColor:
                          config.defaultCardBackColor ?? '#dcfce7',
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
                        {card.content}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            : // REVIEW MODE GRID
              cards.map((card) => (
                <div
                  key={card.id}
                  className="relative perspective-1000 cursor-pointer group"
                  onClick={() => handleCardClick(card.id)}
                >
                  <div
                    className={`w-full h-full transition-all duration-500 ${
                      revealMode === 'flip'
                        ? `preserve-3d ${card.isRevealed ? 'rotate-y-180' : ''}`
                        : ''
                    }`}
                  >
                    {/* FRONT OF CARD */}
                    <div
                      className={`absolute w-full h-full flex flex-col items-center justify-center rounded-xl border-2 shadow-sm ${
                        revealMode === 'flip'
                          ? 'backface-hidden'
                          : 'transition-opacity duration-500'
                      } ${
                        revealMode === 'fade'
                          ? card.isRevealed
                            ? 'opacity-0'
                            : 'opacity-100'
                          : ''
                      }`}
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
                      className={`absolute w-full h-full flex items-center justify-center rounded-xl border-2 shadow-sm ${
                        revealMode === 'flip'
                          ? 'backface-hidden rotate-y-180'
                          : 'transition-opacity duration-500'
                      } ${
                        revealMode === 'fade'
                          ? card.isRevealed
                            ? 'opacity-100'
                            : 'opacity-0 pointer-events-none'
                          : ''
                      }`}
                      style={{
                        backgroundColor:
                          config.defaultCardBackColor ?? '#dcfce7',
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
