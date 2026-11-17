import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { Z_INDEX } from '@/config/zIndex';

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
      className="h-9 min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 hover:border-slate-300"
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
  const [openAt, setOpenAt] = useState<DOMRect | null>(null);
  const open = openAt !== null;
  // Escape closes just this menu, not the editor under it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      setOpenAt(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);
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
  const offered = new Set(options.map((o) => o.id));
  // Materials removed from the widget drop out, so they can't linger unseen in the step.
  const chosen = Array.isArray(params?.items)
    ? (params.items as unknown[]).filter(
        (x): x is string => typeof x === 'string' && offered.has(x)
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
        onClick={(e) =>
          setOpenAt(open ? null : e.currentTarget.getBoundingClientRect())
        }
        className="flex h-9 max-w-56 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-left text-sm text-slate-700 hover:border-slate-300"
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
      </button>
      {openAt &&
        createPortal(
          <>
            <div
              className="fixed inset-0"
              style={{ zIndex: Z_INDEX.popover }}
              onPointerDown={(e) => {
                e.stopPropagation();
                setOpenAt(null);
              }}
            />
            <div
              role="menu"
              className="fixed max-h-60 w-56 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 pb-2 shadow-xl"
              style={{
                left: Math.max(
                  8,
                  Math.min(openAt.right - 224, window.innerWidth - 232)
                ),
                top: openAt.bottom + 4,
                zIndex: Z_INDEX.popover + 1,
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {options.map((o) => (
                <label
                  key={o.id}
                  {...tourAttr('connections.editor.material-option')}
                  role="menuitemcheckbox"
                  aria-checked={chosen.includes(o.id)}
                  className="flex min-h-11 cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50"
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
          </>,
          document.body
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
