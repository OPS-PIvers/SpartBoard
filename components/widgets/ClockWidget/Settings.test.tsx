import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ClockSettings, ClockAppearanceSettings } from './Settings';
import { useDashboard } from '@/context/useDashboard';
import { WidgetData, ClockConfig } from '@/types';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const mockUpdateWidget = vi.fn();

describe('ClockSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateWidget: mockUpdateWidget,
    });
  });

  const createWidget = (config: Partial<ClockConfig> = {}): WidgetData => {
    return {
      id: 'clock-1',
      type: 'clock',
      config: {
        format24: true,
        showSeconds: true,
        themeColor: '#000000',
        fontFamily: 'global',
        clockStyle: 'modern',
        ...config,
      },
    } as WidgetData;
  };

  it('toggles format24', () => {
    const widget = createWidget({ format24: true });
    render(<ClockSettings widget={widget} />);

    const formatButton = screen.getByText('widgets.clock.format24');
    fireEvent.click(formatButton);

    expect(mockUpdateWidget).toHaveBeenCalledWith('clock-1', {
      config: expect.objectContaining({ format24: false }) as unknown,
    });
  });

  it('toggles showSeconds', () => {
    const widget = createWidget({ showSeconds: true });
    render(<ClockSettings widget={widget} />);

    const secondsButton = screen.getByText('widgets.clock.showSeconds');
    fireEvent.click(secondsButton);

    expect(mockUpdateWidget).toHaveBeenCalledWith('clock-1', {
      config: expect.objectContaining({ showSeconds: false }) as unknown,
    });
  });
});

describe('ClockAppearanceSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateWidget: mockUpdateWidget,
    });
  });

  const createWidget = (config: Partial<ClockConfig> = {}): WidgetData => {
    return {
      id: 'clock-1',
      type: 'clock',
      config: {
        format24: true,
        showSeconds: true,
        themeColor: '#000000',
        fontFamily: 'global',
        clockStyle: 'modern',
        glow: false,
        ...config,
      },
    } as WidgetData;
  };

  it('updates font family', () => {
    const widget = createWidget({ fontFamily: 'global' });
    render(<ClockAppearanceSettings widget={widget} />);

    const modernFontButton = screen.getByText('widgets.clock.fonts.modern');
    fireEvent.click(modernFontButton);

    expect(mockUpdateWidget).toHaveBeenCalledWith('clock-1', {
      config: expect.objectContaining({ fontFamily: 'font-sans' }) as unknown,
    });
  });

  it('updates clock style', () => {
    const widget = createWidget({ clockStyle: 'modern' });
    render(<ClockAppearanceSettings widget={widget} />);

    const lcdStyleButton = screen.getByText('widgets.clock.styles.lcd');
    fireEvent.click(lcdStyleButton);

    expect(mockUpdateWidget).toHaveBeenCalledWith('clock-1', {
      config: expect.objectContaining({ clockStyle: 'lcd' }) as unknown,
    });
  });

  it('updates theme color', () => {
    const widget = createWidget({ themeColor: '#000000' });
    render(<ClockAppearanceSettings widget={widget} />);

    // Find all color buttons by their accessible role and name pattern
    const colorButtons = screen.getAllByRole('button', { name: /^color-/i });
    expect(colorButtons.length).toBeGreaterThan(0);

    // Click the first color
    fireEvent.click(colorButtons[0]);

    expect(mockUpdateWidget).toHaveBeenCalledWith('clock-1', {
      config: expect.objectContaining({
        themeColor: expect.any(String) as unknown,
      }) as unknown,
    });
  });

  it('toggles glow', () => {
    const widget = createWidget({ glow: false });
    render(<ClockAppearanceSettings widget={widget} />);

    const glowButton = screen.getByText('widgets.clock.glow');
    fireEvent.click(glowButton);

    expect(mockUpdateWidget).toHaveBeenCalledWith('clock-1', {
      config: expect.objectContaining({ glow: true }) as unknown,
    });
  });
});
