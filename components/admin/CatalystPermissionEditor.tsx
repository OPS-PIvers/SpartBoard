import React, { useState, useEffect, useRef } from 'react';
import {
  CatalystGlobalConfig,
  CatalystCategory,
  CatalystRoutine,
} from '@/types';
import { CATALYST_ROUTINES } from '@/config/catalystRoutines';
import { DEFAULT_CATALYST_CATEGORIES } from '@/config/catalystDefaults';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import {
  renderCatalystIcon,
  isSafeIconUrl,
  mergeCatalystCategories,
  mergeCatalystRoutines,
} from '@/components/widgets/Catalyst';
import { CategoryEditor } from './catalyst/CategoryEditor';
import { RoutineEditor } from './catalyst/RoutineEditor';
import { useStorage } from '@/hooks/useStorage';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';

/**
 * Compares two categories for equality by comparing relevant fields explicitly.
 */
const areCategoriesEqual = (
  a: CatalystCategory,
  b: CatalystCategory
): boolean => {
  return (
    a.id === b.id &&
    a.label === b.label &&
    a.icon === b.icon &&
    a.color === b.color &&
    (a.imageUrl ?? '') === (b.imageUrl ?? '')
  );
};

/**
 * Compares two routines for equality by comparing relevant fields explicitly.
 */
const areRoutinesEqual = (a: CatalystRoutine, b: CatalystRoutine): boolean => {
  // Compare primitive fields
  if (
    a.id !== b.id ||
    a.title !== b.title ||
    a.shortDesc !== b.shortDesc ||
    a.icon !== b.icon ||
    a.category !== b.category
  ) {
    return false;
  }

  // Compare instructions string
  if (a.instructions !== b.instructions) {
    return false;
  }

  // Compare associatedWidgets array
  if (a.associatedWidgets?.length !== b.associatedWidgets?.length) {
    return false;
  }
  if (a.associatedWidgets && b.associatedWidgets) {
    for (let i = 0; i < a.associatedWidgets.length; i++) {
      const aWidget = a.associatedWidgets[i];
      const bWidget = b.associatedWidgets[i];
      if (
        aWidget.id !== bWidget.id ||
        aWidget.type !== bWidget.type ||
        JSON.stringify(aWidget.config) !== JSON.stringify(bWidget.config)
      ) {
        return false;
      }
    }
  }

  return true;
};

interface CatalystPermissionEditorProps {
  config?: CatalystGlobalConfig;
  onChange: (newConfig: CatalystGlobalConfig) => void;
  onShowMessage: (type: 'success' | 'error', text: string) => void;
}

export const CatalystPermissionEditor: React.FC<
  CatalystPermissionEditorProps
> = ({ config, onChange, onShowMessage }) => {
  // Track the previous config to detect changes
  const prevConfigRef = useRef<CatalystGlobalConfig | undefined>(config);
  const { uploadFile } = useStorage();
  const { user } = useAuth();
  const { showConfirm } = useDialog();

  const handleUploadImage = async (file: File): Promise<string> => {
    const uid = user?.uid ?? 'admin';
    const uniqueId = crypto.randomUUID();
    return uploadFile(
      `admin_catalyst_icons/${uid}/${uniqueId}-${file.name}`,
      file
    );
  };

  // Initialize state using shared helper functions
  const [categories, setCategories] = useState<CatalystCategory[]>(() =>
    mergeCatalystCategories(config ?? {})
  );

  const [routines, setRoutines] = useState<CatalystRoutine[]>(() =>
    mergeCatalystRoutines(config ?? {})
  );

  const [activeTab, setActiveTab] = useState<'categories' | 'routines'>(
    'categories'
  );
  const [editingCategory, setEditingCategory] =
    useState<CatalystCategory | null>(null);
  const [editingRoutine, setEditingRoutine] = useState<CatalystRoutine | null>(
    null
  );

  // Sync local state when config prop changes (e.g., updated by another admin)
  useEffect(() => {
    // Only update if config reference changed
    if (config !== prevConfigRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Legitimate use: syncing external Firestore updates
      setCategories(mergeCatalystCategories(config ?? {}));
      setRoutines(mergeCatalystRoutines(config ?? {}));
      prevConfigRef.current = config;
    }
  }, [config]);

  const saveConfig = (
    newCategories: CatalystCategory[],
    newRoutines: CatalystRoutine[]
  ) => {
    // Compute diffs: only save overrides/additions vs defaults using proper equality comparison
    const categoryDiffs = newCategories.filter((cat) => {
      const defaultCat = DEFAULT_CATALYST_CATEGORIES.find(
        (c) => c.id === cat.id
      );
      return !defaultCat || !areCategoriesEqual(cat, defaultCat);
    });

    const routineDiffs = newRoutines.filter((routine) => {
      const defaultRoutine = CATALYST_ROUTINES.find((r) => r.id === routine.id);
      return !defaultRoutine || !areRoutinesEqual(routine, defaultRoutine);
    });

    // Track removed default categories and routines as tombstones
    const newCategoryIds = new Set(newCategories.map((c) => c.id));
    const removedCategoryIds = DEFAULT_CATALYST_CATEGORIES.filter(
      (c) => !newCategoryIds.has(c.id)
    ).map((c) => c.id);

    const newRoutineIds = new Set(newRoutines.map((r) => r.id));
    const removedRoutineIds = CATALYST_ROUTINES.filter(
      (r) => !newRoutineIds.has(r.id)
    ).map((r) => r.id);

    onChange({
      customCategories: categoryDiffs.length > 0 ? categoryDiffs : undefined,
      customRoutines: routineDiffs.length > 0 ? routineDiffs : undefined,
      removedCategoryIds:
        removedCategoryIds.length > 0 ? removedCategoryIds : undefined,
      removedRoutineIds:
        removedRoutineIds.length > 0 ? removedRoutineIds : undefined,
    });
  };

  const handleSaveCategory = (category: CatalystCategory) => {
    let newCategories;
    if (categories.find((c) => c.id === category.id)) {
      newCategories = categories.map((c) =>
        c.id === category.id ? category : c
      );
    } else {
      newCategories = [...categories, category];
    }
    setCategories(newCategories);
    setEditingCategory(null);
    saveConfig(newCategories, routines);
    onShowMessage('success', 'Category saved');
  };

  const handleDeleteCategory = async (id: string) => {
    const isCategoryInUse = routines.some((r) => r.category === id);
    if (isCategoryInUse) {
      onShowMessage(
        'error',
        'Cannot delete category in use by routines. Reassign or delete routines first.'
      );
      return;
    }

    const confirmed = await showConfirm('Delete this category?', {
      title: 'Delete Category',
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    if (confirmed) {
      const newCategories = categories.filter((c) => c.id !== id);
      setCategories(newCategories);
      saveConfig(newCategories, routines);
      onShowMessage('success', 'Category deleted');
    }
  };

  const handleSaveRoutine = (routine: CatalystRoutine) => {
    let newRoutines;
    if (routines.find((r) => r.id === routine.id)) {
      newRoutines = routines.map((r) => (r.id === routine.id ? routine : r));
    } else {
      newRoutines = [...routines, routine];
    }
    setRoutines(newRoutines);
    setEditingRoutine(null);
    saveConfig(categories, newRoutines);
    onShowMessage('success', 'Routine saved');
  };

  const handleDeleteRoutine = async (id: string) => {
    const confirmed = await showConfirm('Delete this routine?', {
      title: 'Delete Routine',
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    if (confirmed) {
      const newRoutines = routines.filter((r) => r.id !== id);
      setRoutines(newRoutines);
      saveConfig(categories, newRoutines);
      onShowMessage('success', 'Routine deleted');
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 rounded-lg border border-slate-200 overflow-hidden min-h-[500px]">
      {/* Tab Nav */}
      <div className="flex gap-2 p-2 bg-white border-b border-slate-200">
        <button
          onClick={() => setActiveTab('categories')}
          className={`flex-1 py-2 text-center text-sm font-bold uppercase rounded-lg transition-colors ${
            activeTab === 'categories'
              ? 'bg-indigo-100 text-indigo-700'
              : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          Categories
        </button>
        <button
          onClick={() => setActiveTab('routines')}
          className={`flex-1 py-2 text-center text-sm font-bold uppercase rounded-lg transition-colors ${
            activeTab === 'routines'
              ? 'bg-indigo-100 text-indigo-700'
              : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          Routines
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {activeTab === 'categories' ? (
          <div className="space-y-4">
            <button
              onClick={() =>
                setEditingCategory({
                  id: crypto.randomUUID(),
                  label: 'New Category',
                  icon: 'LayoutGrid',
                  color: 'bg-indigo-500',
                  isCustom: true,
                })
              }
              className="w-full py-3 border-2 border-dashed border-indigo-200 text-indigo-500 rounded-xl font-bold uppercase text-xs flex items-center justify-center gap-2 hover:bg-indigo-50 transition-colors"
            >
              <Plus size={16} /> Add Category
            </button>

            <div className="grid grid-cols-1 gap-3">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl shadow-sm"
                >
                  {cat.imageUrl && isSafeIconUrl(cat.imageUrl) ? (
                    <img
                      src={cat.imageUrl}
                      alt={cat.label}
                      className="w-10 h-10 rounded-lg object-cover shrink-0"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div
                      className={`w-10 h-10 rounded-lg ${cat.color} flex items-center justify-center text-white shrink-0`}
                    >
                      {renderCatalystIcon(cat.icon, 20)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-700 text-sm truncate">
                      {cat.label}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      aria-label="Edit Category"
                      onClick={() => setEditingCategory(cat)}
                      className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg hover:text-indigo-600"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      aria-label="Delete Category"
                      onClick={() => handleDeleteCategory(cat.id)}
                      className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg hover:text-red-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              onClick={() =>
                setEditingRoutine({
                  id: crypto.randomUUID(),
                  title: 'New Routine',
                  category: categories[0]?.id || '',
                  icon: 'Zap',
                  shortDesc: '',
                  instructions: '',
                  associatedWidgets: [],
                })
              }
              disabled={categories.length === 0}
              className="w-full py-3 border-2 border-dashed border-indigo-200 text-indigo-500 rounded-xl font-bold uppercase text-xs flex items-center justify-center gap-2 hover:bg-indigo-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              <Plus size={16} /> Add Routine
            </button>

            <div className="space-y-6">
              {categories.map((cat) => {
                const catRoutines = routines.filter(
                  (r) => r.category === cat.id
                );
                if (catRoutines.length === 0) return null;

                return (
                  <div key={cat.id}>
                    <h3 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-2 px-1">
                      {cat.label}
                    </h3>
                    <div className="space-y-2">
                      {catRoutines.map((routine) => (
                        <div
                          key={routine.id}
                          className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-indigo-300 transition-colors"
                        >
                          <div className="p-2 bg-slate-100 rounded-lg text-slate-500">
                            {renderCatalystIcon(routine.icon, 18)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-slate-700 text-sm truncate">
                              {routine.title}
                            </div>
                            <div className="text-xxs text-slate-400 truncate">
                              {routine.shortDesc}
                            </div>
                          </div>
                          <button
                            aria-label="Edit Routine"
                            onClick={() => setEditingRoutine(routine)}
                            className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg hover:text-indigo-600"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            aria-label="Delete Routine"
                            onClick={() => handleDeleteRoutine(routine.id)}
                            className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg hover:text-red-600"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <CategoryEditor
        category={editingCategory}
        categories={categories}
        onSave={handleSaveCategory}
        onCancel={() => setEditingCategory(null)}
        onShowMessage={onShowMessage}
        onUploadImage={handleUploadImage}
      />
      <RoutineEditor
        routine={editingRoutine}
        routines={routines}
        categories={categories}
        onSave={handleSaveRoutine}
        onCancel={() => setEditingRoutine(null)}
        onShowMessage={onShowMessage}
        onUploadImage={handleUploadImage}
      />
    </div>
  );
};
