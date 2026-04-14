import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DrawingConfigurationPanel } from './DrawingConfigurationPanel';
import { DrawingGlobalConfig } from '@/types';

// Mock BUILDINGS
vi.mock('@/config/buildings', () => ({
  BUILDINGS: [
    { id: 'b1', name: 'Building 1' },
    { id: 'b2', name: 'Building 2' },
  ],
}));

describe('DrawingConfigurationPanel', () => {
  const mockConfig: DrawingGlobalConfig = {
    buildingDefaults: {
      b1: {
        buildingId: 'b1',
        width: 5,
        customColors: ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF'],
      },
    },
  };

  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly with initial config', () => {
    render(
      <DrawingConfigurationPanel config={mockConfig} onChange={mockOnChange} />
    );

    expect(
      screen.getByText('Configure Building Drawing Defaults')
    ).toBeInTheDocument();
    // Use getAllByText because it appears in the button and the description
    expect(screen.getAllByText('Building 1').length).toBeGreaterThan(0);

    // Check initial values
    const widthInput = screen.getByRole('slider');
    expect(widthInput).toHaveValue('5');
  });

  it('does not render mode toggle (mode is now picked at click-time)', () => {
    render(
      <DrawingConfigurationPanel config={mockConfig} onChange={mockOnChange} />
    );
    expect(screen.queryByText('Overlay (Annotate)')).toBeNull();
    expect(screen.queryByText('Default Mode')).toBeNull();
  });

  it('updates width when changed', () => {
    render(
      <DrawingConfigurationPanel config={mockConfig} onChange={mockOnChange} />
    );

    const widthInput = screen.getByRole('slider');
    fireEvent.change(widthInput, { target: { value: '10' } });

    expect(mockOnChange).toHaveBeenCalled();
    const lastCall = mockOnChange.mock.calls[0][0] as DrawingGlobalConfig;
    expect(lastCall.buildingDefaults['b1']?.width).toBe(10);
  });

  it('updates colors when hex value is changed', () => {
    render(
      <DrawingConfigurationPanel config={mockConfig} onChange={mockOnChange} />
    );

    const colorInputs = screen.getAllByTitle('Change preset color');
    fireEvent.change(colorInputs[0], { target: { value: '#000000' } });

    expect(mockOnChange).toHaveBeenCalled();
    const lastCall = mockOnChange.mock.calls[0][0] as DrawingGlobalConfig;
    expect(lastCall.buildingDefaults['b1']?.customColors?.[0]).toBe('#000000');
  });

  it('switches buildings', () => {
    render(
      <DrawingConfigurationPanel config={mockConfig} onChange={mockOnChange} />
    );

    const b2Button = screen.getByRole('tab', { name: 'Building 2' });
    fireEvent.click(b2Button);

    // Should now show defaults for b2 (which are the internal defaults: width 4)
    const widthInput = screen.getByRole('slider');
    expect(widthInput).toHaveValue('4');

    // Changing a value for b2
    fireEvent.change(widthInput, { target: { value: '8' } });

    expect(mockOnChange).toHaveBeenCalled();
    const lastCall = mockOnChange.mock.calls[0][0] as DrawingGlobalConfig;
    expect(lastCall.buildingDefaults['b2']?.width).toBe(8);
    // Ensure b1 config is preserved
    expect(lastCall.buildingDefaults['b1']?.width).toBe(5);
  });
});
