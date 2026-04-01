import React, { useMemo } from 'react';
import {
  WidgetData,
  SoundboardConfig,
  SoundboardGlobalConfig,
  SoundboardSound,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { Volume2, Music } from 'lucide-react';
import { SOUND_LIBRARY } from '@/config/soundLibrary';

// ─── Web Audio API synthesis ─────────────────────────────────────────────────

let globalAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  globalAudioContext ??= new AudioContext();
  return globalAudioContext;
}

function playSynthesizedSound(id: string): void {
  const ctx = getAudioContext();

  const run = () => {
    const t = ctx.currentTime;

    switch (id) {
      case 'lib-ding': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.7, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
        osc.start(t);
        osc.stop(t + 2.0);
        break;
      }
      case 'lib-applause': {
        const duration = 1.8;
        const bufSize = Math.floor(ctx.sampleRate * duration);
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++)
          data[i] = (Math.random() * 2 - 1) * 0.5;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 2500;
        filter.Q.value = 0.5;
        const gain = ctx.createGain();
        src.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.6, t + 0.15);
        gain.gain.linearRampToValueAtTime(0.4, t + 1.2);
        gain.gain.linearRampToValueAtTime(0, t + duration);
        src.start(t);
        src.stop(t + duration);
        break;
      }
      case 'lib-tada': {
        const notes = [261.63, 329.63, 392, 523.25];
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = freq;
          osc.type = 'triangle';
          const start = t + i * 0.12;
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(0.5, start + 0.04);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.6);
          osc.start(start);
          osc.stop(start + 0.6);
        });
        break;
      }
      case 'lib-fail': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(500, t);
        osc.frequency.exponentialRampToValueAtTime(80, t + 1.2);
        gain.gain.setValueAtTime(0.4, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
        osc.start(t);
        osc.stop(t + 1.2);
        break;
      }
      case 'lib-drumroll': {
        for (let i = 0; i < 20; i++) {
          const bufSize = Math.floor(ctx.sampleRate * 0.025);
          const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
          const data = buf.getChannelData(0);
          for (let j = 0; j < bufSize; j++) data[j] = Math.random() * 2 - 1;
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const gain = ctx.createGain();
          src.connect(gain);
          gain.connect(ctx.destination);
          const vel = 0.2 + (i / 20) * 0.4;
          const st = t + i * 0.055;
          gain.gain.setValueAtTime(vel, st);
          gain.gain.exponentialRampToValueAtTime(0.001, st + 0.04);
          src.start(st);
          src.stop(st + 0.04);
        }
        break;
      }
      case 'lib-whistle': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1800, t);
        osc.frequency.linearRampToValueAtTime(2200, t + 0.5);
        osc.frequency.linearRampToValueAtTime(1800, t + 1.0);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.45, t + 0.1);
        gain.gain.setValueAtTime(0.45, t + 0.8);
        gain.gain.linearRampToValueAtTime(0, t + 1.0);
        osc.start(t);
        osc.stop(t + 1.0);
        break;
      }
      case 'lib-airhorn': {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';
        osc1.frequency.value = 110;
        osc2.frequency.value = 116;
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.setValueAtTime(0.3, t + 0.9);
        gain.gain.linearRampToValueAtTime(0, t + 1.1);
        osc1.start(t);
        osc1.stop(t + 1.1);
        osc2.start(t);
        osc2.stop(t + 1.1);
        break;
      }
      case 'lib-crickets': {
        const duration = 2.0;
        const bufSize = Math.floor(ctx.sampleRate * duration);
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buf.getChannelData(0);
        const chirpRate = 8;
        for (let i = 0; i < bufSize; i++) {
          const time = i / ctx.sampleRate;
          const envelope = Math.max(0, Math.sin(Math.PI * chirpRate * time));
          data[i] = (Math.random() * 2 - 1) * envelope * 0.6;
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 6000;
        filter.Q.value = 1.5;
        const gain = ctx.createGain();
        src.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.5, t);
        gain.gain.linearRampToValueAtTime(0, t + duration);
        src.start(t);
        src.stop(t + duration);
        break;
      }
      default:
        break;
    }
  };

  if (ctx.state === 'suspended') {
    void ctx.resume().then(run);
  } else {
    run();
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export const SoundboardWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const config = widget.config as SoundboardConfig;
  const { selectedSoundIds = [], activeSoundIds } = config;

  const { featurePermissions, selectedBuildings } = useAuth();
  const { updateWidget, selectedWidgetId } = useDashboard();
  const isFocused = selectedWidgetId === widget.id;
  const buildingId = selectedBuildings.length > 0 ? selectedBuildings[0] : null;

  const globalConfig = useMemo(() => {
    const perm = featurePermissions.find((p) => p.widgetType === 'soundboard');
    return perm?.config as SoundboardGlobalConfig | undefined;
  }, [featurePermissions]);

  // All sounds the teacher has made available (selectedSoundIds pool)
  const visibleSounds = useMemo(() => {
    let availableSounds: SoundboardSound[] = [];

    if (!buildingId) {
      const allDefaults = globalConfig?.buildingDefaults ?? {};
      availableSounds = Object.values(allDefaults).flatMap((d) => {
        const custom = d.availableSounds ?? [];
        const library = SOUND_LIBRARY.filter((s) =>
          d.enabledLibrarySoundIds?.includes(s.id)
        );
        return [...library, ...custom];
      });
    } else {
      const bConfig = globalConfig?.buildingDefaults?.[buildingId];
      const custom = bConfig?.availableSounds ?? [];
      const library = SOUND_LIBRARY.filter((s) =>
        bConfig?.enabledLibrarySoundIds?.includes(s.id)
      );
      availableSounds = [...library, ...custom];
    }

    const seenIds = new Set<string>();
    const uniqueSounds = availableSounds.filter((s) => {
      if (seenIds.has(s.id)) return false;
      seenIds.add(s.id);
      return true;
    });

    return uniqueSounds.filter(
      (sound) =>
        selectedSoundIds.includes(sound.id) &&
        (sound.synthesized === true ||
          (typeof sound.url === 'string' && sound.url.trim() !== ''))
    );
  }, [globalConfig, buildingId, selectedSoundIds]);

  // activeSoundIds defaults to selectedSoundIds (backwards compatible)
  const effectiveActiveIds = useMemo(
    () => activeSoundIds ?? selectedSoundIds,
    [activeSoundIds, selectedSoundIds]
  );

  // Sounds shown as big play buttons in the main grid
  const activeSounds = useMemo(
    () => visibleSounds.filter((s) => effectiveActiveIds.includes(s.id)),
    [visibleSounds, effectiveActiveIds]
  );

  // Smart grid: maximize cell size for any number of sounds
  const { cols, rows } = useMemo(() => {
    const count = activeSounds.length;
    if (count === 0) return { cols: 1, rows: 1 };
    // When focused, selection bar takes ~22% of height
    const selBarH = isFocused ? Math.max(64, Math.min(80, widget.h * 0.22)) : 0;
    const availH = Math.max(60, widget.h - selBarH - 24);
    let bestCols = 1;
    let bestRows = count;
    let maxCell = 0;
    for (let c = 1; c <= count; c++) {
      const r = Math.ceil(count / c);
      const cell = Math.min(widget.w / c, availH / r);
      if (cell > maxCell) {
        maxCell = cell;
        bestCols = c;
        bestRows = r;
      }
    }
    return { cols: bestCols, rows: bestRows };
  }, [activeSounds.length, widget.w, widget.h, isFocused]);

  const toggleActive = (id: string) => {
    const current = new Set(effectiveActiveIds);
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    updateWidget(widget.id, {
      config: { ...config, activeSoundIds: Array.from(current) },
    });
  };

  const playSound = (sound: SoundboardSound) => {
    if (sound.synthesized) {
      playSynthesizedSound(sound.id);
    } else {
      const audio = new Audio(sound.url);
      void audio.play().catch((err: unknown) => {
        console.error(`[Soundboard] Failed to play sound ${sound.id}:`, err);
      });
    }
  };

  if (!isFocused && activeSounds.length === 0) {
    return (
      <ScaledEmptyState
        icon={Music}
        title="No Sounds Selected"
        subtitle="Flip to set up your board."
      />
    );
  }

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className="h-full w-full flex flex-col overflow-hidden"
          style={{ padding: 'min(12px, 2.5cqmin)' }}
        >
          {/* Main active sounds grid */}
          <div className="flex-1 min-h-0">
            {activeSounds.length > 0 ? (
              <div
                className="grid h-full w-full"
                style={{
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                  gap: 'min(10px, 2cqmin)',
                }}
              >
                {activeSounds.map((sound) => (
                  <button
                    key={sound.id}
                    onClick={() => playSound(sound)}
                    className="relative overflow-hidden rounded-[min(16px,3cqmin)] flex flex-col items-center justify-center transition-all active:scale-95 group shadow-sm hover:shadow-md border border-white/20 hover:brightness-110"
                    style={{ backgroundColor: sound.color ?? '#6366f1' }}
                  >
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 group-active:bg-black/10 transition-colors" />
                    <Volume2
                      className="text-white drop-shadow-sm"
                      style={{
                        width: 'min(48px, 15cqmin)',
                        height: 'min(48px, 15cqmin)',
                        marginBottom: 'min(6px, 1.5cqmin)',
                      }}
                    />
                    <span
                      className="font-black text-white text-center leading-tight drop-shadow-md break-words max-w-full"
                      style={{
                        fontSize: 'min(18px, 6cqmin)',
                        padding: '0 min(8px, 1.5cqmin)',
                      }}
                    >
                      {sound.label}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              /* Focused with nothing active yet */
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <Music
                  style={{
                    width: 'min(40px, 10cqmin)',
                    height: 'min(40px, 10cqmin)',
                  }}
                  className="mb-2 opacity-20"
                />
                <span style={{ fontSize: 'min(14px, 4cqmin)' }}>
                  Select sounds below
                </span>
              </div>
            )}
          </div>

          {/* Selection bar — only when focused */}
          {isFocused && visibleSounds.length > 0 && (
            <div
              className="flex-shrink-0 bg-slate-100/80 rounded-[min(16px,3cqmin)] flex gap-2 overflow-x-auto no-scrollbar"
              style={{
                marginTop: 'min(8px, 1.5cqmin)',
                padding: 'min(6px, 1.5cqmin)',
                minHeight: 'max(64px, min(80px, 20cqmin))',
              }}
            >
              {visibleSounds.map((sound) => {
                const isActive = effectiveActiveIds.includes(sound.id);
                return (
                  <button
                    key={sound.id}
                    onClick={() => toggleActive(sound.id)}
                    className={`flex-shrink-0 flex flex-col items-center justify-center rounded-xl border-2 transition-all relative ${
                      isActive
                        ? 'bg-white border-blue-500 shadow-sm'
                        : 'bg-white/40 border-transparent text-slate-400'
                    }`}
                    style={{
                      width: 'max(54px, min(70px, 18cqmin))',
                      height: 'max(54px, min(70px, 18cqmin))',
                      gap: '2px',
                    }}
                  >
                    <div
                      className="rounded-lg flex-shrink-0"
                      style={{
                        width: 'max(20px, min(26px, 7cqmin))',
                        height: 'max(20px, min(26px, 7cqmin))',
                        backgroundColor: sound.color ?? '#6366f1',
                        opacity: isActive ? 1 : 0.4,
                      }}
                    />
                    <span
                      className="font-bold uppercase truncate w-full px-1 text-center"
                      style={{ fontSize: 'max(8px, min(10px, 3cqmin))' }}
                    >
                      {sound.label}
                    </span>
                    {isActive && (
                      <div className="absolute top-0.5 right-0.5 w-2 h-2 bg-blue-500 rounded-full border border-white shadow-sm" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      }
    />
  );
};
