import { useState, useEffect, useRef, useCallback } from 'react';
import { TimeToolConfig, WidgetData, WidgetConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { playTimerAlert, resumeAudio } from '@/utils/timeToolAudio';

export const useTimeTool = (widget: WidgetData) => {
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
  const handleStop = useCallback(
    (finalTime?: number) => {
      const timeToSave = finalTime ?? runningDisplayTimeRef.current;
      updateWidget(widget.id, {
        config: {
          isRunning: false,
          elapsedTime: timeToSave,
          startTime: null,
        } as WidgetConfig,
      });
      cancelRaf();
    },
    [updateWidget, widget.id, cancelRaf]
  );

  const handleStart = useCallback(async () => {
    await resumeAudio();
    const now = Date.now();
    updateWidget(widget.id, {
      config: {
        ...config,
        isRunning: true,
        startTime: now,
        elapsedTime: displayTime,
      },
    });
    setRunningDisplayTime(displayTime);
  }, [config, updateWidget, widget.id, displayTime]);

  const handleReset = useCallback(() => {
    const resetTime = config.mode === 'timer' ? config.duration : 0;
    updateWidget(widget.id, {
      config: {
        ...config,
        isRunning: false,
        elapsedTime: resetTime,
        startTime: null,
      },
    });
    setRunningDisplayTime(resetTime);
    cancelRaf();
  }, [config, updateWidget, widget.id, cancelRaf]);

  const setTime = useCallback(
    (s: number) => {
      updateWidget(widget.id, {
        config: {
          ...config,
          elapsedTime: s,
          duration: s,
          isRunning: false,
          startTime: null,
        },
      });
      setRunningDisplayTime(s);
    },
    [config, updateWidget, widget.id]
  );

  const adjustTime = useCallback(
    (deltaSeconds: number) => {
      if (config.mode !== 'timer') return;
      const current = config.isRunning
        ? runningDisplayTimeRef.current
        : config.elapsedTime;
      const next = Math.max(0, current + deltaSeconds);
      const nextDuration = Math.max(config.duration, next);
      updateWidget(widget.id, {
        config: {
          ...config,
          elapsedTime: next,
          duration: nextDuration,
          startTime: config.isRunning ? Date.now() : null,
        },
      });
      // Update the ref synchronously so back-to-back calls inside the same
      // tick (e.g. press-and-hold ramp) read the just-applied value instead
      // of the pre-render stale value the deferred sync-effect would still see.
      runningDisplayTimeRef.current = next;
      setRunningDisplayTime(next);
    },
    [config, updateWidget, widget.id]
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
    if (!config.isRunning || !config.startTime) {
      cancelRaf();
      return;
    }

    const startTime = config.startTime;
    const baseTime = config.elapsedTime;
    const mode = config.mode;

    const tick = () => {
      const delta = (Date.now() - startTime) / 1000;

      if (mode === 'timer') {
        const nextTime = Math.max(0, baseTime - delta);
        setRunningDisplayTime(nextTime);

        if (nextTime === 0) {
          handleStop(0);
          // Signal expiry to the trigger effect. Date.now() is unique
          // per cycle so a second run can fire its own triggers even if
          // the first signal is still being processed.
          setExpirySignal(Date.now());
          return;
        }
      } else {
        setRunningDisplayTime(baseTime + delta);
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
    handleStop,
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

    // Auto-switch expectations voice level
    if (config.timerEndVoiceLevel != null && activeDashboard) {
      const expWidget = activeDashboard.widgets.find(
        (w) => w.type === 'expectations'
      );
      if (expWidget) {
        updateWidget(expWidget.id, {
          config: {
            voiceLevel: config.timerEndVoiceLevel,
          } as WidgetConfig,
        });
      }
    }

    // Auto-switch traffic light color
    if (config.timerEndTrafficColor != null && activeDashboard) {
      const trafficWidget = activeDashboard.widgets.find(
        (w) => w.type === 'traffic'
      );
      if (trafficWidget) {
        updateWidget(trafficWidget.id, {
          config: {
            active: config.timerEndTrafficColor,
          } as WidgetConfig,
        });
      }
    }

    // Auto-pick next student in Randomizer
    if (
      config.timerEndTriggerRandom &&
      activeDashboard &&
      config.duration > 0
    ) {
      const randomWidget = activeDashboard.widgets.find(
        (w) => w.type === 'random'
      );
      if (randomWidget) {
        updateWidget(randomWidget.id, {
          config: {
            externalTrigger: Date.now(),
          } as WidgetConfig,
        });
      }
    }

    // Auto-advance next student in NextUp
    if (
      config.timerEndTriggerNextUp &&
      activeDashboard &&
      config.duration > 0
    ) {
      const nextUpWidget = activeDashboard.widgets.find(
        (w) => w.type === 'nextUp'
      );
      if (nextUpWidget) {
        updateWidget(nextUpWidget.id, {
          config: {
            externalTrigger: Date.now(),
          } as WidgetConfig,
        });
      }
    }

    // Auto-rotate the first Stations widget
    if (
      config.timerEndTriggerStationsRotate &&
      activeDashboard &&
      config.duration > 0
    ) {
      const stationsWidget = activeDashboard.widgets.find(
        (w) => w.type === 'stations'
      );
      if (stationsWidget) {
        updateWidget(stationsWidget.id, {
          config: {
            rotationTrigger: Date.now(),
          } as WidgetConfig,
        });
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
