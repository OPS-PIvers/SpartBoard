import React from 'react';
import { WidgetMeta, WIDGET_COLOR_PRESETS, WIDGET_ICON_PRESETS } from './types';
import { BUILDINGS } from '@/config/buildings';

interface WidgetMetaEditorProps {
  meta: WidgetMeta;
  onChange: (meta: WidgetMeta) => void;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const WidgetMetaEditor: React.FC<WidgetMetaEditorProps> = ({
  meta,
  onChange,
}) => {
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

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-200 mb-3">
          Widget Info
        </h3>

        {/* Title */}
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

        {/* Slug */}
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

        {/* Description */}
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

      {/* Icon */}
      <div>
        <label className="block text-xs text-slate-400 mb-2">
          Icon (emoji)
        </label>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-3xl leading-none">{meta.icon}</span>
          <input
            type="text"
            value={meta.icon}
            onChange={(e) => update({ icon: e.target.value.slice(-2) || '🧩' })}
            className="w-16 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200 text-center focus:outline-none focus:border-blue-500"
            maxLength={2}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {WIDGET_ICON_PRESETS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => update({ icon: emoji })}
              className={`text-lg leading-none p-1.5 rounded border transition-colors ${
                meta.icon === emoji
                  ? 'border-blue-500 bg-blue-900/30'
                  : 'border-transparent hover:border-slate-500 hover:bg-slate-700'
              }`}
              title={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Color */}
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

      {/* Default size */}
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

      {/* Access level */}
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
                    .map((s) => s.trim())
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

      {/* Buildings */}
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
