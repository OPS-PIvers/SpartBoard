import React, { useRef } from 'react';
import { GripVertical, Plus, X } from 'lucide-react';
import { SortableList } from '@/components/common/SortableList';
import type { FieldProps } from '../FieldProps';
import type { ListField } from '@/components/settings/schema/types';
import { resolveLabel } from '../resolveLabel';
import { useStorage } from '@/hooks/useStorage';

type Row = Record<string, unknown>;

let rowIdCounter = 0;

type ListImplProps = FieldProps & {
  deleteImage?: (url: string) => void;
};

const ListImpl: React.FC<ListImplProps> = ({
  field,
  value,
  onChange,
  id,
  describedBy,
  labelId,
  disabled,
  ctx,
  renderRow,
  deleteImage,
}) => {
  // Keyed by object identity, not array index, so remove/reorder can't steal another row's focus.
  const rowIds = useRef(new WeakMap<Row, string>());
  // Primitive rows (malformed/legacy) can't key a WeakMap, so hold them by value — equal primitives share an id, which nothing can distinguish anyway.
  const primitiveRowIds = useRef(new Map<unknown, string>());
  const rows = Array.isArray(value) ? (value as Row[]) : [];

  const getRowId = (row: Row): string => {
    if (row === null || typeof row !== 'object') {
      const cached = primitiveRowIds.current.get(row);
      if (cached) return cached;
      const minted = `row-${rowIdCounter++}`;
      primitiveRowIds.current.set(row, minted);
      return minted;
    }
    if (typeof row.id === 'string' && row.id) return row.id;
    const existing = rowIds.current.get(row);
    if (existing) return existing;
    const fresh = `row-${rowIdCounter++}`;
    rowIds.current.set(row, fresh);
    return fresh;
  };

  if (field.type !== 'list') return null;
  const listField = field as ListField<string>;
  const maxRows = listField.maxRows;
  const sortable = listField.sortable ?? false;
  const addDisabled =
    disabled || (maxRows !== undefined && rows.length >= maxRows);

  const handleAdd = () => {
    const newRow = listField.row.createRow
      ? listField.row.createRow(rows.length)
      : {};
    onChange([...rows, newRow]);
  };

  const handleRemove = (index: number) => {
    const cleanupKey = listField.cleanupImageKey;
    const cleanupValue = cleanupKey ? rows[index]?.[cleanupKey] : undefined;
    onChange(rows.filter((_, i) => i !== index));
    if (typeof cleanupValue === 'string' && cleanupValue) {
      deleteImage?.(cleanupValue);
    }
  };

  const handleRowChange = (index: number, nextRow: Row) => {
    if (
      nextRow !== rows[index] &&
      nextRow !== null &&
      typeof nextRow === 'object' &&
      !(typeof nextRow.id === 'string' && nextRow.id)
    ) {
      rowIds.current.set(nextRow, getRowId(rows[index]));
    }
    onChange(rows.map((row, i) => (i === index ? nextRow : row)));
  };

  const addLabel = resolveLabel(
    ctx.t,
    ctx.widget.type,
    listField.addLabel ?? 'addRow'
  );
  const removeLabel = resolveLabel(ctx.t, ctx.widget.type, 'removeRow');
  const reorderLabel = resolveLabel(ctx.t, ctx.widget.type, 'reorderRow');

  const row = (
    rowValue: Row,
    index: number,
    dragHandle?: {
      attributes: React.HTMLAttributes<HTMLElement>;
      listeners: Record<string, (event: Event) => void> | undefined;
    }
  ) => (
    <div className="flex items-start gap-2">
      {dragHandle && (
        <button
          type="button"
          {...dragHandle.attributes}
          {...(dragHandle.listeners ?? {})}
          disabled={disabled}
          aria-label={reorderLabel}
          className="mt-1 text-slate-400 hover:text-slate-600 cursor-grab disabled:cursor-not-allowed"
        >
          <GripVertical style={{ width: 14, height: 14 }} />
        </button>
      )}
      <div className="flex-1 min-w-0">
        {renderRow
          ? renderRow(rowValue, index, (next) => handleRowChange(index, next))
          : null}
      </div>
      <button
        type="button"
        onClick={() => handleRemove(index)}
        disabled={disabled}
        aria-label={removeLabel}
        className="mt-1 text-slate-400 hover:text-slate-600 disabled:cursor-not-allowed"
      >
        <X style={{ width: 14, height: 14 }} />
      </button>
    </div>
  );

  return (
    <div
      id={id}
      role="group"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      className="flex flex-col gap-2"
    >
      {sortable ? (
        <SortableList
          items={rows}
          getId={(item) => getRowId(item)}
          onReorder={(next) => onChange(next)}
          renderItem={(item, dragHandle, index) => row(item, index, dragHandle)}
        />
      ) : (
        rows.map((r, index) => <div key={getRowId(r)}>{row(r, index)}</div>)
      )}
      <button
        type="button"
        onClick={handleAdd}
        disabled={addDisabled}
        className="flex items-center gap-1 text-xs font-medium text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus style={{ width: 14, height: 14 }} />
        {addLabel}
      </button>
    </div>
  );
};

const StorageManagedList: React.FC<FieldProps> = (props) => {
  const { deleteFile } = useStorage();

  const deleteImage = (url: string) => {
    void deleteFile(url).catch((error) => {
      console.warn('[SettingsList] Failed to delete removed row image.', error);
    });
  };

  return <ListImpl {...props} deleteImage={deleteImage} />;
};

export const List: React.FC<FieldProps> = (props) =>
  props.field.type === 'list' && props.field.cleanupImageKey ? (
    <StorageManagedList {...props} />
  ) : (
    <ListImpl {...props} />
  );
