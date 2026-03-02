import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExpectationsWidget, ExpectationsSettings } from './ExpectationsWidget';
import { useDashboard } from '../../context/useDashboard';
import { useAuth } from '../../context/useAuth';
import { WidgetData, ExpectationsConfig } from '../../types';

vi.mock('../../context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

vi.mock('../../context/useAuth', () => ({
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

  it('renders elementary layout correctly', () => {
    const elementaryWidget: WidgetData = {
      ...mockWidget,
      config: {
        ...(mockWidget.config as ExpectationsConfig),
        layout: 'elementary',
      } as ExpectationsConfig,
    };
    render(<ExpectationsWidget widget={elementaryWidget} />);
    // In elementary layout, labels are different or presented differently
    expect(screen.getByText('Silence')).toBeInTheDocument();
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

describe('ExpectationsSettings', () => {
  beforeEach(() => {
    (useDashboard as Mock).mockReturnValue({
      updateWidget: mockUpdateWidget,
    });
  });

  it('renders layout options', () => {
    render(<ExpectationsSettings widget={mockWidget} />);
    expect(screen.getByText('Secondary')).toBeInTheDocument();
    expect(screen.getByText('Elementary')).toBeInTheDocument();
  });

  it('changes layout configuration', () => {
    render(<ExpectationsSettings widget={mockWidget} />);
    fireEvent.click(screen.getByText('Elementary'));

    expect(mockUpdateWidget).toHaveBeenCalledWith(mockWidget.id, {
      config: expect.objectContaining({
        layout: 'elementary',
      }) as ExpectationsConfig,
    });
  });

  it('shows selected layout with correct styling', () => {
    const elementaryWidget: WidgetData = {
      ...mockWidget,
      config: {
        ...(mockWidget.config as ExpectationsConfig),
        layout: 'elementary',
      } as ExpectationsConfig,
    };
    render(<ExpectationsSettings widget={elementaryWidget} />);
    const elementaryButton = screen.getByText('Elementary').closest('button');
    expect(elementaryButton).toHaveClass('border-blue-500');
  });
});
