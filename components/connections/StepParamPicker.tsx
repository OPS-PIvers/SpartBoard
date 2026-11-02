import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import type {
  MaterialsConfig,
  MaterialsGlobalConfig,
  WidgetData,
  WorkSymbolsGlobalConfig,
} from '@/types';
import { useAuth } from '@/context/useAuth';
import { useWidgetBuildingId } from '@/hooks/useWidgetBuildingId';
import { getMaterialMap } from '@/components/widgets/MaterialsWidget/constants';
import { tourAttr } from '@/config/tourAnchors';

type Params = Record<string, unknown>;

interface PickerProps {
  widget: WidgetData;
  params: Params | undefined;
  onChange: (params: Params) => void;
  label: string;
}

const WorkSymbolPicker: React.FC<PickerProps> = ({
  widget,
  params,
  onChange,
  label,
}) => {
  const { t } = useTranslation();
  const { featurePermissions } = useAuth();
  const buildingId = useWidgetBuildingId(widget);
  const symbols = useMemo(() => {
    const all =
      (
        featurePermissions.find((p) => p.widgetType === 'work-symbols')
          ?.config as WorkSymbolsGlobalConfig | undefined
      )?.symbols ?? [];
    return buildingId
      ? all.filter(
          (s) => s.buildings.length === 0 || s.buildings.includes(buildingId)
        )
      : all;
  }, [featurePermissions, buildingId]);
  const value = typeof params?.symbolId === 'string' ? params.symbolId : '';
  return (
    <select
      value={value}
      {...tourAttr('connections.editor.step-choice')}
      aria-label={label}
      onChange={(e) => onChange({ symbolId: e.target.value || null })}
      className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
    >
      <option value="">
        {t('connections.editor.pickSymbol', { defaultValue: 'Pick a symbol' })}
      </option>
      {symbols.map((s) => (
        <option key={s.id} value={s.id}>
          {s.title}
        </option>
      ))}
    </select>
  );
};

const MaterialsPicker: React.FC<PickerProps> = ({
  widget,
  params,
  onChange,
  label,
}) => {
  const { t } = useTranslation();
  const { featurePermissions, customMaterials } = useAuth();
  const config = widget.config as MaterialsConfig;
  const [open, setOpen] = useState(false);
  const materialMap = useMemo(
    () =>
      getMaterialMap(
        featurePermissions.find((p) => p.widgetType === 'materials')?.config as
          Partial<MaterialsGlobalConfig> | undefined,
        {
          teacherMaterials: customMaterials,
          snapshots: config.customMaterialSnapshots,
        }
      ),
    [featurePermissions, customMaterials, config.customMaterialSnapshots]
  );
  const options = (config.selectedItems ?? []).flatMap((id) => {
    const m = materialMap.get(id);
    return m ? [{ id, label: m.label }] : [];
  });
  const chosen = Array.isArray(params?.items)
    ? (params.items as unknown[]).filter(
        (x): x is string => typeof x === 'string'
      )
    : [];
  const summary =
    options
      .filter((o) => chosen.includes(o.id))
      .map((o) => o.label)
      .join(', ') ||
    t('connections.editor.noMaterials', { defaultValue: 'None' });
  const toggle = (id: string) =>
    onChange({
      items: chosen.includes(id)
        ? chosen.filter((x) => x !== id)
        : [...chosen, id],
    });
  return (
    <div className="relative">
      <button
        type="button"
        {...tourAttr('connections.editor.step-choice')}
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-56 items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-left text-sm"
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 max-h-60 w-56 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 pb-2 shadow-xl"
        >
          {options.map((o) => (
            <label
              key={o.id}
              {...tourAttr('connections.editor.material-option')}
              role="menuitemcheckbox"
              aria-checked={chosen.includes(o.id)}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              <input // no-tour-anchor: its row label carries the anchor
                type="checkbox"
                checked={chosen.includes(o.id)}
                onChange={() => toggle(o.id)}
              />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

/** A step's own choice for widgets whose action takes one; nothing for the rest. */
export const StepParamPicker: React.FC<PickerProps & { action: string }> = (
  props
) => {
  if (props.widget.type === 'work-symbols' && props.action === 'show') {
    return <WorkSymbolPicker {...props} />;
  }
  if (props.widget.type === 'materials' && props.action === 'show') {
    return <MaterialsPicker {...props} />;
  }
  return null;
};
