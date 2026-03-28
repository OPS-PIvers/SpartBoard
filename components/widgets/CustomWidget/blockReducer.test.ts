import { describe, it, expect } from 'vitest';
import {
  blockReducer,
  buildInitialState,
  conditionPasses,
} from './blockReducer';
import { DEFAULT_BLOCK_STATE, WidgetBlockState } from './types';
import { CustomGridDefinition } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGrid(
  overrides?: Partial<CustomGridDefinition>
): CustomGridDefinition {
  return {
    columns: 1,
    rows: 1,
    cells: [],
    connections: [],
    ...overrides,
  };
}

function makeState(
  blocks: Record<string, Partial<typeof DEFAULT_BLOCK_STATE>>
): WidgetBlockState {
  const state: WidgetBlockState = {};
  for (const [id, partial] of Object.entries(blocks)) {
    state[id] = { ...DEFAULT_BLOCK_STATE, ...partial };
  }
  return state;
}

// ---------------------------------------------------------------------------
// conditionPasses
// ---------------------------------------------------------------------------

describe('conditionPasses', () => {
  it('returns true when no condition', () => {
    expect(conditionPasses(undefined, {})).toBe(true);
  });

  it('returns false when the watched block is missing', () => {
    expect(
      conditionPasses(
        { watchBlockId: 'missing', operator: 'gte', value: 5 },
        {}
      )
    ).toBe(false);
  });

  it('gte: passes when value >= condition value', () => {
    const state = makeState({ b1: { value: 5 } });
    expect(
      conditionPasses({ watchBlockId: 'b1', operator: 'gte', value: 5 }, state)
    ).toBe(true);
    expect(
      conditionPasses({ watchBlockId: 'b1', operator: 'gte', value: 6 }, state)
    ).toBe(false);
  });

  it('lte: passes when value <= condition value', () => {
    const state = makeState({ b1: { value: 3 } });
    expect(
      conditionPasses({ watchBlockId: 'b1', operator: 'lte', value: 3 }, state)
    ).toBe(true);
    expect(
      conditionPasses({ watchBlockId: 'b1', operator: 'lte', value: 2 }, state)
    ).toBe(false);
  });

  it('eq: passes only when exactly equal', () => {
    const state = makeState({ b1: { value: 7 } });
    expect(
      conditionPasses({ watchBlockId: 'b1', operator: 'eq', value: 7 }, state)
    ).toBe(true);
    expect(
      conditionPasses({ watchBlockId: 'b1', operator: 'eq', value: 8 }, state)
    ).toBe(false);
  });

  it('boolean condition value: true maps to 1, false to 0', () => {
    const state = makeState({ b1: { value: 1 } });
    expect(
      conditionPasses(
        { watchBlockId: 'b1', operator: 'eq', value: true },
        state
      )
    ).toBe(true);
    expect(
      conditionPasses(
        { watchBlockId: 'b1', operator: 'eq', value: false },
        state
      )
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildInitialState
// ---------------------------------------------------------------------------

describe('buildInitialState', () => {
  it('returns empty state for undefined grid', () => {
    expect(buildInitialState(undefined)).toEqual({});
  });

  it('returns empty state for grid with no blocks', () => {
    const grid = makeGrid({
      cells: [
        {
          id: 'c1',
          colStart: 1,
          rowStart: 1,
          colSpan: 1,
          rowSpan: 1,
          block: null,
        },
      ],
    });
    expect(buildInitialState(grid)).toEqual({});
  });

  it('initialises a counter block with startValue', () => {
    const grid = makeGrid({
      cells: [
        {
          id: 'c1',
          colStart: 1,
          rowStart: 1,
          colSpan: 1,
          rowSpan: 1,
          block: {
            id: 'b1',
            type: 'counter',
            config: { startValue: 10 } as never,
            style: {},
          },
        },
      ],
    });
    const state = buildInitialState(grid);
    expect(state['b1'].value).toBe(10);
  });

  it('initialises a timer block and starts it when autoStart is true', () => {
    const grid = makeGrid({
      cells: [
        {
          id: 'c1',
          colStart: 1,
          rowStart: 1,
          colSpan: 1,
          rowSpan: 1,
          block: {
            id: 'timer1',
            type: 'timer',
            config: { durationSeconds: 60, autoStart: true } as never,
            style: {},
          },
        },
      ],
    });
    const state = buildInitialState(grid);
    expect(state['timer1'].timerRemaining).toBe(60);
    expect(state['timer1'].initialDuration).toBe(60);
    expect(state['timer1'].timerRunning).toBe(true);
  });

  it('does not auto-start a timer when autoStart is false', () => {
    const grid = makeGrid({
      cells: [
        {
          id: 'c1',
          colStart: 1,
          rowStart: 1,
          colSpan: 1,
          rowSpan: 1,
          block: {
            id: 'timer2',
            type: 'timer',
            config: { durationSeconds: 30, autoStart: false } as never,
            style: {},
          },
        },
      ],
    });
    const state = buildInitialState(grid);
    expect(state['timer2'].timerRunning).toBe(false);
  });

  it('initialises a toggle block based on initialOn', () => {
    const grid = makeGrid({
      cells: [
        {
          id: 'c1',
          colStart: 1,
          rowStart: 1,
          colSpan: 1,
          rowSpan: 1,
          block: {
            id: 'tog1',
            type: 'toggle',
            config: { initialOn: true } as never,
            style: {},
          },
        },
      ],
    });
    expect(buildInitialState(grid)['tog1'].value).toBe(1);
  });

  it('stores initialValue matching the configured start value', () => {
    const grid = makeGrid({
      cells: [
        {
          id: 'c1',
          colStart: 1,
          rowStart: 1,
          colSpan: 1,
          rowSpan: 1,
          block: {
            id: 'score1',
            type: 'score',
            config: { startValue: 10 } as never,
            style: {},
          },
        },
      ],
    });
    const state = buildInitialState(grid);
    expect(state['score1'].value).toBe(10);
    expect(state['score1'].initialValue).toBe(10);
  });

  it('initialises poll votes array from options', () => {
    const grid = makeGrid({
      cells: [
        {
          id: 'c1',
          colStart: 1,
          rowStart: 1,
          colSpan: 1,
          rowSpan: 1,
          block: {
            id: 'poll1',
            type: 'poll',
            config: { options: ['A', 'B', 'C'] } as never,
            style: {},
          },
        },
      ],
    });
    expect(buildInitialState(grid)['poll1'].votes).toEqual([0, 0, 0]);
  });

  it('initialises initialHidden button as not visible', () => {
    const grid = makeGrid({
      cells: [
        {
          id: 'c1',
          colStart: 1,
          rowStart: 1,
          colSpan: 1,
          rowSpan: 1,
          block: {
            id: 'btn1',
            type: 'cb-button',
            config: { initialHidden: true, label: 'Go' } as never,
            style: {},
          },
        },
      ],
    });
    expect(buildInitialState(grid)['btn1'].visible).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// blockReducer — INIT
// ---------------------------------------------------------------------------

describe('blockReducer INIT', () => {
  it('replaces state entirely', () => {
    const initial = makeState({ b1: { value: 1 } });
    const replacement = makeState({ b2: { value: 99 } });
    const result = blockReducer(initial, { type: 'INIT', state: replacement });
    expect(result).toBe(replacement);
  });
});

// ---------------------------------------------------------------------------
// blockReducer — RESET_ALL
// ---------------------------------------------------------------------------

describe('blockReducer RESET_ALL', () => {
  it('resets all blocks to initial state from grid', () => {
    const grid = makeGrid({
      cells: [
        {
          id: 'c1',
          colStart: 1,
          rowStart: 1,
          colSpan: 1,
          rowSpan: 1,
          block: {
            id: 'b1',
            type: 'counter',
            config: { startValue: 5 } as never,
            style: {},
          },
        },
      ],
    });
    const mutated = makeState({ b1: { value: 42 } });
    const result = blockReducer(mutated, { type: 'RESET_ALL' }, grid);
    expect(result['b1'].value).toBe(5);
  });

  it('returns empty state when no grid is provided', () => {
    const state = makeState({ b1: { value: 10 } });
    // No gridDefinition → buildInitialState(undefined) = {}
    const result = blockReducer(state, { type: 'RESET_ALL' });
    expect(result).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// blockReducer — TIMER_TICK
// ---------------------------------------------------------------------------

describe('blockReducer TIMER_TICK', () => {
  it('decrements timerRemaining by 1', () => {
    const state = makeState({ t1: { timerRunning: true, timerRemaining: 10 } });
    const result = blockReducer(state, { type: 'TIMER_TICK', blockId: 't1' });
    expect(result['t1'].timerRemaining).toBe(9);
    expect(result['t1'].timerRunning).toBe(true);
  });

  it('stops the timer when it reaches 0', () => {
    const state = makeState({ t1: { timerRunning: true, timerRemaining: 1 } });
    const result = blockReducer(state, { type: 'TIMER_TICK', blockId: 't1' });
    expect(result['t1'].timerRemaining).toBe(0);
    expect(result['t1'].timerRunning).toBe(false);
  });

  it('is a no-op when timer is not running', () => {
    const state = makeState({ t1: { timerRunning: false, timerRemaining: 5 } });
    const result = blockReducer(state, { type: 'TIMER_TICK', blockId: 't1' });
    expect(result).toBe(state); // same reference — no change
  });

  it('is a no-op for an unknown block', () => {
    const state = makeState({ t1: { timerRunning: true, timerRemaining: 5 } });
    const result = blockReducer(state, {
      type: 'TIMER_TICK',
      blockId: 'unknown',
    });
    expect(result).toBe(state);
  });
});

// ---------------------------------------------------------------------------
// blockReducer — BLOCK_EVENT (connections)
// ---------------------------------------------------------------------------

describe('blockReducer BLOCK_EVENT', () => {
  it('is a no-op when there is no grid', () => {
    const state = makeState({ b1: { value: 0 } });
    const result = blockReducer(state, {
      type: 'BLOCK_EVENT',
      sourceId: 'b1',
      event: 'on-click',
    });
    expect(result).toBe(state);
  });

  it('applies show action on on-click event', () => {
    const grid = makeGrid({
      connections: [
        {
          id: 'conn1',
          sourceBlockId: 'btn',
          event: 'on-click',
          targetBlockId: 'box',
          action: 'show',
        },
      ],
    });
    const state = makeState({ btn: {}, box: { visible: false } });
    const result = blockReducer(
      state,
      { type: 'BLOCK_EVENT', sourceId: 'btn', event: 'on-click' },
      grid
    );
    expect(result['box'].visible).toBe(true);
  });

  it('skips connection when guard condition fails', () => {
    const grid = makeGrid({
      connections: [
        {
          id: 'conn1',
          sourceBlockId: 'btn',
          event: 'on-click',
          targetBlockId: 'box',
          action: 'show',
          condition: { watchBlockId: 'counter', operator: 'gte', value: 10 },
        },
      ],
    });
    const state = makeState({
      btn: {},
      box: { visible: false },
      counter: { value: 5 }, // fails gte 10
    });
    const result = blockReducer(
      state,
      { type: 'BLOCK_EVENT', sourceId: 'btn', event: 'on-click' },
      grid
    );
    expect(result['box'].visible).toBe(false); // unchanged
  });

  it('applies connection when guard condition passes', () => {
    const grid = makeGrid({
      connections: [
        {
          id: 'conn1',
          sourceBlockId: 'btn',
          event: 'on-click',
          targetBlockId: 'box',
          action: 'show',
          condition: { watchBlockId: 'counter', operator: 'gte', value: 10 },
        },
      ],
    });
    const state = makeState({
      btn: {},
      box: { visible: false },
      counter: { value: 10 }, // passes gte 10
    });
    const result = blockReducer(
      state,
      { type: 'BLOCK_EVENT', sourceId: 'btn', event: 'on-click' },
      grid
    );
    expect(result['box'].visible).toBe(true);
  });

  it('increment triggers threshold events (on-value-reach-N variants)', () => {
    // When counter increments to 3, it should trigger on-value-reach-3,
    // which should hide the target block.
    const grid = makeGrid({
      connections: [
        {
          id: 'c1',
          sourceBlockId: 'btn',
          event: 'on-click',
          targetBlockId: 'counter',
          action: 'increment',
        },
        {
          id: 'c2',
          sourceBlockId: 'counter',
          event: 'on-value-reach-3',
          targetBlockId: 'badge',
          action: 'reveal',
        },
      ],
    });
    const state = makeState({
      btn: {},
      counter: { value: 2 },
      badge: { revealed: false },
    });
    const result = blockReducer(
      state,
      { type: 'BLOCK_EVENT', sourceId: 'btn', event: 'on-click' },
      grid
    );
    expect(result['counter'].value).toBe(3);
    expect(result['badge'].revealed).toBe(true);
  });

  it('on-counter-reach-N variant also fires on increment', () => {
    const grid = makeGrid({
      connections: [
        {
          id: 'c1',
          sourceBlockId: 'btn',
          event: 'on-click',
          targetBlockId: 'counter',
          action: 'increment',
        },
        {
          id: 'c2',
          sourceBlockId: 'counter',
          event: 'on-counter-reach-3',
          targetBlockId: 'badge',
          action: 'reveal',
        },
      ],
    });
    const state = makeState({
      btn: {},
      counter: { value: 2 },
      badge: { revealed: false },
    });
    const result = blockReducer(
      state,
      { type: 'BLOCK_EVENT', sourceId: 'btn', event: 'on-click' },
      grid
    );
    expect(result['badge'].revealed).toBe(true);
  });

  it('reset-all action restores all blocks to initial state', () => {
    const grid = makeGrid({
      cells: [
        {
          id: 'c1',
          colStart: 1,
          rowStart: 1,
          colSpan: 1,
          rowSpan: 1,
          block: {
            id: 'counter',
            type: 'counter',
            config: { startValue: 0 } as never,
            style: {},
          },
        },
      ],
      connections: [
        {
          id: 'conn1',
          sourceBlockId: 'btn',
          event: 'on-click',
          targetBlockId: 'counter',
          action: 'reset-all',
        },
      ],
    });
    const state = makeState({ btn: {}, counter: { value: 42 } });
    const result = blockReducer(
      state,
      { type: 'BLOCK_EVENT', sourceId: 'btn', event: 'on-click' },
      grid
    );
    expect(result['counter'].value).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// blockReducer — DIRECT_ACTION
// ---------------------------------------------------------------------------

describe('blockReducer DIRECT_ACTION', () => {
  it('increments a counter directly', () => {
    const state = makeState({ b1: { value: 5 } });
    const result = blockReducer(state, {
      type: 'DIRECT_ACTION',
      blockId: 'b1',
      action: 'increment',
    });
    expect(result['b1'].value).toBe(6);
  });

  it('decrement does not go below without min enforcement in reducer', () => {
    const state = makeState({ b1: { value: 2 } });
    const result = blockReducer(state, {
      type: 'DIRECT_ACTION',
      blockId: 'b1',
      action: 'decrement',
    });
    expect(result['b1'].value).toBe(1);
  });

  it('reset restores value to initialValue and resets boolean fields', () => {
    const state = makeState({
      b1: {
        value: 10,
        initialValue: 5,
        revealed: true,
        flipped: true,
        selectedOption: 2,
        timerRunning: true,
        timerRemaining: 5,
        initialDuration: 30,
      },
    });
    const result = blockReducer(state, {
      type: 'DIRECT_ACTION',
      blockId: 'b1',
      action: 'reset',
    });
    expect(result['b1'].value).toBe(5); // restored to initialValue, not 0
    expect(result['b1'].revealed).toBe(false);
    expect(result['b1'].flipped).toBe(false);
    expect(result['b1'].selectedOption).toBe(-1);
    expect(result['b1'].timerRunning).toBe(false);
    expect(result['b1'].timerRemaining).toBe(30); // restored to initialDuration
  });

  it('reset restores value to 0 when no initialValue was set', () => {
    const state = makeState({ b1: { value: 42, initialValue: 0 } });
    const result = blockReducer(state, {
      type: 'DIRECT_ACTION',
      blockId: 'b1',
      action: 'reset',
    });
    expect(result['b1'].value).toBe(0);
  });

  it('set-traffic validates payload and defaults to green on invalid', () => {
    const state = makeState({ b1: { trafficColor: 'green' } });
    const result = blockReducer(state, {
      type: 'DIRECT_ACTION',
      blockId: 'b1',
      action: 'set-traffic',
      actionPayload: 'red',
    });
    expect(result['b1'].trafficColor).toBe('red');

    const bad = blockReducer(state, {
      type: 'DIRECT_ACTION',
      blockId: 'b1',
      action: 'set-traffic',
      actionPayload: 'purple', // invalid
    });
    expect(bad['b1'].trafficColor).toBe('green');
  });

  it('is a no-op for an unknown blockId', () => {
    const state = makeState({ b1: { value: 5 } });
    const result = blockReducer(state, {
      type: 'DIRECT_ACTION',
      blockId: 'missing',
      action: 'increment',
    });
    expect(result).toBe(state);
  });
});
