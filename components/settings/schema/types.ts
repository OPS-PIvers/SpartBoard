import type { ReactNode } from 'react';
import type { GlobalFeature, WidgetData, WidgetType } from '@/types';
import type { AppearanceKey } from '@/utils/widgetConfigPersistence';

/** Appearance keys a schema may list in `styleKeys` (membership checked at runtime). */
export type { AppearanceKey } from '@/utils/widgetConfigPersistence';

export type TranslateFn = (
  key: string,
  options?: Record<string, unknown>
) => string;

export type FieldCtx = {
  config: Record<string, unknown>;
  widget: WidgetData;
  isAdmin: boolean;
  canAccessFeature: (featureId: GlobalFeature) => boolean;
  /** Widget-level feature permission; a `partnerWidget` card is dropped entirely when this denies its partner. */
  canAccessWidget?: (type: WidgetType) => boolean;
  /** Dock-facing widget name (admin displayName override, else the TOOLS label). */
  toolLabel?: (type: WidgetType) => string;
  t: TranslateFn;
  /** Set by the drawer only; fields pick drawer presentations (dropdowns, sliders, new presets) while the legacy panel stays frozen. */
  surface?: 'drawer';
};

/** Mount-stable config writer handed to `Custom.render`. */
export type UpdateConfig = (patch: Record<string, unknown>) => void;

/** Rejects dotted keys at compile time; top-level config keys only. */
export type NoDots<K extends string> = K extends `${string}.${string}`
  ? never
  : K;

export type FieldBase<K extends string> = {
  key: NoDots<K>;
  label: string;
  help?: string;
  /** Additional localized leaves indexed by the find-a-setting filter. */
  searchTerms?: ReadonlyArray<string>;
  /** Sub-heading leaf; SchemaRenderer prints it once above the first visible field that carries it. */
  section?: string;
  visibleWhen?: (ctx: FieldCtx) => boolean;
  disabledWhen?: (ctx: FieldCtx) => boolean;
  /** Derive a displayed value when an unset config key inherits from contextual defaults. */
  readValue?: (ctx: FieldCtx) => unknown;
  /** Expand one field edit into an atomic patch that may update sibling config keys. */
  toPatch?: (value: unknown, ctx: FieldCtx) => Record<string, unknown>;
};

export type FieldOption = {
  value: string | number;
  label: string;
  icon?: ReactNode;
};

export type ToggleField<K extends string> = FieldBase<K> & { type: 'toggle' };

export type TextField<K extends string> = FieldBase<K> & {
  type: 'text';
  placeholder?: string;
  maxLength?: number;
  /** Normalize a completed edit without disrupting typing. */
  normalizeOnBlur?: (value: string) => string;
};

export type TextareaField<K extends string> = FieldBase<K> & {
  type: 'textarea';
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  /** Code surface: monospace font, spellcheck off, dark editor colors. */
  monospace?: boolean;
};

export type NumberField<K extends string> = FieldBase<K> & {
  type: 'number';
  min?: number;
  max?: number;
  step?: number;
};

export type SelectField<K extends string> = FieldBase<K> & {
  type: 'select';
  options: ReadonlyArray<FieldOption>;
};

export type SegmentedField<K extends string> = FieldBase<K> & {
  type: 'segmented';
  options: ReadonlyArray<FieldOption>;
};

export type SliderField<K extends string> = FieldBase<K> & {
  type: 'slider';
  min: number;
  max: number;
  step?: number;
};

export type ColorField<K extends string> = FieldBase<K> & {
  type: 'color';
  /** Bare hexes, or named presets so swatches get readable accessible names. */
  presets?: ReadonlyArray<string | { name: string; hex: string }>;
  allowTransparent?: boolean;
};

export type FontFamilyField<K extends string> = FieldBase<K> & {
  type: 'fontFamily';
};

export type TextSizePresetField<K extends string> = FieldBase<K> & {
  type: 'textSizePreset';
};

export type AccentColorField<K extends string> = FieldBase<K> & {
  type: 'accentColor';
  /** Color shown while unset; derive it from config to inherit a sibling color live. */
  fallback?: (ctx: FieldCtx) => string;
  /** Leaf key for the clear-to-fallback swatch label. */
  fallbackLabel?: string;
};

export type SurfaceColorField<K extends string> = FieldBase<K> & {
  type: 'surfaceColor';
  opacityKey?: string;
};

export type IconPickerField<K extends string> = FieldBase<K> & {
  type: 'iconPicker';
  /** Lucide icon names to offer; defaults to COMMON_INSTRUCTIONAL_ICONS. */
  icons?: ReadonlyArray<string>;
};

export type EmojiPickerField<K extends string> = FieldBase<K> & {
  type: 'emojiPicker';
  /** Emoji to offer as a flat grid; defaults to the curated classroom set. */
  emoji?: ReadonlyArray<string>;
};

export type ImageUploadField<K extends string> = FieldBase<K> & {
  type: 'imageUpload';
  accept?: string;
};

export type SoundOption = { value: string; label: string };

export type SoundPickerField<K extends string> = FieldBase<K> & {
  type: 'soundPicker';
  options: ReadonlyArray<SoundOption>;
  /** Plays the sound for `value`; omit to hide the per-option play buttons. */
  preview?: (value: string) => void;
};

export type RosterPickerField<K extends string> = FieldBase<K> & {
  type: 'rosterPicker';
};

/** Field types usable inside a `List` row; rows never nest lists or custom fields. */
export type RowField<K extends string = string> =
  | ToggleField<K>
  | TextField<K>
  | TextareaField<K>
  | NumberField<K>
  | SelectField<K>
  | SegmentedField<K>
  | SliderField<K>
  | ColorField<K>
  | FontFamilyField<K>
  | TextSizePresetField<K>
  | AccentColorField<K>
  | SurfaceColorField<K>
  | IconPickerField<K>
  | EmojiPickerField<K>
  | ImageUploadField<K>
  | SoundPickerField<K>
  | RosterPickerField<K>;

/** Row sub-schema: keys address row-object properties, not config paths. */
export type RowSchema<Row> = {
  fields: ReadonlyArray<RowField<Extract<keyof Row, string>>>;
  /** Receives the index where the new row will be appended. */
  createRow?: (index: number) => Row;
};

export type ListField<
  K extends string,
  Row = Record<string, unknown>,
> = FieldBase<K> & {
  type: 'list';
  row: RowSchema<Row>;
  addLabel?: string;
  maxRows?: number;
  sortable?: boolean;
  /** Optional row image property whose owned upload is deleted when the row is removed. */
  cleanupImageKey?: Extract<keyof Row, string>;
};

/** Custom roots should carry `id={id}` and `aria-labelledby={labelId}` (plus `aria-describedby={describedBy}`) so FieldRenderer's label row names them. */
export type CustomRenderCtx = FieldCtx & {
  updateConfig: UpdateConfig;
  id: string;
  labelId: string;
  describedBy?: string;
};

export type CustomField<K extends string> = FieldBase<K> & {
  type: 'custom';
  render: (ctx: CustomRenderCtx) => ReactNode;
};

/** A setting that only acts through a sibling widget: the card is titled by the partner, disables its control while the partner is off the board, and offers a one-tap add. */
export type PartnerWidgetField<K extends string> = FieldBase<K> & {
  type: 'partnerWidget';
  partner: WidgetType;
  control: RowField<K> | CustomField<K>;
  /** Explanation shown (with the add button) while the partner is missing. */
  missingHelp: string;
};

export type Field<K extends string = string, Row = Record<string, unknown>> =
  | RowField<K>
  | ListField<K, Row>
  | CustomField<K>
  | PartnerWidgetField<K>;

/** `visibleWhen` plus the partner-permission gate, so every renderer and the filter agree. */
export function isFieldVisible(field: Field, ctx: FieldCtx): boolean {
  if (field.visibleWhen && !field.visibleWhen(ctx)) return false;
  if (field.type === 'partnerWidget' && ctx.canAccessWidget) {
    return ctx.canAccessWidget(field.partner);
  }
  return true;
}

export type GroupId = 'content' | 'behavior' | 'display';

/** D8 order: content, then behavior, then display. */
export const GROUP_ORDER: ReadonlyArray<GroupId> = [
  'content',
  'behavior',
  'display',
];

export type SettingsTab = 'settings' | 'style';

/** Which D8 groups each drawer tab renders: `display` is the widget-scoped section of the Style tab. */
export const TAB_GROUPS: Record<SettingsTab, ReadonlyArray<GroupId>> = {
  settings: ['content', 'behavior'],
  style: ['display'],
};

export type Group<K extends string = string, Row = Record<string, unknown>> = {
  id: GroupId;
  title?: string;
  fields: ReadonlyArray<Field<K, Row>>;
};

export type WidgetSettingsSchema<C = Record<string, unknown>> = {
  groups: ReadonlyArray<Group<Extract<keyof C, string>>>;
  styleKeys?: ReadonlyArray<AppearanceKey>;
  configVersion?: number;
};
