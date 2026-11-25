import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Clock } from 'lucide-react';
import { WidgetPermissionCardBody } from '@/components/admin/WidgetPermissionCardBody';
import type { FeaturePermission } from '@/types';

const BUILDINGS = [
  { id: 'schumann', name: 'Schumann Elementary' },
  { id: 'intermediate', name: 'Intermediate School' },
  { id: 'high', name: 'High School' },
];

vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => BUILDINGS,
  useAdminBuildingsState: () => ({ buildings: BUILDINGS, isLoading: false }),
}));

function renderRow(
  permission: FeaturePermission,
  updatePermission = vi.fn()
): ReturnType<typeof vi.fn> {
  render(
    <WidgetPermissionCardBody
      tool={{
        type: 'clock',
        icon: Clock,
        label: 'Clock',
        color: 'bg-blue-500',
      }}
      permission={permission}
      currentLevels={['k-2', '3-5', '6-8', '9-12']}
      isAllSelected
      isSaving={false}
      hasUnsavedChanges={false}
      isActiveModal={false}
      updatePermission={updatePermission}
      toggleGradeLevel={vi.fn()}
      toggleAllGradeLevels={vi.fn()}
      savePermission={vi.fn()}
      onEditConfig={vi.fn()}
      showMessage={vi.fn()}
    />
  );
  return updatePermission;
}

const base: FeaturePermission = {
  widgetType: 'clock',
  accessLevel: 'public',
  betaUsers: [],
  enabled: true,
};

describe('WidgetPermissionCardBody building restriction', () => {
  it('saves the picked buildings on the permission', () => {
    const update = renderRow(base);
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Add High School' }));
    expect(update).toHaveBeenCalledWith({ buildings: ['high'] });
  });

  it('names the restricted buildings on the collapsed row', () => {
    renderRow({ ...base, buildings: ['schumann', 'intermediate'] });
    expect(
      screen.getByText('Schumann Elementary, Intermediate School')
    ).toBeInTheDocument();
  });
});
