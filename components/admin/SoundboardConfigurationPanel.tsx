import { Card } from '@/components/common/Card';
import React, { useEffect, useRef, useState } from 'react';
import { BUILDINGS } from '@/config/buildings';
import {
  SoundboardGlobalConfig,
  SoundboardBuildingConfig,
  SoundboardSound,
} from '@/types';
import { Button } from '@/components/common/Button';
import { Plus, Trash2, Play, Music } from 'lucide-react';
import { SOUND_LIBRARY } from '@/config/soundLibrary';
import { useAuth } from '@/context/useAuth';
import { ensureProtocol, extractGoogleFileId } from '@/utils/urlHelpers';
import {
  normalizeSoundboardAudioUrl,
  fetchDriveAudioBlobUrl,
} from '@/utils/soundboardAudioUrl';

interface SoundboardConfigurationPanelProps {
  config: SoundboardGlobalConfig;
  onChange: (newConfig: SoundboardGlobalConfig) => void;
}

const ALL_BUILDING_IDS = BUILDINGS.map((building) => building.id);

export const SoundboardConfigurationPanel: React.FC<
  SoundboardConfigurationPanelProps
> = ({ config, onChange }) => {
  const { googleAccessToken } = useAuth();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playbackErrors, setPlaybackErrors] = useState<Record<string, string>>(
    {}
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackResetTimeoutRef = useRef<number | null>(null);

  const validateAudioUrl = (rawUrl: string) => {
    const trimmedUrl = rawUrl.trim();
    if (!trimmedUrl) {
      return {
        normalizedUrl: '',
        isValidUrl: false,
        isGoogleDriveUrl: false,
        driveFileId: null as string | null,
        canTest: false,
        urlError: 'Enter a valid audio URL.',
      };
    }

    const withProtocol = ensureProtocol(trimmedUrl);

    try {
      const parsedUrl = new URL(withProtocol);
      const isGoogleDriveUrl =
        parsedUrl.hostname === 'drive.google.com' ||
        parsedUrl.hostname === 'docs.google.com';
      const driveFileId = isGoogleDriveUrl
        ? extractGoogleFileId(withProtocol)
        : null;
      const hasDriveIdIssue = isGoogleDriveUrl && !driveFileId;

      return {
        normalizedUrl: normalizeSoundboardAudioUrl(withProtocol),
        isValidUrl: true,
        isGoogleDriveUrl,
        driveFileId,
        canTest: !hasDriveIdIssue,
        urlError: hasDriveIdIssue
          ? 'Google Drive link must include a file ID.'
          : null,
      };
    } catch {
      return {
        normalizedUrl: '',
        isValidUrl: false,
        isGoogleDriveUrl: false,
        driveFileId: null as string | null,
        canTest: false,
        urlError: 'Enter a valid audio URL.',
      };
    }
  };

  const clearPlaybackResetTimeout = () => {
    if (playbackResetTimeoutRef.current !== null) {
      window.clearTimeout(playbackResetTimeoutRef.current);
      playbackResetTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearPlaybackResetTimeout();
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const buildingDefaults = config.buildingDefaults ?? {};
  const sharedCustomSounds = config.customLibrarySounds ?? [];

  const getBuildingConfig = (buildingId: string): SoundboardBuildingConfig =>
    buildingDefaults[buildingId] ?? {
      availableSounds: [],
      enabledLibrarySoundIds: [],
      enabledCustomSoundIds: [],
    };

  const updateBuilding = (
    buildingId: string,
    updates: Partial<SoundboardBuildingConfig>
  ) => {
    const current = getBuildingConfig(buildingId);
    onChange({
      ...config,
      buildingDefaults: {
        ...buildingDefaults,
        [buildingId]: {
          ...current,
          ...updates,
        },
      },
    });
  };

  const setSoundEnabledForBuilding = (
    soundId: string,
    buildingId: string,
    key: 'enabledLibrarySoundIds' | 'enabledCustomSoundIds',
    isEnabled: boolean
  ) => {
    const current = getBuildingConfig(buildingId);
    const currentIds = current[key] ?? [];
    const nextIds = isEnabled
      ? Array.from(new Set([...currentIds, soundId]))
      : currentIds.filter((id) => id !== soundId);

    updateBuilding(buildingId, { [key]: nextIds });
  };

  const toggleSoundForBuilding = (
    soundId: string,
    buildingId: string,
    key: 'enabledLibrarySoundIds' | 'enabledCustomSoundIds'
  ) => {
    const currentIds = getBuildingConfig(buildingId)[key] ?? [];
    const isEnabled = currentIds.includes(soundId);
    setSoundEnabledForBuilding(soundId, buildingId, key, !isEnabled);
  };

  const toggleSoundForAllBuildings = (
    soundId: string,
    key: 'enabledLibrarySoundIds' | 'enabledCustomSoundIds'
  ) => {
    const allEnabled = ALL_BUILDING_IDS.every((buildingId) =>
      (getBuildingConfig(buildingId)[key] ?? []).includes(soundId)
    );

    const nextBuildingDefaults: Record<string, SoundboardBuildingConfig> = {
      ...buildingDefaults,
    };
    ALL_BUILDING_IDS.forEach((buildingId) => {
      const current = getBuildingConfig(buildingId);
      const currentIds = current[key] ?? [];
      const nextIds = !allEnabled
        ? Array.from(new Set([...currentIds, soundId]))
        : currentIds.filter((id) => id !== soundId);
      nextBuildingDefaults[buildingId] = { ...current, [key]: nextIds };
    });

    onChange({ ...config, buildingDefaults: nextBuildingDefaults });
  };

  const testSound = async (id: string, url: string) => {
    const validation = validateAudioUrl(url);
    if (!validation.canTest) {
      setPlaybackErrors((prev) => ({
        ...prev,
        [id]: validation.urlError ?? 'Enter a valid audio URL.',
      }));
      return;
    }

    clearPlaybackResetTimeout();
    audioRef.current?.pause();

    setPlaybackErrors((prev) => ({ ...prev, [id]: '' }));
    setPlayingId(id);

    let audioSrc: string;
    let blobUrl: string | null = null;

    // For Google Drive URLs, download via the authenticated API to avoid
    // CORS / redirect issues with the public uc?export=download endpoint.
    if (validation.isGoogleDriveUrl && validation.driveFileId) {
      if (!googleAccessToken) {
        setPlayingId(null);
        setPlaybackErrors((prev) => ({
          ...prev,
          [id]: 'Sign in with Google to test Google Drive audio.',
        }));
        return;
      }

      try {
        blobUrl = await fetchDriveAudioBlobUrl(
          validation.driveFileId,
          googleAccessToken
        );
        audioSrc = blobUrl;
      } catch (err) {
        setPlayingId(null);
        setPlaybackErrors((prev) => ({
          ...prev,
          [id]:
            err instanceof Error
              ? err.message
              : 'Failed to fetch audio from Google Drive.',
        }));
        return;
      }
    } else {
      audioSrc = validation.normalizedUrl;
    }

    const audio = new Audio(audioSrc);
    audioRef.current = audio;

    // Revoke the blob URL only after playback finishes or fails — not on the
    // 1s UI-reset timeout, which would cut off longer audio mid-stream.
    if (blobUrl) {
      const revoke = () => URL.revokeObjectURL(blobUrl);
      audio.addEventListener('ended', revoke, { once: true });
      audio.addEventListener('error', revoke, { once: true });
    }

    try {
      await audio.play();
      playbackResetTimeoutRef.current = window.setTimeout(() => {
        setPlayingId((current) => (current === id ? null : current));
        if (audioRef.current === audio) {
          audioRef.current = null;
        }
        playbackResetTimeoutRef.current = null;
      }, 1000);
    } catch {
      if (audioRef.current === audio) {
        audioRef.current = null;
      }
      setPlayingId((current) => (current === id ? null : current));
      setPlaybackErrors((prev) => ({
        ...prev,
        [id]: 'Playback failed. Check the URL and file sharing permissions.',
      }));
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    }
  };

  const addCustomSound = () => {
    const newSound: SoundboardSound = {
      id: crypto.randomUUID(),
      label: 'New Sound',
      url: '',
      color: '#6366f1',
    };

    onChange({
      ...config,
      customLibrarySounds: [...sharedCustomSounds, newSound],
    });
  };

  const updateCustomSound = (
    index: number,
    updates: Partial<SoundboardSound>
  ) => {
    const nextSounds = [...sharedCustomSounds];
    nextSounds[index] = { ...nextSounds[index], ...updates };

    onChange({
      ...config,
      customLibrarySounds: nextSounds,
    });
  };

  const removeCustomSound = (index: number) => {
    const removedSound = sharedCustomSounds[index];
    const nextSounds = sharedCustomSounds.filter((_, i) => i !== index);

    const nextBuildingDefaults = Object.fromEntries(
      Object.entries(buildingDefaults).map(([buildingId, buildingConfig]) => {
        const nextCustomIds = (
          buildingConfig.enabledCustomSoundIds ?? []
        ).filter((id) => id !== removedSound.id);
        return [
          buildingId,
          {
            ...buildingConfig,
            enabledCustomSoundIds: nextCustomIds,
          },
        ];
      })
    );

    onChange({
      ...config,
      customLibrarySounds: nextSounds,
      buildingDefaults: nextBuildingDefaults,
    });
  };

  const getEnabledBuildingsForSound = (
    soundId: string,
    key: 'enabledLibrarySoundIds' | 'enabledCustomSoundIds'
  ) =>
    ALL_BUILDING_IDS.filter((buildingId) =>
      (getBuildingConfig(buildingId)[key] ?? []).includes(soundId)
    );

  const renderGradeBandAssignments = (
    soundId: string,
    key: 'enabledLibrarySoundIds' | 'enabledCustomSoundIds'
  ) => {
    const enabledBuildings = getEnabledBuildingsForSound(soundId, key);
    const allSelected = enabledBuildings.length === ALL_BUILDING_IDS.length;

    return (
      <div className="flex flex-wrap gap-1.5 mt-2">
        <button
          type="button"
          className={`px-2 py-1 rounded-md text-xxs font-bold border transition-all ${
            allSelected
              ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
              : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
          }`}
          onClick={() => toggleSoundForAllBuildings(soundId, key)}
        >
          All
        </button>
        {BUILDINGS.map((building) => {
          const selected = enabledBuildings.includes(building.id);
          return (
            <button
              key={`${soundId}-${building.id}-${key}`}
              type="button"
              className={`px-2 py-1 rounded-md text-xxs font-bold border transition-all ${
                selected
                  ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
              onClick={() => toggleSoundForBuilding(soundId, building.id, key)}
            >
              {building.gradeLabel}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Standard Library Section */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Music size={16} className="text-brand-blue-primary" />
          <h3 className="text-sm font-bold text-slate-700">
            Standard Sound Library
          </h3>
        </div>
        <p className="text-xxs text-slate-400 mb-4">
          Assign pre-made sounds by grade band. Use “All” to enable the sound
          for every building.
        </p>

        <div className="space-y-3">
          {SOUND_LIBRARY.map((libSound) => {
            const isPlaying = playingId === libSound.id;
            return (
              <div
                key={libSound.id}
                className="rounded-lg border border-slate-200 bg-slate-50 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: libSound.color }}
                    />
                    <div>
                      <p className="text-xs font-bold text-slate-700">
                        {libSound.label}
                      </p>
                      {renderGradeBandAssignments(
                        libSound.id,
                        'enabledLibrarySoundIds'
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void testSound(libSound.id, libSound.url)}
                    className={`p-1 rounded-md transition-colors ${
                      isPlaying
                        ? 'bg-brand-blue-primary text-white'
                        : 'text-slate-400 hover:bg-slate-200'
                    }`}
                    title={`Preview ${libSound.label}`}
                  >
                    <Play
                      size={10}
                      className={isPlaying ? 'animate-pulse' : ''}
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Custom Sounds Section */}
      <Card rounded="xl" className="bg-slate-50 space-y-4">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Plus size={16} className="text-brand-blue-primary" />
            <h3 className="text-sm font-bold text-slate-700">
              Shared Custom Library
            </h3>
          </div>
          <Button
            size="sm"
            onClick={addCustomSound}
            className="flex-shrink-0 shadow-sm"
          >
            <Plus size={16} className="mr-1.5" />
            Add Custom URL
          </Button>
        </div>
        <p className="text-xxs text-slate-500 leading-tight mb-4">
          Add each custom sound once, then assign it to grade bands below.
        </p>

        {sharedCustomSounds.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-400 italic border-2 border-dashed border-slate-200 rounded-xl bg-white/50">
            No custom sounds added yet.
          </div>
        ) : (
          <div className="space-y-3">
            {sharedCustomSounds.map((sound, index) => {
              const isPlaying = playingId === sound.id;
              const validation = validateAudioUrl(sound.url);
              const showUrlError =
                sound.url.trim().length > 0 && !validation.canTest;
              const playbackError = playbackErrors[sound.id];

              return (
                <div
                  key={sound.id}
                  className="bg-white p-3 rounded-xl border border-slate-200 flex items-start gap-4 shadow-sm"
                >
                  <div className="flex-1 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xxs font-bold text-slate-500 uppercase mb-1">
                          Button Label
                        </label>
                        <input
                          type="text"
                          value={sound.label}
                          onChange={(e) =>
                            updateCustomSound(index, { label: e.target.value })
                          }
                          className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-blue-primary outline-none"
                          placeholder="e.g., School Song"
                        />
                      </div>
                      <div>
                        <label className="block text-xxs font-bold text-slate-500 uppercase mb-1">
                          Button Color
                        </label>
                        <div className="flex gap-2 items-center">
                          <input
                            type="color"
                            value={sound.color ?? '#6366f1'}
                            onChange={(e) =>
                              updateCustomSound(index, {
                                color: e.target.value,
                              })
                            }
                            className="h-8 w-8 rounded cursor-pointer border-0 p-0"
                          />
                          <input
                            type="text"
                            value={sound.color ?? '#6366f1'}
                            onChange={(e) =>
                              updateCustomSound(index, {
                                color: e.target.value,
                              })
                            }
                            className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-blue-primary outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xxs font-bold text-slate-500 uppercase mb-1">
                        Audio URL (mp3/wav)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={sound.url}
                          onChange={(e) => {
                            setPlaybackErrors((prev) => ({
                              ...prev,
                              [sound.id]: '',
                            }));
                            updateCustomSound(index, { url: e.target.value });
                          }}
                          className={`flex-1 px-3 py-1.5 text-xs border rounded-lg focus:ring-2 focus:ring-brand-blue-primary outline-none ${
                            showUrlError ? 'border-red-300' : 'border-slate-200'
                          }`}
                          placeholder="https://example.com/sound.mp3"
                        />
                        <button
                          onClick={() => void testSound(sound.id, sound.url)}
                          disabled={!validation.canTest}
                          className={`px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
                            isPlaying
                              ? 'bg-brand-blue-primary text-white border-brand-blue-primary'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed'
                          }`}
                          title="Test Playback"
                        >
                          <Play
                            size={14}
                            className={isPlaying ? 'animate-pulse' : ''}
                          />
                          <span className="text-xxs font-bold uppercase tracking-wider">
                            {isPlaying ? 'Playing...' : 'Test'}
                          </span>
                        </button>
                      </div>

                      {validation.isGoogleDriveUrl && (
                        <p className="mt-1 text-xxs text-slate-500">
                          Google Drive file will be streamed via the Drive API.
                          Users must be signed in with Google to play this
                          sound.
                        </p>
                      )}
                      {showUrlError && (
                        <p className="mt-1 text-xxs text-red-500">
                          {validation.urlError}
                        </p>
                      )}
                      {playbackError && (
                        <p className="mt-1 text-xxs text-red-500">
                          {playbackError}
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="text-xxs font-bold text-slate-500 uppercase mb-1">
                        Assign to Grade Bands
                      </p>
                      {renderGradeBandAssignments(
                        sound.id,
                        'enabledCustomSoundIds'
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => removeCustomSound(index)}
                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors mt-6"
                    title="Remove sound"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};
