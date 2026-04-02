import React, { useState } from 'react';
import { WidgetData, UrlWidgetConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { Plus, Trash2 } from 'lucide-react';

const COLORS = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#84cc16',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#d946ef',
  '#f43f5e',
];

export const UrlWidgetSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = widget.config as UrlWidgetConfig;
  const urls = config.urls ?? [];

  // local state for the form inputs
  const [newUrl, setNewUrl] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newColor, setNewColor] = useState(COLORS[4]);

  const update = (updates: Partial<UrlWidgetConfig>) => {
    updateWidget(widget.id, { config: { ...config, ...updates } });
  };

  const addUrl = () => {
    if (!newUrl.trim()) return;

    // basic url formatting if missing protocol
    let formattedUrl = newUrl.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = 'https://' + formattedUrl;
    }

    const newItem = {
      id: Math.random().toString(36).substring(2, 9),
      url: formattedUrl,
      title: newTitle.trim(),
      color: newColor,
    };

    update({ urls: [...urls, newItem] });
    setNewUrl('');
    setNewTitle('');
    // Optionally keep the color or change it
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
            Button Color
          </label>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
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
            {urls.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-sm"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: u.color ?? '#10b981' }}
                  />
                  <div className="flex flex-col overflow-hidden">
                    <span className="font-bold text-sm text-slate-800 truncate">
                      {u.title ?? u.url}
                    </span>
                    <span className="text-xs text-slate-500 truncate">
                      {u.url}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => removeUrl(u.id)}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="Remove Link"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
