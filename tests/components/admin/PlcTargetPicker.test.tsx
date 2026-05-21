import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlcTargetPicker } from '@/components/admin/PlcResourcesManager/PlcTargetPicker';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k,
  }),
}));

vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: vi.fn(() => ({
    plcs: [
      { id: 'plc-1', name: 'ELA Team' },
      { id: 'plc-2', name: 'Math Team' },
      { id: 'plc-3', name: 'Science Team' },
    ],
    loading: false,
  })),
}));

describe('PlcTargetPicker', () => {
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders All PLCs and Selected PLCs radio options', () => {
    render(
      <PlcTargetPicker
        value={{ scope: 'all', plcIds: [] }}
        onChange={onChange}
      />
    );
    expect(
      screen.getByRole('radio', { name: /all plcs/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /selected plcs/i })
    ).toBeInTheDocument();
  });

  it('marks the All PLCs radio as checked when scope is "all"', () => {
    render(
      <PlcTargetPicker
        value={{ scope: 'all', plcIds: [] }}
        onChange={onChange}
      />
    );
    expect(screen.getByRole('radio', { name: /all plcs/i })).toBeChecked();
    expect(
      screen.getByRole('radio', { name: /selected plcs/i })
    ).not.toBeChecked();
  });

  it('does not show the PLC list when scope is "all"', () => {
    render(
      <PlcTargetPicker
        value={{ scope: 'all', plcIds: [] }}
        onChange={onChange}
      />
    );
    expect(screen.queryByText('ELA Team')).not.toBeInTheDocument();
  });

  it('shows the PLC list when scope is "selected"', () => {
    render(
      <PlcTargetPicker
        value={{ scope: 'selected', plcIds: [] }}
        onChange={onChange}
      />
    );
    expect(screen.getByText('ELA Team')).toBeInTheDocument();
    expect(screen.getByText('Math Team')).toBeInTheDocument();
    expect(screen.getByText('Science Team')).toBeInTheDocument();
  });

  it('calls onChange with scope="selected" and empty plcIds when switching to Selected PLCs', () => {
    render(
      <PlcTargetPicker
        value={{ scope: 'all', plcIds: [] }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('radio', { name: /selected plcs/i }));
    expect(onChange).toHaveBeenCalledWith({ scope: 'selected', plcIds: [] });
  });

  it('calls onChange with scope="all" and empty plcIds when switching to All PLCs', () => {
    render(
      <PlcTargetPicker
        value={{ scope: 'selected', plcIds: ['plc-1'] }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('radio', { name: /all plcs/i }));
    expect(onChange).toHaveBeenCalledWith({ scope: 'all', plcIds: [] });
  });

  it('toggles a PLC into plcIds when its checkbox is clicked', () => {
    render(
      <PlcTargetPicker
        value={{ scope: 'selected', plcIds: [] }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /ela team/i }));
    expect(onChange).toHaveBeenCalledWith({
      scope: 'selected',
      plcIds: ['plc-1'],
    });
  });

  it('removes a PLC from plcIds when its checked checkbox is clicked', () => {
    render(
      <PlcTargetPicker
        value={{ scope: 'selected', plcIds: ['plc-1', 'plc-2'] }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /ela team/i }));
    expect(onChange).toHaveBeenCalledWith({
      scope: 'selected',
      plcIds: ['plc-2'],
    });
  });

  it('marks the correct PLCs as checked', () => {
    render(
      <PlcTargetPicker
        value={{ scope: 'selected', plcIds: ['plc-2'] }}
        onChange={onChange}
      />
    );
    expect(screen.getByRole('checkbox', { name: /math team/i })).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: /ela team/i })
    ).not.toBeChecked();
  });
});
