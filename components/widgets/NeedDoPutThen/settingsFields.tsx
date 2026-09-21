import React from 'react';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { NeedDoPutThenConfig, NeedDoPutThenTile } from '@/types';
import { IconPicker } from '@/components/widgets/InstructionalRoutines/IconPicker';
import { getContrastingTextColor } from '@/components/widgets/MaterialsWidget/constants';
import {
  DEFAULT_DO_ITEMS,
  DEFAULT_NEED_ITEMS,
  DEFAULT_PUT_ITEMS,
  DEFAULT_THEN_ITEMS,
  MAX_LIST_ITEMS,
  MAX_TILE_ITEMS,
  MIN_LIST_ITEMS,
  SECTION_COLORS,
} from './constants';

const newTileId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type TileKey = 'needItems' | 'putItems' | 'thenItems';

const configFor = (ctx: CustomRenderCtx): NeedDoPutThenConfig =>
  ctx.config as unknown as NeedDoPutThenConfig;

const translate = (
  ctx: CustomRenderCtx,
  leaf: string,
  options?: Record<string, unknown>
) => ctx.t(`widgetSettings.need-do-put-then.${leaf}`, options);

const FieldRoot: React.FC<{
  ctx: CustomRenderCtx;
  children: React.ReactNode;
}> = ({ ctx, children }) => (
  <div
    id={ctx.id}
    role="group"
    aria-labelledby={ctx.labelId}
    aria-describedby={ctx.describedBy}
    className="flex flex-col gap-2"
  >
    {children}
  </div>
);

const TileEditor: React.FC<{
  ctx: CustomRenderCtx;
  keyName: TileKey;
  items: NeedDoPutThenTile[];
  defaults: NeedDoPutThenTile[];
  showCheckbox: boolean;
  accentColor: string;
}> = ({ ctx, keyName, items, defaults, showCheckbox, accentColor }) => {
  const updateItems = (next: NeedDoPutThenTile[]) =>
    ctx.updateConfig({ [keyName]: next });

  const updateItem = (index: number, updates: Partial<NeedDoPutThenTile>) =>
    updateItems(
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...updates } : item
      )
    );

  const addItem = () => {
    if (items.length >= MAX_TILE_ITEMS) return;
    updateItems([
      ...items,
      {
        id: newTileId(),
        label: translate(ctx, 'newItem'),
        icon: 'Package',
        color: '#3b82f6',
        checked: true,
      },
    ]);
  };

  return (
    <>
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => updateItems(defaults.map((item) => ({ ...item })))}
          className="flex items-center gap-1 text-xxs font-bold uppercase tracking-wide text-slate-500 hover:text-brand-blue-primary"
          title={translate(ctx, 'restoreDefaults')}
        >
          <RotateCcw className="h-3 w-3" />
          {translate(ctx, 'restore')}
        </button>
      </div>
      <div className="max-h-64 space-y-2 overflow-y-auto pr-1 custom-scrollbar">
        {items.map((item, index) => {
          const textColor = getContrastingTextColor(item.color);
          const checked = item.checked !== false;
          return (
            <div
              key={item.id}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2"
              style={{ borderLeftColor: accentColor, borderLeftWidth: 3 }}
            >
              {showCheckbox && (
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) =>
                    updateItem(index, { checked: event.target.checked })
                  }
                  className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand-blue-primary focus:ring-brand-blue-primary"
                  aria-label={`${translate(ctx, 'showItem')} ${item.label}`}
                  title={translate(ctx, checked ? 'hideItem' : 'showItem')}
                />
              )}
              <IconPicker
                currentIcon={item.icon}
                onSelect={(icon) => updateItem(index, { icon })}
              />
              <input
                type="text"
                value={item.label}
                onChange={(event) =>
                  updateItem(index, { label: event.target.value })
                }
                className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
                placeholder={translate(ctx, 'itemLabel')}
                maxLength={80}
              />
              <label
                className="relative h-7 w-7 shrink-0 cursor-pointer rounded-lg border border-slate-200 shadow-sm focus-within:ring-2 focus-within:ring-brand-blue-primary"
                style={{ backgroundColor: item.color, color: textColor }}
                title={`${translate(ctx, 'pickColor')} ${item.label || translate(ctx, 'item')}`}
              >
                <input
                  type="color"
                  value={item.color}
                  onChange={(event) =>
                    updateItem(index, { color: event.target.value })
                  }
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  aria-label={`${translate(ctx, 'pickColor')} ${item.label || translate(ctx, 'item')}`}
                />
              </label>
              <button
                type="button"
                onClick={() => updateItems(items.filter((_, i) => i !== index))}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                title={translate(ctx, 'removeItem')}
                aria-label={translate(ctx, 'removeItem')}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={addItem}
        disabled={items.length >= MAX_TILE_ITEMS}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 py-2 text-xs font-bold text-slate-500 transition-all hover:border-brand-blue-primary hover:text-brand-blue-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
        {translate(ctx, 'addItem')}
      </button>
    </>
  );
};

const TileListField: React.FC<{
  ctx: CustomRenderCtx;
  keyName: TileKey;
  defaults: NeedDoPutThenTile[];
  showCheckbox: boolean;
  accentColor: string;
}> = ({ ctx, keyName, defaults, showCheckbox, accentColor }) => {
  const config = configFor(ctx);
  const items = config[keyName] ?? defaults;

  return (
    <FieldRoot ctx={ctx}>
      <TileEditor
        ctx={ctx}
        keyName={keyName}
        items={items}
        defaults={defaults}
        showCheckbox={showCheckbox}
        accentColor={accentColor}
      />
    </FieldRoot>
  );
};

const ListField: React.FC<{ ctx: CustomRenderCtx }> = ({ ctx }) => {
  const config = configFor(ctx);
  const items = Array.isArray(config.doItems)
    ? config.doItems
    : DEFAULT_DO_ITEMS;
  const updateItems = (next: string[]) => ctx.updateConfig({ doItems: next });

  return (
    <FieldRoot ctx={ctx}>
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => updateItems([...DEFAULT_DO_ITEMS])}
          className="flex items-center gap-1 text-xxs font-bold uppercase tracking-wide text-slate-500 hover:text-brand-blue-primary"
          title={translate(ctx, 'restoreDefaults')}
        >
          <RotateCcw className="h-3 w-3" />
          {translate(ctx, 'restore')}
        </button>
      </div>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={`${index}-${item}`} className="flex items-start gap-2">
            <span className="mt-2 w-5 shrink-0 text-center text-xs font-black text-slate-500">
              {index + 1}.
            </span>
            <textarea
              value={item}
              onChange={(event) =>
                updateItems(
                  items.map((current, itemIndex) =>
                    itemIndex === index ? event.target.value : current
                  )
                )
              }
              rows={2}
              maxLength={200}
              placeholder={translate(ctx, 'stepPlaceholder', {
                number: index + 1,
              })}
              className="min-w-0 flex-1 resize-none rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
            />
            {items.length > MIN_LIST_ITEMS && (
              <button
                type="button"
                onClick={() =>
                  updateItems(
                    items.filter((_, itemIndex) => itemIndex !== index)
                  )
                }
                className="mt-1 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                title={translate(ctx, 'removeLine')}
                aria-label={translate(ctx, 'removeLine')}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      {items.length < MAX_LIST_ITEMS && (
        <button
          type="button"
          onClick={() => updateItems([...items, ''])}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 py-2 text-xs font-bold text-slate-500 transition-all hover:border-brand-blue-primary hover:text-brand-blue-primary"
        >
          <Plus className="h-3.5 w-3.5" />
          {translate(ctx, 'addLine')}
        </button>
      )}
    </FieldRoot>
  );
};

export const NeedItemsField: React.FC<{ ctx: CustomRenderCtx }> = ({ ctx }) => (
  <TileListField
    ctx={ctx}
    keyName="needItems"
    defaults={DEFAULT_NEED_ITEMS}
    showCheckbox
    accentColor={SECTION_COLORS.need}
  />
);

export const DoItemsField: React.FC<{ ctx: CustomRenderCtx }> = ({ ctx }) => (
  <ListField ctx={ctx} />
);

export const PutItemsField: React.FC<{ ctx: CustomRenderCtx }> = ({ ctx }) => (
  <TileListField
    ctx={ctx}
    keyName="putItems"
    defaults={DEFAULT_PUT_ITEMS}
    showCheckbox
    accentColor={SECTION_COLORS.put}
  />
);

export const ThenItemsField: React.FC<{ ctx: CustomRenderCtx }> = ({ ctx }) => (
  <TileListField
    ctx={ctx}
    keyName="thenItems"
    defaults={DEFAULT_THEN_ITEMS}
    showCheckbox={false}
    accentColor={SECTION_COLORS.then}
  />
);
