import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FeaturePermissionsManager } from './FeaturePermissionsManager';
import type { FeaturePermission, ToolMetadata } from '@/types';

const setDocMock = vi.fn();
const dashboardStub = vi.hoisted(() => ({
  addToast: () => undefined,
  removeToast: () => undefined,
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => dashboardStub,
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join('/') })),
  getDoc: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ forEach: () => undefined }),
  setDoc: (...args: unknown[]) => setDocMock(...args) as Promise<void>,
}));
vi.mock('@/config/firebase', () => ({ db: {}, isAuthBypass: false }));
vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({ uploadWeatherImage: vi.fn() }),
}));
vi.mock('@/hooks/useAdminBuildings', () => ({ useAdminBuildings: () => [] }));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn() }),
}));
vi.mock('@/components/admin/access/useGlobalPermissionsEditor', () => ({
  useGlobalPermissionsEditor: () => ({
    graduated: new Set(),
    unsavedChanges: new Set(),
    saving: new Set(),
    getPermission: vi.fn(),
    isSaved: vi.fn(),
    updatePermission: vi.fn(),
    savePermission: vi.fn().mockResolvedValue(true),
    discardChanges: vi.fn(),
  }),
}));
vi.mock('@/components/admin/WidgetPermissionCardBody', () => ({
  WidgetPermissionCardBody: ({
    tool,
    hasUnsavedChanges,
    onEditConfig,
  }: {
    tool: ToolMetadata;
    hasUnsavedChanges: boolean;
    onEditConfig: () => void;
  }) =>
    tool.type === 'quiz' ? (
      <div>
        <span data-testid="quiz-dirty">{String(hasUnsavedChanges)}</span>
        <button onClick={onEditConfig}>edit quiz</button>
      </div>
    ) : null,
}));
vi.mock('@/components/admin/QuizConfigurationModal', () => ({
  QuizConfigurationModal: ({
    onSave,
  }: {
    onSave: (u: Partial<FeaturePermission>) => Promise<unknown>;
  }) => (
    <button onClick={() => void onSave({ enabled: false })}>save quiz</button>
  ),
}));

describe('FeaturePermissionsManager save failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('keeps a widget marked unsaved when a modal save with updates fails', async () => {
    setDocMock.mockRejectedValue(new Error('permission-denied'));
    render(<FeaturePermissionsManager />);
    fireEvent.click(await screen.findByText('edit quiz'));
    fireEvent.click(await screen.findByText('save quiz'));
    await waitFor(() => expect(setDocMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId('quiz-dirty')).toHaveTextContent('true')
    );
  });

  it('clears the unsaved mark when the modal save succeeds', async () => {
    setDocMock.mockResolvedValue(undefined);
    render(<FeaturePermissionsManager />);
    fireEvent.click(await screen.findByText('edit quiz'));
    fireEvent.click(await screen.findByText('save quiz'));
    await waitFor(() => expect(setDocMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId('quiz-dirty')).toHaveTextContent('false')
    );
  });
});
