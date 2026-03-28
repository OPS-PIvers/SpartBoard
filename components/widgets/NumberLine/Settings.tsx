import React, { useState } from 'react';
import { useDashboard } from '@/context/useDashboard';
import {
  WidgetData,
  NumberLineConfig,
  NumberLineMarker,
  NumberLineJump,
} from '@/types';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { Toggle } from '@/components/common/Toggle';
import { Settings, Plus, X, ArrowRightCircle, Target } from 'lucide-react';
import { WIDGET_PALETTE } from '@/config/colors';

const MAX_NUMBER_LINE_ABS_VALUE = 1000;
const MAX_NUMBER_LINE_TICKS = 5000;

export const NumberLineSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as NumberLineConfig;

  // Safe defaults if missing
  const min = config.min ?? -10;
  const max = config.max ?? 10;
  const step = config.step ?? 1;
  const displayMode = config.displayMode ?? 'integers';
  const showArrows = config.showArrows ?? true;
  const markers = config.markers ?? [];
  const jumps = config.jumps ?? [];

  const updateConfig = (updates: Partial<NumberLineConfig>) => {
    updateWidget(widget.id, { config: { ...config, ...updates } });
  };

  // Add Jump State
  const [newJumpStart, setNewJumpStart] = useState<number>(0);
  const [newJumpEnd, setNewJumpEnd] = useState<number>(5);
  const [newJumpLabel, setNewJumpLabel] = useState<string>('+5');

  // Add Marker State
  const [newMarkerValue, setNewMarkerValue] = useState<number>(0);
  const [newMarkerLabel, setNewMarkerLabel] = useState<string>('Start');

  const handleAddJump = () => {
    const jump: NumberLineJump = {
      id: crypto.randomUUID(),
      startValue: newJumpStart,
      endValue: newJumpEnd,
      label: newJumpLabel,
    };
    updateConfig({ jumps: [...jumps, jump] });
  };

  const handleAddMarker = () => {
    const marker: NumberLineMarker = {
      id: crypto.randomUUID(),
      value: newMarkerValue,
      label: newMarkerLabel,
      color: WIDGET_PALETTE[markers.length % WIDGET_PALETTE.length],
    };
    updateConfig({ markers: [...markers, marker] });
  };

  const removeMarker = (id: string) => {
    updateConfig({ markers: markers.filter((m) => m.id !== id) });
  };

  const removeJump = (id: string) => {
    updateConfig({ jumps: jumps.filter((j) => j.id !== id) });
  };

  return (
    <div className="space-y-6 text-sm">
      {/* Configuration Section */}
      <section>
        <SettingsLabel icon={Settings}>Axis Configuration</SettingsLabel>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Min Value
            </label>
            <input
              type="number"
              defaultValue={min}
              onBlur={(e) => {
                const parsed = parseFloat(e.target.value);
                if (!Number.isNaN(parsed)) {
                  const clamped = Math.max(
                    -MAX_NUMBER_LINE_ABS_VALUE,
                    Math.min(MAX_NUMBER_LINE_ABS_VALUE, parsed)
                  );
                  const nextMin = Math.min(clamped, max);
                  updateConfig({ min: nextMin });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Max Value
            </label>
            <input
              type="number"
              defaultValue={max}
              onBlur={(e) => {
                const parsed = parseFloat(e.target.value);
                if (!Number.isNaN(parsed)) {
                  const clamped = Math.max(
                    -MAX_NUMBER_LINE_ABS_VALUE,
                    Math.min(MAX_NUMBER_LINE_ABS_VALUE, parsed)
                  );
                  const nextMax = Math.max(clamped, min);
                  updateConfig({ max: nextMax });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Step (Interval)
            </label>
            <input
              type="number"
              min="0.01"
              step="any"
              defaultValue={step}
              onBlur={(e) => {
                const parsed = parseFloat(e.target.value);
                if (!Number.isNaN(parsed)) {
                  const safeBaseStep = Math.max(0.01, parsed);
                  const range = Math.abs(max - min);
                  const minStepForTickLimit =
                    range > 0 ? range / MAX_NUMBER_LINE_TICKS : safeBaseStep;
                  const safeStep = Math.max(safeBaseStep, minStepForTickLimit);
                  updateConfig({ step: safeStep });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              Display Mode
            </label>
            <select
              value={displayMode}
              onChange={(e) =>
                updateConfig({
                  displayMode: e.target.value as
                    | 'integers'
                    | 'decimals'
                    | 'fractions',
                })
              }
              className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
            >
              <option value="integers">Integers</option>
              <option value="decimals">Decimals</option>
              <option value="fractions">Fractions</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <Toggle
            checked={showArrows}
            onChange={(checked) => updateConfig({ showArrows: checked })}
          />
          <span className="text-sm text-slate-700 font-medium">
            Show arrows on ends
          </span>
        </div>
      </section>

      {/* Markers Section */}
      <section>
        <SettingsLabel icon={Target}>Markers</SettingsLabel>

        {/* Add Marker Form */}
        <div className="flex gap-2 items-end mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
          <div className="flex-1">
            <label className="block text-xxs font-bold uppercase text-slate-400 mb-1">
              Value
            </label>
            <input
              type="number"
              value={newMarkerValue}
              onChange={(e) =>
                setNewMarkerValue(parseFloat(e.target.value) || 0)
              }
              className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xxs font-bold uppercase text-slate-400 mb-1">
              Label
            </label>
            <input
              type="text"
              value={newMarkerLabel}
              onChange={(e) => setNewMarkerLabel(e.target.value)}
              placeholder="e.g. Start"
              className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-sm"
            />
          </div>
          <button
            onClick={handleAddMarker}
            aria-label="Add marker"
            title="Add marker"
            className="bg-blue-600 text-white p-1.5 rounded-md hover:bg-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Marker List */}
        <div className="space-y-2 max-h-32 overflow-y-auto">
          {markers.length === 0 && (
            <div className="text-center text-slate-400 text-xs py-2 italic">
              No markers added.
            </div>
          )}
          {markers.map((marker) => (
            <div
              key={marker.id}
              className="flex items-center gap-3 bg-white border border-slate-100 p-2 rounded-lg"
            >
              <input
                type="color"
                value={marker.color}
                onChange={(e) => {
                  updateConfig({
                    markers: markers.map((m) =>
                      m.id === marker.id ? { ...m, color: e.target.value } : m
                    ),
                  });
                }}
                className="w-6 h-6 border-0 p-0 cursor-pointer"
              />
              <div className="flex-1 font-mono font-bold text-slate-700">
                {marker.value}
              </div>
              <div className="flex-1 text-slate-500">{marker.label}</div>
              <button
                onClick={() => removeMarker(marker.id)}
                aria-label="Remove marker"
                title="Remove marker"
                className="text-slate-400 hover:text-red-500 p-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Jumps Section */}
      <section>
        <SettingsLabel icon={ArrowRightCircle}>Jumps</SettingsLabel>

        {/* Add Jump Form */}
        <div className="flex gap-2 items-end mb-4 bg-slate-50 p-3 rounded-xl border border-slate-100">
          <div className="w-16">
            <label className="block text-xxs font-bold uppercase text-slate-400 mb-1">
              Start
            </label>
            <input
              type="number"
              value={newJumpStart}
              onChange={(e) => setNewJumpStart(parseFloat(e.target.value) || 0)}
              className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-sm"
            />
          </div>
          <div className="w-16">
            <label className="block text-xxs font-bold uppercase text-slate-400 mb-1">
              End
            </label>
            <input
              type="number"
              value={newJumpEnd}
              onChange={(e) => setNewJumpEnd(parseFloat(e.target.value) || 0)}
              className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xxs font-bold uppercase text-slate-400 mb-1">
              Label
            </label>
            <input
              type="text"
              value={newJumpLabel}
              onChange={(e) => setNewJumpLabel(e.target.value)}
              placeholder="+5"
              className="w-full px-2 py-1.5 border border-slate-200 rounded-md text-sm"
            />
          </div>
          <button
            onClick={handleAddJump}
            aria-label="Add jump"
            title="Add jump"
            className="bg-emerald-600 text-white p-1.5 rounded-md hover:bg-emerald-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Jumps List */}
        <div className="space-y-2 max-h-32 overflow-y-auto">
          {jumps.length === 0 && (
            <div className="text-center text-slate-400 text-xs py-2 italic">
              No jumps added.
            </div>
          )}
          {jumps.map((jump) => (
            <div
              key={jump.id}
              className="flex items-center gap-3 bg-white border border-slate-100 p-2 rounded-lg text-sm"
            >
              <div className="flex-1 font-mono text-slate-600">
                {jump.startValue}{' '}
                <ArrowRightCircle className="inline w-3 h-3 mx-1 text-slate-300" />{' '}
                {jump.endValue}
              </div>
              <div className="flex-1 font-bold text-slate-700">
                {jump.label}
              </div>
              <button
                onClick={() => removeJump(jump.id)}
                aria-label="Remove jump"
                title="Remove jump"
                className="text-slate-400 hover:text-red-500 p-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
