import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RevealGridSettings } from './Settings';
import { useDashboard } from '@/context/useDashboard';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import { useDialog } from '@/context/useDialog';
import { WidgetData } from '@/types';

vi.mock('@/context/useDashboard', () => ({
  useDashboard: vi.fn(),
}));
vi.mock('@/hooks/useGoogleDrive', () => ({
  useGoogleDrive: vi.fn(),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: vi.fn(),
}));
vi.mock('@/components/common/TypographySettings', () => ({
  TypographySettings: () => null,
}));

const mockUpdateWidget = vi.fn();
const mockAddToast = vi.fn();
const mockShowAlert = vi.fn();

const baseWidget: WidgetData = {
  id: 'rg-test-1',
  type: 'reveal-grid',
  x: 0,
  y: 0,
  w: 600,
  h: 400,
  z: 1,
  flipped: true,
  config: {
    cards: [],
    columns: 3,
  },
};

describe('RevealGridSettings — Reveal Grid Set Generator button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateWidget: mockUpdateWidget,
      addToast: mockAddToast,
    });
    (useGoogleDrive as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      driveService: null,
    });
    (useDialog as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      showAlert: mockShowAlert,
    });
  });

  it('gives the teacher feedback instead of silently doing nothing when clicked', () => {
    render(<RevealGridSettings widget={baseWidget} />);

    const button = screen.getByRole('button', {
      name: /Reveal Grid Set Generator/i,
    });
    fireEvent.click(button);

    // Regression: the button previously had no onClick handler at all, so
    // clicking it produced no visible reaction of any kind — a dead control
    // styled to look fully interactive (see CLAUDE.md "Clarity over
    // cleverness"). It must now surface a "coming soon" toast, matching the
    // established pattern for unbuilt features elsewhere in the app
    // (OrganizationPanel's `comingSoon` helper).
    expect(mockAddToast).toHaveBeenCalledTimes(1);
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.stringMatching(/coming soon/i),
      'info'
    );
  });
});
