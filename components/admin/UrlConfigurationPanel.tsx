import React, { useState } from 'react';
import { BUILDINGS } from '@/config/buildings';
import { UrlGlobalConfig } from '@/types';
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

interface UrlConfigurationPanelProps {
  config: UrlGlobalConfig | Record<string, unknown>;
  onChange: (newConfig: Record<string, unknown>) => void;
}

export const UrlConfigurationPanel: React.FC<UrlConfigurationPanelProps> = ({
  config,
  onChange,
}) => {
  const [activeTab, setActiveTab] = useState(BUILDINGS[0].id);

  const typedConfig = config as UrlGlobalConfig;
  const buildingDefaults = typedConfig.buildingDefaults ?? {};
  const activeBuildingConfig = buildingDefaults[activeTab] ?? {
    buildingId: activeTab,
    urls: [],
  };

  const urls = activeBuildingConfig.urls ?? [];

  const [newUrl, setNewUrl] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newColor, setNewColor] = useState(COLORS[4]);

  const updateBuilding = (
    buildingId: string,
    updates: Partial<typeof activeBuildingConfig>
  ) => {
    onChange({
      ...typedConfig,
      buildingDefaults: {
        ...buildingDefaults,
        [buildingId]: {
          ...(buildingDefaults[buildingId] ?? { buildingId }),
          ...updates,
        },
      },
    });
  };

  const addUrl = () => {
    if (!newUrl.trim()) return;

    let formattedUrl = newUrl.trim();
    if (!/^[a-z]+:\/\//i.test(formattedUrl)) {
      formattedUrl = 'https://' + formattedUrl;
    }

    const newItem = {
      id: crypto.randomUUID(),
      url: formattedUrl,
      title: newTitle.trim() || undefined,
      color: newColor,
    };

    updateBuilding(activeTab, { urls: [...urls, newItem] });
    setNewUrl('');
    setNewTitle('');
  };

  const removeUrl = (id: string) => {
    updateBuilding(activeTab, {
      urls: urls.filter((u) => u.id !== id),
    });
  };

  const getDisplayLabel = (title?: string, url?: string) => {
    const trimmedTitle = title?.trim();
    return trimmedTitle && trimmedTitle.length > 0 ? trimmedTitle : url;
  };

  return (
    <div className="space-y-4 bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-50 custom-scrollbar">
        {BUILDINGS.map((b) => (
          <button
            key={b.id}
            onClick={() => setActiveTab(b.id)}
            className={`px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-colors ${
              activeTab === b.id
                ? 'border-brand-blue-primary text-brand-blue-primary bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100'
            }`}
          >
            {b.gradeLabel}
          </button>
        ))}
      </div>

      <div className="p-5 space-y-6">
        <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
          <h3 className="text-sm font-bold text-slate-700">
            Add New Default Link
          </h3>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">
              URL
            </label>
            <input
              type="text"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newUrl.trim()) {
                  addUrl();
                }
              }}
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

        {urls.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-700">
              Active Default Links
            </h3>
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
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
