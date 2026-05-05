import { useState, useEffect, useRef, useCallback } from 'react';
import {
  TimeToolConfig,
  WidgetData,
  ExpectationsConfig,
  WidgetConfig,
  TrafficConfig,
  StationsConfig,
} from '@/types';
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

  const handleStop = useCallback(
    (finalTime?: number) => {
      const timeToSave = finalTime ?? runningDisplayTimeRef.current;
      updateWidget(widget.id, {
        config: {
          ...config,
          isRunning: false,
          elapsedTime: timeToSave,
          startTime: null,
        },
      });
      cancelRaf();
    },
    [config, updateWidget, widget.id, cancelRaf]
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
      setRunningDisplayTime(next);
    },
    [config, updateWidget, widget.id]
  );

  // RAF tick loop
  useEffect(() => {
    if (!config.isRunning || !config.startTime) {
      cancelRaf();
      return;
    }

    const startTime = config.startTime;
    const baseTime = config.elapsedTime;

    const tick = () => {
      const delta = (Date.now() - startTime) / 1000;

      if (config.mode === 'timer') {
        const nextTime = Math.max(0, baseTime - delta);
        setRunningDisplayTime(nextTime);

        if (nextTime === 0) {
          handleStop(0);
          playTimerAlert(config.selectedSound);

          // Auto-switch expectations voice level
          if (config.timerEndVoiceLevel != null && activeDashboard) {
            const expWidget = activeDashboard.widgets.find(
              (w) => w.type === 'expectations'
            );
            if (expWidget) {
              updateWidget(expWidget.id, {
                config: {
                  ...(expWidget.config as ExpectationsConfig),
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
                  ...(trafficWidget.config as TrafficConfig),
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
                  ...randomWidget.config,
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
                  ...nextUpWidget.config,
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
                  ...(stationsWidget.config as StationsConfig),
                  rotationTrigger: Date.now(),
                } as WidgetConfig,
              });
            }
          }

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
    config.selectedSound,
    config.timerEndVoiceLevel,
    config.timerEndTrafficColor,
    config.timerEndTriggerRandom,
    config.timerEndTriggerNextUp,
    config.timerEndTriggerStationsRotate,
    config.duration,
    activeDashboard,
    updateWidget,
    handleStop,
    cancelRaf,
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
