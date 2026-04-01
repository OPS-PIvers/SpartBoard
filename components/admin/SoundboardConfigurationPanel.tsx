import React, { useEffect, useRef, useState } from 'react';
import { BUILDINGS } from '@/config/buildings';
import { BuildingSelector } from './BuildingSelector';
import {
  SoundboardGlobalConfig,
  SoundboardBuildingConfig,
  SoundboardSound,
} from '@/types';
import { Button } from '@/components/common/Button';
import { Plus, Trash2, Play, CheckCircle2, Music } from 'lucide-react';
import { SOUND_LIBRARY } from '@/config/soundLibrary';
import { ensureProtocol, extractGoogleFileId } from '@/utils/urlHelpers';

interface SoundboardConfigurationPanelProps {
  config: SoundboardGlobalConfig;
  onChange: (newConfig: SoundboardGlobalConfig) => void;
}

export const SoundboardConfigurationPanel: React.FC<
  SoundboardConfigurationPanelProps
> = ({ config, onChange }) => {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(
    BUILDINGS[0].id
  );
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
        normalizedUrl: withProtocol,
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
  const currentBuildingConfig: SoundboardBuildingConfig = buildingDefaults[
    selectedBuildingId
  ] ?? {
    availableSounds: [],
    enabledLibrarySoundIds: [],
  };

  const handleUpdateBuilding = (updates: Partial<SoundboardBuildingConfig>) => {
    onChange({
      ...config,
      buildingDefaults: {
        ...buildingDefaults,
        [selectedBuildingId]: {
          ...currentBuildingConfig,
          ...updates,
        },
      },
    });
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

    const audio = new Audio(validation.normalizedUrl);
    audioRef.current = audio;

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
    }
  };

  const sounds = currentBuildingConfig.availableSounds ?? [];
  const enabledLibraryIds = currentBuildingConfig.enabledLibrarySoundIds ?? [];

  const addSound = () => {
    const newSound: SoundboardSound = {
      id: crypto.randomUUID(),
      label: 'New Sound',
      url: '',
      color: '#6366f1',
    };
    handleUpdateBuilding({ availableSounds: [...sounds, newSound] });
  };

  const updateSound = (index: number, updates: Partial<SoundboardSound>) => {
    const newSounds = [...sounds];
    newSounds[index] = { ...newSounds[index], ...updates };
    handleUpdateBuilding({ availableSounds: newSounds });
  };

  const removeSound = (index: number) => {
    const newSounds = sounds.filter((_, i) => i !== index);
    handleUpdateBuilding({ availableSounds: newSounds });
  };

  const toggleLibrarySound = (id: string) => {
    const newIds = enabledLibraryIds.includes(id)
      ? enabledLibraryIds.filter((libId) => libId !== id)
      : [...enabledLibraryIds, id];
    handleUpdateBuilding({ enabledLibrarySoundIds: newIds });
  };

  return (
    <div className="space-y-6">
      {/* Building Selector */}
      <div>
        <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block">
          Configure Building Defaults
        </label>
        <BuildingSelector
          selectedId={selectedBuildingId}
          onSelect={setSelectedBuildingId}
        />
      </div>

      {/* Standard Library Section */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Music size={16} className="text-brand-blue-primary" />
          <h3 className="text-sm font-bold text-slate-700">
            Standard Sound Library
          </h3>
        </div>
        <p className="text-xxs text-slate-400 mb-4">
          Enable or disable high-quality pre-made sounds for teachers in this
          building.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SOUND_LIBRARY.map((libSound) => {
            const isEnabled = enabledLibraryIds.includes(libSound.id);
            const isPlaying = playingId === libSound.id;

            return (
              <button
                key={libSound.id}
                onClick={() => toggleLibrarySound(libSound.id)}
                className={`relative p-2 rounded-lg border transition-all text-left group ${
                  isEnabled
                    ? 'border-brand-blue-primary bg-brand-blue-lighter/30 ring-1 ring-brand-blue-primary/20'
                    : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-xxs font-bold ${isEnabled ? 'text-brand-blue-dark' : 'text-slate-500'}`}
                  >
                    {libSound.label}
                  </span>
                  {isEnabled && (
                    <CheckCircle2
                      size={12}
                      className="text-brand-blue-primary"
                    />
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: libSound.color }}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void testSound(libSound.id, libSound.url);
                    }}
                    className={`p-1 rounded-md transition-colors ${
                      isPlaying
                        ? 'bg-brand-blue-primary text-white'
                        : 'hover:bg-slate-200 text-slate-400'
                    }`}
                  >
                    <Play
                      size={10}
                      className={isPlaying ? 'animate-pulse' : ''}
                    />
                  </button>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Sounds Section */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-4">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Plus size={16} className="text-brand-blue-primary" />
            <h3 className="text-sm font-bold text-slate-700">
              Custom Building Sounds
            </h3>
          </div>
          <Button
            size="sm"
            onClick={addSound}
            className="flex-shrink-0 shadow-sm"
          >
            <Plus size={16} className="mr-1.5" />
            Add Custom URL
          </Button>
        </div>
        <p className="text-xxs text-slate-500 leading-tight mb-4">
          Admins can add specific URLs for sounds unique to this building.
        </p>

        {sounds.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-400 italic border-2 border-dashed border-slate-200 rounded-xl bg-white/50">
            No custom sounds added yet.
          </div>
        ) : (
          <div className="space-y-3">
            {sounds.map((sound, index) => {
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
                            updateSound(index, { label: e.target.value })
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
                              updateSound(index, { color: e.target.value })
                            }
                            className="h-8 w-8 rounded cursor-pointer border-0 p-0"
                          />
                          <input
                            type="text"
                            value={sound.color ?? '#6366f1'}
                            onChange={(e) =>
                              updateSound(index, { color: e.target.value })
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
                            updateSound(index, { url: e.target.value });
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
                          File must be shared publicly or with your domain to
                          play for all users.
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
                  </div>

                  <button
                    onClick={() => removeSound(index)}
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
      </div>
    </div>
  );
};
