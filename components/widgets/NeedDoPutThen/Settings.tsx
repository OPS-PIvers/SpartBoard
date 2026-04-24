import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ListTodo,
  Package,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { WidgetData, NeedDoPutThenConfig, NeedDoPutThenTile } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { TypographySettings } from '@/components/common/TypographySettings';
import { TextSizePresetSettings } from '@/components/common/TextSizePresetSettings';
import { SurfaceColorSettings } from '@/components/common/SurfaceColorSettings';
import { IconPicker } from '@/components/widgets/InstructionalRoutines/IconPicker';
import {
  MATERIAL_COLOR_OPTIONS,
  getContrastingTextColor,
} from '@/components/widgets/MaterialsWidget/constants';
import {
  DEFAULT_NEED_ITEMS,
  DEFAULT_PUT_ITEMS,
  DEFAULT_DO_ITEMS,
  DEFAULT_THEN_ITEMS,
  MAX_LIST_ITEMS,
  MIN_LIST_ITEMS,
  MAX_TILE_ITEMS,
  SECTION_COLORS,
} from './constants';

const newTileId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface CollapsibleSectionProps {
  label: string;
  icon: typeof Package;
  accentColor: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  label,
  icon: Icon,
  accentColor,
  defaultOpen = false,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors"
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
        )}
        <Icon className="w-4 h-4 shrink-0" style={{ color: accentColor }} />
        <span className="text-xs font-bold uppercase tracking-wide text-slate-700">
          {label}
        </span>
      </button>
      {isOpen && <div className="p-3">{children}</div>}
    </div>
  );
};

interface TileEditorProps {
  items: NeedDoPutThenTile[];
  defaults: NeedDoPutThenTile[];
  onChange: (items: NeedDoPutThenTile[]) => void;
  showCheckbox?: boolean;
}

const TileEditor: React.FC<TileEditorProps> = ({
  items,
  defaults,
  onChange,
  showCheckbox = false,
}) => {
  const updateItem = (index: number, updates: Partial<NeedDoPutThenTile>) => {
    const next = items.map((item, i) =>
      i === index ? { ...item, ...updates } : item
    );
    onChange(next);
  };

  const addItem = () => {
    if (items.length >= MAX_TILE_ITEMS) return;
    onChange([
      ...items,
      {
        id: newTileId(),
        label: 'New item',
        icon: 'Package',
        color: '#3b82f6',
        checked: true,
      },
    ]);
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const restoreDefaults = () => {
    onChange(defaults.map((d) => ({ ...d })));
  };

  return (
    <div>
      <div className="flex items-center justify-end mb-2">
        <button
          type="button"
          onClick={restoreDefaults}
          className="flex items-center gap-1 text-xxs font-bold uppercase tracking-wide text-slate-500 hover:text-brand-blue-primary transition-colors"
          title="Restore defaults"
        >
          <RotateCcw className="w-3 h-3" />
          Restore
        </button>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
        {items.map((item, idx) => {
          const textColor = getContrastingTextColor(item.color);
          const isChecked = item.checked !== false;
          return (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2"
            >
              {showCheckbox && (
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) =>
                    updateItem(idx, { checked: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-slate-300 text-brand-blue-primary focus:ring-brand-blue-primary shrink-0"
                  aria-label={`Show ${item.label}`}
                  title={isChecked ? 'Hide from widget' : 'Show on widget'}
                />
              )}
              <IconPicker
                currentIcon={item.icon}
                onSelect={(icon) => updateItem(idx, { icon })}
              />
              <input
                type="text"
                value={item.label}
                onChange={(e) => updateItem(idx, { label: e.target.value })}
                className="flex-1 min-w-0 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-brand-blue-primary focus:outline-none"
                placeholder="Label"
                maxLength={80}
              />
              <div className="relative shrink-0">
                <button
                  type="button"
                  className="h-7 w-7 rounded-lg border border-slate-200 shadow-sm"
                  style={{ backgroundColor: item.color, color: textColor }}
                  title="Pick color"
                  aria-label="Pick color"
                />
                <input
                  type="color"
                  value={item.color}
                  onChange={(e) => updateItem(idx, { color: e.target.value })}
                  className="absolute inset-0 h-7 w-7 opacity-0 cursor-pointer"
                  aria-label="Pick color"
                />
              </div>
              <button
                type="button"
                onClick={() => removeItem(idx)}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="Remove item"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {MATERIAL_COLOR_OPTIONS.map((color) => (
          <div
            key={color}
            className="w-4 h-4 rounded-full border border-slate-200"
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={addItem}
        disabled={items.length >= MAX_TILE_ITEMS}
        className="mt-3 w-full py-2 flex items-center justify-center gap-2 text-xs font-bold text-slate-500 border border-dashed border-slate-300 rounded-lg hover:border-brand-blue-primary hover:text-brand-blue-primary transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus className="w-3.5 h-3.5" />
        Add item
      </button>
    </div>
  );
};

interface ListEditorProps {
  items: string[];
  onChange: (items: string[]) => void;
}

const ListEditor: React.FC<ListEditorProps> = ({ items, onChange }) => {
  const updateItem = (index: number, value: string) => {
    const next = items.map((item, i) => (i === index ? value : item));
    onChange(next);
  };

  const addItem = () => {
    if (items.length >= MAX_LIST_ITEMS) return;
    onChange([...items, '']);
  };

  const removeItem = (index: number) => {
    if (items.length <= MIN_LIST_ITEMS) return;
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div className="space-y-2">
        {items.map((text, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <span className="mt-2 text-xs font-black text-slate-500 w-5 shrink-0 text-center">
              {idx + 1}.
            </span>
            <textarea
              value={text}
              onChange={(e) => updateItem(idx, e.target.value)}
              rows={2}
              className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:ring-2 focus:ring-brand-blue-primary focus:outline-none resize-none"
              placeholder={`Step ${idx + 1}`}
              maxLength={200}
            />
            {items.length > MIN_LIST_ITEMS && (
              <button
                type="button"
                onClick={() => removeItem(idx)}
                className="mt-1 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                title="Remove line"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      {items.length < MAX_LIST_ITEMS && (
        <button
          type="button"
          onClick={addItem}
          className="mt-3 w-full py-2 flex items-center justify-center gap-2 text-xs font-bold text-slate-500 border border-dashed border-slate-300 rounded-lg hover:border-brand-blue-primary hover:text-brand-blue-primary transition-all"
        >
          <Plus className="w-3.5 h-3.5" />
          Add line
        </button>
      )}
    </div>
  );
};

export const NeedDoPutThenSettings: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const config = (widget.config ?? {}) as NeedDoPutThenConfig;

  const {
    needItems = DEFAULT_NEED_ITEMS,
    doItems = DEFAULT_DO_ITEMS,
    putItems = DEFAULT_PUT_ITEMS,
    thenItems = DEFAULT_THEN_ITEMS,
  } = config;

  const update = (updates: Partial<NeedDoPutThenConfig>) => {
    updateWidget(widget.id, { config: { ...config, ...updates } });
  };

  return (
    <div className="p-4 space-y-3">
      <CollapsibleSection
        label="What you need"
        icon={Package}
        accentColor={SECTION_COLORS.need}
      >
        <TileEditor
          items={needItems}
          defaults={DEFAULT_NEED_ITEMS}
          onChange={(items) => update({ needItems: items })}
          showCheckbox
        />
      </CollapsibleSection>

      <CollapsibleSection
        label="What you do"
        icon={ListTodo}
        accentColor={SECTION_COLORS.do}
      >
        <ListEditor
          items={doItems}
          onChange={(items) => update({ doItems: items })}
        />
      </CollapsibleSection>

      <CollapsibleSection
        label="Where it goes"
        icon={Package}
        accentColor={SECTION_COLORS.put}
      >
        <TileEditor
          items={putItems}
          defaults={DEFAULT_PUT_ITEMS}
          onChange={(items) => update({ putItems: items })}
          showCheckbox
        />
      </CollapsibleSection>

      <CollapsibleSection
        label="What's next"
        icon={ListTodo}
        accentColor={SECTION_COLORS.then}
      >
        <TileEditor
          items={thenItems}
          defaults={DEFAULT_THEN_ITEMS}
          onChange={(items) => update({ thenItems: items })}
        />
      </CollapsibleSection>
    </div>
  );
};

export const NeedDoPutThenAppearanceSettings: React.FC<{
  widget: WidgetData;
}> = ({ widget }) => {
  const { updateWidget } = useDashboard();
  const config = (widget.config ?? {}) as NeedDoPutThenConfig;

  const update = (updates: Partial<NeedDoPutThenConfig>) => {
    updateWidget(widget.id, { config: { ...config, ...updates } });
  };

  return (
    <div className="p-4 space-y-6">
      <TypographySettings config={config} updateConfig={update} />
      <TextSizePresetSettings
        config={config}
        updateConfig={update}
        writeScaleMultiplier={false}
      />
      <SurfaceColorSettings config={config} updateConfig={update} />
    </div>
  );
};
