import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { WallEditorModal } from './WallEditorModal';
import type { ActivityWallLibraryEntry } from '@/types';

const { mockSaveActivity } = vi.hoisted(() => ({
  mockSaveActivity: vi.fn((_entry: unknown) => Promise.resolve()),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1' },
    featurePermissions: [],
    selectedBuildings: [],
  }),
}));

vi.mock('@/hooks/useActivityWallLibrary', () => ({
  useActivityWallLibrary: () => ({
    activities: [],
    loading: false,
    error: null,
    saveActivity: mockSaveActivity,
    deleteActivity: vi.fn(),
  }),
}));

vi.mock('@/hooks/useBackgrounds', () => ({
  useBackgrounds: () => ({
    presets: [],
    colors: [],
    patterns: [],
    gradients: [],
  }),
}));

vi.mock('@/utils/classlinkService', () => ({
  classLinkService: {
    getRosters: vi.fn(() => Promise.resolve({ classes: [] })),
  },
}));

vi.mock('@/components/common/Modal', () => ({
  Modal: ({
    isOpen,
    children,
    footer,
  }: {
    isOpen: boolean;
    children: React.ReactNode;
    footer?: React.ReactNode;
  }) =>
    isOpen ? (
      <div>
        {children}
        {footer}
      </div>
    ) : null,
}));

const renderModal = (entry: ActivityWallLibraryEntry | null = null) =>
  render(
    <WallEditorModal open entry={entry} onClose={vi.fn()} onSaved={vi.fn()} />
  );

describe('WallEditorModal', () => {
  beforeEach(() => {
    mockSaveActivity.mockClear();
  });

  it('advances from the layout grid to the settings form and shows submission types', () => {
    renderModal();
    expect(
      screen.getByRole('group', { name: 'Wall layout' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Columns/ }));

    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.getByText('Submission types')).toBeInTheDocument();
    expect(screen.getByText('Layout: Columns')).toBeInTheDocument();
  });

  it('hides submission types when the chosen layout is word cloud', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Word Cloud/ }));

    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.queryByText('Submission types')).not.toBeInTheDocument();
  });

  it('returns to the layout grid with a warning from "Change layout" for an existing wall', () => {
    renderModal({
      id: 'wall-1',
      title: 'Existing',
      prompt: '',
      mode: 'photo',
      moderationEnabled: false,
      identificationMode: 'anonymous',
      createdAt: 0,
      updatedAt: 0,
      layout: 'wall',
    } as ActivityWallLibraryEntry);
    fireEvent.click(screen.getByRole('button', { name: 'Change layout' }));

    expect(
      screen.getByRole('group', { name: 'Wall layout' })
    ).toBeInTheDocument();
    expect(screen.getByText(/keeps every existing post/i)).toBeInTheDocument();
  });

  it('saves the entry with the deprecated legacy fields derived from the new ones', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Word Cloud/ }));
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Exit ticket' },
    });
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'What did you learn?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save wall' }));

    await waitFor(() => expect(mockSaveActivity).toHaveBeenCalledTimes(1));
    const saved = mockSaveActivity.mock.calls[0][0] as ActivityWallLibraryEntry;
    expect(saved.title).toBe('Exit ticket');
    expect(saved.layout).toBe('wordcloud');
    expect(saved.mode).toBe('text');
    expect(saved.identificationMode).toBe('anonymous');
    expect(saved.classId).toBeUndefined();
  });

  it('clears the layout-change warning once a new layout is chosen', () => {
    renderModal({
      id: 'wall-1',
      title: 'Existing',
      prompt: '',
      mode: 'photo',
      moderationEnabled: false,
      identificationMode: 'anonymous',
      createdAt: 0,
      updatedAt: 0,
      layout: 'wall',
    } as ActivityWallLibraryEntry);

    fireEvent.click(screen.getByRole('button', { name: 'Change layout' }));
    expect(screen.getByText(/keeps every existing post/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Columns/ }));
    expect(
      screen.queryByText(/keeps every existing post/i)
    ).not.toBeInTheDocument();
  });

  it('never shows the layout-change warning for a brand-new wall', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Wall/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Change layout' }));

    expect(
      screen.queryByText(/keeps every existing post/i)
    ).not.toBeInTheDocument();
  });

  it('seeds two placeholder columns when Columns is first chosen for a new wall', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Columns/ }));

    expect(screen.getByPlaceholderText('Column 1')).toHaveValue('Column 1');
    expect(screen.getByPlaceholderText('Column 2')).toHaveValue('Column 2');
  });

  it('blocks save for a columns layout with zero sections', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Columns/ }));
    fireEvent.click(screen.getByRole('button', { name: /Remove column 1/i }));
    fireEvent.click(screen.getByRole('button', { name: /Remove column 1/i }));
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Empty columns' },
    });
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'What did you learn?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save wall' }));

    expect(
      screen.getByText('Add at least one column before saving.')
    ).toBeInTheDocument();
    expect(mockSaveActivity).not.toHaveBeenCalled();
  });

  it('seeds two rows and two columns when Table is first chosen for a new wall', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Table/ }));

    expect(screen.getByPlaceholderText('Row 1')).toHaveValue('Row 1');
    expect(screen.getByPlaceholderText('Row 2')).toHaveValue('Row 2');
    expect(screen.getByPlaceholderText('Column 1')).toHaveValue('Column 1');
    expect(screen.getByPlaceholderText('Column 2')).toHaveValue('Column 2');
  });

  it('blocks save for a table layout with zero rows and zero columns', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Table/ }));
    fireEvent.click(screen.getByRole('button', { name: /Remove row 1/i }));
    fireEvent.click(screen.getByRole('button', { name: /Remove row 1/i }));
    fireEvent.click(screen.getByRole('button', { name: /Remove column 1/i }));
    fireEvent.click(screen.getByRole('button', { name: /Remove column 1/i }));
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Empty table' },
    });
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'What did you learn?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save wall' }));

    expect(
      screen.getByText('Add at least one row and one column before saving.')
    ).toBeInTheDocument();
    expect(mockSaveActivity).not.toHaveBeenCalled();
  });

  it('blocks save with an empty prompt', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Wall/ }));
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'No prompt yet' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save wall' }));

    expect(screen.getByText('Add a prompt for students.')).toBeInTheDocument();
    expect(mockSaveActivity).not.toHaveBeenCalled();
  });

  it('seeds classIds from a legacy classId-only wall and keeps both on save', async () => {
    renderModal({
      id: 'wall-1',
      title: 'Existing',
      prompt: 'Existing prompt',
      mode: 'photo',
      moderationEnabled: false,
      identificationMode: 'anonymous',
      createdAt: 0,
      updatedAt: 0,
      layout: 'wall',
      classId: 'class-1',
    } as ActivityWallLibraryEntry);

    fireEvent.click(screen.getByRole('button', { name: 'Save wall' }));

    await waitFor(() => expect(mockSaveActivity).toHaveBeenCalledTimes(1));
    const saved = mockSaveActivity.mock.calls[0][0] as ActivityWallLibraryEntry;
    expect(saved.classId).toBe('class-1');
    expect(saved.classIds).toEqual(['class-1']);
  });
});
