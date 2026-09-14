import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { FeaturePermission } from '@/types';

const mockAddToast = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: mockAddToast }),
}));

const STABLE_BUILDINGS = [
  { id: 'b1', name: 'Building One' },
  { id: 'b2', name: 'Building Two' },
];
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => STABLE_BUILDINGS,
}));

vi.mock('@/components/admin/QuizReadAloudConfigurationPanel', () => ({
  QuizReadAloudConfigurationPanel: () => <div>Languages panel</div>,
}));

import { QuizConfigurationModal } from '@/components/admin/QuizConfigurationModal';

const permission: FeaturePermission = {
  widgetType: 'quiz',
  accessLevel: 'public',
  betaUsers: [],
  enabled: true,
};

beforeEach(() => {
  mockAddToast.mockClear();
});

describe('QuizConfigurationModal', () => {
  it('defaults the raise-hand mode to teacher choice', () => {
    render(
      <QuizConfigurationModal
        isOpen
        onClose={vi.fn()}
        permission={permission}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/Teacher's choice/)).toBeChecked();
    expect(screen.getByLabelText(/Always on/)).not.toBeChecked();
  });

  it('saves the selected mode under the active building', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <QuizConfigurationModal
        isOpen
        onClose={onClose}
        permission={permission}
        onSave={onSave}
      />
    );
    fireEvent.click(screen.getByLabelText(/Always on/));
    fireEvent.click(screen.getByText('Save Configuration'));
    expect(onSave).toHaveBeenCalledWith({
      config: { buildingDefaults: { b1: { handRaiseMode: 'force-on' } } },
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('hydrates the stored mode for the selected building', () => {
    render(
      <QuizConfigurationModal
        isOpen
        onClose={vi.fn()}
        permission={{
          ...permission,
          config: { buildingDefaults: { b1: { handRaiseMode: 'force-off' } } },
        }}
        onSave={vi.fn()}
      />
    );
    expect(screen.getByLabelText(/Always off/)).toBeChecked();
  });

  it('shows the languages panel on its tab', () => {
    render(
      <QuizConfigurationModal
        isOpen
        onClose={vi.fn()}
        permission={permission}
        onSave={vi.fn()}
      />
    );
    expect(screen.queryByText('Languages panel')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Languages/ }));
    expect(screen.getByText('Languages panel')).toBeInTheDocument();
  });
});
