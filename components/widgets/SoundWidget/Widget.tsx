import React, { useState, useEffect, useRef } from 'react';
import { useDashboard } from '@/context/useDashboard';
import {
  WidgetData,
  SoundConfig,
  TrafficConfig,
  WidgetConfig,
  ExpectationsConfig,
} from '@/types';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { POSTER_LEVELS, getLevelData } from './constants';
import { ThermometerView } from './components/ThermometerView';
import { SpeedometerView } from './components/SpeedometerView';
import { PopcornBallsView } from './components/PopcornBallsView';

// Add type definition for webkitAudioContext
interface CustomWindow extends Window {
  webkitAudioContext: typeof AudioContext;
}

// After the Board has been hidden this long, fully release the mic +
// AudioContext instead of keeping them alive for fast resume. Shorter hides
// still hit the fast-resume path below.
const RELEASE_AFTER_HIDDEN_MS = 2 * 60 * 1000;

export const SoundWidget: React.FC<{
  widget: WidgetData;
  isActive?: boolean;
}> = ({ widget, isActive = true }) => {
  const { updateWidget, activeDashboard } = useDashboard();
  const [volume, setVolume] = useState(0);
  const [history, setHistory] = useState<number[]>(new Array(50).fill(0));
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  // Timer that releases the mic + AudioContext after a long hide (see effect below).
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    sensitivity = 1,
    visual = 'thermometer',
    autoTrafficLight,
    trafficLightThreshold = 4,
    syncExpectations = false,
  } = widget.config as SoundConfig;

  // Use ref for sensitivity to prevent audio stream restart on sensitivity changes
  const sensitivityRef = useRef(sensitivity);
  useEffect(() => {
    sensitivityRef.current = sensitivity;
  }, [sensitivity]);

  // Nexus Connection: Sync with Expectations
  useEffect(() => {
    if (!syncExpectations || !activeDashboard) return;

    const expectationsWidget = activeDashboard.widgets.find(
      (w) => w.type === 'expectations'
    );
    if (!expectationsWidget) return;

    const expectationsConfig = expectationsWidget.config as ExpectationsConfig;
    const { voiceLevel } = expectationsConfig;
    if (voiceLevel === null || voiceLevel === undefined) return;

    // Map Voice Level (0-4) to Sensitivity (5.0 - 0.5)
    // 0 -> 5.0 (Silent/Very sensitive)
    // 1 -> 3.5
    // 2 -> 2.0
    // 3 -> 1.0
    // 4 -> 0.5 (Loud/Less sensitive)
    const mapping: Record<number, number> = {
      0: 5.0,
      1: 3.5,
      2: 2.0,
      3: 1.0,
      4: 0.5,
    };

    const targetSensitivity = mapping[voiceLevel] ?? 1.0;

    if (sensitivity !== targetSensitivity) {
      updateWidget(widget.id, {
        config: {
          ...widget.config,
          sensitivity: targetSensitivity,
        } as SoundConfig,
      });
    }
  }, [
    syncExpectations,
    activeDashboard,
    sensitivity,
    widget.id,
    widget.config,
    updateWidget,
  ]);

  // Two cooperating effects so the suspend/resume seam works as intended:
  //
  //   (1) Per-`isActive` effect: controls the RAF loop and suspends/resumes
  //       the running AudioContext when the host Board is hidden/shown.
  //       On hide it suspends (keeping the mic alive for fast resume) AND
  //       arms a release timer; only if the Board stays hidden past
  //       RELEASE_AFTER_HIDDEN_MS does it close the AudioContext and stop
  //       the mic tracks (clearing the refs so the next activation re-acquires
  //       via the first-activation path). Re-show within the window cancels
  //       the timer and hits the "resume existing context" path. (Cleanup that
  //       closed on every toggle made the resume branch dead code; the next
  //       activation would always re-prompt the mic icon.)
  //
  //   (2) Mount-only effect: owns full teardown — stops the stream and
  //       closes the AudioContext. Runs exactly once on unmount.
  //
  // The mic indicator stays visible during a short hide (stream still live)
  // for instant resume; after a long hide the mic is released automatically.
  useEffect(() => {
    if (!isActive) {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      void audioContextRef.current?.suspend();

      // Arm a one-shot timer to release the mic + AudioContext if the Board
      // stays hidden long enough that fast-resume no longer justifies holding
      // the resources (and the live mic indicator) open.
      releaseTimerRef.current ??= setTimeout(() => {
        releaseTimerRef.current = null;
        streamRef.current?.getTracks().forEach((t) => t.stop());
        void audioContextRef.current?.close();
        audioContextRef.current = null;
        analyserRef.current = null;
        streamRef.current = null;
      }, RELEASE_AFTER_HIDDEN_MS);
      return undefined;
    }

    // Re-shown before the release timer fired: keep the existing context, so
    // cancel the pending release.
    if (releaseTimerRef.current !== null) {
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }

    // If we already have a running AudioContext (board was hidden then
    // shown again), just resume and restart the RAF loop without
    // re-acquiring the mic.
    if (audioContextRef.current && analyserRef.current) {
      void audioContextRef.current.resume();

      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const resumeLoop = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const sum = dataArray.reduce((a, b) => a + b, 0);
        const average = sum / bufferLength;
        const normalized = Math.min(
          100,
          average * (sensitivityRef.current * 2)
        );
        setVolume(normalized);
        setHistory((prev) => [...prev.slice(-49), normalized]);
        animationRef.current = requestAnimationFrame(resumeLoop);
      };
      resumeLoop();
      // Cleanup limited to cancelling the RAF — the AudioContext + stream
      // outlive the isActive toggle.
      return () => {
        if (animationRef.current !== null) {
          cancelAnimationFrame(animationRef.current);
          animationRef.current = null;
        }
      };
    }

    // First activation: acquire the mic and set up AudioContext fresh.
    let cancelled = false;
    const startAudio = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as CustomWindow).webkitAudioContext;
        const audioContext = new AudioContextClass();
        audioContextRef.current = audioContext;
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const update = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          const sum = dataArray.reduce((a, b) => a + b, 0);
          const average = sum / bufferLength;
          const normalized = Math.min(
            100,
            average * (sensitivityRef.current * 2)
          );

          setVolume(normalized);
          setHistory((prev) => [...prev.slice(-49), normalized]);
          animationRef.current = requestAnimationFrame(update);
        };
        update();
      } catch (err) {
        console.error(err);
      }
    };
    void startAudio();
    return () => {
      cancelled = true;
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      // NOTE: do NOT close the AudioContext or stop the stream here. Full
      // teardown lives in the mount-only effect below so the resume path
      // above stays reachable on hide→show toggles. If `getUserMedia`
      // rejected, both refs stayed null and the next activation re-tries.
    };
  }, [isActive]);

  // Mount-only teardown: release the mic and AudioContext on unmount.
  useEffect(() => {
    return () => {
      if (releaseTimerRef.current !== null) {
        clearTimeout(releaseTimerRef.current);
        releaseTimerRef.current = null;
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void audioContextRef.current?.close();
      audioContextRef.current = null;
      analyserRef.current = null;
      streamRef.current = null;
    };
  }, []);

  const level = getLevelData(volume);

  // Nexus Connection: Auto Traffic Light
  useEffect(() => {
    if (!autoTrafficLight || !activeDashboard) return;

    // Find the first traffic light widget
    const trafficLight = activeDashboard.widgets.find(
      (w) => w.type === 'traffic'
    );
    if (!trafficLight) return;

    const levelIndex = POSTER_LEVELS.indexOf(level);
    const thresholdIndex = trafficLightThreshold ?? 4;

    // Stable Delay: Only act if the level holds for 1s
    const timer = setTimeout(() => {
      const trafficConfig = trafficLight.config as TrafficConfig;
      const desiredState = levelIndex >= thresholdIndex ? 'red' : 'green';

      // Only update if state is different to avoid spamming Firestore
      if (trafficConfig.active !== desiredState) {
        updateWidget(trafficLight.id, {
          config: { ...trafficConfig, active: desiredState } as WidgetConfig,
        });
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [
    level,
    autoTrafficLight,
    trafficLightThreshold,
    activeDashboard,
    updateWidget,
  ]);

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div className="flex-1 min-h-0 relative w-full h-full p-2">
          {visual === 'thermometer' && <ThermometerView volume={volume} />}
          {visual === 'speedometer' && <SpeedometerView volume={volume} />}
          {visual === 'balls' && <PopcornBallsView volume={volume} />}
          {visual === 'line' && (
            <div className="w-full h-full bg-black/20 rounded-2xl p-2">
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="w-full h-full overflow-visible"
              >
                <polyline
                  fill="none"
                  stroke={level.color}
                  strokeWidth="3"
                  points={history
                    .map((v, i) => `${(i / 49) * 100},${100 - v}`)
                    .join(' ')}
                  className="transition-colors duration-300"
                />
              </svg>
            </div>
          )}
        </div>
      }
      footer={
        <div className="text-center pb-3">
          <span
            className="font-black uppercase tracking-widest px-6 py-2 rounded-full text-white shadow-md transition-all duration-300 inline-block border-2 border-white/20"
            style={{
              backgroundColor: level.color,
              fontSize: 'min(12px, 3.5cqmin)',
            }}
          >
            {level.label}
          </span>
        </div>
      }
    />
  );
};
