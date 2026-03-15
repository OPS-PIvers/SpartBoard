import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from '@testing-library/react';
import { CatalystPermissionEditor } from './CatalystPermissionEditor';
import { CatalystGlobalConfig, CatalystRoutine } from '../../types';
import { CATALYST_ROUTINES } from '../../config/catalystRoutines';

vi.mock('../../context/useAuth', () => ({
  useAuth: vi.fn(() => ({
    user: { uid: 'test-user' },
    isAdmin: true,
  })),
}));

vi.mock('../../hooks/useStorage', () => ({
  useStorage: vi.fn(() => ({
    uploadFile: vi.fn().mockResolvedValue('https://example.com/image.png'),
    uploading: false,
  })),
}));

describe('CatalystPermissionEditor', () => {
  const mockOnChange = vi.fn();
  const mockOnShowMessage = vi.fn();

  beforeEach(() => {
    mockOnChange.mockClear();
    mockOnShowMessage.mockClear();
    vi.spyOn(window, 'alert').mockImplementation(vi.fn());
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const defaultConfig: CatalystGlobalConfig = {
    customCategories: [],
    customRoutines: [],
    removedCategoryIds: [],
    removedRoutineIds: [],
  };

  it('renders default categories and routines', () => {
    render(
      <CatalystPermissionEditor
        config={defaultConfig}
        onChange={mockOnChange}
        onShowMessage={mockOnShowMessage}
      />
    );

    // Default categories should be visible
    expect(screen.getByText('Attention')).toBeInTheDocument();

    // Switch to routines tab
    fireEvent.click(screen.getByText('Routines'));
    expect(screen.getByText('Signal for Silence')).toBeInTheDocument();
  });

  it('allows adding a new category', () => {
    render(
      <CatalystPermissionEditor
        config={defaultConfig}
        onChange={mockOnChange}
        onShowMessage={mockOnShowMessage}
      />
    );

    fireEvent.click(screen.getByText('Add Category'));

    const labelInput = screen.getByDisplayValue('New Category');
    fireEvent.change(labelInput, { target: { value: 'My Custom Cat' } });

    fireEvent.click(screen.getByText('Save'));

    expect(mockOnChange).toHaveBeenCalledTimes(1);
    expect(mockOnShowMessage).toHaveBeenCalledWith('success', 'Category saved');
    const newConfig = mockOnChange.mock.calls[0][0] as CatalystGlobalConfig;
    expect(newConfig.customCategories).toBeDefined();
    expect(
      newConfig.customCategories?.some((cat) => cat.label === 'My Custom Cat')
    ).toBe(true);
  });

  it('prevents deleting a category that is in use', () => {
    render(
      <CatalystPermissionEditor
        config={defaultConfig}
        onChange={mockOnChange}
        onShowMessage={mockOnShowMessage}
      />
    );

    // 'Get Attention' category is used by 'Signal for Silence'
    const deleteBtns = screen.getAllByLabelText('Delete Category');
    const deleteBtn = deleteBtns[0]; // Assuming Attention is first

    fireEvent.click(deleteBtn);

    expect(mockOnShowMessage).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('in use')
    );
    expect(mockOnChange).not.toHaveBeenCalled();
  });

  it('allows editing a routine', () => {
    render(
      <CatalystPermissionEditor
        config={defaultConfig}
        onChange={mockOnChange}
        onShowMessage={mockOnShowMessage}
      />
    );
    fireEvent.click(screen.getByText('Routines'));

    // Edit 'Signal for Silence' (first routine)
    const editBtns = screen.getAllByLabelText('Edit Routine');
    const editBtn = editBtns[0];

    fireEvent.click(editBtn);

    const titleInput = screen.getByDisplayValue('Signal for Silence');
    fireEvent.change(titleInput, { target: { value: 'Updated Signal' } });

    fireEvent.click(screen.getByText('Save'));

    expect(mockOnChange).toHaveBeenCalledTimes(1);
    expect(mockOnShowMessage).toHaveBeenCalledWith('success', 'Routine saved');
    const newConfig = mockOnChange.mock.calls[0][0] as CatalystGlobalConfig;
    expect(newConfig.customRoutines).toBeDefined();
    expect(
      newConfig.customRoutines?.some((r) => r.title === 'Updated Signal')
    ).toBe(true);
  });

  it('validates JSON in associated widgets', async () => {
    render(
      <CatalystPermissionEditor
        config={defaultConfig}
        onChange={mockOnChange}
        onShowMessage={mockOnShowMessage}
      />
    );
    fireEvent.click(screen.getByText('Routines'));

    fireEvent.click(screen.getByText('Add Routine'));
    fireEvent.click(screen.getByText('Add Widget'));

    const textareas = screen.getAllByRole('textbox');
    const jsonInput = textareas[textareas.length - 1] as HTMLTextAreaElement;

    fireEvent.change(jsonInput, { target: { value: '{ invalid: json ' } });

    await waitFor(() => {
      expect(screen.getByText('Invalid JSON format')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Save'));
    expect(mockOnShowMessage).toHaveBeenCalledWith(
      'error',
      'Please fix JSON errors before saving.'
    );
    expect(mockOnChange).not.toHaveBeenCalled();

    fireEvent.change(jsonInput, { target: { value: '{ "valid": true }' } });

    await waitFor(() => {
      expect(screen.queryByText('Invalid JSON format')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Save'));
    expect(mockOnChange).toHaveBeenCalled();
  });

  it('merges default and custom routines correctly', () => {
    const customRoutine = {
      ...CATALYST_ROUTINES[0],
      title: 'Overridden Routine',
    };
    const newRoutine: CatalystRoutine = {
      id: 'new-routine',
      title: 'Brand New Routine',
      category: 'Get Attention',
      icon: 'Zap',
      shortDesc: 'New',
      instructions: 'New',
      associatedWidgets: [],
    };

    const config: CatalystGlobalConfig = {
      customRoutines: [customRoutine, newRoutine],
    };

    render(
      <CatalystPermissionEditor
        config={config}
        onChange={mockOnChange}
        onShowMessage={mockOnShowMessage}
      />
    );
    fireEvent.click(screen.getByText('Routines'));

    expect(screen.getByText('Overridden Routine')).toBeInTheDocument();
    expect(screen.getByText('Brand New Routine')).toBeInTheDocument();
    expect(screen.queryByText('Signal for Silence')).not.toBeInTheDocument();
  });

  it('persists deleted default categories as tombstones', async () => {
    // Initial config with routines removed to allow deleting 'Get Attention'
    const config: CatalystGlobalConfig = {
      removedRoutineIds: ['signal-silence', 'call-response'],
    };

    render(
      <CatalystPermissionEditor
        config={config}
        onChange={mockOnChange}
        onShowMessage={mockOnShowMessage}
      />
    );

    const deleteBtns = screen.getAllByLabelText('Delete Category');
    fireEvent.click(deleteBtns[0]);

    await waitFor(() => expect(mockOnChange).toHaveBeenCalledTimes(1));
    expect(mockOnShowMessage).toHaveBeenCalledWith(
      'success',
      'Category deleted'
    );
    const newConfig = mockOnChange.mock.calls[0][0] as CatalystGlobalConfig;

    expect(newConfig.removedCategoryIds).toBeDefined();
    expect(newConfig.removedCategoryIds).toContain('Get Attention');
  });

  it('persists deleted default routines as tombstones', async () => {
    render(
      <CatalystPermissionEditor
        config={defaultConfig}
        onChange={mockOnChange}
        onShowMessage={mockOnShowMessage}
      />
    );
    fireEvent.click(screen.getByText('Routines'));

    const deleteBtns = screen.getAllByLabelText('Delete Routine');
    fireEvent.click(deleteBtns[0]);

    await waitFor(() => expect(mockOnChange).toHaveBeenCalledTimes(1));
    expect(mockOnShowMessage).toHaveBeenCalledWith(
      'success',
      'Routine deleted'
    );
    const newConfig = mockOnChange.mock.calls[0][0] as CatalystGlobalConfig;

    expect(newConfig.removedRoutineIds).toBeDefined();
    expect(newConfig.removedRoutineIds?.length).toBeGreaterThan(0);
  });

  it('excludes removed categories from initialization', () => {
    const config: CatalystGlobalConfig = {
      removedCategoryIds: ['Get Attention', 'Engage'],
    };

    render(
      <CatalystPermissionEditor
        config={config}
        onChange={mockOnChange}
        onShowMessage={mockOnShowMessage}
      />
    );

    expect(screen.queryByText('Attention')).not.toBeInTheDocument();
    expect(screen.queryByText('Engage')).not.toBeInTheDocument();
    expect(screen.getByText('Set Up')).toBeInTheDocument();
  });

  it('excludes removed routines from initialization', () => {
    const config: CatalystGlobalConfig = {
      removedRoutineIds: ['signal-silence'],
    };

    render(
      <CatalystPermissionEditor
        config={config}
        onChange={mockOnChange}
        onShowMessage={mockOnShowMessage}
      />
    );
    fireEvent.click(screen.getByText('Routines'));

    expect(screen.queryByText('Signal for Silence')).not.toBeInTheDocument();
  });
});
