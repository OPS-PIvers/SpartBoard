import React, { useState, useMemo } from 'react';
import {
  X,
  Triangle,
  Settings2,
  Save,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import { useAdminBuildings } from '@/hooks/useAdminBuildings';
import { useBuildingSelection } from '@/hooks/useBuildingSelection';
import { BuildingSelector } from './BuildingSelector';
import {
  BloomsTaxonomyGlobalConfig,
  BloomsTaxonomyBuildingConfig,
  FeaturePermission,
} from '@/types';
import { Toast } from '../common/Toast';
import { Modal } from '../common/Modal';
import {
  BLOOMS_LEVELS,
  BLOOMS_LABELS,
  BLOOMS_COLORS,
  CONTENT_CATEGORIES,
  CATEGORY_LABELS,
  type BloomsLevel,
  type ContentCategory,
} from '../widgets/BloomsTaxonomy/constants';
import { DEFAULT_BLOOMS_CONTENT } from '../widgets/BloomsTaxonomy/defaultContent';

const normalizeConfig = (raw: unknown): BloomsTaxonomyGlobalConfig => {
  const config = raw as BloomsTaxonomyGlobalConfig | undefined;
  return { buildingDefaults: config?.buildingDefaults ?? {} };
};

interface BloomsTaxonomyConfigurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  permission: FeaturePermission;
  onSave: (updates: Partial<FeaturePermission>) => void;
}

export const BloomsTaxonomyConfigurationModal: React.FC<
  BloomsTaxonomyConfigurationModalProps
> = ({ isOpen, onClose, permission, onSave }) => {
  const BUILDINGS = useAdminBuildings();
  const [config, setConfig] = useState<BloomsTaxonomyGlobalConfig>(() =>
    normalizeConfig(permission.config)
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] =
    useBuildingSelection(BUILDINGS);
  const [selectedLevel, setSelectedLevel] = useState<BloomsLevel>('remember');

  // Sync state if permission.config changes externally
  const [prevConfig, setPrevConfig] = useState(permission.config);
  if (permission.config !== prevConfig) {
    setPrevConfig(permission.config);
    setConfig(normalizeConfig(permission.config));
  }

  const handleSave = () => {
    setSaving(true);
    try {
      onSave({
        config: config as unknown as Record<string, unknown>,
      });
      setMessage({
        text: "Bloom's Taxonomy configuration saved!",
        type: 'success',
      });
      onClose();
    } catch (err) {
      console.error("Failed to save Bloom's Taxonomy config:", err);
      setMessage({ text: 'Failed to save configuration.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const currentBuildingConfig = useMemo(
    () =>
      config.buildingDefaults?.[selectedBuildingId] ?? {
        availableCategories: [...CONTENT_CATEGORIES],
        defaultEnabledCategories: [...CONTENT_CATEGORIES],
        aiEnabled: false,
        contentOverrides: {},
      },
    [config.buildingDefaults, selectedBuildingId]
  );

  const updateBuilding = (updates: Partial<BloomsTaxonomyBuildingConfig>) => {
    setConfig((prev) => ({
      ...prev,
      buildingDefaults: {
        ...prev.buildingDefaults,
        [selectedBuildingId]: {
          ...currentBuildingConfig,
          ...updates,
        },
      },
    }));
  };

  // Content editor helpers
  const getItemsForLevelCategory = (
    level: BloomsLevel,
    category: ContentCategory
  ): string[] => {
    return (
      currentBuildingConfig.contentOverrides?.[level]?.[category] ??
      DEFAULT_BLOOMS_CONTENT[level]?.[category] ??
      []
    );
  };

  const updateItems = (
    level: BloomsLevel,
    category: ContentCategory,
    items: string[]
  ) => {
    const overrides = {
      ...(currentBuildingConfig.contentOverrides ?? {}),
      [level]: {
        ...(currentBuildingConfig.contentOverrides?.[level] ?? {}),
        [category]: items,
      },
    };
    updateBuilding({ contentOverrides: overrides });
  };

  const addItem = (level: BloomsLevel, category: ContentCategory) => {
    const items = getItemsForLevelCategory(level, category);
    updateItems(level, category, [...items, '']);
  };

  const removeItem = (
    level: BloomsLevel,
    category: ContentCategory,
    index: number
  ) => {
    const items = getItemsForLevelCategory(level, category);
    updateItems(
      level,
      category,
      items.filter((_, i) => i !== index)
    );
  };

  const updateItem = (
    level: BloomsLevel,
    category: ContentCategory,
    index: number,
    value: string
  ) => {
    const items = getItemsForLevelCategory(level, category);
    const next = [...items];
    next[index] = value;
    updateItems(level, category, next);
  };

  const availableCategories = currentBuildingConfig.availableCategories ?? [
    ...CONTENT_CATEGORIES,
  ];
  const defaultEnabled = currentBuildingConfig.defaultEnabledCategories ?? [
    ...CONTENT_CATEGORIES,
  ];

  const toggleAvailable = (cat: ContentCategory) => {
    const next = availableCategories.includes(cat)
      ? availableCategories.filter((c) => c !== cat)
      : [...availableCategories, cat];
    updateBuilding({
      availableCategories: next,
      // Also remove from defaults if no longer available
      defaultEnabledCategories: defaultEnabled.filter((c) => next.includes(c)),
    });
  };

  const toggleDefaultEnabled = (cat: ContentCategory) => {
    const next = defaultEnabled.includes(cat)
      ? defaultEnabled.filter((c) => c !== cat)
      : [...defaultEnabled, cat];
    updateBuilding({ defaultEnabledCategories: next });
  };

  if (!isOpen) return null;

  const header = (
    <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
          <Triangle className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-800 tracking-tight">
            Bloom&apos;s Taxonomy Administration
          </h2>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
            Content, Categories & AI Settings
          </p>
        </div>
      </div>
      <button
        onClick={onClose}
        className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
      >
        <X className="w-6 h-6" />
      </button>
    </div>
  );

  const footer = (
    <div className="flex items-center justify-between w-full">
      <p className="text-xxs text-slate-400 font-bold uppercase tracking-widest">
        Building: {BUILDINGS.find((b) => b.id === selectedBuildingId)?.name}
      </p>
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="px-6 py-2.5 rounded-2xl text-sm font-black text-slate-500 hover:bg-white transition-all border border-transparent hover:border-slate-200"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-8 py-2.5 bg-indigo-600 text-white rounded-2xl text-sm font-black shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 transition-all flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" /> Save Configuration
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        maxWidth="max-w-5xl"
        customHeader={header}
        footer={footer}
        className="!p-0"
        contentClassName=""
        footerClassName="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between w-full shrink-0"
      >
        <div className="p-6 space-y-8">
          {/* Building Selector */}
          <section className="space-y-4">
            <div>
              <label className="text-xxs font-black text-slate-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
                <Settings2 className="w-3.5 h-3.5" /> Select Building to
                Configure
              </label>
              <BuildingSelector
                selectedId={selectedBuildingId}
                onSelect={setSelectedBuildingId}
                activeClassName="bg-indigo-500 text-white border-indigo-500 shadow-sm"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2 duration-300">
              {/* Left: Category & AI settings */}
              <div className="space-y-6">
                {/* Available Categories */}
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
                  <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-indigo-500" /> Available
                    Categories
                  </h4>
                  <p className="text-xs text-slate-500">
                    Which categories teachers can see in this building.
                  </p>
                  <div className="space-y-2">
                    {(CONTENT_CATEGORIES as readonly ContentCategory[]).map(
                      (cat) => (
                        <label
                          key={cat}
                          className="flex items-center gap-2 cursor-pointer text-sm text-slate-700"
                        >
                          <input
                            type="checkbox"
                            checked={availableCategories.includes(cat)}
                            onChange={() => toggleAvailable(cat)}
                            className="rounded border-slate-300 text-indigo-500 focus:ring-indigo-500"
                          />
                          {CATEGORY_LABELS[cat]}
                        </label>
                      )
                    )}
                  </div>
                </div>

                {/* Default Enabled Categories */}
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
                  <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest">
                    Default Enabled Categories
                  </h4>
                  <p className="text-xs text-slate-500">
                    Pre-selected when a teacher first adds the widget.
                  </p>
                  <div className="space-y-2">
                    {availableCategories.map((cat) => (
                      <label
                        key={cat}
                        className="flex items-center gap-2 cursor-pointer text-sm text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={defaultEnabled.includes(cat)}
                          onChange={() => toggleDefaultEnabled(cat)}
                          className="rounded border-slate-300 text-indigo-500 focus:ring-indigo-500"
                        />
                        {CATEGORY_LABELS[cat]}
                      </label>
                    ))}
                  </div>
                </div>

                {/* AI Toggle */}
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
                  <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest">
                    AI Generation
                  </h4>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={currentBuildingConfig.aiEnabled ?? false}
                      onChange={(e) =>
                        updateBuilding({ aiEnabled: e.target.checked })
                      }
                      className="rounded border-slate-300 text-indigo-500 focus:ring-indigo-500 w-5 h-5"
                    />
                    <div>
                      <p className="text-sm font-semibold text-slate-700">
                        Enable AI content generation
                      </p>
                      <p className="text-xs text-slate-500">
                        Teachers can type a topic and generate Bloom&apos;s
                        content with AI.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Right: Content Editor */}
              <div className="space-y-4">
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
                  <h4 className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-indigo-500" /> Content
                    Editor
                  </h4>
                  <p className="text-xs text-slate-500">
                    Customize items per level and category. Changes override
                    defaults.
                  </p>

                  {/* Level tabs */}
                  <div className="flex flex-wrap gap-1">
                    {BLOOMS_LEVELS.map((level) => (
                      <button
                        key={level}
                        onClick={() => setSelectedLevel(level)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                        style={
                          selectedLevel === level
                            ? {
                                backgroundColor: BLOOMS_COLORS[level],
                                color: 'white',
                              }
                            : {
                                backgroundColor: 'transparent',
                                color: BLOOMS_COLORS[level],
                                border: `1px solid ${BLOOMS_COLORS[level]}40`,
                              }
                        }
                      >
                        {BLOOMS_LABELS[level]}
                      </button>
                    ))}
                  </div>

                  {/* Category content for selected level */}
                  <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
                    {(CONTENT_CATEGORIES as readonly ContentCategory[]).map(
                      (cat) => {
                        const items = getItemsForLevelCategory(
                          selectedLevel,
                          cat
                        );
                        return (
                          <div
                            key={cat}
                            className="bg-white p-3 rounded-xl border border-slate-200 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <h5 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                                {CATEGORY_LABELS[cat]}
                              </h5>
                              <button
                                onClick={() => addItem(selectedLevel, cat)}
                                className="p-1 text-indigo-500 hover:bg-indigo-50 rounded transition-colors"
                                title="Add item"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            {items.map((item, idx) => (
                              <div
                                key={idx}
                                className="flex items-center gap-1"
                              >
                                <input
                                  type="text"
                                  value={item}
                                  onChange={(e) =>
                                    updateItem(
                                      selectedLevel,
                                      cat,
                                      idx,
                                      e.target.value
                                    )
                                  }
                                  className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 text-slate-700 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none"
                                />
                                <button
                                  onClick={() =>
                                    removeItem(selectedLevel, cat, idx)
                                  }
                                  className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="Remove item"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                            {items.length === 0 && (
                              <p className="text-xs text-slate-400 italic">
                                No items. Click + to add.
                              </p>
                            )}
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </Modal>
      {message && (
        <Toast
          message={message.text}
          type={message.type}
          onClose={() => setMessage(null)}
        />
      )}
    </>
  );
};
