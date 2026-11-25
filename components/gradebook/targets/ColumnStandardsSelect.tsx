import React, { useMemo } from 'react';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import type { GradebookTargetTag } from '@/utils/gradebook/gradebookCore';
import { ChecklistSelect } from '@/components/common/ChecklistSelect';
import { useColumnTargetCatalog } from './useColumnTargetCatalog';

const MAX_ROWS = 60;

const tagCode = (t: GradebookTargetTag): string => t.code ?? t.label;

interface ColumnStandardsSelectProps {
  id?: string;
  targets: GradebookTargetTag[];
  onChange: (next: GradebookTargetTag[]) => void;
  disabled?: boolean;
}

/** D29 whole-column tags: a select-style button and a searchable checklist menu. */
export const ColumnStandardsSelect: React.FC<ColumnStandardsSelectProps> = ({
  id,
  targets,
  onChange,
  disabled,
}) => {
  const { entries } = useColumnTargetCatalog();
  // Picked tags first, including ones no longer in the catalog.
  const tags = useMemo(() => {
    const picked = new Set(targets.map((t) => t.id));
    return [
      ...targets,
      ...entries.map((e) => e.tag).filter((tag) => !picked.has(tag.id)),
    ];
  }, [entries, targets]);

  return (
    <ChecklistSelect
      id={id}
      label="Standards"
      options={tags.map((tag) => ({
        id: tag.id,
        code: tagCode(tag),
        label: tag.label,
        anchor: tourFieldAttr(
          'gradebook.column.standard-option',
          'gradebook',
          tag.id
        ),
      }))}
      selected={targets.map((t) => t.id)}
      onToggle={(tagId, checked) => {
        if (!checked) return onChange(targets.filter((t) => t.id !== tagId));
        const tag = tags.find((t) => t.id === tagId);
        if (tag) onChange([...targets, tag]);
      }}
      emptyText="None"
      noMatchesText="No matches"
      title={targets.map((t) => `${tagCode(t)} ${t.label}`).join('\n')}
      disabled={disabled}
      className="w-full"
      anchor={tourAttr('gradebook.column.standards')}
      searchFrom={0}
      searchPlaceholder={`Search ${entries.length} standards`}
      searchAnchor={tourAttr('gradebook.column.standards-search')}
      showCount
      maxRows={MAX_ROWS}
    />
  );
};
