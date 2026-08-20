/**
 * Regression test: a new "High" (or "Middle"/"Other") building must not be
 * saved with the "Grades served" field hardcoded to elementary's 'K-5'.
 *
 * `grades` drives grade-level widget filtering (buildingRecordToBuilding()
 * in config/buildings.ts parses it, and only falls back to a Type-derived
 * default when the string is unparseable). 'K-5' parses successfully to
 * ['k-2', '3-5'], so an admin who creates a High school building without
 * manually editing "Grades served" silently gets elementary-band widget
 * filtering for that building instead of 9-12.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { BuildingsView } from '@/components/admin/Organization/views/BuildingsView';
import type { BuildingRecord } from '@/components/admin/Organization/types';

describe('BuildingsView — Add building grades default', () => {
  it('defaults saved grades to the selected Type, not a hardcoded K-5', () => {
    const onAdd = vi.fn();
    render(
      <BuildingsView
        buildings={[]}
        actorRole="super_admin"
        actorBuildingIds={[]}
        onAdd={onAdd}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    fireEvent.click(
      screen.getAllByRole('button', { name: /add building/i })[0]
    );

    const dialog = screen.getByRole('dialog');
    fireEvent.change(
      within(dialog).getByPlaceholderText('Orono Middle School'),
      {
        target: { value: 'Orono High School' },
      }
    );
    fireEvent.change(within(dialog).getByRole('combobox'), {
      target: { value: 'high' },
    });
    // "Grades served" is intentionally left untouched by the admin.

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Add building' })
    );

    expect(onAdd).toHaveBeenCalledTimes(1);
    const record = onAdd.mock.calls[0][0] as Partial<BuildingRecord>;
    expect(record.grades).toBe('9-12');
  });

  it('defaults "Other"-type buildings to K-12, not an empty string', () => {
    // Regression: gradeLabelFromType('other') used to return '', so an
    // Other-type building left blank saved grades: '' — buildingRecordToBuilding()
    // then produced an empty gradeLevels array, which hides every grade-gated
    // widget in FeaturePermissionsManager's building filter (.some() on []
    // is always false). Flagged by automated PR review on #2511.
    const onAdd = vi.fn();
    render(
      <BuildingsView
        buildings={[]}
        actorRole="super_admin"
        actorBuildingIds={[]}
        onAdd={onAdd}
        onUpdate={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    fireEvent.click(
      screen.getAllByRole('button', { name: /add building/i })[0]
    );

    const dialog = screen.getByRole('dialog');
    fireEvent.change(
      within(dialog).getByPlaceholderText('Orono Middle School'),
      {
        target: { value: 'Orono Community Education' },
      }
    );
    fireEvent.change(within(dialog).getByRole('combobox'), {
      target: { value: 'other' },
    });
    // "Grades served" is intentionally left untouched by the admin.

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Add building' })
    );

    expect(onAdd).toHaveBeenCalledTimes(1);
    const record = onAdd.mock.calls[0][0] as Partial<BuildingRecord>;
    expect(record.grades).toBe('K-12');
    expect(record.grades).not.toBe('');
  });
});
