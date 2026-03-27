/**
 * Runtime types for the CustomWidget renderer.
 * These types are used by the widget at runtime (in the browser by teachers/students).
 */

import { CustomBlockType, BlockAction } from '@/types';

/** Runtime state for a single block within a custom widget instance */
export interface BlockState {
  /** Numeric value (counter, score, progress, stars) */
  value: number;
  /** Whether the block is visible */
  visible: boolean;
  /** Dynamic text override (for conditional-label, set-text actions) */
  text: string;
  /** Dynamic image override (for set-image actions) */
  image: string;
  /** Whether a flip-card is showing its back face */
  flipped: boolean;
  /** Checklist item checked states */
  checked: boolean[];
  /** Poll vote counts per option */
  votes: number[];
  /** Whether a reveal/badge block has been revealed */
  revealed: boolean;
  /** Traffic light color */
  trafficColor: 'red' | 'yellow' | 'green';
  /** Match pair: which right-side item is selected */
  selectedRight: number | null;
  /** Match pair: completed pairings [leftIndex, rightIndex] */
  completedPairs: [number, number][];
  /** Sort bin: which items have been sorted (itemIndex → binIndex) */
  sortedItems: Record<number, number>;
  /** Timer: whether it is currently running */
  timerRunning: boolean;
  /** Timer: remaining seconds */
  timerRemaining: number;
  /** Multiple choice: which option was selected (-1 = none) */
  selectedOption: number;
}

export const DEFAULT_BLOCK_STATE: BlockState = {
  value: 0,
  visible: true,
  text: '',
  image: '',
  flipped: false,
  checked: [],
  votes: [],
  revealed: false,
  trafficColor: 'green',
  selectedRight: null,
  completedPairs: [],
  sortedItems: {},
  timerRunning: false,
  timerRemaining: 0,
  selectedOption: -1,
};

/** Widget-level state: a map of blockId → BlockState */
export type WidgetBlockState = Record<string, BlockState>;

/** Actions dispatched by blocks to the widget-level reducer */
export type WidgetAction =
  | {
      type: 'BLOCK_EVENT';
      sourceId: string;
      event: string;
      payload?: string | number;
    }
  | { type: 'RESET_ALL' }
  | { type: 'TIMER_TICK'; blockId: string }
  | { type: 'INIT'; state: WidgetBlockState }
  | {
      type: 'DIRECT_ACTION';
      blockId: string;
      action: BlockAction;
      actionPayload?: string;
      actionValue?: number;
    };

/** Category metadata for block palette display */
export interface BlockCategory {
  id: string;
  label: string;
  blocks: CustomBlockType[];
}

export const BLOCK_CATEGORIES: BlockCategory[] = [
  {
    id: 'display',
    label: 'Display',
    blocks: [
      'text',
      'heading',
      'image',
      'reveal',
      'flip-card',
      'conditional-label',
      'badge',
      'traffic-light',
      'divider',
      'spacer',
    ],
  },
  {
    id: 'input',
    label: 'Input & Control',
    blocks: ['cb-button', 'counter', 'toggle', 'stars', 'text-input', 'poll'],
  },
  {
    id: 'game',
    label: 'Game & Assessment',
    blocks: ['multiple-choice', 'match-pair', 'hotspot', 'sort-bin'],
  },
  {
    id: 'progress',
    label: 'Progress & Measurement',
    blocks: ['progress', 'timer', 'score', 'checklist'],
  },
];

/** Human-readable labels for each block type */
export const BLOCK_LABELS: Record<CustomBlockType, string> = {
  text: 'Text',
  heading: 'Heading',
  image: 'Image',
  reveal: 'Reveal',
  'flip-card': 'Flip Card',
  'conditional-label': 'Conditional Label',
  badge: 'Badge',
  'traffic-light': 'Traffic Light',
  divider: 'Divider',
  spacer: 'Spacer',
  'cb-button': 'Button',
  counter: 'Counter',
  toggle: 'Toggle',
  stars: 'Stars',
  'text-input': 'Text Input',
  poll: 'Poll',
  'multiple-choice': 'Multiple Choice',
  'match-pair': 'Match Pair',
  hotspot: 'Hotspot Image',
  'sort-bin': 'Sort Bin',
  progress: 'Progress Bar',
  timer: 'Timer',
  score: 'Score',
  checklist: 'Checklist',
};

/** Emoji icons for each block type */
export const BLOCK_ICONS: Record<CustomBlockType, string> = {
  text: '📝',
  heading: '🔤',
  image: '🖼️',
  reveal: '✨',
  'flip-card': '🃏',
  'conditional-label': '💬',
  badge: '🏅',
  'traffic-light': '🚦',
  divider: '➖',
  spacer: '⬜',
  'cb-button': '🔘',
  counter: '🔢',
  toggle: '🔀',
  stars: '⭐',
  'text-input': '📋',
  poll: '📊',
  'multiple-choice': '❓',
  'match-pair': '🔗',
  hotspot: '📍',
  'sort-bin': '🗂️',
  progress: '📶',
  timer: '⏱️',
  score: '🏆',
  checklist: '✅',
};

/** Events that each block type can fire */
export const BLOCK_EVENTS: Record<CustomBlockType, string[]> = {
  text: [],
  heading: [],
  image: ['on-click'],
  reveal: ['on-click'],
  'flip-card': ['on-click'],
  'conditional-label': [],
  badge: ['on-click'],
  'traffic-light': [],
  divider: [],
  spacer: [],
  'cb-button': ['on-click'],
  counter: ['on-counter-reach-N'],
  toggle: ['on-toggle-on', 'on-toggle-off'],
  stars: ['on-star-rated-N'],
  'text-input': ['on-input-submit'],
  poll: ['on-vote-option-N'],
  'multiple-choice': ['on-correct', 'on-incorrect'],
  'match-pair': ['on-all-matched'],
  hotspot: ['on-spot-clicked-N'],
  'sort-bin': ['on-item-sorted', 'on-all-sorted'],
  progress: [],
  timer: ['on-timer-end', 'on-timer-start'],
  score: ['on-score-reach-N'],
  checklist: ['on-item-checked', 'on-all-checked'],
};

/** Actions that each block type can receive */
export const BLOCK_ACTIONS: Record<CustomBlockType, string[]> = {
  text: ['show', 'hide', 'set-text'],
  heading: ['show', 'hide', 'set-text'],
  image: ['show', 'hide', 'set-image', 'reveal'],
  reveal: ['reveal', 'show', 'hide'],
  'flip-card': ['flip', 'flip-back', 'show', 'hide', 'set-image'],
  'conditional-label': ['show', 'hide', 'set-text'],
  badge: ['reveal', 'show', 'hide'],
  'traffic-light': ['set-traffic', 'show', 'hide'],
  divider: ['show', 'hide'],
  spacer: [],
  'cb-button': ['show', 'hide'],
  counter: ['increment', 'decrement', 'set-value', 'reset', 'show', 'hide'],
  toggle: ['toggle-on', 'toggle-off', 'show', 'hide'],
  stars: ['set-value', 'reset', 'show', 'hide'],
  'text-input': ['show', 'hide'],
  poll: ['reset', 'show', 'hide'],
  'multiple-choice': ['reset', 'show', 'hide'],
  'match-pair': ['reset', 'show', 'hide'],
  hotspot: ['show', 'hide'],
  'sort-bin': ['reset', 'show', 'hide'],
  progress: ['increment', 'decrement', 'set-value', 'reset', 'show', 'hide'],
  timer: ['start-timer', 'stop-timer', 'reset', 'show', 'hide'],
  score: [
    'increment',
    'decrement',
    'set-value',
    'add-score',
    'reset',
    'show',
    'hide',
  ],
  checklist: ['check-item', 'reset', 'show', 'hide'],
};
