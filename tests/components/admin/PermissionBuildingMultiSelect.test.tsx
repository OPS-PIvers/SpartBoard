import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PermissionBuildingMultiSelect } from '@/components/admin/PermissionBuildingMultiSelect';
import { useAdminBuildingsState } from '@/hooks/useAdminBuildings';

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => [
    { id: 'elem', name: 'Elementary' },
    { id: 'mid', name: 'Middle' },
    { id: 'high', name: 'High School' },
  ],
  useAdminBuildingsState: vi.fn(() => ({
    buildings: [
      { id: 'elem', name: 'Elementary' },
      { id: 'mid', name: 'Middle' },
      { id: 'high', name: 'High School' },
    ],
    isLoading: false,
  })),
}));

const openMenu = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Buildings' }));
const row = (name: RegExp) => screen.getByRole('menuitemcheckbox', { name });

describe('PermissionBuildingMultiSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads "All buildings" when nothing is picked', () => {
    render(
      <PermissionBuildingMultiSelect selectedIds={[]} onChange={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: 'Buildings' })).toHaveTextContent(
      'All buildings'
    );
  });

  it('lists the picks on the button and checks them in the menu', () => {
    render(
      <PermissionBuildingMultiSelect
        selectedIds={['elem', 'high']}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: 'Buildings' })).toHaveTextContent(
      'Elementary, High School'
    );
    openMenu();
    expect(row(/elementary/i)).toHaveAttribute('aria-checked', 'true');
    expect(row(/high school/i)).toHaveAttribute('aria-checked', 'true');
    expect(row(/middle/i)).toHaveAttribute('aria-checked', 'false');
  });

  it('adds a building and stays open', () => {
    const onChange = vi.fn();
    render(
      <PermissionBuildingMultiSelect
        selectedIds={['elem']}
        onChange={onChange}
      />
    );
    openMenu();
    fireEvent.click(row(/middle/i));
    expect(onChange).toHaveBeenCalledWith(['elem', 'mid']);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('removes a picked building', () => {
    const onChange = vi.fn();
    render(
      <PermissionBuildingMultiSelect
        selectedIds={['elem', 'high']}
        onChange={onChange}
      />
    );
    openMenu();
    fireEvent.click(row(/elementary/i));
    expect(onChange).toHaveBeenCalledWith(['high']);
  });

  it('lists a deleted building so it can be cleared', () => {
    const onChange = vi.fn();
    render(
      <PermissionBuildingMultiSelect
        selectedIds={['elem', 'deleted-bldg-99']}
        onChange={onChange}
      />
    );
    openMenu();
    const orphan = row(/unknown building \(deleted-bldg-99\)/i);
    expect(orphan).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(orphan);
    expect(onChange).toHaveBeenCalledWith(['elem']);
  });

  it('treats a legacy building id as selected instead of an orphan', () => {
    // 'orono-high-school' is a pre-migration alias for the canonical 'high' id.
    render(
      <PermissionBuildingMultiSelect
        selectedIds={['orono-high-school']}
        onChange={vi.fn()}
      />
    );
    openMenu();
    expect(row(/high school/i)).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText(/unknown building/i)).not.toBeInTheDocument();
  });

  it('writes the canonical id when toggling off a legacy-keyed selection', () => {
    const onChange = vi.fn();
    render(
      <PermissionBuildingMultiSelect
        selectedIds={['orono-high-school']}
        onChange={onChange}
      />
    );
    openMenu();
    fireEvent.click(row(/high school/i));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('hides unknown buildings while buildings are loading', () => {
    vi.mocked(useAdminBuildingsState).mockReturnValue({
      buildings: [],
      isLoading: true,
    });
    render(
      <PermissionBuildingMultiSelect
        selectedIds={['orphan-id']}
        onChange={vi.fn()}
      />
    );
    openMenu();
    expect(screen.queryByText(/unknown building/i)).not.toBeInTheDocument();
  });
});
