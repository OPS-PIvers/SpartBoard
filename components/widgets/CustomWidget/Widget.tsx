/**
 * CustomWidgetWidget
 *
 * Runtime renderer for custom widgets. Supports block-mode (CSS grid of blocks)
 * and code-mode (sandboxed iframe).
 */

import React, { useReducer, useEffect, useRef } from 'react';
import { onSnapshot, doc } from 'firebase/firestore';
import { db, isConfigured } from '@/config/firebase';
import {
  WidgetData,
  CustomWidgetConfig,
  CustomGridDefinition,
  CustomWidgetDoc,
} from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { WidgetBlockState, WidgetAction } from './types';
import {
  blockReducer,
  buildInitialState,
  conditionPasses,
} from './blockReducer';
import { BlockRenderer } from './BlockRenderer';
import {
  WidgetStateContext,
  WidgetStateContextValue,
} from './WidgetStateContext';

// ---------------------------------------------------------------------------
// Audio helper
// ---------------------------------------------------------------------------

let globalAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  globalAudioContext ??= new AudioContext();
  return globalAudioContext;
}

function playBeep(frequency = 440, duration = 0.3): void {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {
    // AudioContext not available — ignore
  }
}

// ---------------------------------------------------------------------------
// Main Widget
// ---------------------------------------------------------------------------

export const CustomWidgetWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const config = widget.config as CustomWidgetConfig;
  const { customWidgetId } = config;
  const { addToast } = useDashboard();

  // Live Firestore doc for the custom widget definition
  const [widgetDoc, setWidgetDoc] = React.useState<CustomWidgetDoc | null>(
    null
  );
  const [docLoading, setDocLoading] = React.useState(true);

  // Active grid definition — sourced from live Firestore doc only
  const activeGrid: CustomGridDefinition | undefined =
    widgetDoc?.gridDefinition;

  const activeCode: string | undefined = widgetDoc?.codeContent;

  const activeMode: 'block' | 'code' = widgetDoc?.mode ?? 'block';

  const adminSettings = config.adminSettings;

  const [state, dispatch] = useReducer(
    (s: WidgetBlockState, a: WidgetAction) => blockReducer(s, a, activeGrid),
    {},
    () => buildInitialState(activeGrid)
  );

  // Subscribe to Firestore doc
  useEffect(() => {
    if (!isConfigured || !customWidgetId) {
      const timer = setTimeout(() => setDocLoading(false), 0);
      return () => clearTimeout(timer);
    }
    const ref = doc(db, 'custom_widgets', customWidgetId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setWidgetDoc({ ...snap.data(), id: snap.id } as CustomWidgetDoc);
        } else {
          setWidgetDoc(null);
        }
        setDocLoading(false);
      },
      () => {
        setWidgetDoc(null);
        setDocLoading(false);
      }
    );
    return unsub;
  }, [customWidgetId]);

  // Re-initialize block state when grid *content* changes (not just reference).
  // Two-level guard:
  //   1. Compare widgetDoc.updatedAt (O(1)) — skips stringify on every snapshot
  //      when only unrelated metadata (e.g. title) hasn't actually changed.
  //   2. JSON.stringify only runs when updatedAt bumped, preventing false-positive
  //      INIT resets from title/description-only saves.
  const prevUpdatedAtRef = useRef<number | null>(null);
  const prevGridSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeGrid) return;
    const docUpdatedAt = widgetDoc?.updatedAt ?? null;
    if (docUpdatedAt !== null && docUpdatedAt === prevUpdatedAtRef.current)
      return;
    prevUpdatedAtRef.current = docUpdatedAt;
    const signature = JSON.stringify(activeGrid);
    if (signature !== prevGridSignatureRef.current) {
      prevGridSignatureRef.current = signature;
      dispatch({ type: 'INIT', state: buildInitialState(activeGrid) });
    }
  }, [activeGrid, widgetDoc?.updatedAt]);

  // Determine whether any timers are running (safe to derive during render).
  const hasRunningTimers = Object.values(state).some(
    (bs) => bs.timerRunning && bs.timerRemaining > 0
  );

  // Keep a ref with the live list of running timer IDs so the interval
  // callback is never stale. Updated in an effect (not during render).
  const runningTimerIdsRef = useRef<string[]>([]);
  useEffect(() => {
    runningTimerIdsRef.current = Object.entries(state)
      .filter(([, bs]) => bs.timerRunning && bs.timerRemaining > 0)
      .map(([id]) => id);
  });

  // Timer intervals: tick each running timer block every second
  useEffect(() => {
    if (!hasRunningTimers) return;
    const interval = setInterval(() => {
      for (const blockId of runningTimerIdsRef.current) {
        dispatch({ type: 'TIMER_TICK', blockId });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [hasRunningTimers, dispatch]);

  // Queue of BLOCK_EVENTs dispatched since the last state flush — used to fire
  // side effects after the reducer has settled. A queue (not a single ref) is
  // required because some blocks emit multiple events in sequence
  // (e.g. counter: on-counter-reach-X AND on-value-reach-X).
  const lastEventRef = useRef<WidgetAction[]>([]);
  // Track previous state to detect timer-end transitions for side effects.
  const prevStateRef = useRef<WidgetBlockState>({});

  const dispatchWithSideEffects = React.useCallback(
    (action: WidgetAction) => {
      if (action.type === 'BLOCK_EVENT') {
        lastEventRef.current.push(action);
      }
      dispatch(action);
    },
    [dispatch]
  );

  // After state update: fire play-sound / show-toast side effects.
  // Timer-end state transitions are now handled atomically in the TIMER_TICK
  // reducer case — this effect only handles the side effects (sound/toast).
  useEffect(() => {
    if (!activeGrid) {
      prevStateRef.current = state;
      return;
    }

    // Timer-end side effects: play-sound / show-toast for on-timer-end connections
    const prev = prevStateRef.current;
    for (const [blockId, bs] of Object.entries(state)) {
      const prevBs = prev[blockId];
      if (
        prevBs &&
        prevBs.timerRemaining > 0 &&
        bs.timerRemaining === 0 &&
        !bs.timerRunning
      ) {
        // ⚡ Bolt Optimization: Use direct if condition instead of filter() to prevent intermediate array allocations
        for (const conn of activeGrid.connections) {
          if (conn.sourceBlockId === blockId && conn.event === 'on-timer-end') {
            if (!conditionPasses(conn.condition, state)) continue;
            if (conn.action === 'play-sound') playBeep();
            if (conn.action === 'show-toast' && conn.actionPayload)
              addToast(conn.actionPayload, 'info');
          }
        }
      }
    }
    prevStateRef.current = state;

    // BLOCK_EVENT side effects: drain the queue and fire play-sound / show-toast
    const queuedEvents = lastEventRef.current;
    lastEventRef.current = [];
    for (const ev of queuedEvents) {
      if (ev.type !== 'BLOCK_EVENT') continue;
      // ⚡ Bolt Optimization: Use direct if condition instead of filter() to prevent intermediate array allocations
      for (const conn of activeGrid.connections) {
        if (conn.sourceBlockId === ev.sourceId && conn.event === ev.event) {
          if (!conditionPasses(conn.condition, state)) continue;
          if (conn.action === 'play-sound') playBeep();
          if (conn.action === 'show-toast' && conn.actionPayload)
            addToast(conn.actionPayload, 'info');
        }
      }
    }
  }, [state, activeGrid, addToast]);

  // Context value
  const contextValue: WidgetStateContextValue = React.useMemo(
    () => ({
      state,
      dispatch: dispatchWithSideEffects,
      gridDefinition: activeGrid,
      adminSettings,
    }),
    [state, dispatchWithSideEffects, activeGrid, adminSettings]
  );

  // Loading state
  if (docLoading) {
    return (
      <div
        className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-400"
        style={{ fontSize: 'min(14px, 5cqmin)' }}
      >
        Loading…
      </div>
    );
  }

  // Code mode
  if (activeMode === 'code') {
    return (
      <div className="w-full h-full">
        <iframe
          srcDoc={activeCode ?? ''}
          sandbox="allow-scripts allow-forms allow-modals"
          className="w-full h-full border-0"
          title={widgetDoc?.title ?? 'Custom Widget'}
        />
      </div>
    );
  }

  // Block mode — no grid definition yet
  if (!activeGrid) {
    return (
      <div
        className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-400"
        style={{ fontSize: 'min(14px, 5cqmin)' }}
      >
        No content configured.
      </div>
    );
  }

  return (
    <WidgetStateContext.Provider value={contextValue}>
      <div
        className="w-full h-full"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${activeGrid.columns}, 1fr)`,
          gridTemplateRows: `repeat(${activeGrid.rows}, 1fr)`,
        }}
      >
        {activeGrid.cells.map((cell) => {
          if (!cell.block) {
            return (
              <div
                key={cell.id}
                style={{
                  gridColumn: `${cell.colStart} / span ${cell.colSpan}`,
                  gridRow: `${cell.rowStart} / span ${cell.rowSpan}`,
                }}
              />
            );
          }
          return (
            <div
              key={cell.id}
              style={{
                gridColumn: `${cell.colStart} / span ${cell.colSpan}`,
                gridRow: `${cell.rowStart} / span ${cell.rowSpan}`,
                backgroundColor: cell.block.style.backgroundColor ?? undefined,
                borderRadius: cell.block.style.borderRadius ?? undefined,
                padding: cell.block.style.padding ?? undefined,
                overflow: 'hidden',
              }}
            >
              <BlockRenderer block={cell.block} />
            </div>
          );
        })}
      </div>
    </WidgetStateContext.Provider>
  );
};
