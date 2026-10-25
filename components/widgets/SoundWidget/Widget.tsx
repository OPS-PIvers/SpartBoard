import React, {
  useState,
  useEffect,
  useEffectEvent,
  useCallback,
  useRef,
} from 'react';
import {
  AlertTriangle,
  BarChart3,
  Ear,
  PartyPopper,
  RotateCcw,
} from 'lucide-react';
import { tourAttr } from '@/config/tourAnchors';
import { useTranslation } from 'react-i18next';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { playTimerAlert, resumeAudio } from '@/utils/timeToolAudio';
import {
  WidgetData,
  SoundConfig,
  TrafficConfig,
  ExpectationsConfig,
} from '@/types';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { POSTER_LEVELS, getLevelData } from './constants';
import { ThermometerView } from './components/ThermometerView';
import { SpeedometerView } from './components/SpeedometerView';
import { PopcornBallsView } from './components/PopcornBallsView';
import { LevelNameView } from './components/LevelNameView';
import {
  ALERT_SOUND_COOLDOWN_MS,
  CALIBRATE_GIVE_UP_MS,
  CALIBRATE_MS,
  CALIBRATE_SAMPLE_MS,
  DEFAULT_ALERT_SOUND,
  isCalibrating,
  noiseFloorFrom,
  formatGoalTime,
  quietGoalMs,
  NOISE_METER_PRO,
  alertDelayMs,
  resolveTargetLevel,
  smoothVolume,
  targetLimit,
} from './noiseTarget';
import { useTooLoudAlert } from './useTooLoudAlert';
import { useQuietGoal } from './useQuietGoal';
import { useNoiseSession } from './useNoiseSession';
import { SessionSummary } from './components/SessionSummary';

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
  const { t } = useTranslation();
  const pro = useAuth().canAccessFeature(NOISE_METER_PRO);
  const [volume, setVolume] = useState(0);
  const [history, setHistory] = useState<number[]>(new Array(50).fill(0));
  const [micReady, setMicReady] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const closeSummary = useCallback(() => setShowSummary(false), []);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  // Timer that releases the mic + AudioContext after a long hide (see effect below).
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    sensitivity = 1,
    visual: savedVisual = 'thermometer',
    autoTrafficLight,
    trafficLightThreshold = 4,
    syncExpectations = false,
    targetLevel,
    alertDelaySeconds,
    alertSoundEnabled = false,
    alertSound = DEFAULT_ALERT_SOUND,
    noiseFloor,
    quietGoalMinutes,
    quietGoalResetOnAlert = false,
  } = widget.config as SoundConfig;
  // Level name is a pro visual; without the flag it falls back to the default.
  const visual = savedVisual === 'level' && !pro ? 'thermometer' : savedVisual;
  const floor = pro && typeof noiseFloor === 'number' ? noiseFloor : 0;
  const calibrating =
    pro && isActive && isCalibrating(widget.config as SoundConfig);

  // Use ref for sensitivity to prevent audio stream restart on sensitivity changes
  const sensitivityRef = useRef(sensitivity);
  // Pro smooths the reading so the meter and the alert don't flicker.
  const smoothRef = useRef(pro);
  const smoothedRef = useRef(0);
  // Pro sync sets the target, so the sensitivity the old sync saved stays out of it.
  const effectiveSensitivity = pro && syncExpectations ? 1 : sensitivity;
  const floorRef = useRef(floor);
  // Latest analyser average before the floor, read by calibration.
  const rawAverageRef = useRef<number | null>(null);
  useEffect(() => {
    sensitivityRef.current = effectiveSensitivity;
    smoothRef.current = pro;
    floorRef.current = floor;
  }, [effectiveSensitivity, pro, floor]);

  const expectationsWidgets =
    activeDashboard?.widgets.filter((w) => w.type === 'expectations') ?? [];
  // Prefer the Expectations widget the teacher synced, as its settings intend.
  const expectationsVoiceLevel = (
    (
      expectationsWidgets.find(
        (w) => (w.config as ExpectationsConfig).syncSoundWidget
      ) ?? expectationsWidgets[0]
    )?.config as ExpectationsConfig | undefined
  )?.voiceLevel;
  const targetInForce = pro
    ? resolveTargetLevel(targetLevel, syncExpectations, expectationsVoiceLevel)
    : null;
  const limit = targetLimit(targetInForce);

  // Nexus Connection: Sync with Expectations
  useEffect(() => {
    // With pro, the voice level sets the target instead of the sensitivity.
    if (pro || !syncExpectations || !activeDashboard) return;

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
        },
      });
    }
  }, [
    pro,
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
    const measure = (
      analyser: AnalyserNode,
      dataArray: Uint8Array<ArrayBuffer>
    ) => {
      analyser.getByteFrequencyData(dataArray);
      const sum = dataArray.reduce((a, b) => a + b, 0);
      const average = sum / dataArray.length;
      rawAverageRef.current = average;
      const raw = Math.min(
        100,
        Math.max(0, average - floorRef.current) * (sensitivityRef.current * 2)
      );
      if (!smoothRef.current) return raw;
      smoothedRef.current = smoothVolume(smoothedRef.current, raw);
      return smoothedRef.current;
    };

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
        rawAverageRef.current = null;
        setMicReady(false);
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
      smoothedRef.current = 0;

      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const resumeLoop = () => {
        if (!analyserRef.current) return;
        const normalized = measure(analyserRef.current, dataArray);
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
        setMicReady(true);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const update = () => {
          if (!analyserRef.current) return;
          const normalized = measure(analyserRef.current, dataArray);

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
      rawAverageRef.current = null;
    };
  }, []);

  const level = getLevelData(volume);

  // An empty sample list ends the request and keeps the saved floor.
  const finishCalibration = useEffectEvent((samples: number[]) => {
    const config = widget.config as SoundConfig;
    updateWidget(
      widget.id,
      {
        config: {
          ...config,
          ...(samples.length > 0 && { noiseFloor: noiseFloorFrom(samples) }),
          calibratedAt: config.calibrateRequest ?? Date.now(),
        },
      },
      { skipHistory: true }
    );
  });

  // Calibrate: sample the quiet room for a few seconds, then save its level as the zero point.
  useEffect(() => {
    if (!calibrating) return undefined;
    let sampler: ReturnType<typeof setInterval> | undefined;
    let done: ReturnType<typeof setTimeout> | undefined;
    const giveUp = setTimeout(() => {
      clearInterval(sampler);
      clearTimeout(done);
      finishCalibration([]);
    }, CALIBRATE_GIVE_UP_MS);
    const listen = () => {
      const samples: number[] = [];
      sampler = setInterval(() => {
        // Null until the mic is live, so a pending permission prompt adds no zeros.
        if (rawAverageRef.current !== null) samples.push(rawAverageRef.current);
      }, CALIBRATE_SAMPLE_MS);
      done = setTimeout(() => {
        clearInterval(sampler);
        if (samples.length > 0) {
          clearTimeout(giveUp);
          finishCalibration(samples);
        } else listen();
      }, CALIBRATE_MS);
    };
    listen();
    return () => {
      clearInterval(sampler);
      clearTimeout(done);
      clearTimeout(giveUp);
    };
  }, [calibrating]);

  const goalMs = limit === null ? 0 : quietGoalMs(quietGoalMinutes);
  const isOver = isActive && !calibrating && limit !== null && volume >= limit;
  const quietGoal = useQuietGoal(
    isActive && micReady && !calibrating && goalMs > 0 && !isOver,
    goalMs,
    () => undefined
  );

  const noiseSession = useNoiseSession(
    pro && isActive && micReady && !calibrating,
    POSTER_LEVELS.indexOf(level)
  );

  const lastChimeRef = useRef(0);
  const alerting = useTooLoudAlert(
    isOver,
    alertDelayMs(alertDelaySeconds),
    () => {
      noiseSession.addAlert();
      if (quietGoalResetOnAlert && !quietGoal.done) quietGoal.reset();
      if (!alertSoundEnabled) return;
      const now = Date.now();
      if (now - lastChimeRef.current < ALERT_SOUND_COOLDOWN_MS) return;
      lastChimeRef.current = now;
      void resumeAudio().then(() => playTimerAlert(alertSound));
    }
  );

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
          config: { ...trafficConfig, active: desiredState },
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

  const levelPill = (
    <span
      className="font-black uppercase tracking-widest rounded-full text-white shadow-md transition-all duration-300 inline-block border-2 border-white/20"
      style={{
        backgroundColor: level.color,
        fontSize: 'min(12px, 3.5cqmin)',
        paddingLeft: 'min(24px, 6cqmin)',
        paddingRight: 'min(24px, 6cqmin)',
        paddingTop: 'min(8px, 2cqmin)',
        paddingBottom: 'min(8px, 2cqmin)',
      }}
    >
      {pro ? (
        // All labels share one cell, so the pill and Summary button keep still.
        <span className="grid justify-items-center">
          {POSTER_LEVELS.map((l) => (
            <span
              key={l.label}
              className={l === level ? undefined : 'invisible'}
              style={{ gridArea: '1 / 1' }}
            >
              {l.label}
            </span>
          ))}
        </span>
      ) : (
        level.label
      )}
    </span>
  );

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className="flex-1 min-h-0 relative w-full h-full"
          style={{ padding: 'min(8px, 2cqmin)' }}
        >
          {visual === 'thermometer' && (
            <ThermometerView volume={volume} limit={limit} />
          )}
          {visual === 'speedometer' && (
            <SpeedometerView volume={volume} limit={limit} />
          )}
          {visual === 'level' && (
            <LevelNameView volume={volume} targetLevel={targetInForce} />
          )}
          {visual === 'balls' && (
            <PopcornBallsView volume={volume} limit={limit} />
          )}
          {visual === 'line' && (
            <div
              className="w-full h-full bg-black/20 rounded-2xl"
              style={{ padding: 'min(8px, 2cqmin)' }}
            >
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
                {limit !== null && (
                  <line
                    data-testid="sound-target-line"
                    x1="0"
                    x2="100"
                    y1={100 - limit}
                    y2={100 - limit}
                    strokeWidth="1.5"
                    strokeDasharray="4 3"
                    vectorEffect="non-scaling-stroke"
                    className="stroke-slate-800"
                  />
                )}
              </svg>
            </div>
          )}
          {pro && (
            <div
              role="status"
              aria-live="polite"
              className="absolute inset-x-0 top-0"
            >
              {calibrating && (
                <div
                  className="flex items-center justify-center bg-slate-800 text-white font-bold shadow-md text-center"
                  style={{
                    margin: 'min(8px, 2cqmin)',
                    gap: 'min(8px, 2cqmin)',
                    padding: 'min(10px, 2.5cqmin)',
                    borderRadius: 'min(12px, 3cqmin)',
                    fontSize: 'min(20px, 6cqmin)',
                  }}
                >
                  <Ear
                    aria-hidden="true"
                    className="shrink-0"
                    style={{
                      width: 'min(22px, 6.5cqmin)',
                      height: 'min(22px, 6.5cqmin)',
                    }}
                  />
                  {t('widgets.sound.calibrating')}
                </div>
              )}
              {!calibrating && !alerting && quietGoal.done && (
                <div
                  className="flex items-center justify-center bg-emerald-600 text-white font-black uppercase tracking-wide shadow-md motion-safe:animate-in motion-safe:zoom-in-95"
                  style={{
                    margin: 'min(8px, 2cqmin)',
                    gap: 'min(10px, 2.5cqmin)',
                    padding: 'min(10px, 2.5cqmin)',
                    borderRadius: 'min(12px, 3cqmin)',
                    fontSize: 'min(32px, 9cqmin)',
                  }}
                >
                  <PartyPopper
                    aria-hidden="true"
                    style={{
                      width: 'min(32px, 9cqmin)',
                      height: 'min(32px, 9cqmin)',
                    }}
                  />
                  {t('widgets.sound.goalReached')}
                </div>
              )}
              {!calibrating && alerting && (
                <div
                  className="flex items-center justify-center bg-brand-red-primary text-white font-black uppercase tracking-wide shadow-md"
                  style={{
                    margin: 'min(8px, 2cqmin)',
                    gap: 'min(10px, 2.5cqmin)',
                    padding: 'min(10px, 2.5cqmin)',
                    borderRadius: 'min(12px, 3cqmin)',
                    fontSize: 'min(40px, 11cqmin)',
                  }}
                >
                  <AlertTriangle
                    aria-hidden="true"
                    style={{
                      width: 'min(40px, 11cqmin)',
                      height: 'min(40px, 11cqmin)',
                    }}
                  />
                  {t('widgets.sound.tooLoud')}
                </div>
              )}
            </div>
          )}
          {pro && showSummary && (
            <SessionSummary
              session={noiseSession.session}
              widgetId={widget.id}
              widgetType={widget.type}
              onClose={closeSummary}
              onClear={noiseSession.clear}
            />
          )}
        </div>
      }
      footer={
        <div
          className="text-center"
          style={{ paddingBottom: 'min(12px, 3cqmin)' }}
        >
          {goalMs > 0 && (
            <div
              className="flex items-center mx-auto"
              style={{
                gap: 'min(8px, 2cqmin)',
                paddingLeft: 'min(12px, 3cqmin)',
                paddingRight: 'min(12px, 3cqmin)',
                marginBottom: 'min(8px, 2cqmin)',
              }}
            >
              <div
                role="progressbar"
                aria-label={t('widgets.sound.quietGoal')}
                aria-valuemin={0}
                aria-valuemax={goalMs / 1000}
                aria-valuenow={Math.floor(quietGoal.elapsedMs / 1000)}
                aria-valuetext={`${formatGoalTime(quietGoal.elapsedMs)} / ${formatGoalTime(goalMs)}`}
                className="flex-1 rounded-full bg-slate-800/15 overflow-hidden"
                style={{ height: 'min(10px, 3cqmin)' }}
              >
                <div
                  className="h-full bg-emerald-600 transition-[width] duration-300"
                  style={{
                    width: `${(quietGoal.elapsedMs / goalMs) * 100}%`,
                  }}
                />
              </div>
              <span
                className="font-bold tabular-nums text-slate-700 whitespace-nowrap"
                style={{ fontSize: 'min(14px, 5.5cqmin)' }}
              >
                {formatGoalTime(quietGoal.elapsedMs)} / {formatGoalTime(goalMs)}
              </span>
              <button
                type="button"
                onClick={quietGoal.reset}
                aria-label={t('widgets.sound.restartGoal')}
                title={t('widgets.sound.restartGoal')}
                className="relative touch-target-expand rounded-full text-slate-600 hover:bg-slate-800/10 flex items-center justify-center"
                style={{
                  width: 'min(32px, 8cqmin)',
                  height: 'min(32px, 8cqmin)',
                }}
                {...tourAttr('sound.restart-goal', widget.id, widget.type)}
              >
                <RotateCcw
                  aria-hidden="true"
                  style={{
                    width: 'min(16px, 4.5cqmin)',
                    height: 'min(16px, 4.5cqmin)',
                  }}
                />
              </button>
            </div>
          )}
          {pro ? (
            <span className="relative inline-block">
              {/* The level name view already shows the level in large type. */}
              {visual === 'level' ? (
                // Holds the pill's space so the Summary button keeps its place.
                <span className="invisible" aria-hidden="true">
                  {levelPill}
                </span>
              ) : (
                levelPill
              )}
              <button
                type="button"
                onClick={() => setShowSummary((open) => !open)}
                aria-pressed={showSummary}
                aria-label={t('widgets.sound.summary')}
                title={t('widgets.sound.summary')}
                className="absolute left-full top-1/2 -translate-y-1/2 touch-target-expand rounded-full text-slate-600 hover:bg-slate-800/10 flex items-center justify-center"
                style={{
                  marginLeft: 'min(8px, 2cqmin)',
                  width: 'min(32px, 8cqmin)',
                  height: 'min(32px, 8cqmin)',
                }}
                {...tourAttr('sound.summary', widget.id, widget.type)}
              >
                <BarChart3
                  aria-hidden="true"
                  style={{
                    width: 'min(18px, 5cqmin)',
                    height: 'min(18px, 5cqmin)',
                  }}
                />
              </button>
            </span>
          ) : (
            levelPill
          )}
        </div>
      }
    />
  );
};
