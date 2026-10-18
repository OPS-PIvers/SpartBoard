import React, { useState, useEffect } from 'react';
import {
  useGlobalStyle,
  useDashboardActions,
} from '@/context/dashboardCanvasStore';
import { WidgetData, RevealGridConfig, MemoryCard } from '@/types';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { Toggle } from '@/components/common/Toggle';
import { getFontClass } from '@/utils/styles';
import { shuffleArray } from '@/utils/randomHelpers';

// One font size for a set of card texts, sized so the longest fits its card and short words stay whole.
const fitFont = (
  texts: (string | undefined)[],
  capPx: number,
  share = 1
): string => {
  const values = texts.map((t) => t ?? '');
  const length = Math.max(4, ...values.map((v) => v.length));
  // Card width plus height approximates the card's area, so wide cards get bigger text than cqmin allows.
  const k = (29 * Math.sqrt(share)) / Math.sqrt(length);
  const longest = Math.max(
    4,
    ...values.flatMap((v) => v.split(/\s+/).map((w) => w.length))
  );
  const wordFit = longest <= 24 ? `, ${(140 / longest).toFixed(2)}cqw` : '';
  return `min(${capPx}px, calc(${k.toFixed(2)} * (1cqw + 1cqh))${wordFit})`;
};

const GAP = 'min(16px, 4cqmin)';

const CARD_STYLE: React.CSSProperties = { containerType: 'size' };

export const RevealGridWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboardActions();
  const config = widget.config as RevealGridConfig;
  const globalStyle = useGlobalStyle();
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
  const fronts = cards.map((c) => c.frontContent);
  const backs = cards.map((c) => c.backContent);
  const frontFont = fitFont(fronts, 56);
  const backFont = fitFont(backs, 40);
  const answerFont = fitFont(backs, 28, 0.4);
  const memoryFont = fitFont(
    memoryCards.map((c) => c.content),
    40
  );
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
          <span
            className="font-bold text-gray-700"
            style={{ fontSize: 'min(14px, 5cqmin)' }}
          >
            Vocabulary Review
          </span>
          <div
            className="flex items-center"
            style={{ gap: 'min(8px, 2cqmin)' }}
          >
            {isMemoryMode ? (
              <button
                onClick={handleStartMemoryGame}
                className="bg-blue-100 hover:bg-blue-200 text-blue-700 font-bold rounded-lg transition-colors"
                style={{
                  paddingTop: 'min(4px, 1cqmin)',
                  paddingBottom: 'min(4px, 1cqmin)',
                  paddingLeft: 'min(12px, 3cqmin)',
                  paddingRight: 'min(12px, 3cqmin)',
                  fontSize: 'min(12px, 4.5cqmin)',
                }}
              >
                Start Over
              </button>
            ) : (
              <>
                <span
                  className="text-gray-600 font-medium"
                  style={{ fontSize: 'min(12px, 4.5cqmin)' }}
                >
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
        <div className="h-full w-full overflow-y-auto">
          <div
            className={`grid min-h-full w-full ${fontClass}`}
            style={{
              // Up to the configured column count; fewer when cards would get too narrow to read.
              gridTemplateColumns: `repeat(auto-fill, minmax(max(min(88px, 30cqmin), calc((100% - ${columns - 1} * ${GAP}) / ${columns})), 1fr))`,
              gridAutoRows: 'minmax(min(64px, 25cqmin), 1fr)',
              gap: GAP,
            }}
          >
            {isMemoryMode
              ? // MEMORY MODE GRID
                memoryCards.map((card, index) => (
                  <div
                    key={card.id}
                    className={`relative perspective-1000 cursor-pointer group ${card.isMatched ? 'invisible' : ''}`}
                    style={CARD_STYLE}
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
                            card.bgColor ??
                            config.defaultCardColor ??
                            '#dbeafe',
                          borderColor: '#bfdbfe',
                        }}
                      >
                        <span
                          className="font-bold text-center text-slate-400"
                          style={{
                            fontSize: 'min(64px, 40cqmin)',
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
                          className="text-center [overflow-wrap:anywhere] w-full text-slate-800 font-medium"
                          style={{
                            fontSize: memoryFont,
                            padding: 'min(24px, 6cqmin)',
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
                    style={CARD_STYLE}
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
                            card.bgColor ??
                            config.defaultCardColor ??
                            '#dbeafe',
                          borderColor: '#bfdbfe',
                        }}
                      >
                        <span
                          className="font-bold text-center [overflow-wrap:anywhere] w-full"
                          style={{
                            fontSize: frontFont,
                            padding: 'min(24px, 6cqmin)',
                          }}
                        >
                          {card.frontContent}
                        </span>

                        {/* THE MAGIC: X-Ray Answer Overlay */}
                        {isShowAnswersMode && !card.isRevealed && (
                          <div
                            className="absolute bg-yellow-100/90 rounded border border-yellow-300 text-yellow-800 text-center shadow-sm z-10"
                            style={{
                              insetInline: 'min(8px, 4cqmin)',
                              bottom: 'min(8px, 4cqmin)',
                              padding: 'min(8px, 3cqmin)',
                              fontSize: answerFont,
                            }}
                          >
                            <span
                              className="uppercase tracking-wider block opacity-75"
                              style={{
                                fontSize: 'min(12px, 7cqmin)',
                                marginBottom: 'min(4px, 1.5cqmin)',
                              }}
                            >
                              Answer
                            </span>
                            <span className="[overflow-wrap:anywhere] font-medium">
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
                          className="text-center [overflow-wrap:anywhere] w-full text-slate-800 font-medium"
                          style={{
                            fontSize: backFont,
                            padding: 'min(24px, 6cqmin)',
                          }}
                        >
                          {card.backContent}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
          </div>
        </div>
      }
    />
  );
};
