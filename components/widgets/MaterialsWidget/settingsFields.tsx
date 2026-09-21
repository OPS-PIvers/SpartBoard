import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Pencil,
  Plus,
} from 'lucide-react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type {
  MaterialDefinition,
  MaterialsConfig,
  MaterialsGlobalConfig,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import { handleRadioGroupKeyDown } from '@/components/common/radioGroupKeyNav';
import {
  MAX_TEACHER_MATERIALS,
  buildMaterialSnapshots,
  createTeacherMaterialId,
  getMaterialsCatalog,
} from './constants';
import { CustomMaterialForm } from './CustomMaterialForm';
import {
  forgetMaterial,
  preferencesFromConfig,
} from '@/utils/materialsPreferences';

type FormState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'edit'; materialId: string };

const configFor = (ctx: CustomRenderCtx): MaterialsConfig =>
  ctx.config as unknown as MaterialsConfig;

const translate = (
  ctx: CustomRenderCtx,
  leaf: string,
  options?: Record<string, unknown>
) => ctx.t(`widgetSettings.materials.${leaf}`, options);

const TITLE_FONTS = [
  { id: 'global', label: 'inherit', icon: 'G' },
  { id: 'font-mono', label: 'digital', icon: '01' },
  { id: 'font-sans', label: 'modern', icon: 'Aa' },
  { id: 'font-handwritten', label: 'school', icon: '✏️' },
] as const;

export const MaterialsTitleFontField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => {
  const { materialsPreferences, saveMaterialsPreferences } = useAuth();
  const selected =
    typeof ctx.config.titleFont === 'string' ? ctx.config.titleFont : 'global';

  const selectTitleFont = (titleFont: string) => {
    ctx.updateConfig({ titleFont });
    saveMaterialsPreferences(
      preferencesFromConfig(materialsPreferences, {
        ...(ctx.config as unknown as MaterialsConfig),
        titleFont,
      })
    );
  };

  return (
    <div
      id={ctx.id}
      role="radiogroup"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      onKeyDown={(event) =>
        handleRadioGroupKeyDown(event, TITLE_FONTS, (font) =>
          selectTitleFont(font.id)
        )
      }
      className="grid grid-cols-4 gap-2"
    >
      {TITLE_FONTS.map((font) => {
        const isSelected = selected === font.id;
        return (
          <button
            key={font.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => selectTitleFont(font.id)}
            className={`flex flex-col items-center gap-1 rounded-lg border-2 p-2 transition-all ${
              isSelected
                ? 'border-blue-500 bg-blue-50 shadow-sm'
                : 'border-slate-100 hover:border-slate-200'
            }`}
          >
            <span className={`text-sm ${font.id} text-slate-900`}>
              {font.icon}
            </span>
            <span className="text-center text-xxxs font-black uppercase tracking-tighter text-slate-500">
              {translate(ctx, font.label)}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export const MaterialsTitleField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => {
  const { materialsPreferences, saveMaterialsPreferences } = useAuth();
  const config = configFor(ctx);
  const title = config.title ?? 'What you need';

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextTitle = event.target.value;
    ctx.updateConfig({ title: nextTitle });
    saveMaterialsPreferences(
      preferencesFromConfig(materialsPreferences, {
        ...config,
        title: nextTitle,
      })
    );
  };

  return (
    <input
      id={ctx.id}
      type="text"
      value={title}
      onChange={handleChange}
      placeholder={translate(ctx, 'titlePlaceholder')}
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500"
    />
  );
};

export const MaterialsCatalogField: React.FC<{
  ctx: CustomRenderCtx;
}> = ({ ctx }) => {
  const { dashboards, updateWidgetConfigsAcrossBoards } = useDashboard();
  const {
    featurePermissions,
    customMaterials,
    saveCustomMaterials,
    materialsPreferences,
    saveMaterialsPreferences,
  } = useAuth();
  const { showConfirm } = useDialog();
  const buildingId = useWidgetBuildingId(ctx.widget);
  const config = configFor(ctx);
  const [form, setForm] = useState<FormState>({ mode: 'closed' });
  const [showHidden, setShowHidden] = useState(false);

  const selectedItems = config.selectedItems ?? [];
  const activeItems = config.activeItems ?? [];
  const permission = featurePermissions.find(
    (item) => item.widgetType === 'materials'
  );
  const materialsConfig = (permission?.config ??
    {}) as Partial<MaterialsGlobalConfig>;
  const buildingAssignedIds = buildingId
    ? materialsConfig.buildingDefaults?.[buildingId]?.selectedItems
    : undefined;
  const catalogOptions = {
    teacherMaterials: customMaterials,
    snapshots: config.customMaterialSnapshots,
  };
  const materialsCatalog = getMaterialsCatalog(materialsConfig, {
    ...catalogOptions,
    allowedIds: buildingAssignedIds,
  });
  const snapshotCatalog = getMaterialsCatalog(materialsConfig, catalogOptions);
  const hiddenMaterialIds = materialsPreferences.hiddenMaterialIds ?? [];
  const hiddenSet = new Set(hiddenMaterialIds);
  const visibleCatalog = materialsCatalog.filter(
    (item) => !hiddenSet.has(item.id)
  );
  const hiddenCatalog = materialsCatalog.filter((item) =>
    hiddenSet.has(item.id)
  );
  const teacherMaterialIds = new Set(
    customMaterials.map((material) => material.id)
  );
  const selectedSet = new Set(selectedItems);
  const allowTeacherMaterials =
    materialsConfig?.allowTeacherMaterials !== false;
  const atMaterialCap = customMaterials.length >= MAX_TEACHER_MATERIALS;

  const withSnapshots = (next: MaterialsConfig): MaterialsConfig => ({
    ...next,
    customMaterialSnapshots: buildMaterialSnapshots(
      [...next.selectedItems, ...next.activeItems],
      snapshotCatalog
    ),
  });

  const commitConfig = (
    next: MaterialsConfig,
    nextHiddenIds: string[] = hiddenMaterialIds
  ) => {
    ctx.updateConfig({
      selectedItems: next.selectedItems,
      activeItems: next.activeItems,
      customMaterialSnapshots: next.customMaterialSnapshots,
    });
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
    const nextSelected = new Set(selectedSet);
    if (nextSelected.has(id)) nextSelected.delete(id);
    else nextSelected.add(id);
    applySelection(
      Array.from(nextSelected),
      activeItems.filter((activeId) => nextSelected.has(activeId))
    );
  };

  const isAllSelected =
    visibleCatalog.length > 0 &&
    visibleCatalog.every((item) => selectedSet.has(item.id));

  const toggleAll = () => {
    if (isAllSelected) applySelection([], []);
    else
      applySelection(
        visibleCatalog.map((item) => item.id),
        activeItems
      );
  };

  const handleSaveMaterial = (draft: Omit<MaterialDefinition, 'id'>) => {
    if (form.mode === 'edit') {
      void saveCustomMaterials(
        customMaterials.map((material) =>
          material.id === form.materialId
            ? { ...draft, id: form.materialId }
            : material
        )
      );
      setForm({ mode: 'closed' });
      return;
    }
    if (atMaterialCap) return;
    const created: MaterialDefinition = {
      ...draft,
      id: createTeacherMaterialId(),
    };
    void saveCustomMaterials([...customMaterials, created]);
    applySelection([...selectedItems, created.id], activeItems);
    setForm({ mode: 'closed' });
  };

  const countWidgetsUsing = (materialId: string) =>
    dashboards.reduce(
      (total, dashboard) =>
        total +
        dashboard.widgets.filter((widget) => {
          if (widget.type !== 'materials') return false;
          const widgetConfig = widget.config as MaterialsConfig;
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
        ? ` ${translate(ctx, usageCount === 1 ? 'deleteUsageOne' : 'deleteUsageOther', { count: usageCount })}`
        : '';
    const confirmed = await showConfirm(
      `${translate(ctx, 'deleteMaterialQuestion', { label: material.label })}${usageNote}`,
      {
        title: translate(ctx, 'deleteMaterialTitle'),
        variant: 'danger',
        confirmLabel: translate(ctx, 'delete'),
      }
    );
    if (!confirmed) return;
    setForm({ mode: 'closed' });
    await saveCustomMaterials(
      customMaterials.filter((item) => item.id !== materialId)
    );
    saveMaterialsPreferences(forgetMaterial(materialsPreferences, materialId));
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
      };
    });
  };

  const editingMaterial =
    form.mode === 'edit'
      ? customMaterials.find((material) => material.id === form.materialId)
      : undefined;

  return (
    <div
      id={ctx.id}
      role="group"
      aria-labelledby={ctx.labelId}
      aria-describedby={ctx.describedBy}
      className="flex flex-col gap-3"
    >
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
          translate={(leaf, options) => translate(ctx, leaf, options)}
        />
      ) : (
        <>
          <div className="flex items-center justify-end gap-3">
            {allowTeacherMaterials && !atMaterialCap && (
              <button
                type="button"
                onClick={() => setForm({ mode: 'create' })}
                className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {translate(ctx, 'addMaterial')}
              </button>
            )}
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs font-bold text-blue-600 hover:underline"
            >
              {translate(ctx, isAllSelected ? 'deselectAll' : 'selectAll')}
            </button>
          </div>
          <div className="flex max-h-[280px] flex-col gap-2 overflow-y-auto pr-1">
            {visibleCatalog.length === 0 && (
              <p className="py-2 text-xs italic text-slate-500">
                {translate(ctx, 'everyMaterialHidden')}
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
                      ? 'border-blue-200 bg-blue-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleItem(item.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 p-2 text-left"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                        isSelected
                          ? 'border-blue-600 bg-blue-600'
                          : 'border-slate-300 bg-white'
                      }`}
                      aria-hidden="true"
                    >
                      {isSelected && (
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                      )}
                    </span>
                    <item.iconComponent
                      className={`h-4 w-4 shrink-0 ${
                        isSelected ? 'text-blue-600' : 'text-slate-400'
                      }`}
                    />
                    <span
                      className={`break-words text-sm font-medium leading-tight ${
                        isSelected ? 'text-slate-900' : 'text-slate-500'
                      }`}
                    >
                      {item.label}
                    </span>
                  </button>
                  {isEditable && (
                    <button
                      type="button"
                      onClick={() =>
                        setForm({ mode: 'edit', materialId: item.id })
                      }
                      aria-label={translate(ctx, 'editMaterial', {
                        label: item.label,
                      })}
                      className="shrink-0 rounded-md p-2 text-slate-500 transition-colors hover:bg-white hover:text-blue-600"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => hideMaterial(item.id)}
                    aria-label={translate(ctx, 'hideMaterial', {
                      label: item.label,
                    })}
                    className="mr-0.5 shrink-0 rounded-md p-2 text-slate-500 transition-colors hover:bg-white hover:text-slate-800"
                  >
                    <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
          {hiddenCatalog.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowHidden((previous) => !previous)}
                aria-expanded={showHidden}
                className="flex items-center gap-1 text-xs font-bold text-slate-600 hover:underline"
              >
                {showHidden ? (
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {translate(ctx, 'hiddenMaterials', {
                  count: hiddenCatalog.length,
                })}
              </button>
              {showHidden && (
                <ul
                  className="flex flex-col gap-2"
                  aria-label={translate(ctx, 'hiddenMaterialsLabel')}
                >
                  {hiddenCatalog.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-2"
                    >
                      <item.iconComponent className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="min-w-0 flex-1 break-words text-sm font-medium leading-tight text-slate-500">
                        {item.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => unhideMaterial(item.id)}
                        aria-label={translate(ctx, 'showMaterial', {
                          label: item.label,
                        })}
                        className="shrink-0 rounded-md p-2 text-slate-500 transition-colors hover:bg-white hover:text-blue-600"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {allowTeacherMaterials && atMaterialCap && (
            <p className="text-xxs italic leading-tight text-slate-400">
              {translate(ctx, 'materialCap', { count: MAX_TEACHER_MATERIALS })}
            </p>
          )}
          <p className="text-xxs italic leading-tight text-slate-400">
            {translate(ctx, 'selectionTip')}
          </p>
        </>
      )}
    </div>
  );
};
