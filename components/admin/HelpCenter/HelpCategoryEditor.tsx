import React, { useState } from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { SortableList } from '@/components/common/SortableList';
import type { HelpCategory, HelpResourceItem } from '@/types/helpCenter';
import { slugifyCategoryName, sortCategories } from './helpCenterAdmin';

interface HelpCategoryEditorProps {
  categories: HelpCategory[];
  items: HelpResourceItem[];
  onSave: (next: HelpCategory[]) => Promise<void>;
}

export const HelpCategoryEditor: React.FC<HelpCategoryEditorProps> = ({
  categories,
  items,
  onSave,
}) => {
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ordered = sortCategories(categories);

  const persist = async (next: HelpCategory[]) => {
    setError(null);
    try {
      await onSave(next.map((c, index) => ({ ...c, order: index })));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    const id = slugifyCategoryName(name);
    if (ordered.some((c) => c.id === id)) {
      setError('A category with that name already exists.');
      return;
    }
    setNewName('');
    await persist([...ordered, { id, name, order: ordered.length }]);
  };

  const handleDelete = async (category: HelpCategory) => {
    if (items.some((item) => item.categoryId === category.id)) {
      setError('Move or delete the items in this category first.');
      return;
    }
    await persist(ordered.filter((c) => c.id !== category.id));
  };

  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
      <h3 className="text-sm font-semibold text-slate-900 mb-2">Categories</h3>
      <SortableList
        items={ordered}
        getId={(category) => category.id}
        onReorder={(next) => void persist(next)}
        className="space-y-1"
        renderItem={(category, handle) => (
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1.5">
            <button
              type="button"
              aria-label={`Reorder ${category.name}`}
              className="text-slate-400 cursor-grab"
              {...handle.attributes}
              {...handle.listeners}
            >
              <GripVertical className="w-4 h-4" />
            </button>
            <input
              type="text"
              key={category.name}
              defaultValue={category.name}
              aria-label={`Category name for ${category.name}`}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (!name || name === category.name) return;
                void persist(
                  ordered.map((c) =>
                    c.id === category.id ? { ...c, name } : c
                  )
                );
              }}
              className="flex-1 text-sm text-slate-700 bg-transparent focus:outline-none"
            />
            <button
              type="button"
              aria-label={`Delete ${category.name}`}
              onClick={() => void handleDelete(category)}
              className="text-slate-400 hover:text-red-600"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      />
      <div className="flex items-center gap-2 mt-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category"
          aria-label="New category name"
          className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
        />
        <button
          type="button"
          onClick={() => void handleAdd()}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-sm"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 mt-2">
          {error}
        </p>
      )}
    </div>
  );
};
