import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlcResourcesManager } from '@/components/admin/PlcResourcesManager/PlcResourcesManager';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k,
  }),
}));

const mockCreateResource = vi.fn();
const mockUpdateResource = vi.fn();
const mockDeleteResource = vi.fn();

vi.mock('@/hooks/usePlcResources', () => ({
  usePlcResources: vi.fn(() => ({
    resources: [],
    loading: false,
    error: null,
    createResource: mockCreateResource,
    updateResource: mockUpdateResource,
    deleteResource: mockDeleteResource,
  })),
}));

vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: vi.fn(() => ({
    plcs: [
      { id: 'plc-a', name: 'ELA PLC' },
      { id: 'plc-b', name: 'Math PLC' },
    ],
    loading: false,
  })),
}));

describe('PlcResourcesManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateResource.mockResolvedValue('new-res-id');
    mockUpdateResource.mockResolvedValue(undefined);
    mockDeleteResource.mockResolvedValue(undefined);
  });

  it('renders the manager title and Add Resource button', () => {
    render(<PlcResourcesManager />);
    expect(screen.getByText('PLC Resources')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /add resource/i })
    ).toBeInTheDocument();
  });

  it('shows the create form after clicking Add Resource', () => {
    render(<PlcResourcesManager />);
    fireEvent.click(screen.getByRole('button', { name: /add resource/i }));
    expect(
      screen.getByRole('form', { name: /create resource/i })
    ).toBeInTheDocument();
  });

  it('calls createResource with the assembled payload on submit', async () => {
    render(<PlcResourcesManager />);
    fireEvent.click(screen.getByRole('button', { name: /add resource/i }));

    // Fill title
    fireEvent.change(screen.getByPlaceholderText(/unit 3 planning doc/i), {
      target: { value: 'Spring PD Doc' },
    });
    // Fill refId
    fireEvent.change(
      screen.getByPlaceholderText(/https:\/\/docs\.google\.com/i),
      {
        target: { value: 'https://docs.google.com/d/spring' },
      }
    );
    // Scope is 'all' by default — submit

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(mockCreateResource).toHaveBeenCalledTimes(1);
    });

    const payload = mockCreateResource.mock.calls[0]?.[0];
    expect(payload).toMatchObject({
      kind: 'doc',
      title: 'Spring PD Doc',
      refId: 'https://docs.google.com/d/spring',
      scope: 'all',
      plcIds: [],
    });
  });

  it('shows an error when title is empty on submit', async () => {
    render(<PlcResourcesManager />);
    fireEvent.click(screen.getByRole('button', { name: /add resource/i }));

    // Fill refId but not title
    fireEvent.change(
      screen.getByPlaceholderText(/https:\/\/docs\.google\.com/i),
      {
        target: { value: 'https://docs.google.com/d/x' },
      }
    );
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/title is required/i);
    });
    expect(mockCreateResource).not.toHaveBeenCalled();
  });

  it('shows an error when scope is "selected" but no PLCs are chosen', async () => {
    render(<PlcResourcesManager />);
    fireEvent.click(screen.getByRole('button', { name: /add resource/i }));

    fireEvent.change(screen.getByPlaceholderText(/unit 3 planning doc/i), {
      target: { value: 'My Doc' },
    });
    fireEvent.change(
      screen.getByPlaceholderText(/https:\/\/docs\.google\.com/i),
      {
        target: { value: 'https://docs.google.com/d/x' },
      }
    );
    // Switch to Selected PLCs
    fireEvent.click(screen.getByRole('radio', { name: /selected plcs/i }));
    // Don't select any PLC
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /select at least one plc/i
      );
    });
    expect(mockCreateResource).not.toHaveBeenCalled();
  });

  it('calls createResource with correct plcIds when scope is "selected"', async () => {
    render(<PlcResourcesManager />);
    fireEvent.click(screen.getByRole('button', { name: /add resource/i }));

    fireEvent.change(screen.getByPlaceholderText(/unit 3 planning doc/i), {
      target: { value: 'Targeted Doc' },
    });
    fireEvent.change(
      screen.getByPlaceholderText(/https:\/\/docs\.google\.com/i),
      {
        target: { value: 'https://docs.google.com/d/targeted' },
      }
    );

    // Switch to Selected PLCs and pick one
    fireEvent.click(screen.getByRole('radio', { name: /selected plcs/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /ela plc/i }));

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(mockCreateResource).toHaveBeenCalledTimes(1);
    });

    const payload = mockCreateResource.mock.calls[0]?.[0];
    expect(payload).toMatchObject({
      scope: 'selected',
      plcIds: ['plc-a'],
    });
  });

  it('hides the form after a successful submit', async () => {
    render(<PlcResourcesManager />);
    fireEvent.click(screen.getByRole('button', { name: /add resource/i }));

    fireEvent.change(screen.getByPlaceholderText(/unit 3 planning doc/i), {
      target: { value: 'Done Doc' },
    });
    fireEvent.change(
      screen.getByPlaceholderText(/https:\/\/docs\.google\.com/i),
      {
        target: { value: 'https://docs.google.com/d/done' },
      }
    );
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(
        screen.queryByRole('form', { name: /create resource/i })
      ).not.toBeInTheDocument();
    });
  });
});
