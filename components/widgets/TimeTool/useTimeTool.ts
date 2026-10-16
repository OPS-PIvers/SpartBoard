import { useState, useEffect, useRef, useCallback } from 'react';
import { TimeToolConfig, WidgetData } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { playTimerAlert, resumeAudio } from '@/utils/timeToolAudio';
import {
  clockStateOf,
  secondsAt,
  timeToolClockPatch,
  type TimeToolClockEvent,
} from '@/utils/timeToolClock';

// `isBoardActive` is false for a timer on a mounted but hidden board, which must not drive widgets on the shown board.
export const useTimeTool = (
  widget: WidgetData,
  { isBoardActive = true }: { isBoardActive?: boolean } = {}
) => {
  const { updateWidget, activeDashboard } = useDashboard();
  const config = widget.config as TimeToolConfig;

  const [runningDisplayTime, setRunningDisplayTime] = useState(
    config.elapsedTime
  );
  const runningDisplayTimeRef = useRef(runningDisplayTime);
  const rafRef = useRef<number | null>(null);

  // Keep the ref in sync so handleStop can read the latest value
  useEffect(() => {
    runningDisplayTimeRef.current = runningDisplayTime;
  }, [runningDisplayTime]);

  const displayTime = config.isRunning
    ? runningDisplayTime
    : config.elapsedTime;

  const cancelRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // handleStop is stable across renders: it sends only the delta the
  // dashboard reducer needs to apply (`updateWidget` already shallow-merges
  // the new fields onto the live `w.config` — see DashboardContext
  // `updateWidget`). Not spreading the local `config` here also avoids a
  // subtle write-skew where stale local config could overwrite a newer
  // remote-synced config on the same render tick.
  // Pause saves the last painted time, so the face doesn't jump when it stops.
  const handleStop = useCallback(
    (finalTime?: number, opts?: { skipHistory?: boolean }) => {
      const timeToSave = finalTime ?? runningDisplayTimeRef.current;
      updateWidget(
        widget.id,
        {
          config: {
            isRunning: false,
            elapsedTime: timeToSave,
            startTime: null,
          },
        },
        opts
      );
      cancelRaf();
    },
    [updateWidget, widget.id, cancelRaf]
  );

  const handleStart = useCallback(async () => {
    await resumeAudio();
    const patch = timeToolClockPatch(config, {
      type: 'start',
      now: Date.now(),
    });
    if (!patch) return;
    updateWidget(widget.id, { config: patch });
    setRunningDisplayTime(config.elapsedTime);
  }, [config, updateWidget, widget.id]);

  // Reset, setTime and adjust spread the whole config, as they always have.
  const applySpread = useCallback(
    (event: TimeToolClockEvent) => {
      const patch = timeToolClockPatch(config, event);
      if (!patch) return null;
      updateWidget(widget.id, { config: { ...config, ...patch } });
      return patch;
    },
    [config, updateWidget, widget.id]
  );

  const handleReset = useCallback(() => {
    const patch = applySpread({ type: 'reset' });
    if (patch?.elapsedTime != null) setRunningDisplayTime(patch.elapsedTime);
    cancelRaf();
  }, [applySpread, cancelRaf]);

  const setTime = useCallback(
    (s: number) => {
      applySpread({ type: 'setTime', seconds: s });
      setRunningDisplayTime(s);
    },
    [applySpread]
  );

  const adjustTime = useCallback(
    (deltaSeconds: number) => {
      const fromSeconds = config.isRunning
        ? runningDisplayTimeRef.current
        : config.elapsedTime;
      const patch = applySpread({
        type: 'adjust',
        deltaSeconds,
        fromSeconds,
        now: Date.now(),
      });
      if (patch?.elapsedTime == null) return;
      const next = patch.elapsedTime;
      // Update the ref synchronously so back-to-back calls inside the same
      // tick (e.g. press-and-hold ramp) read the just-applied value instead
      // of the pre-render stale value the deferred sync-effect would still see.
      runningDisplayTimeRef.current = next;
      setRunningDisplayTime(next);
    },
    [config.isRunning, config.elapsedTime, applySpread]
  );

  // ── RAF tick loop ────────────────────────────────────────────────────
  //
  // Deliberately narrow deps: only the timing-state values that should
  // actually restart the loop (run state, mode, the captured base for the
  // delta math). When the countdown reaches zero we stop the timer and
  // raise a one-shot expiry signal — the broader auto-trigger work
  // (sound, expectations/traffic/randomizer/nextup/stations) is handled
  // in a separate effect below.
  //
  // Why split: `activeDashboard` is a fresh reference on every dashboard
  // mutation (any widget add/edit/drag-end), and the timer-end config
  // fields are user-tweakable mid-run. Putting either in this dep array
  // tore down and re-scheduled the RAF on every unrelated change, which
  // is wasteful even on a static board and pathological while a
  // position-aware widget (catalyst*) is being dragged at 60fps.
  const [expirySignal, setExpirySignal] = useState<number | null>(null);

  useEffect(() => {
    const clock = {
      mode: config.mode,
      // A running clock never reads its duration; leaving it out keeps the loop from restarting on duration edits.
      duration: 0,
      elapsedTime: config.elapsedTime,
      isRunning: config.isRunning,
      startTime: config.startTime,
    };
    const state = clockStateOf(clock);
    if (state.phase !== 'running') {
      cancelRaf();
      return;
    }

    const tick = () => {
      const nextTime = secondsAt(clock, Date.now());
      setRunningDisplayTime(nextTime);

      if (state.mode === 'timer' && nextTime === 0) {
        const patch = timeToolClockPatch(clock, { type: 'expire' });
        // Expiry is system-driven; keep it out of the undo stack.
        if (patch)
          updateWidget(widget.id, { config: patch }, { skipHistory: true });
        cancelRaf();
        // Signal expiry to the trigger effect. Date.now() is unique
        // per cycle so a second run can fire its own triggers even if
        // the first signal is still being processed.
        setExpirySignal(Date.now());
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return cancelRaf;
  }, [
    config.isRunning,
    config.startTime,
    config.elapsedTime,
    config.mode,
    updateWidget,
    widget.id,
    cancelRaf,
  ]);

  // ── Auto-trigger effect ──────────────────────────────────────────────
  //
  // Fires the end-of-timer side effects (sound + sister-widget updates)
  // when the RAF tick raises `expirySignal`. Deps include everything we
  // read here so the closure always has the freshest values — but
  // `lastFiredSignalRef` guards against re-firing when one of those deps
  // changes for any reason OTHER than a new expiry (e.g. the teacher
  // edits a different widget on the board and `activeDashboard`'s
  // reference flips). The ref is processing memory, not a state mirror.
  const lastFiredSignalRef = useRef<number | null>(null);

  useEffect(() => {
    if (expirySignal === null) return;
    if (expirySignal === lastFiredSignalRef.current) return;
    lastFiredSignalRef.current = expirySignal;

    playTimerAlert(config.selectedSound);

    // Only a timer on the shown board drives sister widgets; a hidden board's timer would otherwise act on the shown one.
    const board = isBoardActive ? activeDashboard : null;

    // Auto-switch expectations voice level
    if (config.timerEndVoiceLevel != null && board) {
      const expWidget = board.widgets.find((w) => w.type === 'expectations');
      if (expWidget) {
        updateWidget(
          expWidget.id,
          {
            config: {
              voiceLevel: config.timerEndVoiceLevel,
            },
          },
          { skipHistory: true }
        );
      }
    }

    // Auto-switch traffic light color
    if (config.timerEndTrafficColor != null && board) {
      const trafficWidget = board.widgets.find((w) => w.type === 'traffic');
      if (trafficWidget) {
        updateWidget(
          trafficWidget.id,
          {
            config: {
              active: config.timerEndTrafficColor,
            },
          },
          { skipHistory: true }
        );
      }
    }

    // Auto-pick next student in Randomizer
    if (config.timerEndTriggerRandom && board && config.duration > 0) {
      const randomWidget = board.widgets.find((w) => w.type === 'random');
      if (randomWidget) {
        updateWidget(
          randomWidget.id,
          {
            config: {
              externalTrigger: Date.now(),
            },
          },
          { skipHistory: true }
        );
      }
    }

    // Auto-advance next student in NextUp
    if (config.timerEndTriggerNextUp && board && config.duration > 0) {
      const nextUpWidget = board.widgets.find((w) => w.type === 'nextUp');
      if (nextUpWidget) {
        updateWidget(
          nextUpWidget.id,
          {
            config: {
              externalTrigger: Date.now(),
            },
          },
          { skipHistory: true }
        );
      }
    }

    // Auto-rotate the first Stations widget
    if (config.timerEndTriggerStationsRotate && board && config.duration > 0) {
      const stationsWidget = board.widgets.find((w) => w.type === 'stations');
      if (stationsWidget) {
        updateWidget(
          stationsWidget.id,
          {
            config: {
              rotationTrigger: Date.now(),
            },
          },
          { skipHistory: true }
        );
      }
    }
  }, [
    expirySignal,
    config.selectedSound,
    config.timerEndVoiceLevel,
    config.timerEndTrafficColor,
    config.timerEndTriggerRandom,
    config.timerEndTriggerNextUp,
    config.timerEndTriggerStationsRotate,
    config.duration,
    activeDashboard,
    isBoardActive,
    updateWidget,
  ]);

  return {
    displayTime,
    isRunning: config.isRunning,
    mode: config.mode,
    config,
    handleStart,
    handleStop,
    handleReset,
    setTime,
    adjustTime,
  };
};
