import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExpectationsWidget } from './';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { WidgetData, ExpectationsConfig } from '@/types';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: vi.fn(),
}));

const mockUpdateWidget = vi.fn();

const mockWidget: WidgetData = {
  id: 'test-expectations',
  type: 'expectations',
  x: 0,
  y: 0,
  w: 300,
  h: 400,
  z: 1,
  flipped: false,
  minimized: false,
  maximized: false,
  config: {
    voiceLevel: 0,
    workMode: 'individual',
    interactionMode: 'productive',
    layout: 'secondary',
  } as ExpectationsConfig,
};

describe('ExpectationsWidget', () => {
  beforeEach(() => {
    (useDashboard as Mock).mockReturnValue({
      updateWidget: mockUpdateWidget,
    });
    (useAuth as Mock).mockReturnValue({
      featurePermissions: [],
      selectedBuildings: [],
    });
  });

  it('renders initial state correctly in secondary layout', () => {
    render(<ExpectationsWidget widget={mockWidget} />);
    expect(screen.getByText('Silence')).toBeInTheDocument();
    expect(screen.getByText('Alone')).toBeInTheDocument();
    expect(screen.getByText('Productive')).toBeInTheDocument();
  });

  it('switches categories when clicking on a main option', () => {
    render(<ExpectationsWidget widget={mockWidget} />);
    fireEvent.click(screen.getByText('Silence'));
    expect(screen.getByText('Volume Level')).toBeInTheDocument();
    expect(screen.getByText('Whisper')).toBeInTheDocument();
  });

  it('updates configuration when selecting a new option', () => {
    render(<ExpectationsWidget widget={mockWidget} />);
    fireEvent.click(screen.getByText('Silence'));
    fireEvent.click(screen.getByText('Whisper'));

    expect(mockUpdateWidget).toHaveBeenCalledWith(mockWidget.id, {
      config: expect.objectContaining({
        voiceLevel: 1,
      }) as ExpectationsConfig,
    });
  });

  it('renders "Level" label and number for volume options', () => {
    render(<ExpectationsWidget widget={mockWidget} />);
    // In main view
    expect(screen.getAllByText('Level').length).toBeGreaterThan(0);
    expect(screen.getByText('0')).toBeInTheDocument();

    // In sub view
    fireEvent.click(screen.getByText('Silence'));
    expect(screen.getAllByText('Level').length).toBeGreaterThan(0);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('navigates back to main menu from sub-views', () => {
    render(<ExpectationsWidget widget={mockWidget} />);
    fireEvent.click(screen.getByText('Silence'));
    const backButton = screen.getByRole('button', { name: '' }); // ArrowLeft icon button
    fireEvent.click(backButton);
    expect(screen.queryByText('Volume Level')).not.toBeInTheDocument();
    expect(screen.getByText('Volume')).toBeInTheDocument();
  });

  it('deselects an option when clicking it again in sub-view', () => {
    render(<ExpectationsWidget widget={mockWidget} />);
    fireEvent.click(screen.getByText('Silence'));
    fireEvent.click(screen.getByText('Silence')); // Deselect

    expect(mockUpdateWidget).toHaveBeenCalledWith(mockWidget.id, {
      config: expect.objectContaining({
        voiceLevel: null,
      }) as ExpectationsConfig,
    });
  });

  it('handles interaction mode selection', () => {
    render(<ExpectationsWidget widget={mockWidget} />);
    fireEvent.click(screen.getByText('Productive'));
    fireEvent.click(screen.getByText('Respectful'));

    expect(mockUpdateWidget).toHaveBeenCalledWith(mockWidget.id, {
      config: expect.objectContaining({
        interactionMode: 'respectful',
      }) as ExpectationsConfig,
    });
  });
});
