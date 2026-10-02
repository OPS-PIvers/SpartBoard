import type { ReactNode } from 'react';
import type {
  Field,
  FieldCtx,
  UpdateConfig,
} from '@/components/settings/schema/types';

/** Field components render only the control; FieldRenderer draws the label row and help line. */
export type FieldProps<F extends Field = Field> = {
  field: F;
  value: unknown;
  onChange: (value: unknown) => void;
  id: string;
  describedBy?: string;
  /** Id of FieldRenderer's visible label, for controls whose root cannot use `<label for>`. */
  labelId?: string;
  disabled: boolean;
  ctx: FieldCtx;
  /** Field key for per-field tour anchors (list rows use a positional key). */
  tourKey?: string;
  /** List fields only: renders one row's sub-schema fields via FieldRenderer. */
  renderRow?: (
    row: Record<string, unknown>,
    rowIndex: number,
    onRowChange: (nextRow: Record<string, unknown>) => void
  ) => ReactNode;
  /** Mount-stable patch writer for Custom `render` and fields that write a second key. */
  updateConfig?: UpdateConfig;
  /** PartnerWidget only: renders the inner control via FieldRenderer. */
  renderField?: (field: Field, forceDisabled: boolean) => ReactNode;
};
