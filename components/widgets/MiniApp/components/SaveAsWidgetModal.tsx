import React, { useState } from 'react';
import { Bookmark, X, Check, Loader2 } from 'lucide-react';
import {
  CUSTOM_WIDGET_ICON_OPTIONS,
  getCustomWidgetIcon,
} from '@/config/customWidgetIcons';

const COLOR_PRESETS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'Blue', value: 'bg-blue-500' },
  { label: 'Indigo', value: 'bg-indigo-600' },
  { label: 'Violet', value: 'bg-violet-600' },
  { label: 'Purple', value: 'bg-purple-500' },
  { label: 'Pink', value: 'bg-pink-500' },
  { label: 'Red', value: 'bg-red-500' },
  { label: 'Orange', value: 'bg-orange-500' },
  { label: 'Amber', value: 'bg-amber-500' },
  { label: 'Green', value: 'bg-green-500' },
  { label: 'Emerald', value: 'bg-emerald-500' },
  { label: 'Teal', value: 'bg-teal-500' },
  { label: 'Slate', value: 'bg-slate-700' },
];

interface SaveAsWidgetModalProps {
  defaultTitle: string;
  isSaving?: boolean;
  onSave: (values: { title: string; icon: string; color: string }) => void;
  onClose: () => void;
}

export const SaveAsWidgetModal: React.FC<SaveAsWidgetModalProps> = ({
  defaultTitle,
  isSaving = false,
  onSave,
  onClose,
}) => {
  // Parent renders this modal conditionally on `showSaveAsWidget`, so each
  // open is a fresh mount and useState initializers naturally re-derive from
  // the current `defaultTitle` without any reset effect or setState-in-render.
  const [title, setTitle] = useState(defaultTitle);
  const [icon, setIcon] = useState(CUSTOM_WIDGET_ICON_OPTIONS[0].key);
  const [color, setColor] = useState(COLOR_PRESETS[0].value);

  const trimmed = title.trim();
  const canSave = trimmed.length > 0 && !isSaving;

  const handleSubmit = () => {
    if (!canSave) return;
    onSave({ title: trimmed, icon, color });
  };

  return (
    <div className="absolute inset-0 z-overlay bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div
        className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        {/* Header */}
        <div className="p-4 flex items-center justify-between bg-brand-blue-primary">
          <div className="flex items-center gap-2 text-white">
            <Bookmark className="w-5 h-5" />
            <span className="font-black uppercase tracking-tight">
              Save as Widget
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          {/* Live preview chip */}
          <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
            <div
              className={`w-12 h-12 rounded-2xl ${color} flex items-center justify-center text-white shadow-sm shrink-0`}
            >
              {React.createElement(getCustomWidgetIcon(icon) ?? Bookmark, {
                size: 22,
              })}
            </div>
            <div className="min-w-0">
              <p className="text-xxs font-black uppercase text-slate-400 tracking-widest">
                Preview
              </p>
              <p className="text-sm font-bold text-slate-700 truncate">
                {trimmed.length > 0 ? trimmed : 'Untitled widget'}
              </p>
            </div>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <label
              htmlFor="save-as-widget-title"
              className="block text-xs font-black uppercase tracking-widest text-slate-500"
            >
              Title
            </label>
            <input
              id="save-as-widget-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Mini App"
              autoFocus
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-brand-blue-primary"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSave) handleSubmit();
              }}
            />
          </div>

          {/* Icon */}
          <div className="space-y-2">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-500">
              Icon
            </label>
            <div className="grid grid-cols-6 gap-1.5">
              {CUSTOM_WIDGET_ICON_OPTIONS.map((option) => {
                const Icon = option.icon;
                const active = option.key === icon;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setIcon(option.key)}
                    title={option.label}
                    aria-label={option.label}
                    aria-pressed={active}
                    className={`aspect-square rounded-xl flex items-center justify-center border-2 transition-all ${
                      active
                        ? 'border-brand-blue-primary bg-brand-blue-primary/10 text-brand-blue-primary'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color */}
          <div className="space-y-2">
            <label className="block text-xs font-black uppercase tracking-widest text-slate-500">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((preset) => {
                const active = preset.value === color;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => setColor(preset.value)}
                    title={preset.label}
                    aria-label={preset.label}
                    aria-pressed={active}
                    className={`w-8 h-8 rounded-full ${preset.value} flex items-center justify-center text-white transition-all shadow-sm ${
                      active
                        ? 'ring-2 ring-offset-2 ring-brand-blue-primary scale-110'
                        : 'hover:scale-105'
                    }`}
                  >
                    {active ? <Check className="w-4 h-4" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSave}
            className="px-4 py-2 rounded-xl text-sm font-black uppercase tracking-widest bg-brand-blue-primary hover:bg-brand-blue-dark text-white transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Bookmark className="w-4 h-4" />
            )}
            <span>{isSaving ? 'Saving…' : 'Save Widget'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
