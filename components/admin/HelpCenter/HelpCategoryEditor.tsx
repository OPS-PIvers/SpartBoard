import React, { useState } from 'react';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { SortableList } from '@/components/common/SortableList';
import { useDialog } from '@/context/useDialog';
import type { HelpCategory, HelpResourceItem } from '@/types/helpCenter';
import { slugifyCategoryName, sortCategories } from './helpCenterAdmin';

interface HelpCategoriesDialogProps {
  categories: HelpCategory[];
  items: HelpResourceItem[];
  onSave: (next: HelpCategory[]) => Promise<void>;
  /** Removes the category and makes its items Unfiled. */
  onDelete: (category: HelpCategory, rest: HelpCategory[]) => Promise<void>;
  onClose: () => void;
}

/** Add, rename, reorder and delete Help Center categories (super admins). */
export const HelpCategoriesDialog: React.FC<HelpCategoriesDialogProps> = ({
  categories,
  items,
  onSave,
  onDelete,
  onClose,
}) => {
  const { showConfirm } = useDialog();
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ordered = sortCategories(categories);
  const renumber = (next: HelpCategory[]) =>
    next.map((c, index) => ({ ...c, order: index }));

  const run = async (work: () => Promise<void>) => {
    setError(null);
    try {
      await work();
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
    await run(() =>
      onSave(renumber([...ordered, { id, name, order: ordered.length }]))
    );
  };

  const handleDelete = async (category: HelpCategory) => {
    const count = items.filter(
      (item) => item.categoryId === category.id
    ).length;
    const confirmed = await showConfirm(
      count > 0
        ? `Delete "${category.name}"? Its ${count} ${count === 1 ? 'item becomes' : 'items become'} Unfiled and hidden.`
        : `Delete "${category.name}"?`,
      { variant: 'danger', confirmLabel: 'Delete' }
    );
    if (!confirmed) return;
    await run(() =>
      onDelete(
        category,
        renumber(ordered.filter((c) => c.id !== category.id))
      )
    );
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Categories"
      maxWidth="max-w-lg"
    >
      <div className="space-y-3">
        <SortableList
          items={ordered}
          getId={(category) => category.id}
          onReorder={(next) => void run(() => onSave(renumber(next)))}
          className="divide-y divide-slate-100"
          renderItem={(category, handle) => (
            <div className="flex items-center gap-2 bg-white py-1">
              <button
                type="button"
                aria-label={`Reorder ${category.name}`}
                {...tourFieldAttr(
                  'admin.help-center.category-reorder',
                  'help',
                  category.id
                )}
                className="flex h-11 w-8 shrink-0 items-center justify-center text-slate-400 cursor-grab"
                {...handle.attributes}
                {...handle.listeners}
              >
                <GripVertical className="w-4 h-4" aria-hidden="true" />
              </button>
              <input
                type="text"
                key={category.name}
                defaultValue={category.name}
                aria-label={`Name of ${category.name}`}
                {...tourFieldAttr(
                  'admin.help-center.category-rename',
                  'help',
                  category.id
                )}
                onBlur={(e) => {
                  const name = e.target.value.trim();
                  if (!name || name === category.name) return;
                  void run(() =>
                    onSave(
                      ordered.map((c) =>
                        c.id === category.id ? { ...c, name } : c
                      )
                    )
                  );
                }}
                className="h-11 min-w-0 flex-1 rounded-lg bg-transparent px-2 text-sm text-slate-800 focus:bg-white focus:outline-hidden focus:ring-[3px] focus:ring-brand-blue-primary/30"
              />
              <button
                type="button"
                aria-label={`Delete ${category.name}`}
                {...tourFieldAttr(
                  'admin.help-center.category-delete',
                  'help',
                  category.id
                )}
                onClick={() => void handleDelete(category)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:text-red-600 focus:outline-hidden focus-visible:ring-[3px] focus-visible:ring-brand-blue-primary/30"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          )}
        />
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleAdd();
          }}
        >
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New category"
            aria-label="New category name"
            {...tourAttr('admin.help-center.category-name')}
            className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm focus:outline-hidden focus:border-brand-blue-primary focus:ring-[3px] focus:ring-brand-blue-primary/30"
          />
          <button
            type="submit"
            disabled={!newName.trim()}
            {...tourAttr('admin.help-center.category-add')}
            className="flex h-11 items-center gap-1 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add
          </button>
        </form>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
};
