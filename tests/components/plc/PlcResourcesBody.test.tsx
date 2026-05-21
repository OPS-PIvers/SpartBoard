import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlcResourcesBody } from '@/components/plc/resources/PlcResourcesBody';
import type { Plc, PlcResource } from '@/types';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k,
  }),
}));

const mockCreateDoc = vi.fn();

vi.mock('@/hooks/usePlcDocs', () => ({
  usePlcDocs: vi.fn(() => ({
    docs: [],
    loading: false,
    error: null,
    createDoc: mockCreateDoc,
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
  })),
}));

const mockUsePlcResources = vi.fn();
vi.mock('@/hooks/usePlcResources', () => ({
  usePlcResources: (...args: unknown[]): unknown =>
    mockUsePlcResources(...args),
}));

vi.mock('@/components/common/ScaledEmptyState', () => ({
  ScaledEmptyState: ({
    title,
    subtitle,
  }: {
    title: string;
    subtitle: string;
  }) => (
    <div data-testid="empty-state">
      <span>{title}</span>
      <span>{subtitle}</span>
    </div>
  ),
}));

const PLC: Plc = {
  id: 'plc-test',
  name: 'Test PLC',
  leadUid: 'u1',
  memberUids: ['u1'],
  memberEmails: { u1: 'u1@school.edu' },
  sharedSheetUrl: null,
  createdAt: 0,
  updatedAt: 0,
};

const makeResource = (overrides: Partial<PlcResource> = {}): PlcResource => ({
  id: 'res-1',
  kind: 'doc',
  title: 'Spring Planning Doc',
  description: 'Use for unit planning',
  refId: 'https://docs.google.com/d/spring',
  scope: 'all',
  plcIds: [],
  createdByAdminUid: 'admin-1',
  createdByAdminEmail: 'admin@school.edu',
  createdAt: 1000,
  updatedAt: 2000,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateDoc.mockResolvedValue('new-doc-id');
});

describe('PlcResourcesBody', () => {
  it('shows empty state when there are no resources', () => {
    mockUsePlcResources.mockReturnValue({
      resources: [],
      loading: false,
      error: null,
    });
    render(<PlcResourcesBody plc={PLC} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('shows a loading indicator while loading', () => {
    mockUsePlcResources.mockReturnValue({
      resources: [],
      loading: true,
      error: null,
    });
    render(<PlcResourcesBody plc={PLC} />);
    expect(screen.getByText(/loading resources/i)).toBeInTheDocument();
  });

  it('shows an error message when loading fails', () => {
    mockUsePlcResources.mockReturnValue({
      resources: [],
      loading: false,
      error: new Error('permission denied'),
    });
    render(<PlcResourcesBody plc={PLC} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/failed to load/i);
  });

  it('renders resources grouped by kind', () => {
    mockUsePlcResources.mockReturnValue({
      resources: [
        makeResource({ id: 'r1', kind: 'doc', title: 'A Doc' }),
        makeResource({ id: 'r2', kind: 'quiz', title: 'A Quiz' }),
      ],
      loading: false,
      error: null,
    });
    render(<PlcResourcesBody plc={PLC} />);
    expect(screen.getByText('A Doc')).toBeInTheDocument();
    expect(screen.getByText('A Quiz')).toBeInTheDocument();
    // Both group headings present
    expect(screen.getByText('Documents')).toBeInTheDocument();
    expect(screen.getByText('Quizzes')).toBeInTheDocument();
  });

  it('calls createDoc with title and url when Use is clicked on a doc resource', async () => {
    mockUsePlcResources.mockReturnValue({
      resources: [makeResource()],
      loading: false,
      error: null,
    });
    render(<PlcResourcesBody plc={PLC} />);

    const useButton = screen.getByRole('button', {
      name: /use spring planning doc/i,
    });
    fireEvent.click(useButton);

    await waitFor(() => {
      expect(mockCreateDoc).toHaveBeenCalledTimes(1);
    });
    expect(mockCreateDoc).toHaveBeenCalledWith({
      title: 'Spring Planning Doc',
      url: 'https://docs.google.com/d/spring',
    });
  });

  it('shows "Added" state after successful createDoc', async () => {
    mockUsePlcResources.mockReturnValue({
      resources: [makeResource()],
      loading: false,
      error: null,
    });
    render(<PlcResourcesBody plc={PLC} />);

    fireEvent.click(
      screen.getByRole('button', { name: /use spring planning doc/i })
    );

    await waitFor(() => {
      expect(screen.getByText('Added')).toBeInTheDocument();
    });
  });

  it('shows a graceful message (not a crash) for non-doc kinds', async () => {
    mockUsePlcResources.mockReturnValue({
      resources: [makeResource({ id: 'q1', kind: 'quiz', title: 'Unit Quiz' })],
      loading: false,
      error: null,
    });
    render(<PlcResourcesBody plc={PLC} />);

    fireEvent.click(screen.getByRole('button', { name: /use unit quiz/i }));

    await waitFor(() => {
      // Should show the "go to the matching section" guidance, not crash
      expect(
        screen.getByText(/go to the matching section/i)
      ).toBeInTheDocument();
    });
    // createDoc should NOT have been called for a quiz
    expect(mockCreateDoc).not.toHaveBeenCalled();
  });

  it('calls usePlcResources with the plcId', () => {
    mockUsePlcResources.mockReturnValue({
      resources: [],
      loading: false,
      error: null,
    });
    render(<PlcResourcesBody plc={PLC} />);
    expect(mockUsePlcResources).toHaveBeenCalledWith({ plcId: 'plc-test' });
  });
});
