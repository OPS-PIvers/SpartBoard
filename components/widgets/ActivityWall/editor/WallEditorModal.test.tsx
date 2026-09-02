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
      screen.getByRole('radiogroup', { name: 'Wall layout' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /Columns/ }));

    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.getByText('Submission types')).toBeInTheDocument();
    expect(screen.getByText('Layout: Columns')).toBeInTheDocument();
  });

  it('hides submission types when the chosen layout is word cloud', () => {
    renderModal();
    fireEvent.click(screen.getByRole('radio', { name: /Word Cloud/ }));

    expect(screen.getByLabelText('Title')).toBeInTheDocument();
    expect(screen.queryByText('Submission types')).not.toBeInTheDocument();
  });

  it('returns to the layout grid with a warning from "Change layout"', () => {
    renderModal();
    fireEvent.click(screen.getByRole('radio', { name: /Wall/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Change layout' }));

    expect(
      screen.getByRole('radiogroup', { name: 'Wall layout' })
    ).toBeInTheDocument();
    expect(screen.getByText(/keeps every existing post/i)).toBeInTheDocument();
  });

  it('saves the entry with the deprecated legacy fields derived from the new ones', async () => {
    renderModal();
    fireEvent.click(screen.getByRole('radio', { name: /Word Cloud/ }));
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Exit ticket' },
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
});
