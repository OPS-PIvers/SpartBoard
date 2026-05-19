import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PermissionBuildingMultiSelect } from '@/components/admin/PermissionBuildingMultiSelect';

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [
    { id: 'elem', name: 'Elementary' },
    { id: 'mid', name: 'Middle' },
    { id: 'high', name: 'High School' },
  ],
}));

describe('PermissionBuildingMultiSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders an "All buildings" pill when selection is empty', () => {
    render(
      <PermissionBuildingMultiSelect selectedIds={[]} onChange={vi.fn()} />
    );
    expect(screen.getByText(/all buildings/i)).toBeInTheDocument();
  });

  it('marks selected buildings as pressed and unselected as not pressed', () => {
    render(
      <PermissionBuildingMultiSelect
        selectedIds={['elem', 'high']}
        onChange={vi.fn()}
      />
    );
    expect(
      screen.getByRole('button', { name: /remove elementary/i })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: /remove high school/i })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /add middle/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('calls onChange with the new selection when an unselected building is clicked', () => {
    const onChange = vi.fn();
    render(
      <PermissionBuildingMultiSelect
        selectedIds={['elem']}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /add middle/i }));
    expect(onChange).toHaveBeenCalledWith(['elem', 'mid']);
  });

  it('calls onChange removing the building when a selected chip is clicked', () => {
    const onChange = vi.fn();
    render(
      <PermissionBuildingMultiSelect
        selectedIds={['elem', 'high']}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /remove elementary/i }));
    expect(onChange).toHaveBeenCalledWith(['high']);
  });

  it('renders orphan IDs as amber chips and removes them on click', () => {
    const onChange = vi.fn();
    render(
      <PermissionBuildingMultiSelect
        selectedIds={['elem', 'deleted-bldg-99']}
        onChange={onChange}
      />
    );
    const orphanChip = screen.getByRole('button', {
      name: /remove unknown building deleted-bldg-99/i,
    });
    expect(orphanChip).toBeInTheDocument();
    expect(orphanChip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(orphanChip);
    expect(onChange).toHaveBeenCalledWith(['elem']);
  });
});
