import React, { useId } from 'react';
import {
  WidgetData,
  MaterialsConfig,
  MaterialsGlobalConfig,
  MaterialDefinition,
  WidgetConfig,
} from '@/types';
import { useDashboard } from '@/context/useDashboard';
import {
  MAX_TEACHER_MATERIALS,
  buildMaterialSnapshots,
  createTeacherMaterialId,
  getMaterialsCatalog,
} from './constants';
import { CustomMaterialForm } from './CustomMaterialForm';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import {
  Type,
  Palette,
  Edit3,
  Pencil,
  Plus,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  forgetMaterial,
  preferencesFromConfig,
} from '@/utils/materialsPreferences';
import { WIDGET_PALETTE } from '@/config/colors';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';

type FormState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; materialId: string };

export const MaterialsSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, dashboards, updateWidgetConfigsAcrossBoards } =
    useDashboard();
  const {
    featurePermissions,
    customMaterials,
    saveCustomMaterials,
    materialsPreferences,
    saveMaterialsPreferences,
  } = useAuth();
  const { showConfirm } = useDialog();
  const buildingId = useWidgetBuildingId(widget);
  const config = widget.config as MaterialsConfig;
  const availableMaterialsLabelId = useId();
  const typographyLabelId = useId();
  const titleTextId = useId();
  const titleColorLabelId = useId();
  const [form, setForm] = React.useState<FormState>({ mode: 'closed' });
  const [showHidden, setShowHidden] = React.useState(false);
  const {
    selectedItems = [],
    activeItems = [],
    title = 'What you need',
    titleFont = 'global',
    titleColor = '#2d3f89',
    customMaterialSnapshots,
  } = config;
  const permission = featurePermissions.find(
    (item) => item.widgetType === 'materials'
  );
  const materialsConfig = permission?.config as Partial<MaterialsGlobalConfig>;
  const buildingAssignedIds = buildingId
    ? materialsConfig.buildingDefaults?.[buildingId]?.selectedItems
    : undefined;

  const catalogOptions = React.useMemo(
    () => ({
      teacherMaterials: customMaterials,
      snapshots: customMaterialSnapshots,
    }),
    [customMaterials, customMaterialSnapshots]
  );

  // Displayed catalog: the building allowlist gates built-ins and admin customs,
  // but never the teacher's own materials.
  const materialsCatalog = React.useMemo(
    () =>
      getMaterialsCatalog(materialsConfig, {
        ...catalogOptions,
        allowedIds: buildingAssignedIds,
      }),
    [buildingAssignedIds, catalogOptions, materialsConfig]
  );

  // Unfiltered catalog, used only to resolve snapshots so an allowlist can never
  // silently drop the definition of a material this widget already references.
  const snapshotCatalog = React.useMemo(
    () => getMaterialsCatalog(materialsConfig, catalogOptions),
    [catalogOptions, materialsConfig]
  );

  const hiddenMaterialIds = React.useMemo(
    () => materialsPreferences.hiddenMaterialIds ?? [],
    [materialsPreferences.hiddenMaterialIds]
  );
  const hiddenSet = React.useMemo(
    () => new Set(hiddenMaterialIds),
    [hiddenMaterialIds]
  );
  // Hidden rows leave the picker and live in their own collapsed section.
  const visibleCatalog = React.useMemo(
    () => materialsCatalog.filter((item) => !hiddenSet.has(item.id)),
    [hiddenSet, materialsCatalog]
  );
  const hiddenCatalog = React.useMemo(
    () => materialsCatalog.filter((item) => hiddenSet.has(item.id)),
    [hiddenSet, materialsCatalog]
  );

  const teacherMaterialIds = React.useMemo(
    () => new Set(customMaterials.map((material) => material.id)),
    [customMaterials]
  );

  const selectedSet = React.useMemo(
    () => new Set(selectedItems),
    [selectedItems]
  );

  const allowTeacherMaterials =
    materialsConfig?.allowTeacherMaterials !== false;
  const atMaterialCap = customMaterials.length >= MAX_TEACHER_MATERIALS;

  // Rewrites the snapshot list from whatever the config now references.
  const withSnapshots = React.useCallback(
    (next: MaterialsConfig): MaterialsConfig => ({
      ...next,
      customMaterialSnapshots: buildMaterialSnapshots(
        [...next.selectedItems, ...next.activeItems],
        snapshotCatalog
      ),
    }),
    [snapshotCatalog]
  );

  // Every settings write also refreshes the account-wide defaults that seed
  // the next Materials widget on any board.
  const commitConfig = (
    next: MaterialsConfig,
    nextHiddenIds: string[] = hiddenMaterialIds
  ) => {
    updateWidget(widget.id, { config: next });
    saveMaterialsPreferences({
      ...preferencesFromConfig(materialsPreferences, next),
      hiddenMaterialIds: nextHiddenIds,
    });
  };

  const applySelection = (
    nextSelected: string[],
    nextActive: string[],
    nextHiddenIds?: string[]
  ) => {
    commitConfig(
      withSnapshots({
        ...config,
        selectedItems: nextSelected,
        activeItems: nextActive,
      }),
      nextHiddenIds
    );
  };

  const hideMaterial = (id: string) => {
    applySelection(
      selectedItems.filter((selectedId) => selectedId !== id),
      activeItems.filter((activeId) => activeId !== id),
      [...hiddenMaterialIds.filter((hidden) => hidden !== id), id]
    );
  };

  const unhideMaterial = (id: string) => {
    saveMaterialsPreferences({
      ...materialsPreferences,
      hiddenMaterialIds: hiddenMaterialIds.filter((hidden) => hidden !== id),
    });
  };

  const toggleItem = (id: string) => {
    const newSelected = new Set(selectedSet);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }

    applySelection(
      Array.from(newSelected),
      activeItems.filter((activeId: string) => newSelected.has(activeId))
    );
  };

  const isAllSelected =
    visibleCatalog.length > 0 &&
    visibleCatalog.every((item) => selectedSet.has(item.id));

  const toggleAll = () => {
    if (isAllSelected) {
      applySelection([], []);
    } else {
      applySelection(
        visibleCatalog.map((i) => i.id),
        activeItems
      );
    }
  };

  const handleSaveMaterial = (draft: Omit<MaterialDefinition, 'id'>) => {
    if (form.mode === 'edit') {
      const next = customMaterials.map((material) =>
        material.id === form.materialId
          ? { ...draft, id: form.materialId }
          : material
      );
      void saveCustomMaterials(next);
      setForm({ mode: 'closed' });
      return;
    }

    if (atMaterialCap) return;
    const created: MaterialDefinition = {
      ...draft,
      id: createTeacherMaterialId(),
    };
    void saveCustomMaterials([...customMaterials, created]);
    // Selected but not active — creating a material must not change what is projected.
    applySelection([...selectedItems, created.id], activeItems);
    setForm({ mode: 'closed' });
  };

  const countWidgetsUsing = (materialId: string) =>
    dashboards.reduce(
      (total, dashboard) =>
        total +
        dashboard.widgets.filter((w) => {
          if (w.type !== 'materials') return false;
          const widgetConfig = w.config as MaterialsConfig;
          return (
            (widgetConfig.selectedItems ?? []).includes(materialId) ||
            (widgetConfig.activeItems ?? []).includes(materialId)
          );
        }).length,
      0
    );

  const handleDeleteMaterial = async (materialId: string) => {
    const material = customMaterials.find((item) => item.id === materialId);
    if (!material) return;

    const usageCount = countWidgetsUsing(materialId);
    const usageNote =
      usageCount > 0
        ? ` It is used on ${usageCount} widget${usageCount === 1 ? '' : 's'} and will be removed from ${usageCount === 1 ? 'it' : 'them'}.`
        : '';
    const confirmed = await showConfirm(
      `Delete “${material.label}”?${usageNote}`,
      { title: 'Delete Material', variant: 'danger', confirmLabel: 'Delete' }
    );
    if (!confirmed) return;

    setForm({ mode: 'closed' });
    await saveCustomMaterials(
      customMaterials.filter((item) => item.id !== materialId)
    );
    saveMaterialsPreferences(forgetMaterial(materialsPreferences, materialId));
    // updateWidgetConfigsAcrossBoards handles and toasts its own save
    // failures internally (see DashboardContext.tsx) — it never rejects.
    await updateWidgetConfigsAcrossBoards('materials', (widgetConfig) => {
      const materialsWidgetConfig = widgetConfig as MaterialsConfig;
      const selected = materialsWidgetConfig.selectedItems ?? [];
      const active = materialsWidgetConfig.activeItems ?? [];
      const snapshots = materialsWidgetConfig.customMaterialSnapshots ?? [];
      const isReferenced =
        selected.includes(materialId) ||
        active.includes(materialId) ||
        snapshots.some((snapshot) => snapshot.id === materialId);
      if (!isReferenced) return null;

      return {
        ...materialsWidgetConfig,
        selectedItems: selected.filter((id) => id !== materialId),
        activeItems: active.filter((id) => id !== materialId),
        customMaterialSnapshots: snapshots.filter(
          (snapshot) => snapshot.id !== materialId
        ),
      } as WidgetConfig;
    });
  };

  const editingMaterial =
    form.mode === 'edit'
      ? customMaterials.find((material) => material.id === form.materialId)
      : undefined;

  const fonts = [
    { id: 'global', label: 'Inherit', icon: 'G' },
    { id: 'font-mono', label: 'Digital', icon: '01' },
    { id: 'font-sans', label: 'Modern', icon: 'Aa' },
    { id: 'font-handwritten', label: 'School', icon: '✏️' },
  ];

  return (
    <div className="flex flex-col gap-6 p-1">
      {/* Title Settings */}
      <div className="space-y-4">
        <div>
          <SettingsLabel htmlFor={titleTextId} icon={Edit3}>
            Title Text
          </SettingsLabel>
          <input
            id={titleTextId}
            type="text"
            value={title}
            onChange={(e) => commitConfig({ ...config, title: e.target.value })}
            placeholder="What you need"
            className="w-full p-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>

        <div>
          <SettingsLabel as="span" id={typographyLabelId} icon={Type}>
            Typography
          </SettingsLabel>
          <div
            className="grid grid-cols-4 gap-2"
            role="group"
            aria-labelledby={typographyLabelId}
          >
            {fonts.map((f) => (
              <button
                key={f.id}
                onClick={() => commitConfig({ ...config, titleFont: f.id })}
                className={`p-2 rounded-lg border-2 flex flex-col items-center gap-1 transition-all ${
                  titleFont === f.id || (!titleFont && f.id === 'global')
                    ? 'border-blue-500 bg-blue-50 shadow-sm'
                    : 'border-slate-100 hover:border-slate-200'
                }`}
              >
                <span className={`text-sm ${f.id} text-slate-900`}>
                  {f.icon}
                </span>
                <span className="text-xxxs font-black uppercase text-slate-500 tracking-tighter text-center leading-none">
                  {f.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <SettingsLabel as="span" id={titleColorLabelId} icon={Palette}>
            Title Color
          </SettingsLabel>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-labelledby={titleColorLabelId}
          >
            {WIDGET_PALETTE.map((c) => (
              <button
                key={c}
                onClick={() =>
                  updateWidget(widget.id, {
                    config: { ...config, titleColor: c },
                  })
                }
                className={`w-6 h-6 rounded-full border-2 transition-all ${
                  titleColor === c
                    ? 'border-slate-800 scale-125 shadow-md'
                    : 'border-transparent hover:scale-110'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      </div>

      <hr className="border-slate-100" />

      {/* Item Selection */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <SettingsLabel
            as="span"
            id={availableMaterialsLabelId}
            className="mb-0"
          >
            Available Materials
          </SettingsLabel>
          {form.mode === 'closed' && (
            <div className="flex items-center gap-3">
              {allowTeacherMaterials && !atMaterialCap && (
                <button
                  onClick={() => setForm({ mode: 'create' })}
                  className="flex items-center gap-1 text-xs text-blue-600 font-bold hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add
                </button>
              )}
              <button
                onClick={toggleAll}
                className="text-xs text-blue-600 font-bold hover:underline"
              >
                {isAllSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          )}
        </div>

        {form.mode !== 'closed' ? (
          <CustomMaterialForm
            key={form.mode === 'edit' ? form.materialId : 'create'}
            material={editingMaterial}
            onSave={handleSaveMaterial}
            onDelete={
              editingMaterial
                ? () => void handleDeleteMaterial(editingMaterial.id)
                : undefined
            }
            onCancel={() => setForm({ mode: 'closed' })}
          />
        ) : (
          <>
            <div
              className="flex flex-col gap-2 max-h-[280px] overflow-y-auto pr-1"
              role="group"
              aria-labelledby={availableMaterialsLabelId}
            >
              {visibleCatalog.length === 0 && (
                <p className="text-xs text-slate-500 italic py-2">
                  Every material is hidden. Show one below to use it.
                </p>
              )}
              {visibleCatalog.map((item) => {
                const isSelected = selectedSet.has(item.id);
                const isEditable = teacherMaterialIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className={`flex items-center rounded-lg border transition-all ${
                      isSelected
                        ? 'bg-blue-50 border-blue-200 shadow-sm'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <button
                      onClick={() => toggleItem(item.id)}
                      className="flex flex-1 min-w-0 items-center gap-3 p-2 text-left"
                    >
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-blue-600 border-blue-600'
                            : 'bg-white border-slate-300'
                        }`}
                      >
                        {isSelected && (
                          <div className="w-1.5 h-1.5 bg-white rounded-full" />
                        )}
                      </div>
                      <item.iconComponent
                        className={`w-4 h-4 flex-shrink-0 ${
                          isSelected ? 'text-blue-600' : 'text-slate-400'
                        }`}
                      />
                      <span
                        className={`text-sm font-medium leading-tight break-words ${
                          isSelected ? 'text-slate-900' : 'text-slate-500'
                        }`}
                      >
                        {item.label}
                      </span>
                    </button>
                    {isEditable && (
                      <button
                        onClick={() =>
                          setForm({ mode: 'edit', materialId: item.id })
                        }
                        aria-label={`Edit ${item.label}`}
                        title={`Edit ${item.label}`}
                        className="flex-shrink-0 p-2 rounded-md text-slate-500 transition-colors hover:bg-white hover:text-blue-600"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => hideMaterial(item.id)}
                      aria-label={`Hide ${item.label}`}
                      title={`Hide ${item.label} from this list`}
                      className="flex-shrink-0 p-2 mr-0.5 rounded-md text-slate-500 transition-colors hover:bg-white hover:text-slate-800"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
            {hiddenCatalog.length > 0 && (
              <div className="space-y-2">
                <button
                  onClick={() => setShowHidden((prev) => !prev)}
                  aria-expanded={showHidden}
                  className="flex items-center gap-1 text-xs text-slate-600 font-bold hover:underline"
                >
                  {showHidden ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                  Hidden materials ({hiddenCatalog.length})
                </button>
                {showHidden && (
                  <ul
                    className="flex flex-col gap-2"
                    aria-label="Hidden materials"
                  >
                    {hiddenCatalog.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-center gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-2"
                      >
                        <item.iconComponent className="w-4 h-4 flex-shrink-0 text-slate-400" />
                        <span className="flex-1 min-w-0 text-sm font-medium leading-tight break-words text-slate-500">
                          {item.label}
                        </span>
                        <button
                          onClick={() => unhideMaterial(item.id)}
                          aria-label={`Show ${item.label}`}
                          title={`Show ${item.label} in the list again`}
                          className="flex-shrink-0 p-2 rounded-md text-slate-500 transition-colors hover:bg-white hover:text-blue-600"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {allowTeacherMaterials && atMaterialCap && (
              <p className="text-xxs text-slate-400 leading-tight italic">
                You have reached the {MAX_TEACHER_MATERIALS} custom material
                limit. Delete one to add another.
              </p>
            )}
            <p className="text-xxs text-slate-400 leading-tight italic">
              Selected materials will appear on the widget face when focused.
              Tap them to toggle their visibility for students. Your selection
              and hidden materials carry over to new Materials widgets.
            </p>
          </>
        )}
      </div>
    </div>
  );
};
