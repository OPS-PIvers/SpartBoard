import { slugify } from '@/utils/slug';
import React from 'react';
import { WidgetMeta, WIDGET_COLOR_PRESETS } from './types';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import {
  CUSTOM_WIDGET_ICON_OPTIONS,
  getCustomWidgetIcon,
} from '@/config/customWidgetIcons';
import { Puzzle } from 'lucide-react';

interface WidgetMetaEditorProps {
  meta: WidgetMeta;
  onChange: (meta: WidgetMeta) => void;
}

function renderWidgetIcon(
  iconKey: string,
  className: string,
  size: number
): React.ReactNode {
  const Icon = getCustomWidgetIcon(iconKey);
  if (Icon) return React.createElement(Icon, { size, className });
  if (iconKey.trim().length === 0) {
    return React.createElement(Puzzle, { size, className });
  }
  return (
    <span className={className} style={{ fontSize: size }} aria-hidden="true">
      {iconKey}
    </span>
  );
}

export const WidgetMetaEditor: React.FC<WidgetMetaEditorProps> = ({
  meta,
  onChange,
}) => {
  const BUILDINGS = useAdminBuildings();
  const update = (partial: Partial<WidgetMeta>) =>
    onChange({ ...meta, ...partial });

  const handleTitleChange = (title: string) => {
    update({ title, slug: slugify(title) });
  };

  const toggleBuilding = (id: string) => {
    const next = meta.buildings.includes(id)
      ? meta.buildings.filter((b) => b !== id)
      : [...meta.buildings, id];
    update({ buildings: next });
  };
  const selectedIconOption = CUSTOM_WIDGET_ICON_OPTIONS.find(
    (option) => option.key === meta.icon
  );
  const selectedIconLabel = selectedIconOption?.label ?? meta.icon;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-200 mb-3">
          Widget Info
        </h3>

        <div className="space-y-1 mb-3">
          <label className="block text-xs text-slate-400">
            Widget Name <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={meta.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="e.g. Daily Poll"
            className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        <div className="space-y-1 mb-3">
          <label className="block text-xs text-slate-400">
            Slug (auto-generated, must be unique)
          </label>
          <input
            type="text"
            value={meta.slug}
            onChange={(e) => update({ slug: slugify(e.target.value) })}
            placeholder="daily-poll"
            className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        <div className="space-y-1 mb-3">
          <label className="block text-xs text-slate-400">Description</label>
          <textarea
            value={meta.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="Short description of what this widget does..."
            rows={2}
            className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-2">Widget Icon</label>
        <div className="flex items-center gap-3 mb-2 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2">
          {renderWidgetIcon(meta.icon, 'text-blue-300', 20)}
          <span className="text-xs text-slate-300">{selectedIconLabel}</span>
        </div>
        <p className="text-xs text-slate-500 mb-2">
          Use a Lucide icon so your widget matches the rest of SPART.
        </p>
        <div className="grid grid-cols-4 gap-2">
          {CUSTOM_WIDGET_ICON_OPTIONS.map((option) => {
            const active = option.key === meta.icon;
            return (
              <button
                key={option.key}
                onClick={() => update({ icon: option.key })}
                className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-xs transition-colors ${
                  active
                    ? 'border-blue-500 bg-blue-900/30 text-blue-200'
                    : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                }`}
                title={option.label}
              >
                {React.createElement(option.icon, { size: 16 })}
                <span className="leading-none">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-2">
          Accent Color
        </label>
        <div className="flex flex-wrap gap-1.5">
          {WIDGET_COLOR_PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => update({ color: preset.value })}
              title={preset.label}
              className={`w-7 h-7 rounded-full ${preset.value} border-2 transition-all ${
                meta.color === preset.value
                  ? 'border-white scale-110 ring-2 ring-blue-500'
                  : 'border-transparent hover:border-white/50'
              }`}
            />
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-2">
          Default Size (px)
        </label>
        <div className="flex gap-3">
          <div className="flex-1 space-y-1">
            <label className="block text-xs text-slate-500">Width</label>
            <input
              type="number"
              value={meta.defaultWidth}
              min={200}
              max={1200}
              step={50}
              onChange={(e) => update({ defaultWidth: Number(e.target.value) })}
              className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex-1 space-y-1">
            <label className="block text-xs text-slate-500">Height</label>
            <input
              type="number"
              value={meta.defaultHeight}
              min={150}
              max={900}
              step={50}
              onChange={(e) =>
                update({ defaultHeight: Number(e.target.value) })
              }
              className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-2">
          Access Level
        </label>
        <div className="flex gap-2">
          {(['public', 'beta', 'admin'] as const).map((level) => (
            <button
              key={level}
              onClick={() => update({ accessLevel: level })}
              className={`flex-1 py-1.5 text-xs font-medium rounded border transition-colors capitalize ${
                meta.accessLevel === level
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-slate-900 border-slate-600 text-slate-400 hover:border-blue-500 hover:text-slate-200'
              }`}
            >
              {level}
            </button>
          ))}
        </div>
        {meta.accessLevel === 'beta' && (
          <div className="mt-2 space-y-1">
            <label className="block text-xs text-slate-400">
              Beta User Emails (one per line)
            </label>
            <textarea
              value={meta.betaUsers.join('\n')}
              onChange={(e) =>
                update({
                  betaUsers: e.target.value
                    .split('\n')
                    .map((s) => s.trim().toLowerCase())
                    .filter(Boolean),
                })
              }
              rows={3}
              placeholder="teacher@school.edu"
              className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1">
          Available In (leave empty for all buildings)
        </label>
        <div className="space-y-1 max-h-36 overflow-y-auto">
          {BUILDINGS.map((building) => (
            <label
              key={building.id}
              className="flex items-center gap-2 cursor-pointer hover:bg-slate-700 px-2 py-1 rounded"
            >
              <input
                type="checkbox"
                checked={meta.buildings.includes(building.id)}
                onChange={() => toggleBuilding(building.id)}
                className="accent-blue-500"
              />
              <span className="text-sm text-slate-300">{building.name}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};
