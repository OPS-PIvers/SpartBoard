/**
 * blockReducer.ts
 *
 * Core reducer for the CustomWidget IFTTT connection system.
 * Handles all block state transitions triggered by block events and connections.
 */

import { BlockConnection, CustomGridDefinition, BlockAction } from '@/types';
import {
  BlockState,
  WidgetBlockState,
  WidgetAction,
  DEFAULT_BLOCK_STATE,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Evaluate an optional guard condition on the current state */
export function conditionPasses(
  condition: BlockConnection['condition'],
  state: WidgetBlockState
): boolean {
  if (!condition) return true;
  const watchState = state[condition.watchBlockId];
  if (!watchState) return false;
  const watchValue = watchState.value;
  const condValue =
    typeof condition.value === 'boolean'
      ? condition.value
        ? 1
        : 0
      : condition.value;
  switch (condition.operator) {
    case 'gte':
      return watchValue >= condValue;
    case 'lte':
      return watchValue <= condValue;
    case 'eq':
      return watchValue === condValue;
    default:
      return true;
  }
}

/** Apply a single action to a block state, returning the next block state */
function applyAction(
  blockState: BlockState,
  action: BlockAction,
  actionPayload: string | undefined,
  actionValue: number | undefined
): BlockState {
  const step = actionValue ?? 1;
  switch (action) {
    case 'show':
      return { ...blockState, visible: true };
    case 'hide':
      return { ...blockState, visible: false };
    case 'reveal':
      return { ...blockState, revealed: true };
    case 'flip':
      return { ...blockState, flipped: true };
    case 'flip-back':
      return { ...blockState, flipped: false };
    case 'set-text':
      return { ...blockState, text: actionPayload ?? '' };
    case 'set-image':
      return { ...blockState, image: actionPayload ?? '' };
    case 'increment':
      return { ...blockState, value: blockState.value + step };
    case 'decrement':
      return { ...blockState, value: blockState.value - step };
    case 'set-value':
      return { ...blockState, value: actionValue ?? 0 };
    case 'add-score':
      return { ...blockState, value: blockState.value + step };
    case 'reset':
      return {
        ...blockState,
        value: 0,
        checked: blockState.checked.map(() => false),
        votes: blockState.votes.map(() => 0),
        revealed: false,
        flipped: false,
        selectedOption: -1,
        completedPairs: [],
        sortedItems: {},
        selectedRight: null,
        timerRunning: false,
        timerRemaining: blockState.initialDuration,
      };
    case 'reset-all':
      // reset-all is handled at the reducer level, this is a no-op per-block
      return blockState;
    case 'start-timer':
      return { ...blockState, timerRunning: true };
    case 'stop-timer':
      return { ...blockState, timerRunning: false };
    case 'set-traffic':
      return {
        ...blockState,
        trafficColor: (actionPayload as BlockState['trafficColor']) ?? 'green',
      };
    case 'play-sound':
      // Side effect handled in Widget.tsx, no state change
      return blockState;
    case 'show-toast':
      // Side effect handled in Widget.tsx, no state change
      return blockState;
    case 'check-item': {
      const idx = actionValue ?? 0;
      const newChecked = [...blockState.checked];
      if (idx >= 0 && idx < newChecked.length) {
        newChecked[idx] = true;
      }
      return { ...blockState, checked: newChecked };
    }
    case 'toggle-on':
      return { ...blockState, value: 1 };
    case 'toggle-off':
      return { ...blockState, value: 0 };
    case 'select-option':
      return { ...blockState, selectedOption: actionValue ?? -1 };
    case 'complete-pair': {
      // actionPayload encodes "leftIndex:rightIndex"
      const [ls, rs] = (actionPayload ?? '').split(':');
      const li = parseInt(ls, 10);
      const ri = parseInt(rs, 10);
      if (isNaN(li) || isNaN(ri)) return blockState;
      return {
        ...blockState,
        completedPairs: [
          ...blockState.completedPairs,
          [li, ri] as [number, number],
        ],
      };
    }
    case 'sort-item': {
      // actionPayload encodes "itemIndex:binIndex"
      const [is2, bs2] = (actionPayload ?? '').split(':');
      const itemIdx = parseInt(is2, 10);
      const binIdx = parseInt(bs2, 10);
      if (isNaN(itemIdx) || isNaN(binIdx)) return blockState;
      return {
        ...blockState,
        sortedItems: { ...blockState.sortedItems, [itemIdx]: binIdx },
      };
    }
    case 'vote-option': {
      const idx = actionValue ?? 0;
      const newVotes = [...blockState.votes];
      if (idx >= 0 && idx < newVotes.length) {
        newVotes[idx] = (newVotes[idx] ?? 0) + 1;
      }
      return { ...blockState, votes: newVotes, selectedOption: idx };
    }
    default:
      return blockState;
  }
}

/** Check whether a threshold event should fire after state update */
function getThresholdEvents(
  blockId: string,
  prevState: BlockState,
  nextState: BlockState
): Array<{ sourceId: string; event: string }> {
  const events: Array<{ sourceId: string; event: string }> = [];

  // Value threshold: emit all three variants so connections using any naming
  // convention (on-value-reach-N, on-counter-reach-N, on-score-reach-N) fire.
  if (
    nextState.value !== prevState.value &&
    nextState.value > prevState.value
  ) {
    const v = nextState.value;
    events.push(
      { sourceId: blockId, event: `on-value-reach-${v}` },
      { sourceId: blockId, event: `on-counter-reach-${v}` },
      { sourceId: blockId, event: `on-score-reach-${v}` }
    );
  }

  return events;
}

// ---------------------------------------------------------------------------
// Initial state builder
// ---------------------------------------------------------------------------

/** Build the initial WidgetBlockState from a grid definition */
export function buildInitialState(
  gridDefinition: CustomGridDefinition | undefined
): WidgetBlockState {
  if (!gridDefinition) return {};

  const state: WidgetBlockState = {};

  for (const cell of gridDefinition.cells) {
    if (!cell.block) continue;
    const block = cell.block;
    const cfg = block.config as Record<string, unknown>;

    const startValue =
      typeof cfg.startValue === 'number'
        ? cfg.startValue
        : typeof cfg.initialValue === 'number'
          ? cfg.initialValue
          : typeof cfg.startValue === 'number'
            ? cfg.startValue
            : 0;

    const initialText =
      typeof cfg.text === 'string'
        ? cfg.text
        : typeof cfg.initialText === 'string'
          ? cfg.initialText
          : '';

    const initialImage = typeof cfg.url === 'string' ? cfg.url : '';

    const pollOptions = Array.isArray(cfg.options) ? cfg.options : [];
    const checklistItems = Array.isArray(cfg.items) ? cfg.items : [];

    const timerRemaining =
      typeof cfg.durationSeconds === 'number' ? cfg.durationSeconds : 0;

    const autoStart =
      typeof cfg.autoStart === 'boolean' ? cfg.autoStart : false;

    const initialHidden =
      typeof cfg.initialHidden === 'boolean' ? cfg.initialHidden : false;

    const initialColor =
      typeof cfg.initialColor === 'string'
        ? (cfg.initialColor as BlockState['trafficColor'])
        : 'green';

    const initialOn =
      typeof cfg.initialOn === 'boolean' ? cfg.initialOn : false;

    const initialStars =
      typeof cfg.initialValue === 'number' ? cfg.initialValue : 0;

    state[block.id] = {
      ...DEFAULT_BLOCK_STATE,
      value:
        block.type === 'toggle'
          ? initialOn
            ? 1
            : 0
          : block.type === 'stars'
            ? initialStars
            : startValue,
      visible: !initialHidden,
      text: initialText,
      image: initialImage,
      votes: pollOptions.map(() => 0),
      checked: checklistItems.map(() => false),
      timerRunning: autoStart && timerRemaining > 0,
      timerRemaining,
      initialDuration: timerRemaining,
      trafficColor: initialColor,
    };
  }

  return state;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function blockReducer(
  state: WidgetBlockState,
  action: WidgetAction,
  gridDefinition?: CustomGridDefinition
): WidgetBlockState {
  switch (action.type) {
    case 'INIT':
      return action.state;

    case 'RESET_ALL':
      return buildInitialState(gridDefinition);

    case 'TIMER_TICK': {
      const bs = state[action.blockId];
      if (!bs || !bs.timerRunning || bs.timerRemaining <= 0) return state;
      const newRemaining = bs.timerRemaining - 1;
      const nowDone = newRemaining <= 0;
      return {
        ...state,
        [action.blockId]: {
          ...bs,
          timerRemaining: newRemaining,
          timerRunning: nowDone ? false : bs.timerRunning,
        },
      };
    }

    case 'BLOCK_EVENT': {
      if (!gridDefinition) return state;

      const { sourceId, event } = action;
      const connections = gridDefinition.connections.filter(
        (c) => c.sourceBlockId === sourceId && c.event === event
      );

      if (connections.length === 0) return state;

      let nextState = { ...state };
      const pendingEvents: Array<{ sourceId: string; event: string }> = [];

      for (const conn of connections) {
        if (!conditionPasses(conn.condition, nextState)) continue;

        // reset-all is a special action that affects all blocks
        if (conn.action === 'reset-all') {
          nextState = buildInitialState(gridDefinition);
          continue;
        }

        const targetState = nextState[conn.targetBlockId];
        if (!targetState) continue;

        const prevTargetState = targetState;
        const newTargetState = applyAction(
          targetState,
          conn.action,
          conn.actionPayload,
          conn.actionValue
        );

        nextState = { ...nextState, [conn.targetBlockId]: newTargetState };

        // Collect threshold events from value changes
        const thresholds = getThresholdEvents(
          conn.targetBlockId,
          prevTargetState,
          newTargetState
        );
        pendingEvents.push(...thresholds);
      }

      // Process threshold events (one level deep to avoid infinite loops)
      for (const evt of pendingEvents) {
        const thresholdConns = gridDefinition.connections.filter(
          (c) => c.sourceBlockId === evt.sourceId && c.event === evt.event
        );
        for (const conn of thresholdConns) {
          if (!conditionPasses(conn.condition, nextState)) continue;
          if (conn.action === 'reset-all') {
            nextState = buildInitialState(gridDefinition);
            continue;
          }
          const targetState = nextState[conn.targetBlockId];
          if (!targetState) continue;
          const newTargetState = applyAction(
            targetState,
            conn.action,
            conn.actionPayload,
            conn.actionValue
          );
          nextState = { ...nextState, [conn.targetBlockId]: newTargetState };
        }
      }

      return nextState;
    }

    case 'DIRECT_ACTION': {
      const bs = state[action.blockId];
      if (!bs) return state;
      return {
        ...state,
        [action.blockId]: applyAction(
          bs,
          action.action,
          action.actionPayload,
          action.actionValue
        ),
      };
    }

    default:
      return state;
  }
}
