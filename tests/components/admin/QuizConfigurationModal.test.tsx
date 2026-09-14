import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { FeaturePermission } from '@/types';

const mockAddToast = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: mockAddToast }),
}));

const mockShowConfirm = vi.fn().mockResolvedValue(true);
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: mockShowConfirm }),
}));

let mockBuildings: { id: string; name: string }[] = [
  { id: 'b1', name: 'Building One' },
  { id: 'b2', name: 'Building Two' },
];
vi.mock('@/hooks/useAdminBuildings', () => ({
  useAdminBuildings: () => mockBuildings,
}));

// Stateful stub: proves the panel stays mounted (its draft survives tab switches)
// and lets a test drive the unsaved-draft callback.
vi.mock('@/components/admin/QuizReadAloudConfigurationPanel', () => ({
  QuizReadAloudConfigurationPanel: ({
    onDirtyChange,
  }: {
    onDirtyChange?: (dirty: boolean) => void;
  }) => {
    const [draft, setDraft] = React.useState('');
    React.useEffect(() => {
      onDirtyChange?.(draft !== '');
    }, [draft, onDirtyChange]);
    return (
      <div>
        <span>Languages panel</span>
        <input
          aria-label="panel draft"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </div>
    );
  },
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
  mockShowConfirm.mockClear();
  mockShowConfirm.mockResolvedValue(true);
  mockBuildings = [
    { id: 'b1', name: 'Building One' },
    { id: 'b2', name: 'Building Two' },
  ];
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

  it('saves the selected mode under the active building', async () => {
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
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith({
      config: { buildingDefaults: { b1: { handRaiseMode: 'force-on' } } },
    });
  });

  it('preserves unrelated config keys such as dockDefaults', async () => {
    const onSave = vi.fn();
    render(
      <QuizConfigurationModal
        isOpen
        onClose={vi.fn()}
        permission={{
          ...permission,
          config: { dockDefaults: { b1: false } },
        }}
        onSave={onSave}
      />
    );
    fireEvent.click(screen.getByLabelText(/Always off/));
    fireEvent.click(screen.getByText('Save Configuration'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith({
      config: {
        dockDefaults: { b1: false },
        buildingDefaults: { b1: { handRaiseMode: 'force-off' } },
      },
    });
  });

  it('reports an error and stays open when the write fails', async () => {
    const onClose = vi.fn();
    render(
      <QuizConfigurationModal
        isOpen
        onClose={onClose}
        permission={permission}
        onSave={() => Promise.resolve(false)}
      />
    );
    fireEvent.click(screen.getByText('Save Configuration'));
    await waitFor(() =>
      expect(mockAddToast).toHaveBeenCalledWith(
        'Failed to save quiz configuration.',
        'error'
      )
    );
    expect(onClose).not.toHaveBeenCalled();
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

  it('shows an empty state and writes no building entry with no buildings', async () => {
    mockBuildings = [];
    const onSave = vi.fn();
    render(
      <QuizConfigurationModal
        isOpen
        onClose={vi.fn()}
        permission={permission}
        onSave={onSave}
      />
    );
    expect(screen.getByText('No buildings configured')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Always on/)).toBeNull();
    fireEvent.click(screen.getByText('Save Configuration'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith({ config: { buildingDefaults: {} } });
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
    expect(screen.getByText('Languages panel')).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Languages/ }));
    expect(screen.getByText('Languages panel')).toBeVisible();
  });

  it('hides the footer save on the languages tab so the panel keeps its own', () => {
    render(
      <QuizConfigurationModal
        isOpen
        onClose={vi.fn()}
        permission={permission}
        onSave={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Languages/ }));
    expect(screen.queryByText('Save Configuration')).toBeNull();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('keeps the languages draft alive across tab switches', () => {
    render(
      <QuizConfigurationModal
        isOpen
        onClose={vi.fn()}
        permission={permission}
        onSave={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Languages/ }));
    fireEvent.change(screen.getByLabelText('panel draft'), {
      target: { value: 'es' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Behavior/ }));
    fireEvent.click(screen.getByRole('button', { name: /Languages/ }));
    expect(screen.getByLabelText('panel draft')).toHaveValue('es');
  });

  it('confirms before closing with an unsaved languages draft', async () => {
    const onClose = vi.fn();
    render(
      <QuizConfigurationModal
        isOpen
        onClose={onClose}
        permission={permission}
        onSave={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Languages/ }));
    fireEvent.change(screen.getByLabelText('panel draft'), {
      target: { value: 'es' },
    });
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(mockShowConfirm).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it('closes without a prompt when nothing was edited', async () => {
    const onClose = vi.fn();
    render(
      <QuizConfigurationModal
        isOpen
        onClose={onClose}
        permission={permission}
        onSave={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockShowConfirm).not.toHaveBeenCalled();
  });

  it('confirms before discarding unsaved edits', async () => {
    const onClose = vi.fn();
    render(
      <QuizConfigurationModal
        isOpen
        onClose={onClose}
        permission={permission}
        onSave={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText(/Always on/));
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(mockShowConfirm).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it('stays open when the discard prompt is declined', async () => {
    mockShowConfirm.mockResolvedValue(false);
    const onClose = vi.fn();
    render(
      <QuizConfigurationModal
        isOpen
        onClose={onClose}
        permission={permission}
        onSave={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText(/Always off/));
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(mockShowConfirm).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });
});
