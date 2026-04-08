import React, { useMemo, useState } from 'react';
import * as LucideIcons from 'lucide-react';
import { BUILDINGS } from '@/config/buildings';
import { BuildingSelector } from './BuildingSelector';
import {
  MaterialDefinition,
  MaterialsGlobalConfig,
  BuildingMaterialsDefaults,
} from '@/types';
import {
  MATERIAL_COLOR_OPTIONS,
  MATERIAL_ICON_OPTIONS,
  getMaterialsCatalog,
  resolveMaterialIcon,
} from '../widgets/MaterialsWidget/constants';
import { IconPicker } from '@/components/widgets/InstructionalRoutines/IconPicker';
import { Button } from '@/components/common/Button';
import { Plus, Trash2, Search } from 'lucide-react';
import { Card } from '@/components/common/Card';

interface MaterialsConfigurationPanelProps {
  config: MaterialsGlobalConfig;
  onChange: (newConfig: MaterialsGlobalConfig) => void;
}

const EMPTY_DRAFT: Omit<MaterialDefinition, 'id'> = {
  label: '',
  icon: 'Backpack',
  color: MATERIAL_COLOR_OPTIONS[0],
};

export const MaterialsConfigurationPanel: React.FC<
  MaterialsConfigurationPanelProps
> = ({ config, onChange }) => {
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>(
    BUILDINGS[0].id
  );
  const [draft, setDraft] =
    useState<Omit<MaterialDefinition, 'id'>>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [iconQuery, setIconQuery] = useState('');

  const buildingDefaults = config.buildingDefaults ?? {};
  const customMaterials = config.customMaterials ?? [];
  const currentBuildingConfig: BuildingMaterialsDefaults = buildingDefaults[
    selectedBuildingId
  ] ?? {
    buildingId: selectedBuildingId,
    selectedItems: [],
  };

  const selectedItems = new Set(currentBuildingConfig.selectedItems ?? []);
  const materialsCatalog = useMemo(() => getMaterialsCatalog(config), [config]);
  const customMaterialIds = new Set(
    customMaterials.map((material) => material.id)
  );

  const filteredFallbackIcons = useMemo(() => {
    const ignoredKeys = new Set(['createLucideIcon', 'Icon']);
    const allIconNames = Object.keys(LucideIcons)
      .filter(
        (iconName) => /^[A-Z]/.test(iconName) && !ignoredKeys.has(iconName)
      )
      .sort((a, b) => a.localeCompare(b));
    const query = iconQuery.trim().toLowerCase();
    if (!query) return [];
    return allIconNames.filter((iconName) =>
      iconName.toLowerCase().includes(query)
    );
  }, [iconQuery]);

  const handleUpdateBuilding = (
    updates: Partial<BuildingMaterialsDefaults>
  ) => {
    onChange({
      ...config,
      buildingDefaults: {
        ...buildingDefaults,
        [selectedBuildingId]: {
          ...currentBuildingConfig,
          ...updates,
        },
      },
    });
  };

  const updateAllBuildingAssignments = (
    nextCustomMaterials: MaterialDefinition[]
  ) => {
    const validIds = new Set([
      ...getMaterialsCatalog({
        ...config,
        customMaterials: nextCustomMaterials,
      }).map((material) => material.id),
    ]);

    const nextBuildingDefaults = Object.fromEntries(
      Object.entries(buildingDefaults).map(([buildingId, defaults]) => [
        buildingId,
        {
          ...defaults,
          selectedItems: (defaults.selectedItems ?? []).filter((id) =>
            validIds.has(id)
          ),
        },
      ])
    );

    onChange({
      ...config,
      customMaterials: nextCustomMaterials,
      buildingDefaults: nextBuildingDefaults,
    });
  };

  const resetDraft = () => {
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
    setIconQuery('');
  };

  const startEditing = (material: MaterialDefinition) => {
    setDraft({
      label: material.label,
      icon: material.icon,
      color: material.color,
      textColor: material.textColor,
    });
    setEditingId(material.id);
    setIconQuery('');
  };

  const saveCustomMaterial = () => {
    const trimmedLabel = draft.label.trim();
    if (!trimmedLabel) return;

    const nextMaterial: MaterialDefinition = {
      id:
        editingId ??
        `custom-${trimmedLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomUUID().slice(0, 8)}`,
      label: trimmedLabel,
      icon: draft.icon,
      color: draft.color,
      textColor: draft.textColor,
    };

    const nextCustomMaterials = editingId
      ? customMaterials.map((material) =>
          material.id === editingId ? nextMaterial : material
        )
      : [...customMaterials, nextMaterial];

    updateAllBuildingAssignments(nextCustomMaterials);
    resetDraft();
  };

  const removeCustomMaterial = (materialId: string) => {
    updateAllBuildingAssignments(
      customMaterials.filter((material) => material.id !== materialId)
    );
    if (editingId === materialId) {
      resetDraft();
    }
  };

  const toggleItem = (id: string) => {
    const next = new Set(selectedItems);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    handleUpdateBuilding({ selectedItems: Array.from(next) });
  };

  const isAllSelected = selectedItems.size === materialsCatalog.length;

  const toggleAll = () => {
    if (isAllSelected) {
      handleUpdateBuilding({ selectedItems: [] });
    } else {
      handleUpdateBuilding({
        selectedItems: materialsCatalog.map((item) => item.id),
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <label className="text-xxs font-bold text-slate-500 uppercase mb-1 block">
              Custom Materials Library
            </label>
            <p className="text-xxs text-slate-400 leading-tight">
              Create reusable materials here, then assign them to one or more
              buildings below.
            </p>
          </div>
          {editingId && (
            <Button variant="ghost" size="sm" onClick={resetDraft}>
              Cancel Edit
            </Button>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <div className="space-y-2">
                <label className="text-xxs font-bold uppercase tracking-widest text-slate-500 block">
                  Material Name
                </label>
                <input
                  type="text"
                  value={draft.label}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      label: e.target.value,
                    }))
                  }
                  placeholder="Glue sticks"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-blue-primary"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xxs font-bold uppercase tracking-widest text-slate-500 block">
                  Icon
                </label>
                <div className="flex items-center gap-2">
                  <IconPicker
                    currentIcon={draft.icon}
                    onSelect={(icon) =>
                      setDraft((current) => ({ ...current, icon }))
                    }
                    color="blue"
                  />
                  <span className="text-xs font-medium text-slate-500">
                    {draft.icon}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xxs font-bold uppercase tracking-widest text-slate-500 block">
                Suggested Icons
              </label>
              <div className="flex flex-wrap gap-2">
                {MATERIAL_ICON_OPTIONS.map((iconName) => {
                  const Icon = resolveMaterialIcon(iconName);
                  const isActive = draft.icon === iconName;
                  return (
                    <button
                      key={iconName}
                      type="button"
                      onClick={() =>
                        setDraft((current) => ({ ...current, icon: iconName }))
                      }
                      className={`rounded-xl border p-2 transition-colors ${
                        isActive
                          ? 'border-brand-blue-primary bg-brand-blue-lighter text-brand-blue-dark'
                          : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                      }`}
                      title={iconName}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xxs font-bold uppercase tracking-widest text-slate-500 block">
                Search Full Lucide Set
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={iconQuery}
                  onChange={(e) => setIconQuery(e.target.value)}
                  placeholder="Search more icons..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-blue-primary"
                />
              </div>
              {filteredFallbackIcons.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {filteredFallbackIcons.map((iconName) => {
                    const Icon = resolveMaterialIcon(iconName);
                    return (
                      <button
                        key={iconName}
                        type="button"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            icon: iconName,
                          }))
                        }
                        className={`rounded-xl border p-2 transition-colors ${
                          draft.icon === iconName
                            ? 'border-brand-blue-primary bg-brand-blue-lighter text-brand-blue-dark'
                            : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                        }`}
                        title={iconName}
                      >
                        <Icon className="h-4 w-4" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-xxs font-bold uppercase tracking-widest text-slate-500 block">
                Color
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {MATERIAL_COLOR_OPTIONS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() =>
                      setDraft((current) => ({ ...current, color }))
                    }
                    className={`h-7 w-7 rounded-full border-2 transition-transform ${
                      draft.color === color
                        ? 'scale-110 border-slate-800'
                        : 'border-white hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
                <input
                  type="color"
                  aria-label="Material color"
                  value={draft.color}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      color: e.target.value,
                    }))
                  }
                  className="h-9 w-9 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                variant="primary"
                size="sm"
                onClick={saveCustomMaterial}
                disabled={!draft.label.trim()}
              >
                <Plus className="h-4 w-4" />
                {editingId ? 'Save Material' : 'Add Material'}
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label className="text-xxs font-bold uppercase tracking-widest text-slate-500 block">
                Admin-Created Materials
              </label>
              <span className="text-xxs text-slate-400">
                {customMaterials.length} custom
              </span>
            </div>

            {customMaterials.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-400">
                No custom materials yet.
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                {customMaterials.map((material) => {
                  const resolvedMaterial = materialsCatalog.find(
                    (entry) => entry.id === material.id
                  );
                  if (!resolvedMaterial) return null;

                  const Icon = resolvedMaterial.iconComponent;

                  return (
                    <div
                      key={material.id}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"
                    >
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-xl"
                        style={{
                          backgroundColor: resolvedMaterial.color,
                          color: resolvedMaterial.textColor,
                        }}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold text-slate-700">
                          {material.label}
                        </div>
                        <div className="truncate text-xxs text-slate-400">
                          {material.icon}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEditing(material)}
                      >
                        Edit
                      </Button>
                      <button
                        type="button"
                        onClick={() => removeCustomMaterial(material.id)}
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                        aria-label={`Remove ${material.label}`}
                        title={`Remove ${material.label}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div>
        <label className="text-xxs font-bold text-slate-500 uppercase mb-2 block">
          Configure Building Materials Defaults
        </label>
        <BuildingSelector
          selectedId={selectedBuildingId}
          onSelect={setSelectedBuildingId}
        />
      </div>

      <Card rounded="xl" className="bg-slate-50 space-y-4">
        <p className="text-xxs text-slate-500 leading-tight">
          These materials will be available to teachers in{' '}
          <b>{BUILDINGS.find((b) => b.id === selectedBuildingId)?.name}</b> when
          they add a Materials widget. Built-in materials always remain
          available here; custom materials can be assigned per building.
        </p>

        <div className="flex items-center justify-between">
          <label className="text-xxs font-bold text-slate-500 uppercase block">
            Available Materials ({selectedItems.size}/{materialsCatalog.length}{' '}
            selected)
          </label>
          <button
            type="button"
            onClick={toggleAll}
            className="text-xxs font-bold text-brand-blue-primary hover:text-brand-blue-dark transition-colors"
          >
            {isAllSelected ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {materialsCatalog.map((item) => {
            const isSelected = selectedItems.has(item.id);
            const Icon = item.iconComponent;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleItem(item.id)}
                className={`flex items-center gap-2 rounded-lg border p-2 text-left transition-colors ${
                  isSelected
                    ? 'border-brand-blue-primary shadow-sm ring-1 ring-brand-blue-primary/20'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
                style={{
                  backgroundColor: isSelected ? '#dbeafe' : undefined,
                }}
              >
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: item.color,
                    color: item.textColor,
                  }}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-slate-700">
                    {item.label}
                  </span>
                  {customMaterialIds.has(item.id) && (
                    <span className="block text-xxs uppercase tracking-wide text-slate-400">
                      Custom
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {selectedItems.size === 0 && (
          <p className="text-xxs text-slate-400 italic text-center">
            No materials selected. Teachers will see no assigned materials until
            this building is configured.
          </p>
        )}
      </Card>
    </div>
  );
};
