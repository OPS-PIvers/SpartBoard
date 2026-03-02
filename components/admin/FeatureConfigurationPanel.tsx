import React, { useState } from 'react';
import {
  FeaturePermission,
  WidgetType,
  InternalToolType,
  LunchCountGlobalConfig,
  WeatherGlobalConfig,
  WebcamGlobalConfig,
  WeatherTemperatureRange,
  CatalystGlobalConfig,
  ExpectationsGlobalConfig,
  ToolMetadata,
} from '../../types';
import {
  Settings,
  Plus,
  Trash2,
  Image as ImageIcon,
  X,
  Loader2,
  Upload,
} from 'lucide-react';
import { CatalystPermissionEditor } from './CatalystPermissionEditor';
import { ExpectationsConfigurationPanel } from './ExpectationsConfigurationPanel';
import { ScheduleConfigurationPanel } from './ScheduleConfigurationPanel';
import { ClockConfigurationPanel } from './ClockConfigurationPanel';
import { TimeToolConfigurationPanel } from './TimeToolConfigurationPanel';
import { ChecklistConfigurationPanel } from './ChecklistConfigurationPanel';
import { SoundConfigurationPanel } from './SoundConfigurationPanel';
import { NoteConfigurationPanel } from './NoteConfigurationPanel';
import { TrafficLightConfigurationPanel } from './TrafficLightConfigurationPanel';
import { RandomConfigurationPanel } from './RandomConfigurationPanel';
import { DiceConfigurationPanel } from './DiceConfigurationPanel';
import { ScoreboardConfigurationPanel } from './ScoreboardConfigurationPanel';
import { MaterialsConfigurationPanel } from './MaterialsConfigurationPanel';
import { Toggle } from '../common/Toggle';

// Helper type guard
const isCatalystConfig = (config: unknown): config is CatalystGlobalConfig => {
  return typeof config === 'object' && config !== null;
};

// Shared prop shape for all "building-defaults" config panels
type BuildingConfigPanel = React.ComponentType<{
  config: Record<string, unknown>;
  onChange: (newConfig: Record<string, unknown>) => void;
}>;

// Map from widget/tool type to its building-defaults configuration panel.
// Catalyst is excluded here because it requires additional props.
const BUILDING_CONFIG_PANELS: Partial<Record<string, BuildingConfigPanel>> = {
  schedule: ScheduleConfigurationPanel as unknown as BuildingConfigPanel,
  clock: ClockConfigurationPanel as unknown as BuildingConfigPanel,
  'time-tool': TimeToolConfigurationPanel as unknown as BuildingConfigPanel,
  checklist: ChecklistConfigurationPanel as unknown as BuildingConfigPanel,
  sound: SoundConfigurationPanel as unknown as BuildingConfigPanel,
  text: NoteConfigurationPanel as unknown as BuildingConfigPanel,
  traffic: TrafficLightConfigurationPanel as unknown as BuildingConfigPanel,
  random: RandomConfigurationPanel as unknown as BuildingConfigPanel,
  dice: DiceConfigurationPanel as unknown as BuildingConfigPanel,
  scoreboard: ScoreboardConfigurationPanel as unknown as BuildingConfigPanel,
  materials: MaterialsConfigurationPanel as unknown as BuildingConfigPanel,
};

interface FeatureConfigurationPanelProps {
  tool: ToolMetadata;
  permission: FeaturePermission;
  updatePermission: (
    widgetType: WidgetType | InternalToolType,
    updates: Partial<FeaturePermission>
  ) => void;
  showMessage: (type: 'success' | 'error', text: string) => void;
  uploadWeatherImage: (rangeId: string, file: File) => Promise<string>;
}

export const FeatureConfigurationPanel: React.FC<
  FeatureConfigurationPanelProps
> = ({
  tool,
  permission,
  updatePermission,
  showMessage,
  uploadWeatherImage,
}) => {
  const [uploadingRangeId, setUploadingRangeId] = useState<string | null>(null);

  const addWeatherRange = (widgetType: WidgetType | InternalToolType) => {
    const config = (permission.config ?? {
      fetchingStrategy: 'client',
      updateFrequencyMinutes: 15,
      temperatureRanges: [],
    }) as unknown as WeatherGlobalConfig;

    const newRange: WeatherTemperatureRange = {
      id: crypto.randomUUID(),
      min: 0,
      max: 100,
      message: 'New Range',
    };

    updatePermission(widgetType, {
      config: {
        ...config,
        temperatureRanges: [...(config.temperatureRanges ?? []), newRange],
      },
    });
  };

  const updateWeatherRange = (
    widgetType: WidgetType | InternalToolType,
    rangeId: string,
    updates: Partial<WeatherTemperatureRange>
  ) => {
    const config = (permission.config ?? {}) as unknown as WeatherGlobalConfig;
    const ranges = config.temperatureRanges ?? [];

    const newRanges = ranges.map((r) =>
      r.id === rangeId ? { ...r, ...updates } : r
    );

    updatePermission(widgetType, {
      config: { ...config, temperatureRanges: newRanges },
    });
  };

  const removeWeatherRange = (
    widgetType: WidgetType | InternalToolType,
    rangeId: string
  ) => {
    const config = (permission.config ?? {}) as unknown as WeatherGlobalConfig;
    const ranges = config.temperatureRanges ?? [];

    updatePermission(widgetType, {
      config: {
        ...config,
        temperatureRanges: ranges.filter((r) => r.id !== rangeId),
      },
    });
  };

  const handleWeatherImageUpload = async (
    widgetType: WidgetType | InternalToolType,
    rangeId: string,
    file: File
  ) => {
    if (!file) return;
    setUploadingRangeId(rangeId);
    try {
      const url = await uploadWeatherImage(rangeId, file);
      updateWeatherRange(widgetType, rangeId, { imageUrl: url });
      showMessage('success', 'Image uploaded');
    } catch (e) {
      console.error(e);
      showMessage('error', 'Upload failed');
    } finally {
      setUploadingRangeId(null);
    }
  };

  return (
    <div className="mb-4 p-3 bg-brand-blue-lighter/20 border border-brand-blue-lighter rounded-lg animate-in slide-in-from-top-2">
      <h4 className="text-xs font-black text-brand-blue-dark uppercase mb-3 flex items-center gap-2">
        <Settings className="w-3 h-3" /> {tool.label} Configuration
      </h4>

      {tool.type === 'lunchCount' && (
        <div className="space-y-3">
          {(() => {
            const config = (permission.config ?? {}) as LunchCountGlobalConfig;
            const isSchumannIdMalformed =
              config.schumannSheetId && config.schumannSheetId.includes('/');
            const isIntermediateIdMalformed =
              config.intermediateSheetId &&
              config.intermediateSheetId.includes('/');
            const isUrlMalformed =
              config.submissionUrl &&
              !config.submissionUrl.startsWith('https://');

            return (
              <>
                <p className="text-xxs text-slate-400 leading-tight">
                  Found in the URL: docs.google.com/spreadsheets/d/<b>[ID]</b>
                  /edit
                </p>
                <div>
                  <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
                    Schumann Elementary — Sheet ID
                  </label>
                  <input
                    type="text"
                    value={config.schumannSheetId ?? ''}
                    onChange={(e) =>
                      updatePermission(tool.type, {
                        config: {
                          ...config,
                          schumannSheetId: e.target.value.trim(),
                        },
                      })
                    }
                    className={`w-full px-2 py-1.5 text-xs font-mono border rounded focus:ring-1 outline-none ${
                      isSchumannIdMalformed
                        ? 'border-red-300 bg-red-50 focus:ring-red-500'
                        : 'border-slate-300 focus:ring-brand-blue-primary'
                    }`}
                    placeholder="Schumann spreadsheet ID"
                  />
                  {isSchumannIdMalformed && (
                    <p className="text-xxs text-red-600 font-bold mt-1">
                      Warning: Enter only the ID, not the full URL.
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
                    Intermediate School — Sheet ID
                  </label>
                  <input
                    type="text"
                    value={config.intermediateSheetId ?? ''}
                    onChange={(e) =>
                      updatePermission(tool.type, {
                        config: {
                          ...config,
                          intermediateSheetId: e.target.value.trim(),
                        },
                      })
                    }
                    className={`w-full px-2 py-1.5 text-xs font-mono border rounded focus:ring-1 outline-none ${
                      isIntermediateIdMalformed
                        ? 'border-red-300 bg-red-50 focus:ring-red-500'
                        : 'border-slate-300 focus:ring-brand-blue-primary'
                    }`}
                    placeholder="Intermediate spreadsheet ID"
                  />
                  {isIntermediateIdMalformed && (
                    <p className="text-xxs text-red-600 font-bold mt-1">
                      Warning: Enter only the ID, not the full URL.
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
                    Submission URL (Apps Script)
                  </label>
                  <input
                    type="text"
                    value={config.submissionUrl ?? ''}
                    onChange={(e) =>
                      updatePermission(tool.type, {
                        config: {
                          ...config,
                          submissionUrl: e.target.value.trim(),
                        },
                      })
                    }
                    className={`w-full px-2 py-1.5 text-xs font-mono border rounded focus:ring-1 outline-none ${
                      isUrlMalformed
                        ? 'border-red-300 bg-red-50 focus:ring-red-500'
                        : 'border-slate-300 focus:ring-brand-blue-primary'
                    }`}
                    placeholder="https://script.google.com/macros/s/.../exec"
                  />
                  {isUrlMalformed && (
                    <p className="text-xxs text-red-600 font-bold mt-1">
                      Warning: URL must start with https://
                    </p>
                  )}
                </div>
              </>
            );
          })()}
        </div>
      )}

      {tool.type === 'weather' && (
        <div className="space-y-4">
          {(() => {
            const config = (permission.config ?? {
              fetchingStrategy: 'client',
              updateFrequencyMinutes: 15,
              temperatureRanges: [],
            }) as unknown as WeatherGlobalConfig;

            return (
              <>
                <div>
                  <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
                    Fetching Strategy
                  </label>
                  <div className="flex bg-white rounded-lg border border-slate-200 p-1">
                    <button
                      onClick={() =>
                        updatePermission(tool.type, {
                          config: {
                            ...config,
                            fetchingStrategy: 'client',
                          },
                        })
                      }
                      className={`flex-1 py-1.5 text-xxs font-bold rounded transition-colors ${
                        config.fetchingStrategy === 'client' ||
                        !config.fetchingStrategy
                          ? 'bg-brand-blue-primary text-white shadow-sm'
                          : 'text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      Client (Direct)
                    </button>
                    <button
                      onClick={() =>
                        updatePermission(tool.type, {
                          config: {
                            ...config,
                            fetchingStrategy: 'admin_proxy',
                          },
                        })
                      }
                      className={`flex-1 py-1.5 text-xxs font-bold rounded transition-colors ${
                        config.fetchingStrategy === 'admin_proxy'
                          ? 'bg-brand-blue-primary text-white shadow-sm'
                          : 'text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      Admin Proxy
                    </button>
                  </div>
                  <p className="text-xxs text-slate-400 mt-1">
                    <strong>Client:</strong> Each user fetches data directly
                    (higher API usage).
                    <br />
                    <strong>Admin Proxy:</strong> Admin fetches data, users sync
                    from database (saves API calls).
                  </p>
                </div>

                {config.fetchingStrategy === 'admin_proxy' && (
                  <div className="space-y-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div>
                      <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
                        Data Source
                      </label>
                      <div className="flex bg-white rounded-lg border border-slate-200 p-1">
                        <button
                          onClick={() =>
                            updatePermission(tool.type, {
                              config: {
                                ...config,
                                source: 'openweather',
                              },
                            })
                          }
                          className={`flex-1 py-1.5 text-xxs font-bold rounded transition-colors ${
                            config.source === 'openweather' || !config.source
                              ? 'bg-brand-blue-primary text-white shadow-sm'
                              : 'text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          OpenWeather
                        </button>
                        <button
                          onClick={() =>
                            updatePermission(tool.type, {
                              config: {
                                ...config,
                                source: 'earth_networks',
                              },
                            })
                          }
                          className={`flex-1 py-1.5 text-xxs font-bold rounded transition-colors ${
                            config.source === 'earth_networks'
                              ? 'bg-brand-blue-primary text-white shadow-sm'
                              : 'text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          Earth Networks
                        </button>
                      </div>
                    </div>

                    {(config.source === 'openweather' || !config.source) && (
                      <div>
                        <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
                          City (Optional)
                        </label>
                        <input
                          type="text"
                          placeholder="Default: Local Station"
                          value={config.city ?? ''}
                          onChange={(e) =>
                            updatePermission(tool.type, {
                              config: {
                                ...config,
                                city: e.target.value,
                              },
                            })
                          }
                          className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-brand-blue-primary outline-none"
                        />
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
                    Update Frequency (Minutes)
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="1440"
                    value={config.updateFrequencyMinutes ?? 15}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      updatePermission(tool.type, {
                        config: {
                          ...config,
                          updateFrequencyMinutes: isNaN(val) ? 15 : val,
                        },
                      });
                    }}
                    className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-brand-blue-primary outline-none"
                  />
                </div>

                <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200">
                  <span className="text-xxs font-bold text-slate-500 uppercase">
                    Show &quot;Feels Like&quot; Temperature
                  </span>
                  <Toggle
                    checked={config.showFeelsLike ?? false}
                    onChange={(checked) =>
                      updatePermission(tool.type, {
                        config: {
                          ...config,
                          showFeelsLike: checked,
                        },
                      })
                    }
                    size="xs"
                    showLabels={false}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xxs font-bold text-slate-500 uppercase block">
                      Temperature Ranges
                    </label>
                    <button
                      onClick={() => addWeatherRange(tool.type)}
                      className="text-xxs font-bold text-brand-blue-primary hover:text-brand-blue-dark flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add Range
                    </button>
                  </div>

                  <div className="space-y-2">
                    {(config.temperatureRanges || []).map((range) => (
                      <div
                        key={range.id}
                        className="bg-white border border-slate-200 rounded-lg p-2 space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <select
                            value={range.type ?? 'range'}
                            onChange={(e) =>
                              updateWeatherRange(tool.type, range.id, {
                                type: e.target
                                  .value as WeatherTemperatureRange['type'],
                              })
                            }
                            className="text-xxs font-bold border border-slate-200 rounded px-1 py-1"
                          >
                            <option value="range">Range</option>
                            <option value="above">Above</option>
                            <option value="below">Below</option>
                          </select>

                          {(range.type === 'range' || !range.type) && (
                            <>
                              <input
                                type="number"
                                placeholder="Min"
                                value={range.min}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  updateWeatherRange(tool.type, range.id, {
                                    min: isNaN(val) ? 0 : val,
                                  });
                                }}
                                className="w-14 px-1.5 py-1 text-xs border border-slate-200 rounded text-center"
                                title="Min Temp"
                              />
                              <span className="text-slate-400 text-xs">-</span>
                              <input
                                type="number"
                                placeholder="Max"
                                value={range.max}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  updateWeatherRange(tool.type, range.id, {
                                    max: isNaN(val) ? 0 : val,
                                  });
                                }}
                                className="w-14 px-1.5 py-1 text-xs border border-slate-200 rounded text-center"
                                title="Max Temp"
                              />
                            </>
                          )}

                          {range.type === 'above' && (
                            <div className="flex items-center gap-2 flex-1">
                              <span className="text-xxs font-bold text-slate-400 uppercase">
                                Above
                              </span>
                              <input
                                type="number"
                                placeholder="Temp"
                                value={range.min}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  updateWeatherRange(tool.type, range.id, {
                                    min: isNaN(val) ? 0 : val,
                                  });
                                }}
                                className="w-14 px-1.5 py-1 text-xs border border-slate-200 rounded text-center"
                              />
                            </div>
                          )}

                          {range.type === 'below' && (
                            <div className="flex items-center gap-2 flex-1">
                              <span className="text-xxs font-bold text-slate-400 uppercase">
                                Below
                              </span>
                              <input
                                type="number"
                                placeholder="Temp"
                                value={range.max}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  updateWeatherRange(tool.type, range.id, {
                                    max: isNaN(val) ? 0 : val,
                                  });
                                }}
                                className="w-14 px-1.5 py-1 text-xs border border-slate-200 rounded text-center"
                              />
                            </div>
                          )}

                          <div className="flex-1" />
                          <button
                            onClick={() =>
                              removeWeatherRange(tool.type, range.id)
                            }
                            className="text-red-500 hover:text-red-700 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <input
                          type="text"
                          placeholder="Display Message..."
                          value={range.message}
                          onChange={(e) =>
                            updateWeatherRange(tool.type, range.id, {
                              message: e.target.value,
                            })
                          }
                          className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:border-brand-blue-primary outline-none"
                        />

                        <div className="flex items-center gap-2">
                          {range.imageUrl ? (
                            <div className="relative w-10 h-10 rounded bg-slate-100 overflow-hidden shrink-0 group">
                              <img
                                src={range.imageUrl}
                                alt="Range"
                                className="w-full h-full object-cover"
                              />
                              <button
                                onClick={() =>
                                  updateWeatherRange(tool.type, range.id, {
                                    imageUrl: undefined,
                                  })
                                }
                                className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded bg-slate-50 border border-dashed border-slate-300 flex items-center justify-center shrink-0">
                              <ImageIcon className="w-4 h-4 text-slate-300" />
                            </div>
                          )}

                          <div className="flex-1">
                            <label className="flex items-center gap-2 cursor-pointer bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded px-3 py-1.5 transition-colors w-max">
                              {uploadingRangeId === range.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-blue-primary" />
                              ) : (
                                <Upload className="w-3.5 h-3.5 text-slate-500" />
                              )}
                              <span className="text-xxs font-bold text-slate-600 uppercase">
                                {range.imageUrl
                                  ? 'Change Image'
                                  : 'Upload Image'}
                              </span>
                              <input
                                type="file"
                                className="hidden"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    void handleWeatherImageUpload(
                                      tool.type,
                                      range.id,
                                      file
                                    );
                                  }
                                }}
                                disabled={!!uploadingRangeId}
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {tool.type === 'webcam' && (
        <div className="space-y-4">
          {(() => {
            const config = (permission.config ??
              {}) as unknown as WebcamGlobalConfig;
            return (
              <div>
                <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
                  OCR Mode
                </label>
                <div className="flex bg-white rounded-lg border border-slate-200 p-1">
                  <button
                    onClick={() =>
                      updatePermission(tool.type, {
                        config: {
                          ...(permission.config ?? {}),
                          ocrMode: 'standard',
                        },
                      })
                    }
                    className={`flex-1 py-1.5 text-xxs font-bold rounded transition-colors ${
                      config.ocrMode === 'standard' || !config.ocrMode
                        ? 'bg-brand-blue-primary text-white shadow-sm'
                        : 'text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    Standard (Local)
                  </button>
                  <button
                    onClick={() =>
                      updatePermission(tool.type, {
                        config: {
                          ...(permission.config ?? {}),
                          ocrMode: 'gemini',
                        },
                      })
                    }
                    className={`flex-1 py-1.5 text-xxs font-bold rounded transition-colors ${
                      config.ocrMode === 'gemini'
                        ? 'bg-brand-blue-primary text-white shadow-sm'
                        : 'text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    Gemini (AI)
                  </button>
                </div>
                <p className="text-xxs text-slate-400 mt-1">
                  <strong>Standard:</strong> Uses browser-local OCR (no API
                  usage).
                  <br />
                  <strong>Gemini:</strong> Uses Gemini 3 Flash for higher
                  accuracy (uses AI limits).
                </p>
              </div>
            );
          })()}
        </div>
      )}

      {tool.type === 'expectations' && (
        <div className="space-y-4">
          <ExpectationsConfigurationPanel
            config={
              (permission.config ?? {
                buildings: {},
              }) as unknown as ExpectationsGlobalConfig
            }
            onChange={(newConfig) =>
              updatePermission(tool.type, {
                config: newConfig as unknown as Record<string, unknown>,
              })
            }
          />
        </div>
      )}

      {tool.type === 'catalyst' && (
        <div className="space-y-4">
          <CatalystPermissionEditor
            config={
              isCatalystConfig(permission.config) ? permission.config : {}
            }
            onChange={(newConfig) =>
              updatePermission(tool.type, {
                config: newConfig as unknown as Record<string, unknown>,
              })
            }
            onShowMessage={showMessage}
          />
        </div>
      )}

      {(() => {
        const BuildingPanel = BUILDING_CONFIG_PANELS[tool.type];
        if (!BuildingPanel) return null;
        return (
          <div className="space-y-4">
            <BuildingPanel
              config={
                permission.config ?? {
                  buildingDefaults: {},
                }
              }
              onChange={(newConfig) =>
                updatePermission(tool.type, { config: newConfig })
              }
            />
          </div>
        );
      })()}

      {![
        'lunchCount',
        'weather',
        'instructionalRoutines',
        'catalyst',
        'webcam',
        'stickers',
        'calendar',
        'miniApp',
        'expectations',
        ...Object.keys(BUILDING_CONFIG_PANELS),
      ].includes(tool.type) && (
        <p className="text-xs text-slate-500 italic">
          No additional configuration available for this widget.
        </p>
      )}
    </div>
  );
};
