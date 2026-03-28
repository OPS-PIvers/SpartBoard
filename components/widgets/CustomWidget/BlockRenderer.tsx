/**
 * BlockRenderer.tsx
 *
 * Renders the appropriate block component based on block.type.
 * All block components use container query units (cqmin) for sizing.
 */

import React, { useState } from 'react';
import {
  CustomBlockDefinition,
  TextBlockConfig,
  HeadingBlockConfig,
  ImageBlockConfig,
  RevealBlockConfig,
  FlipCardBlockConfig,
  ConditionalLabelBlockConfig,
  BadgeBlockConfig,
  TrafficLightBlockConfig,
  ButtonBlockConfig,
  CounterBlockConfig,
  ToggleBlockConfig,
  StarsBlockConfig,
  TextInputBlockConfig,
  PollBlockConfig,
  MultipleChoiceBlockConfig,
  MatchPairBlockConfig,
  HotspotBlockConfig,
  SortBinBlockConfig,
  ProgressBlockConfig,
  TimerBlockConfig,
  ScoreBlockConfig,
  ChecklistBlockConfig,
} from '@/types';
import { BlockState, WidgetAction } from './types';
import { useWidgetState } from './WidgetStateContext';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface BlockProps<T> {
  block: CustomBlockDefinition;
  config: T;
  blockState: BlockState;
  dispatch: React.Dispatch<WidgetAction>;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Display Blocks
// ---------------------------------------------------------------------------

function TextBlock({ block, config, blockState }: BlockProps<TextBlockConfig>) {
  const displayText = blockState.text || config.text;
  return (
    <div
      className="w-full h-full flex items-center justify-center overflow-hidden p-1"
      style={{
        color: block.style.textColor ?? undefined,
        fontSize: 'min(16px, 6cqmin)',
      }}
    >
      <span className="text-center break-words">{displayText}</span>
    </div>
  );
}

function HeadingBlock({
  block,
  config,
  blockState,
}: BlockProps<HeadingBlockConfig>) {
  const displayText = blockState.text || config.text;
  const sizeMap: Record<string, string> = {
    sm: 'min(18px, 8cqmin)',
    md: 'min(24px, 12cqmin)',
    lg: 'min(32px, 18cqmin)',
    xl: 'min(40px, 25cqmin)',
  };
  const fontSize = sizeMap[config.size ?? 'md'];
  return (
    <div
      className="w-full h-full flex items-center justify-center overflow-hidden p-1"
      style={{
        color: block.style.textColor ?? undefined,
        fontSize,
        fontWeight: 'bold',
      }}
    >
      <span className="text-center break-words">{displayText}</span>
    </div>
  );
}

function ImageBlock({
  block,
  config,
  blockState,
  dispatch,
}: BlockProps<ImageBlockConfig>) {
  const src = blockState.image || config.url;
  return (
    <div
      className="w-full h-full flex items-center justify-center overflow-hidden cursor-pointer"
      onClick={() =>
        dispatch({ type: 'BLOCK_EVENT', sourceId: block.id, event: 'on-click' })
      }
    >
      {src ? (
        <img
          src={src}
          alt={config.alt ?? ''}
          className="w-full h-full"
          style={{ objectFit: config.objectFit ?? 'cover' }}
        />
      ) : (
        <div
          className="text-slate-400 text-center"
          style={{ fontSize: 'min(12px, 4.5cqmin)' }}
        >
          No image
        </div>
      )}
    </div>
  );
}

function RevealBlock({
  block,
  config,
  blockState,
  dispatch,
}: BlockProps<RevealBlockConfig>) {
  const isRevealed = blockState.revealed;
  return (
    <div
      className="relative w-full h-full flex items-center justify-center overflow-hidden cursor-pointer"
      onClick={() =>
        dispatch({ type: 'BLOCK_EVENT', sourceId: block.id, event: 'on-click' })
      }
    >
      <div
        className="w-full h-full flex items-center justify-center transition-all duration-500"
        style={{
          opacity: isRevealed ? 1 : 0,
          transform: isRevealed ? 'scale(1)' : 'scale(0.9)',
        }}
      >
        {config.contentType === 'image' ? (
          <img
            src={config.content}
            alt="revealed"
            className="w-full h-full"
            style={{ objectFit: 'contain' }}
          />
        ) : (
          <span
            className="text-center break-words p-2"
            style={{
              color: block.style.textColor ?? undefined,
              fontSize: 'min(16px, 6cqmin)',
            }}
          >
            {config.content}
          </span>
        )}
      </div>
      {!isRevealed && (
        <div
          className="absolute inset-0 flex items-center justify-center text-slate-400"
          style={{ fontSize: 'min(12px, 4.5cqmin)' }}
        >
          Click to reveal
        </div>
      )}
    </div>
  );
}

function FlipCardBlock({
  block,
  config,
  blockState,
  dispatch,
}: BlockProps<FlipCardBlockConfig>) {
  const isFlipped = blockState.flipped;
  return (
    <div
      className="w-full h-full cursor-pointer"
      style={{ perspective: '600px' }}
      onClick={() =>
        dispatch({ type: 'BLOCK_EVENT', sourceId: block.id, event: 'on-click' })
      }
    >
      <div
        className="w-full h-full relative transition-transform duration-500"
        style={{
          transformStyle: 'preserve-3d',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* Front */}
        <div
          className="absolute inset-0 flex items-center justify-center overflow-hidden"
          style={{ backfaceVisibility: 'hidden' }}
        >
          {config.frontType === 'image' ? (
            <img
              src={config.frontContent}
              alt="front"
              className="w-full h-full"
              style={{ objectFit: 'cover' }}
            />
          ) : (
            <span
              className="text-center break-words p-2"
              style={{
                color: block.style.textColor ?? undefined,
                fontSize: 'min(16px, 6cqmin)',
              }}
            >
              {config.frontContent}
            </span>
          )}
        </div>
        {/* Back */}
        <div
          className="absolute inset-0 flex items-center justify-center overflow-hidden bg-slate-700"
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        >
          {config.backType === 'image' ? (
            <img
              src={config.backContent}
              alt="back"
              className="w-full h-full"
              style={{ objectFit: 'cover' }}
            />
          ) : (
            <span
              className="text-center break-words p-2"
              style={{
                color: block.style.textColor ?? 'white',
                fontSize: 'min(16px, 6cqmin)',
              }}
            >
              {config.backContent}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ConditionalLabelBlock({
  block,
  config,
  blockState,
}: BlockProps<ConditionalLabelBlockConfig>) {
  const displayText = blockState.text || config.initialText;
  return (
    <div
      className="w-full h-full flex items-center justify-center overflow-hidden p-1"
      style={{
        color: block.style.textColor ?? undefined,
        fontSize: 'min(16px, 6cqmin)',
      }}
    >
      <span className="text-center break-words">{displayText}</span>
    </div>
  );
}

function BadgeBlock({
  block,
  config,
  blockState,
  dispatch,
}: BlockProps<BadgeBlockConfig>) {
  const isRevealed = blockState.revealed;
  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center cursor-pointer overflow-hidden"
      onClick={() =>
        dispatch({ type: 'BLOCK_EVENT', sourceId: block.id, event: 'on-click' })
      }
    >
      <div
        className="transition-all duration-500"
        style={{
          transform: isRevealed ? 'scale(1)' : 'scale(0)',
          fontSize: 'min(48px, 20cqmin)',
        }}
      >
        {config.icon}
      </div>
      {config.label && (
        <div
          className="mt-1 text-center"
          style={{
            color: block.style.textColor ?? undefined,
            fontSize: 'min(12px, 4.5cqmin)',
          }}
        >
          {config.label}
        </div>
      )}
    </div>
  );
}

function TrafficLightBlock({
  block,
  config,
  blockState,
}: BlockProps<TrafficLightBlockConfig>) {
  const color = blockState.trafficColor;
  const colorMap: Record<string, string> = {
    red: '#ef4444',
    yellow: '#eab308',
    green: '#22c55e',
  };
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-1 overflow-hidden p-1">
      <div
        className="rounded-full transition-all duration-300"
        style={{
          backgroundColor: colorMap[color] ?? colorMap.green,
          width: 'min(48px, 18cqmin)',
          height: 'min(48px, 18cqmin)',
          boxShadow: `0 0 12px 4px ${colorMap[color] ?? colorMap.green}`,
        }}
      />
      {config.label && (
        <div
          className="text-center"
          style={{
            color: block.style.textColor ?? undefined,
            fontSize: 'min(12px, 4.5cqmin)',
          }}
        >
          {config.label}
        </div>
      )}
    </div>
  );
}

function DividerBlock() {
  return (
    <div className="w-full h-full flex items-center justify-center px-2">
      <hr className="border-slate-400 w-full" />
    </div>
  );
}

function SpacerBlock() {
  return <div className="w-full h-full" />;
}

// ---------------------------------------------------------------------------
// Input & Control Blocks
// ---------------------------------------------------------------------------

function ButtonBlock({
  block,
  config,
  blockState,
  dispatch,
}: BlockProps<ButtonBlockConfig>) {
  const styleMap: Record<string, string> = {
    primary: 'bg-blue-600 hover:bg-blue-500 text-white',
    secondary: 'bg-slate-600 hover:bg-slate-500 text-white',
    danger: 'bg-red-600 hover:bg-red-500 text-white',
  };
  const btnClass = styleMap[config.style ?? 'primary'];
  return (
    <div className="w-full h-full flex items-center justify-center p-1">
      <button
        className={`rounded transition-colors font-medium flex items-center gap-1 ${btnClass}`}
        style={{
          fontSize: 'min(14px, 5.5cqmin)',
          padding: 'min(8px, 2cqmin) min(16px, 4cqmin)',
          opacity: blockState.visible ? 1 : 0,
          pointerEvents: blockState.visible ? 'auto' : 'none',
        }}
        onClick={() =>
          dispatch({
            type: 'BLOCK_EVENT',
            sourceId: block.id,
            event: 'on-click',
          })
        }
      >
        {config.icon && <span>{config.icon}</span>}
        {config.label}
      </button>
    </div>
  );
}

function CounterBlock({
  block,
  config,
  blockState,
  dispatch,
}: BlockProps<CounterBlockConfig>) {
  const min = config.min ?? -Infinity;
  const max = config.max ?? Infinity;
  const step = config.step ?? 1;

  const inc = () => {
    if (blockState.value >= max) return;
    dispatch({
      type: 'DIRECT_ACTION',
      blockId: block.id,
      action: 'increment',
      actionValue: step,
    });
    dispatch({
      type: 'BLOCK_EVENT',
      sourceId: block.id,
      event: `on-counter-reach-${blockState.value + step}`,
    });
  };

  const dec = () => {
    if (blockState.value <= min) return;
    dispatch({
      type: 'DIRECT_ACTION',
      blockId: block.id,
      action: 'decrement',
      actionValue: step,
    });
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-1 overflow-hidden p-1">
      {config.label && (
        <div
          className="text-center text-slate-300"
          style={{ fontSize: 'min(12px, 4.5cqmin)' }}
        >
          {config.label}
        </div>
      )}
      <div
        className="font-bold text-center"
        style={{
          fontSize: 'min(32px, 20cqmin)',
          color: block.style.textColor ?? 'white',
        }}
      >
        {blockState.value}
      </div>
      <div className="flex gap-1">
        <button
          className="bg-slate-600 hover:bg-slate-500 text-white rounded transition-colors"
          style={{
            fontSize: 'min(16px, 6cqmin)',
            padding: 'min(4px, 1.5cqmin) min(10px, 3cqmin)',
          }}
          onClick={dec}
          disabled={blockState.value <= min}
        >
          −
        </button>
        <button
          className="bg-slate-600 hover:bg-slate-500 text-white rounded transition-colors"
          style={{
            fontSize: 'min(16px, 6cqmin)',
            padding: 'min(4px, 1.5cqmin) min(10px, 3cqmin)',
          }}
          onClick={inc}
          disabled={blockState.value >= max}
        >
          +
        </button>
      </div>
    </div>
  );
}

function ToggleBlock({
  block,
  config,
  blockState,
  dispatch,
}: BlockProps<ToggleBlockConfig>) {
  const isOn = blockState.value === 1;
  const handleToggle = () => {
    if (isOn) {
      dispatch({
        type: 'DIRECT_ACTION',
        blockId: block.id,
        action: 'toggle-off',
      });
      dispatch({
        type: 'BLOCK_EVENT',
        sourceId: block.id,
        event: 'on-toggle-off',
      });
    } else {
      dispatch({
        type: 'DIRECT_ACTION',
        blockId: block.id,
        action: 'toggle-on',
      });
      dispatch({
        type: 'BLOCK_EVENT',
        sourceId: block.id,
        event: 'on-toggle-on',
      });
    }
  };
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-1 overflow-hidden p-1">
      {config.label && (
        <div
          className="text-center text-slate-300"
          style={{ fontSize: 'min(12px, 4.5cqmin)' }}
        >
          {config.label}
        </div>
      )}
      <button
        onClick={handleToggle}
        className="relative rounded-full transition-colors duration-200"
        style={{
          width: 'min(56px, 16cqmin)',
          height: 'min(28px, 8cqmin)',
          backgroundColor: isOn ? '#3b82f6' : '#475569',
        }}
      >
        <div
          className="absolute top-0.5 rounded-full bg-white shadow transition-transform duration-200"
          style={{
            width: 'min(22px, 6.5cqmin)',
            height: 'min(22px, 6.5cqmin)',
            top: 'min(3px, 0.75cqmin)',
            left: 'min(3px, 0.75cqmin)',
            transform: isOn ? 'translateX(min(28px, 8cqmin))' : 'translateX(0)',
          }}
        />
      </button>
    </div>
  );
}

function StarsBlock({
  block,
  config,
  blockState,
  dispatch,
}: BlockProps<StarsBlockConfig>) {
  const maxStars = config.maxStars ?? 5;
  const currentValue = blockState.value;
  return (
    <div className="w-full h-full flex flex-col items-center justify-center overflow-hidden p-1">
      <div className="flex gap-0.5">
        {Array.from({ length: maxStars }, (_, i) => (
          <button
            key={i}
            onClick={() => {
              dispatch({
                type: 'DIRECT_ACTION',
                blockId: block.id,
                action: 'set-value',
                actionValue: i + 1,
              });
              dispatch({
                type: 'BLOCK_EVENT',
                sourceId: block.id,
                event: `on-star-rated-${i + 1}`,
              });
            }}
            style={{ fontSize: 'min(28px, 10cqmin)' }}
            className="transition-transform hover:scale-110"
          >
            {i < currentValue ? '★' : '☆'}
          </button>
        ))}
      </div>
    </div>
  );
}

function TextInputBlock({
  block,
  config,
  blockState,
  dispatch,
}: BlockProps<TextInputBlockConfig>) {
  const [inputValue, setInputValue] = useState('');
  const handleSubmit = () => {
    if (!inputValue.trim()) return;
    dispatch({
      type: 'BLOCK_EVENT',
      sourceId: block.id,
      event: 'on-input-submit',
      payload: inputValue,
    });
    setInputValue('');
  };

  void blockState;

  return (
    <div className="w-full h-full flex flex-col gap-1 p-1 overflow-hidden justify-center">
      {config.label && (
        <div
          className="text-slate-300"
          style={{ fontSize: 'min(12px, 4.5cqmin)' }}
        >
          {config.label}
        </div>
      )}
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        placeholder={config.placeholder ?? 'Type here…'}
        className="bg-slate-700 border border-slate-500 rounded text-white outline-none focus:border-blue-400"
        style={{
          fontSize: 'min(13px, 5cqmin)',
          padding: 'min(4px, 1.5cqmin) min(8px, 2.5cqmin)',
        }}
      />
      <button
        onClick={handleSubmit}
        className="bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors self-end"
        style={{
          fontSize: 'min(12px, 4.5cqmin)',
          padding: 'min(4px, 1.5cqmin) min(10px, 3cqmin)',
        }}
      >
        {config.submitLabel ?? 'Submit'}
      </button>
    </div>
  );
}

function PollBlock({
  block,
  config,
  blockState,
  dispatch,
}: BlockProps<PollBlockConfig>) {
  const votes =
    blockState.votes.length === config.options.length
      ? blockState.votes
      : config.options.map(() => 0);
  const voted = blockState.selectedOption !== -1;
  const totalVotes = votes.reduce((a, b) => a + b, 0);

  const handleVote = (index: number) => {
    if (voted) return;
    dispatch({
      type: 'DIRECT_ACTION',
      blockId: block.id,
      action: 'vote-option',
      actionValue: index,
    });
    dispatch({
      type: 'BLOCK_EVENT',
      sourceId: block.id,
      event: `on-vote-option-${index + 1}`,
    });
  };

  return (
    <div className="w-full h-full flex flex-col gap-1 p-1 overflow-hidden justify-center">
      {config.question && (
        <div
          className="text-center font-medium"
          style={{
            color: block.style.textColor ?? 'white',
            fontSize: 'min(13px, 5cqmin)',
          }}
        >
          {config.question}
        </div>
      )}
      <div className="flex flex-col gap-0.5">
        {config.options.map((option, i) => {
          const voteCount = votes[i] ?? 0;
          const pct =
            totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
          return (
            <button
              key={i}
              onClick={() => handleVote(i)}
              className="relative rounded overflow-hidden text-left transition-colors"
              style={{
                backgroundColor: voted ? '#334155' : '#475569',
                fontSize: 'min(12px, 4.5cqmin)',
                padding: 'min(4px, 1.5cqmin) min(8px, 2.5cqmin)',
              }}
            >
              {voted && (
                <div
                  className="absolute inset-y-0 left-0 bg-blue-600 opacity-50"
                  style={{ width: `${pct}%` }}
                />
              )}
              <span className="relative text-white">
                {option}
                {voted &&
                  ` — ${voteCount} vote${voteCount !== 1 ? 's' : ''} (${pct}%)`}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Game & Assessment Blocks
// ---------------------------------------------------------------------------

function MultipleChoiceBlock({
  block,
  config,
  blockState,
  dispatch,
}: BlockProps<MultipleChoiceBlockConfig>) {
  const selected = blockState.selectedOption;
  const hasAnswered = selected !== -1;

  const handleSelect = (index: number) => {
    if (hasAnswered) return;
    dispatch({
      type: 'DIRECT_ACTION',
      blockId: block.id,
      action: 'select-option',
      actionValue: index,
    });
    const isCorrect = index === config.correctIndex;
    dispatch({
      type: 'BLOCK_EVENT',
      sourceId: block.id,
      event: isCorrect ? 'on-correct' : 'on-incorrect',
    });
  };

  return (
    <div className="w-full h-full flex flex-col gap-1 p-1 overflow-hidden justify-center">
      {config.question && (
        <div
          className="text-center font-medium"
          style={{
            color: block.style.textColor ?? 'white',
            fontSize: 'min(13px, 5cqmin)',
          }}
        >
          {config.question}
        </div>
      )}
      <div className="flex flex-col gap-0.5">
        {config.options.map((option, i) => {
          let btnBg = 'bg-slate-600 hover:bg-slate-500';
          if (hasAnswered) {
            if (i === config.correctIndex) {
              btnBg = 'bg-green-700';
            } else if (i === selected) {
              btnBg = 'bg-red-700';
            } else {
              btnBg = 'bg-slate-700';
            }
          }
          return (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              className={`rounded text-left text-white transition-colors ${btnBg}`}
              style={{
                fontSize: 'min(12px, 4.5cqmin)',
                padding: 'min(4px, 1.5cqmin) min(8px, 2.5cqmin)',
              }}
            >
              {hasAnswered && i === config.correctIndex && '✓ '}
              {hasAnswered &&
                i === selected &&
                i !== config.correctIndex &&
                '✗ '}
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MatchPairBlock({
  block,
  config,
  blockState,
  dispatch,
}: BlockProps<MatchPairBlockConfig>) {
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  const completedPairs = blockState.completedPairs;

  const isLeftMatched = (i: number) => completedPairs.some(([l]) => l === i);
  const isRightMatched = (i: number) => completedPairs.some(([, r]) => r === i);

  const handleLeftClick = (i: number) => {
    if (isLeftMatched(i)) return;
    setSelectedLeft(i);
  };

  const handleRightClick = (ri: number) => {
    if (selectedLeft === null || isRightMatched(ri)) return;
    const isCorrect = config.correctPairs[selectedLeft] === ri;
    if (isCorrect) {
      dispatch({
        type: 'DIRECT_ACTION',
        blockId: block.id,
        action: 'complete-pair',
        actionPayload: `${selectedLeft}:${ri}`,
      });
      dispatch({
        type: 'BLOCK_EVENT',
        sourceId: block.id,
        event: 'on-correct',
      });
      if (completedPairs.length + 1 === config.leftItems.length) {
        dispatch({
          type: 'BLOCK_EVENT',
          sourceId: block.id,
          event: 'on-all-matched',
        });
      }
    } else {
      dispatch({
        type: 'BLOCK_EVENT',
        sourceId: block.id,
        event: 'on-click',
      });
    }
    setSelectedLeft(null);
  };

  return (
    <div className="w-full h-full flex gap-1 p-1 overflow-hidden">
      <div className="flex-1 flex flex-col gap-0.5 justify-center">
        {config.leftItems.map((item, i) => (
          <button
            key={i}
            onClick={() => handleLeftClick(i)}
            className={`rounded text-left text-white transition-colors ${
              isLeftMatched(i)
                ? 'bg-green-700 opacity-60'
                : selectedLeft === i
                  ? 'bg-blue-600'
                  : 'bg-slate-600 hover:bg-slate-500'
            }`}
            style={{
              fontSize: 'min(12px, 4.5cqmin)',
              padding: 'min(3px, 1.2cqmin) min(6px, 2cqmin)',
            }}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="flex-1 flex flex-col gap-0.5 justify-center">
        {config.rightItems.map((item, i) => (
          <button
            key={i}
            onClick={() => handleRightClick(i)}
            className={`rounded text-left text-white transition-colors ${
              isRightMatched(i)
                ? 'bg-green-700 opacity-60'
                : 'bg-slate-600 hover:bg-slate-500'
            }`}
            style={{
              fontSize: 'min(12px, 4.5cqmin)',
              padding: 'min(3px, 1.2cqmin) min(6px, 2cqmin)',
            }}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

function HotspotBlock({
  block,
  config,
  blockState,
  dispatch,
}: BlockProps<HotspotBlockConfig>) {
  void blockState;
  return (
    <div className="w-full h-full relative overflow-hidden">
      {config.imageUrl && (
        <img
          src={config.imageUrl}
          alt="hotspot"
          className="w-full h-full"
          style={{ objectFit: 'cover' }}
        />
      )}
      {config.spots.map((spot, i) => (
        <button
          key={i}
          onClick={() =>
            dispatch({
              type: 'BLOCK_EVENT',
              sourceId: block.id,
              event: `on-spot-clicked-${i + 1}`,
            })
          }
          className="absolute rounded-full bg-blue-600 hover:bg-blue-400 text-white font-bold transition-colors flex items-center justify-center"
          style={{
            left: `${spot.x}%`,
            top: `${spot.y}%`,
            transform: 'translate(-50%, -50%)',
            width: 'min(28px, 7cqmin)',
            height: 'min(28px, 7cqmin)',
            fontSize: 'min(12px, 4.5cqmin)',
          }}
          title={spot.label}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
}

function SortBinBlock({
  block,
  config,
  blockState,
  dispatch,
}: BlockProps<SortBinBlockConfig>) {
  const [selectedItem, setSelectedItem] = useState<number | null>(null);
  const sortedItems = blockState.sortedItems;

  const unsortedItems = config.items
    .map((item, i) => ({ item, i }))
    .filter(({ i }) => !(i in sortedItems));

  const handleItemClick = (i: number) => {
    setSelectedItem(i === selectedItem ? null : i);
  };

  const handleBinClick = (binIndex: number) => {
    if (selectedItem === null) return;
    const isCorrect = config.items[selectedItem].correctBin === binIndex;
    dispatch({
      type: 'DIRECT_ACTION',
      blockId: block.id,
      action: 'sort-item',
      actionPayload: `${selectedItem}:${binIndex}`,
    });
    dispatch({
      type: 'BLOCK_EVENT',
      sourceId: block.id,
      event: isCorrect ? 'on-item-sorted' : 'on-click',
    });
    const newSortedCount = Object.keys(sortedItems).length + 1;
    if (newSortedCount === config.items.length) {
      dispatch({
        type: 'BLOCK_EVENT',
        sourceId: block.id,
        event: 'on-all-sorted',
      });
    }
    setSelectedItem(null);
  };

  return (
    <div className="w-full h-full flex flex-col gap-1 p-1 overflow-hidden">
      {/* Item chips */}
      <div className="flex flex-wrap gap-0.5">
        {unsortedItems.map(({ item, i }) => (
          <button
            key={i}
            onClick={() => handleItemClick(i)}
            className={`rounded text-white transition-colors ${
              selectedItem === i
                ? 'bg-blue-600'
                : 'bg-slate-600 hover:bg-slate-500'
            }`}
            style={{
              fontSize: 'min(11px, 4cqmin)',
              padding: 'min(3px, 1cqmin) min(7px, 2.5cqmin)',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {/* Bins */}
      <div className="flex gap-1 flex-1">
        {config.bins.map((bin, bi) => {
          const itemsInBin = Object.entries(sortedItems)
            .filter(([, bIdx]) => bIdx === bi)
            .map(([iIdx]) => config.items[Number(iIdx)]);
          return (
            <button
              key={bi}
              onClick={() => handleBinClick(bi)}
              className={`flex-1 rounded border-2 flex flex-col items-center p-0.5 transition-colors ${
                selectedItem !== null
                  ? 'border-blue-400 bg-slate-700 hover:bg-slate-600'
                  : 'border-slate-500 bg-slate-800'
              }`}
            >
              <div
                className="font-medium text-slate-300"
                style={{ fontSize: 'min(11px, 4cqmin)' }}
              >
                {bin}
              </div>
              {itemsInBin.map((it, j) => (
                <div
                  key={j}
                  className="bg-green-700 rounded text-white"
                  style={{
                    fontSize: 'min(10px, 3.5cqmin)',
                    padding: 'min(2px, 0.8cqmin) min(5px, 1.8cqmin)',
                    marginTop: 'min(2px, 0.8cqmin)',
                  }}
                >
                  {it.label}
                </div>
              ))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress & Measurement Blocks
// ---------------------------------------------------------------------------

function ProgressBlock({
  block: _block,
  config,
  blockState,
}: BlockProps<ProgressBlockConfig>) {
  const min = config.min ?? 0;
  const max = config.max ?? 100;
  const value = blockState.value;
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  return (
    <div className="w-full h-full flex flex-col justify-center gap-1 p-1 overflow-hidden">
      {config.label && (
        <div
          className="text-slate-300 text-center"
          style={{ fontSize: 'min(12px, 4.5cqmin)' }}
        >
          {config.label}
        </div>
      )}
      <div
        className="w-full bg-slate-700 rounded-full overflow-hidden"
        style={{ height: 'min(16px, 5cqmin)' }}
      >
        <div
          className="h-full bg-green-500 transition-all duration-300 rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div
        className="text-center text-slate-300"
        style={{ fontSize: 'min(11px, 4cqmin)' }}
      >
        {value} / {max}
      </div>
    </div>
  );
}

function TimerBlock({
  block,
  config,
  blockState,
  dispatch,
}: BlockProps<TimerBlockConfig>) {
  const remaining = blockState.timerRemaining;
  const isRunning = blockState.timerRunning;
  const showControls = config.showControls !== false;

  const handleStart = () => {
    dispatch({
      type: 'DIRECT_ACTION',
      blockId: block.id,
      action: 'start-timer',
    });
    dispatch({
      type: 'BLOCK_EVENT',
      sourceId: block.id,
      event: 'on-timer-start',
    });
  };

  const handleStop = () => {
    dispatch({
      type: 'DIRECT_ACTION',
      blockId: block.id,
      action: 'stop-timer',
    });
    dispatch({
      type: 'BLOCK_EVENT',
      sourceId: block.id,
      event: 'on-timer-stop',
    });
  };

  const handleReset = () => {
    dispatch({
      type: 'DIRECT_ACTION',
      blockId: block.id,
      action: 'reset',
    });
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-1 overflow-hidden p-1">
      <div
        className="font-mono font-bold"
        style={{
          fontSize: 'min(36px, 22cqmin)',
          color:
            remaining <= 10 && remaining > 0
              ? '#ef4444'
              : (block.style.textColor ?? 'white'),
        }}
      >
        {formatTime(remaining)}
      </div>
      {showControls && (
        <div className="flex gap-1">
          {!isRunning ? (
            <button
              onClick={handleStart}
              className="bg-green-700 hover:bg-green-600 text-white rounded transition-colors"
              style={{
                fontSize: 'min(12px, 4.5cqmin)',
                padding: 'min(4px, 1.5cqmin) min(10px, 3cqmin)',
              }}
            >
              ▶ Start
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="bg-yellow-700 hover:bg-yellow-600 text-white rounded transition-colors"
              style={{
                fontSize: 'min(12px, 4.5cqmin)',
                padding: 'min(4px, 1.5cqmin) min(10px, 3cqmin)',
              }}
            >
              ⏸ Pause
            </button>
          )}
          <button
            onClick={handleReset}
            className="bg-slate-600 hover:bg-slate-500 text-white rounded transition-colors"
            style={{
              fontSize: 'min(12px, 4.5cqmin)',
              padding: 'min(4px, 1.5cqmin) min(10px, 3cqmin)',
            }}
          >
            ↺ Reset
          </button>
        </div>
      )}
    </div>
  );
}

function ScoreBlock({
  block,
  config,
  blockState,
}: BlockProps<ScoreBlockConfig>) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center overflow-hidden p-1">
      {config.label && (
        <div
          className="text-slate-300 text-center"
          style={{ fontSize: 'min(12px, 4.5cqmin)' }}
        >
          {config.label}
        </div>
      )}
      <div
        className="font-bold text-center"
        style={{
          fontSize: 'min(40px, 25cqmin)',
          color: block.style.textColor ?? 'white',
        }}
      >
        {blockState.value}
      </div>
    </div>
  );
}

function ChecklistBlock({
  block,
  config,
  blockState,
  dispatch,
}: BlockProps<ChecklistBlockConfig>) {
  const checked = blockState.checked;

  const handleCheck = (index: number) => {
    if (checked[index]) return;
    dispatch({
      type: 'DIRECT_ACTION',
      blockId: block.id,
      action: 'check-item',
      actionValue: index,
    });
    dispatch({
      type: 'BLOCK_EVENT',
      sourceId: block.id,
      event: 'on-item-checked',
      payload: index,
    });
    const allChecked = checked
      .map((c, i) => (i === index ? true : c))
      .every(Boolean);
    if (allChecked) {
      dispatch({
        type: 'BLOCK_EVENT',
        sourceId: block.id,
        event: 'on-all-checked',
      });
    }
  };

  return (
    <div className="w-full h-full flex flex-col gap-0.5 p-1 overflow-auto justify-center">
      {config.items.map((item, i) => (
        <button
          key={i}
          onClick={() => handleCheck(i)}
          className="flex items-center gap-1 text-left hover:bg-slate-700 rounded px-1 transition-colors"
          style={{ padding: 'min(3px, 1.2cqmin) min(4px, 1.5cqmin)' }}
        >
          <span
            className={`rounded border-2 flex items-center justify-center flex-shrink-0 ${
              checked[i]
                ? 'bg-green-600 border-green-600 text-white'
                : 'border-slate-400 bg-transparent'
            }`}
            style={{
              width: 'min(18px, 5.5cqmin)',
              height: 'min(18px, 5.5cqmin)',
              fontSize: 'min(12px, 4cqmin)',
            }}
          >
            {checked[i] ? '✓' : ''}
          </span>
          <span
            className={
              checked[i] ? 'line-through text-slate-400' : 'text-white'
            }
            style={{ fontSize: 'min(13px, 5cqmin)' }}
          >
            {item}
          </span>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BlockRenderer — main switch
// ---------------------------------------------------------------------------

interface BlockRendererProps {
  block: CustomBlockDefinition;
}

export const BlockRenderer: React.FC<BlockRendererProps> = ({ block }) => {
  const { state, dispatch } = useWidgetState();
  const blockState = state[block.id];

  if (!blockState) return null;
  if (!blockState.visible) return null;

  const cfg = block.config as Record<string, unknown>;

  const commonProps = {
    block,
    blockState,
    dispatch,
  };

  switch (block.type) {
    case 'text':
      return (
        <TextBlock
          {...commonProps}
          config={cfg as unknown as TextBlockConfig}
        />
      );
    case 'heading':
      return (
        <HeadingBlock
          {...commonProps}
          config={cfg as unknown as HeadingBlockConfig}
        />
      );
    case 'image':
      return (
        <ImageBlock
          {...commonProps}
          config={cfg as unknown as ImageBlockConfig}
        />
      );
    case 'reveal':
      return (
        <RevealBlock
          {...commonProps}
          config={cfg as unknown as RevealBlockConfig}
        />
      );
    case 'flip-card':
      return (
        <FlipCardBlock
          {...commonProps}
          config={cfg as unknown as FlipCardBlockConfig}
        />
      );
    case 'conditional-label':
      return (
        <ConditionalLabelBlock
          {...commonProps}
          config={cfg as unknown as ConditionalLabelBlockConfig}
        />
      );
    case 'badge':
      return (
        <BadgeBlock
          {...commonProps}
          config={cfg as unknown as BadgeBlockConfig}
        />
      );
    case 'traffic-light':
      return (
        <TrafficLightBlock
          {...commonProps}
          config={cfg as unknown as TrafficLightBlockConfig}
        />
      );
    case 'divider':
      return <DividerBlock />;
    case 'spacer':
      return <SpacerBlock />;
    case 'cb-button':
      return (
        <ButtonBlock
          {...commonProps}
          config={cfg as unknown as ButtonBlockConfig}
        />
      );
    case 'counter':
      return (
        <CounterBlock
          {...commonProps}
          config={cfg as unknown as CounterBlockConfig}
        />
      );
    case 'toggle':
      return (
        <ToggleBlock
          {...commonProps}
          config={cfg as unknown as ToggleBlockConfig}
        />
      );
    case 'stars':
      return (
        <StarsBlock
          {...commonProps}
          config={cfg as unknown as StarsBlockConfig}
        />
      );
    case 'text-input':
      return (
        <TextInputBlock
          {...commonProps}
          config={cfg as unknown as TextInputBlockConfig}
        />
      );
    case 'poll':
      return (
        <PollBlock
          {...commonProps}
          config={cfg as unknown as PollBlockConfig}
        />
      );
    case 'multiple-choice':
      return (
        <MultipleChoiceBlock
          {...commonProps}
          config={cfg as unknown as MultipleChoiceBlockConfig}
        />
      );
    case 'match-pair':
      return (
        <MatchPairBlock
          {...commonProps}
          config={cfg as unknown as MatchPairBlockConfig}
        />
      );
    case 'hotspot':
      return (
        <HotspotBlock
          {...commonProps}
          config={cfg as unknown as HotspotBlockConfig}
        />
      );
    case 'sort-bin':
      return (
        <SortBinBlock
          {...commonProps}
          config={cfg as unknown as SortBinBlockConfig}
        />
      );
    case 'progress':
      return (
        <ProgressBlock
          {...commonProps}
          config={cfg as unknown as ProgressBlockConfig}
        />
      );
    case 'timer':
      return (
        <TimerBlock
          {...commonProps}
          config={cfg as unknown as TimerBlockConfig}
        />
      );
    case 'score':
      return (
        <ScoreBlock
          {...commonProps}
          config={cfg as unknown as ScoreBlockConfig}
        />
      );
    case 'checklist':
      return (
        <ChecklistBlock
          {...commonProps}
          config={cfg as unknown as ChecklistBlockConfig}
        />
      );
    default:
      return null;
  }
};
