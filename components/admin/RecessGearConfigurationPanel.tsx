import React, { useState } from 'react';
import {
  Plus,
  X,
  Upload,
  Loader2,
  ImageIcon,
  Info,
  Trash2,
} from 'lucide-react';
import { RecessGearGlobalConfig, RecessGearTemperatureRange } from '@/types';
import { Toggle } from '@/components/common/Toggle';

export interface RecessGearConfigurationPanelProps {
  uploadWeatherImage?: (rangeId: string, file: File) => Promise<string>;
  config: Record<string, unknown>;
  onChange: (newConfig: Record<string, unknown>) => void;
}

export const RecessGearConfigurationPanel: React.FC<
  RecessGearConfigurationPanelProps
> = ({ config: rawConfig, onChange, uploadWeatherImage }) => {
  const config = (rawConfig ?? {
    fetchingStrategy: 'client',
    updateFrequencyMinutes: 15,
    temperatureRanges: [],
  }) as unknown as RecessGearGlobalConfig;

  const [uploadingRangeId, setUploadingRangeId] = useState<string | null>(null);

  const addRange = () => {
    const newRange: RecessGearTemperatureRange = {
      id: crypto.randomUUID(),
      min: 0,
      max: 100,
      label: 'New Item',
      category: 'clothing',
    };
    onChange({
      ...config,
      temperatureRanges: [...(config.temperatureRanges ?? []), newRange],
    });
  };

  const updateRange = (
    rangeId: string,
    updates: Partial<RecessGearTemperatureRange>
  ) => {
    const ranges = config.temperatureRanges ?? [];
    onChange({
      ...config,
      temperatureRanges: ranges.map((r) =>
        r.id === rangeId ? { ...r, ...updates } : r
      ),
    });
  };

  const removeRange = (rangeId: string) => {
    const ranges = config.temperatureRanges ?? [];
    onChange({
      ...config,
      temperatureRanges: ranges.filter((r) => r.id !== rangeId),
    });
  };

  const handleImageUpload = async (rangeId: string, file: File) => {
    if (!file) return;
    setUploadingRangeId(rangeId);
    try {
      if (!uploadWeatherImage) throw new Error('Upload function not provided');
      const url = await uploadWeatherImage(rangeId, file);
      updateRange(rangeId, { imageUrl: url });
      // showMessage('success', 'Image uploaded');
    } catch (e) {
      console.error(e);
      // showMessage('error', 'Upload failed');
    } finally {
      setUploadingRangeId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
          Weather Fetching Strategy
        </label>
        <div className="flex bg-white rounded-lg border border-slate-200 p-1">
          <button
            onClick={() =>
              onChange({
                ...config,
                fetchingStrategy: 'client',
              })
            }
            className={`flex-1 py-1.5 text-xxs font-bold rounded transition-colors ${
              config.fetchingStrategy === 'client' || !config.fetchingStrategy
                ? 'bg-brand-blue-primary text-white shadow-sm'
                : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            Client (Direct)
          </button>
          <button
            onClick={() =>
              onChange({
                ...config,
                fetchingStrategy: 'admin_proxy',
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
          <strong>Client:</strong> Each user fetches data directly (higher API
          usage).
          <br />
          <strong>Admin Proxy:</strong> Admin fetches data, users sync from
          database (saves API calls).
        </p>
      </div>

      {config.fetchingStrategy === 'admin_proxy' && (
        <div className="space-y-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <div>
            <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
              Weather Data Source
            </label>
            <div className="flex bg-white rounded-lg border border-slate-200 p-1">
              <button
                onClick={() =>
                  onChange({
                    ...config,
                    source: 'openweather',
                  })
                }
                className={`flex-1 py-1.5 text-xxs font-bold rounded transition-colors ${
                  config.source === 'openweather' || !config.source
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                OpenWeather
              </button>
              <button
                onClick={() =>
                  onChange({
                    ...config,
                    source: 'earth_networks',
                  })
                }
                className={`flex-1 py-1.5 text-xxs font-bold rounded transition-colors ${
                  config.source === 'earth_networks'
                    ? 'bg-emerald-500 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                Earth Networks
              </button>
            </div>
            {config.source === 'earth_networks' && (
              <div className="mt-2 p-2 bg-amber-50 rounded-lg border border-amber-200">
                <div className="flex gap-2">
                  <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xxs text-amber-800 leading-tight">
                    Requires valid Earth Networks API credentials in Firebase
                    config.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
              Default City
            </label>
            <input
              type="text"
              value={config.city ?? ''}
              onChange={(e) => onChange({ ...config, city: e.target.value })}
              placeholder="e.g. Orono"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-brand-blue-primary"
            />
            <p className="text-xxs text-slate-400 mt-1">
              Used if the widget has no specific location configured.
            </p>
          </div>

          <div>
            <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
              Update Frequency (Minutes)
            </label>
            <input
              type="number"
              min="5"
              max="1440"
              value={config.updateFrequencyMinutes ?? 15}
              onChange={(e) =>
                onChange({
                  ...config,
                  updateFrequencyMinutes: parseInt(e.target.value) || 15,
                })
              }
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-brand-blue-primary"
            />
            <p className="text-xxs text-slate-400 mt-1">
              How often the backend fetches new weather data. Default: 15. Min:
              5.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
        <div className="flex flex-col">
          <span className="text-xs font-bold text-slate-700">
            Use &quot;Feels Like&quot;
          </span>
          <span className="text-xxs text-slate-500">
            Calculate gear based on wind chill / heat index
          </span>
        </div>
        <Toggle
          checked={config.useFeelsLike ?? true}
          onChange={(checked) => onChange({ ...config, useFeelsLike: checked })}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-slate-700 uppercase">
            Recess Gear Items
          </label>
          <button
            onClick={addRange}
            className="flex items-center gap-1 text-xs font-bold text-brand-blue-primary hover:bg-brand-blue-primary/10 px-2 py-1 rounded transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Item
          </button>
        </div>

        <div className="space-y-3">
          {(config.temperatureRanges ?? []).map((range) => (
            <div
              key={range.id}
              className="p-3 bg-white border border-slate-200 rounded-lg space-y-3"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={range.type ?? 'range'}
                  onChange={(e) =>
                    updateRange(range.id, {
                      type: e.target
                        .value as RecessGearTemperatureRange['type'],
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
                        updateRange(range.id, {
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
                        updateRange(range.id, {
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
                        updateRange(range.id, {
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
                        updateRange(range.id, {
                          max: isNaN(val) ? 0 : val,
                        });
                      }}
                      className="w-14 px-1.5 py-1 text-xs border border-slate-200 rounded text-center"
                    />
                  </div>
                )}

                <select
                  value={range.category}
                  onChange={(e) =>
                    updateRange(range.id, {
                      category: e.target
                        .value as RecessGearTemperatureRange['category'],
                    })
                  }
                  className="text-xxs font-bold border border-slate-200 rounded px-1 py-1"
                >
                  <option value="clothing">Clothing</option>
                  <option value="footwear">Footwear</option>
                  <option value="accessory">Accessory</option>
                </select>

                <div className="flex-1" />
                <button
                  onClick={() => removeRange(range.id)}
                  className="text-red-500 hover:text-red-700 p-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Gear Label (e.g. Winter Coat)..."
                  value={range.label}
                  onChange={(e) =>
                    updateRange(range.id, { label: e.target.value })
                  }
                  className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded focus:border-brand-blue-primary outline-none"
                />
                <input
                  type="text"
                  placeholder="Emoji Icon..."
                  value={range.icon ?? ''}
                  onChange={(e) =>
                    updateRange(range.id, { icon: e.target.value })
                  }
                  className="w-20 px-2 py-1.5 text-xs border border-slate-200 rounded focus:border-brand-blue-primary outline-none text-center"
                />
              </div>

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
                        updateRange(range.id, { imageUrl: undefined })
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
                      {range.imageUrl ? 'Change Image' : 'Upload Image'}
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          void handleImageUpload(range.id, file);
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
    </div>
  );
};
