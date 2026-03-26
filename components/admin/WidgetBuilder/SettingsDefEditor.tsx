import React, { useState } from 'react';
import { CustomWidgetSettingDef } from '@/types';
import { Plus, Trash2, GripVertical } from 'lucide-react';

interface SettingsDefEditorProps {
  settingsDefs: CustomWidgetSettingDef[];
  onChange: (defs: CustomWidgetSettingDef[]) => void;
}

type SettingType = CustomWidgetSettingDef['type'];

function defaultValueForType(type: SettingType): string | number | boolean {
  switch (type) {
    case 'number':
      return 0;
    case 'boolean':
      return false;
    default:
      return '';
  }
}

export const SettingsDefEditor: React.FC<SettingsDefEditorProps> = ({
  settingsDefs,
  onChange,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newDef, setNewDef] = useState<CustomWidgetSettingDef>({
    key: '',
    label: '',
    type: 'string',
    defaultValue: '',
    options: [],
  });
  const [optionsText, setOptionsText] = useState('');

  const handleAdd = () => {
    if (!newDef.key.trim() || !newDef.label.trim()) return;
    // Ensure key is unique
    const key = newDef.key.trim().replace(/\s+/g, '_').toLowerCase();
    if (settingsDefs.some((d) => d.key === key)) {
      return; // Duplicate key, silently skip (could show error)
    }
    const def: CustomWidgetSettingDef = {
      ...newDef,
      key,
      options:
        newDef.type === 'select'
          ? optionsText
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
    };
    onChange([...settingsDefs, def]);
    setIsAdding(false);
    setNewDef({ key: '', label: '', type: 'string', defaultValue: '' });
    setOptionsText('');
  };

  const handleDelete = (key: string) => {
    onChange(settingsDefs.filter((d) => d.key !== key));
  };

  const handleTypeChange = (type: SettingType) => {
    setNewDef((prev) => ({
      ...prev,
      type,
      defaultValue: defaultValueForType(type),
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Admin Settings</h3>
        <button
          onClick={() => setIsAdding((v) => !v)}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
        >
          <Plus size={10} />
          Add Setting
        </button>
      </div>

      <p className="text-xs text-slate-500">
        Define settings that admins can configure per-instance of this widget.
        These appear in the widget&apos;s settings panel.
      </p>

      {/* Add form */}
      {isAdding && (
        <div className="bg-slate-900 border border-blue-700 rounded-lg p-3 space-y-3">
          <p className="text-xs font-semibold text-blue-400">New Setting</p>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="block text-xs text-slate-400">
                Key (identifier)
              </label>
              <input
                type="text"
                value={newDef.key}
                onChange={(e) =>
                  setNewDef((p) => ({ ...p, key: e.target.value }))
                }
                placeholder="my_setting"
                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-slate-400">
                Display Label
              </label>
              <input
                type="text"
                value={newDef.label}
                onChange={(e) =>
                  setNewDef((p) => ({ ...p, label: e.target.value }))
                }
                placeholder="My Setting"
                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-xs text-slate-400">Type</label>
            <div className="flex gap-2">
              {(['string', 'number', 'boolean', 'select'] as SettingType[]).map(
                (t) => (
                  <button
                    key={t}
                    onClick={() => handleTypeChange(t)}
                    className={`px-2 py-1 text-xs rounded border transition-colors ${
                      newDef.type === t
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-blue-500'
                    }`}
                  >
                    {t}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-xs text-slate-400">
              Default Value
            </label>
            {newDef.type === 'boolean' ? (
              <select
                value={String(newDef.defaultValue)}
                onChange={(e) =>
                  setNewDef((p) => ({
                    ...p,
                    defaultValue: e.target.value === 'true',
                  }))
                }
                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="false">false</option>
                <option value="true">true</option>
              </select>
            ) : newDef.type === 'number' ? (
              <input
                type="number"
                value={Number(newDef.defaultValue)}
                onChange={(e) =>
                  setNewDef((p) => ({
                    ...p,
                    defaultValue: Number(e.target.value),
                  }))
                }
                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            ) : (
              <input
                type="text"
                value={String(newDef.defaultValue)}
                onChange={(e) =>
                  setNewDef((p) => ({ ...p, defaultValue: e.target.value }))
                }
                placeholder="Default value..."
                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            )}
          </div>

          {newDef.type === 'select' && (
            <div className="space-y-1">
              <label className="block text-xs text-slate-400">
                Options (one per line)
              </label>
              <textarea
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                rows={3}
                placeholder="Option A&#10;Option B&#10;Option C"
                className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:border-blue-500"
              />
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={!newDef.key.trim() || !newDef.label.trim()}
              className="flex-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
            >
              Add Setting
            </button>
            <button
              onClick={() => setIsAdding(false)}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Existing settings */}
      {settingsDefs.length === 0 && !isAdding && (
        <p className="text-xs text-slate-500 italic">
          No settings defined. Optional — add settings to make this widget
          configurable by admins.
        </p>
      )}

      <div className="space-y-2">
        {settingsDefs.map((def) => (
          <div
            key={def.key}
            className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2"
          >
            <GripVertical
              size={14}
              className="text-slate-600 flex-shrink-0 cursor-grab"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-200">{def.label}</p>
              <p className="text-xs text-slate-500 font-mono">
                {def.key}
                {' · '}
                <span className="text-amber-400">{def.type}</span>
                {' · default: '}
                <span className="text-slate-400">
                  {String(def.defaultValue)}
                </span>
                {def.options && def.options.length > 0 && (
                  <span className="text-slate-500">
                    {' '}
                    [{def.options.join(', ')}]
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={() => handleDelete(def.key)}
              className="p-1 text-slate-500 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors flex-shrink-0"
              title="Delete setting"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
