import React from 'react';
import { Plus, Trash2, MessageSquare } from 'lucide-react';
import { TalkingToolGlobalConfig, TalkingToolCategory } from '@/types';
import { DEFAULT_TALKING_TOOL_CATEGORIES } from '@/config/talkingToolData';
import { IconPicker } from '@/components/widgets/InstructionalRoutines/IconPicker';

interface TalkingToolConfigurationPanelProps {
  config: Partial<TalkingToolGlobalConfig>;
  onChange: (newConfig: TalkingToolGlobalConfig) => void;
}

export const TalkingToolConfigurationPanel: React.FC<
  TalkingToolConfigurationPanelProps
> = ({ config, onChange }) => {
  const categories = config.categories ?? DEFAULT_TALKING_TOOL_CATEGORIES;

  const updateCategory = (
    id: string,
    updates: Partial<TalkingToolCategory>
  ) => {
    const next = categories.map((c) =>
      c.id === id ? { ...c, ...updates } : c
    );
    onChange({ categories: next });
  };

  const addCategory = () => {
    const newCat: TalkingToolCategory = {
      id: crypto.randomUUID(),
      label: 'New Category',
      color: '#3b82f6',
      icon: 'MessageSquare',
      stems: [{ id: crypto.randomUUID(), text: 'New sentence stem...' }],
    };
    onChange({ categories: [...categories, newCat] });
  };

  const removeCategory = (id: string) => {
    const next = categories.filter((c) => c.id !== id);
    onChange({ categories: next });
  };

  const addStem = (catId: string) => {
    const next = categories.map((c) =>
      c.id === catId
        ? {
            ...c,
            stems: [...c.stems, { id: crypto.randomUUID(), text: '' }],
          }
        : c
    );
    onChange({ categories: next });
  };

  const updateStem = (catId: string, stemId: string, value: string) => {
    const next = categories.map((c) => {
      if (c.id === catId) {
        const nextStems = c.stems.map((s) =>
          s.id === stemId ? { ...s, text: value } : s
        );
        return { ...c, stems: nextStems };
      }
      return c;
    });
    onChange({ categories: next });
  };

  const removeStem = (catId: string, stemId: string) => {
    const next = categories.map((c) => {
      if (c.id === catId) {
        const nextStems = c.stems.filter((s) => s.id !== stemId);
        return { ...c, stems: nextStems };
      }
      return c;
    });
    onChange({ categories: next });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">
          Categories & Sentence Stems
        </h4>
        <button
          onClick={addCategory}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue-primary text-white rounded-lg text-xxs font-black uppercase tracking-wider hover:bg-brand-blue-dark transition-all shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" /> Add Category
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {categories.map((cat) => (
          <div
            key={cat.id}
            className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden shadow-sm"
          >
            {/* Category Header */}
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
              <IconPicker
                currentIcon={cat.icon}
                onSelect={(icon) => updateCategory(cat.id, { icon })}
                color="blue"
              />
              <input
                type="text"
                value={cat.label}
                onChange={(e) =>
                  updateCategory(cat.id, { label: e.target.value })
                }
                className="flex-1 bg-transparent border-none focus:ring-0 font-bold text-slate-800 p-0 text-sm"
                placeholder="Category Label"
              />
              <input
                type="color"
                value={cat.color}
                onChange={(e) =>
                  updateCategory(cat.id, { color: e.target.value })
                }
                className="w-6 h-6 rounded cursor-pointer border-none bg-transparent"
              />
              <button
                onClick={() => removeCategory(cat.id)}
                className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                title="Remove Category"
                aria-label="Remove category"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Stems List */}
            <div className="p-4 space-y-2">
              <label className="text-xxs font-black text-slate-400 uppercase tracking-widest block mb-2">
                Sentence Stems
              </label>
              {cat.stems.map((stem) => (
                <div key={stem.id} className="flex items-center gap-2 group">
                  <input
                    type="text"
                    value={stem.text}
                    onChange={(e) =>
                      updateStem(cat.id, stem.id, e.target.value)
                    }
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:border-brand-blue-primary focus:bg-white outline-none transition-all"
                    placeholder="Enter sentence stem..."
                  />
                  <button
                    onClick={() => removeStem(cat.id, stem.id)}
                    className="p-1.5 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    aria-label="Remove stem"
                    title="Remove stem"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <button
                onClick={() => addStem(cat.id)}
                className="w-full py-2 mt-2 border-2 border-dashed border-slate-100 rounded-xl text-slate-400 hover:border-brand-blue-light hover:text-brand-blue-primary transition-all flex items-center justify-center gap-2 text-xxs font-bold uppercase"
              >
                <Plus className="w-3.5 h-3.5" /> Add Stem
              </button>
            </div>
          </div>
        ))}

        {categories.length === 0 && (
          <div className="py-12 flex flex-col items-center justify-center bg-white border-2 border-dashed border-slate-200 rounded-3xl text-slate-400">
            <MessageSquare className="w-12 h-12 mb-4 opacity-20" />
            <p className="font-black uppercase tracking-widest text-xs">
              No categories defined
            </p>
            <p className="text-xs mt-1">
              Add your first category to get started.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
