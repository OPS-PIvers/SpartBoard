import React from 'react';
import { WidgetData, MaterialsConfig, MaterialsGlobalConfig } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { getMaterialsCatalog } from './constants';
import { SettingsLabel } from '@/components/common/SettingsLabel';
import { Type, Palette, Edit3 } from 'lucide-react';
import { WIDGET_PALETTE } from '@/config/colors';
import { useAuth } from '@/context/useAuth';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';

export const MaterialsSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const { featurePermissions } = useAuth();
  const buildingId = useWidgetBuildingId(widget);
  const config = widget.config as MaterialsConfig;
  const {
    selectedItems = [],
    activeItems = [],
    title = 'What you need',
    titleFont = 'global',
    titleColor = '#2d3f89',
  } = config;
  const permission = featurePermissions.find(
    (item) => item.widgetType === 'materials'
  );
  const materialsConfig = permission?.config as Partial<MaterialsGlobalConfig>;
  const buildingAssignedIds = buildingId
    ? materialsConfig.buildingDefaults?.[buildingId]?.selectedItems
    : undefined;
  const materialsCatalog = React.useMemo(() => {
    const fullCatalog = getMaterialsCatalog(materialsConfig);
    if (!buildingAssignedIds || buildingAssignedIds.length === 0) {
      return fullCatalog;
    }

    const allowedIds = new Set(buildingAssignedIds);
    return fullCatalog.filter((material) => allowedIds.has(material.id));
  }, [buildingAssignedIds, materialsConfig]);

  const selectedSet = React.useMemo(
    () => new Set(selectedItems),
    [selectedItems]
  );

  const toggleItem = (id: string) => {
    const newSelected = new Set(selectedSet);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }

    const newActive = activeItems.filter((activeId: string) =>
      newSelected.has(activeId)
    );

    updateWidget(widget.id, {
      config: {
        ...config,
        selectedItems: Array.from(newSelected),
        activeItems: newActive,
      },
    });
  };

  const isAllSelected =
    materialsCatalog.length > 0 && selectedSet.size === materialsCatalog.length;

  const toggleAll = () => {
    if (isAllSelected) {
      updateWidget(widget.id, {
        config: { ...config, selectedItems: [], activeItems: [] },
      });
    } else {
      updateWidget(widget.id, {
        config: {
          ...config,
          selectedItems: materialsCatalog.map((i) => i.id),
        },
      });
    }
  };

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
          <SettingsLabel icon={Edit3}>Title Text</SettingsLabel>
          <input
            type="text"
            value={title}
            onChange={(e) =>
              updateWidget(widget.id, {
                config: { ...config, title: e.target.value },
              })
            }
            placeholder="What you need"
            className="w-full p-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>

        <div>
          <SettingsLabel icon={Type}>Typography</SettingsLabel>
          <div className="grid grid-cols-4 gap-2">
            {fonts.map((f) => (
              <button
                key={f.id}
                onClick={() =>
                  updateWidget(widget.id, {
                    config: { ...config, titleFont: f.id },
                  })
                }
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
          <SettingsLabel icon={Palette}>Title Color</SettingsLabel>
          <div className="flex flex-wrap gap-2">
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
        <div className="flex items-center justify-between">
          <SettingsLabel className="mb-0">Available Materials</SettingsLabel>
          <button
            onClick={toggleAll}
            className="text-xs text-blue-600 font-bold hover:underline"
          >
            {isAllSelected ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[250px] overflow-y-auto pr-1">
          {materialsCatalog.map((item) => {
            const isSelected = selectedSet.has(item.id);
            return (
              <button
                key={item.id}
                onClick={() => toggleItem(item.id)}
                className={`flex items-center gap-3 p-2 rounded-lg border transition-all ${
                  isSelected
                    ? 'bg-blue-50 border-blue-200 shadow-sm'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
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
                  className={`text-sm font-medium truncate ${
                    isSelected ? 'text-slate-900' : 'text-slate-500'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-xxs text-slate-400 leading-tight italic">
          Selected materials will appear on the widget face when focused. Tap
          them to toggle their visibility for students.
        </p>
      </div>
    </div>
  );
};
