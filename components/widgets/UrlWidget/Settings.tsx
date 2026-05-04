import React, { useState } from 'react';
import { WidgetData, UrlWidgetConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { Plus, Trash2 } from 'lucide-react';
import {
  URL_ICONS,
  URL_COLORS,
  DEFAULT_URL_ICON_ID,
  DEFAULT_URL_COLOR,
  getUrlIcon,
} from './icons';

export const UrlWidgetSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as UrlWidgetConfig;
  const urls = config.urls ?? [];

  // local state for the form inputs
  const [newUrl, setNewUrl] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_URL_COLOR);
  const [newIcon, setNewIcon] = useState(DEFAULT_URL_ICON_ID);

  const update = (updates: Partial<UrlWidgetConfig>) => {
    updateWidget(widget.id, { config: { ...config, ...updates } });
  };

  const getDisplayLabel = (title?: string, url?: string) => {
    const trimmedTitle = title?.trim();
    return trimmedTitle && trimmedTitle.length > 0 ? trimmedTitle : url;
  };

  const addUrl = () => {
    if (!newUrl.trim()) return;

    // basic url formatting if missing protocol
    let formattedUrl = newUrl.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = 'https://' + formattedUrl;
    }

    const newItem = {
      id: crypto.randomUUID(),
      url: formattedUrl,
      title: newTitle.trim() || undefined,
      color: newColor,
      icon: newIcon,
    };

    update({ urls: [...urls, newItem] });
    setNewUrl('');
    setNewTitle('');
  };

  const removeUrl = (id: string) => {
    update({ urls: urls.filter((u) => u.id !== id) });
  };

  return (
    <div className="p-4 space-y-6">
      {/* Add New URL Section */}
      <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
        <h3 className="text-sm font-bold text-slate-700">Add New Link</h3>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
            URL
          </label>
          <input
            type="text"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-blue-primary focus:outline-none"
            placeholder="e.g. google.com"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
            Title (Optional)
          </label>
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-brand-blue-primary focus:outline-none"
            placeholder="e.g. Google"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">
            Icon
          </label>
          <div className="grid grid-cols-10 gap-1.5 max-h-32 overflow-y-auto p-1">
            {URL_ICONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setNewIcon(id)}
                title={label}
                aria-label={label}
                aria-pressed={newIcon === id}
                className={`flex items-center justify-center w-8 h-8 rounded-lg border-2 transition-all ${
                  newIcon === id
                    ? 'border-slate-800 bg-slate-800 text-white scale-105'
                    : 'border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-600 mb-2 uppercase tracking-wider">
            Button Color
          </label>
          <div className="flex flex-wrap gap-2">
            {URL_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setNewColor(c)}
                className={`w-8 h-8 rounded-full border-2 transition-all ${
                  newColor === c
                    ? 'border-slate-800 scale-110 shadow-sm'
                    : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={addUrl}
          disabled={!newUrl.trim()}
          className="w-full mt-2 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl font-bold transition-colors"
        >
          <Plus size={16} />
          Add Link
        </button>
      </div>

      {/* Existing URLs List */}
      {urls.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-700">Active Links</h3>
          <div className="space-y-2">
            {urls.map((u) => {
              const Icon = getUrlIcon(u.icon);
              return (
                <div
                  key={u.id}
                  className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-sm"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: u.color ?? DEFAULT_URL_COLOR }}
                    >
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <span className="font-bold text-sm text-slate-800 truncate">
                        {getDisplayLabel(u.title, u.url)}
                      </span>
                      <span className="text-xs text-slate-500 truncate">
                        {u.url}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeUrl(u.id)}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Remove Link"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
