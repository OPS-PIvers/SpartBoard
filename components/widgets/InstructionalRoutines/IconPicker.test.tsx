import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IconPicker } from './IconPicker';
import React from 'react';

// Mock Lucide Icons
vi.mock('lucide-react', () => {
  const icons = {
    Zap: () => <div data-testid="icon-zap">Zap</div>,
    Lightbulb: () => <div data-testid="icon-lightbulb">Lightbulb</div>,
    HelpCircle: () => <div data-testid="icon-help-circle">HelpCircle</div>,
    X: () => <div data-testid="icon-x">X</div>,
    // Explicitly define InvalidIcon as undefined to avoid Vitest "No export defined" error
    // when the component tries to access Icons.InvalidIcon
    InvalidIcon: undefined,
  };

  return new Proxy(icons, {
    get: (target, prop) => {
      if (prop in target) {
        return target[prop as keyof typeof icons];
      }
      return undefined;
    },
  });
});

// Mock instructionalIcons config
vi.mock('@/config/instructionalIcons', () => ({
  COMMON_INSTRUCTIONAL_ICONS: ['Zap', 'Lightbulb'],
}));

// Mock FloatingPanel to just render children (simplifies testing without portal issues)
vi.mock('@/components/common/FloatingPanel', () => ({
  FloatingPanel: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="floating-panel">{children}</div>
  ),
}));

describe('IconPicker', () => {
  const mockOnSelect = vi.fn();
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the trigger button with the current icon', () => {
    render(
      <IconPicker currentIcon="Zap" onSelect={mockOnSelect} color="blue" />
    );

    expect(screen.getByTestId('icon-zap')).toBeInTheDocument();
    expect(screen.queryByTestId('floating-panel')).not.toBeInTheDocument();
  });

  it('renders HelpCircle when currentIcon is invalid', () => {
    render(
      <IconPicker
        currentIcon="InvalidIcon"
        onSelect={mockOnSelect}
        color="blue"
      />
    );

    expect(screen.getByTestId('icon-help-circle')).toBeInTheDocument();
  });

  it('opens the panel when clicked', async () => {
    render(
      <IconPicker currentIcon="Zap" onSelect={mockOnSelect} color="blue" />
    );

    const triggerButton = screen.getByTitle('Select Icon');
    await user.click(triggerButton);

    expect(screen.getByTestId('floating-panel')).toBeInTheDocument();
    expect(screen.getByText('Select Icon')).toBeInTheDocument();

    // Check if icons are in the list
    const panel = screen.getByTestId('floating-panel');
    const zapInPanel = panel.querySelector('[data-testid="icon-zap"]');
    const lightbulbInPanel = panel.querySelector(
      '[data-testid="icon-lightbulb"]'
    );

    expect(zapInPanel).toBeInTheDocument();
    expect(lightbulbInPanel).toBeInTheDocument();
  });

  it('calls onSelect and closes the panel when an icon is selected', async () => {
    render(
      <IconPicker currentIcon="Zap" onSelect={mockOnSelect} color="blue" />
    );

    // Open the picker
    await user.click(screen.getByTitle('Select Icon'));

    // Find the Lightbulb icon in the panel and click its parent button
    const panel = screen.getByTestId('floating-panel');
    const lightbulbIcon = panel.querySelector('[data-testid="icon-lightbulb"]');
    expect(lightbulbIcon).toBeInTheDocument();

    const lightbulbButton = lightbulbIcon?.closest('button');
    if (lightbulbButton) {
      await user.click(lightbulbButton);
    }

    expect(mockOnSelect).toHaveBeenCalledWith('Lightbulb');

    // Verify panel closed
    expect(screen.queryByTestId('floating-panel')).not.toBeInTheDocument();
  });

  it('closes the panel when the close button is clicked', async () => {
    render(
      <IconPicker currentIcon="Zap" onSelect={mockOnSelect} color="blue" />
    );

    // Open
    await user.click(screen.getByTitle('Select Icon'));
    expect(screen.getByTestId('floating-panel')).toBeInTheDocument();

    // Close
    const closeButton = screen.getByTestId('icon-x').closest('button');
    if (closeButton) {
      await user.click(closeButton);
    }

    expect(screen.queryByTestId('floating-panel')).not.toBeInTheDocument();
    expect(mockOnSelect).not.toHaveBeenCalled();
  });
});
