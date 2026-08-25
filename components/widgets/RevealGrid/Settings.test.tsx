import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RevealGridSettings, RevealGridAppearanceSettings } from './Settings';
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

describe('RevealGridAppearanceSettings — card color label associations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useDashboard as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      updateWidget: mockUpdateWidget,
    });
  });

  it('names the Default Card Front Color input from its label', () => {
    render(<RevealGridAppearanceSettings widget={baseWidget} />);

    expect(screen.getByLabelText('Default Card Front Color')).toHaveAttribute(
      'type',
      'color'
    );
  });

  it('names the Default Card Back Color input from its label', () => {
    render(<RevealGridAppearanceSettings widget={baseWidget} />);

    expect(screen.getByLabelText('Default Card Back Color')).toHaveAttribute(
      'type',
      'color'
    );
  });
});

describe('RevealGridSettings — label associations', () => {
  const withCards: WidgetData = {
    ...baseWidget,
    config: { cards: [{ id: 'card-a', frontContent: 'Q', backContent: 'A' }] },
  };

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

  it('names the Set Name input from its label', () => {
    render(<RevealGridSettings widget={baseWidget} />);

    expect(screen.getByLabelText('Set Name')).toHaveAttribute('type', 'text');
  });

  // The card's edit fields only render once its row is expanded, and the
  // chevron that expands it is icon-only, so reach it through the row.
  const expandCardShowing = (frontText: string) => {
    const row = screen.getByText(frontText).parentElement as HTMLElement;
    fireEvent.click(row.querySelectorAll('button')[0]);
  };

  it('names each card input from its own label', () => {
    render(<RevealGridSettings widget={withCards} />);
    expandCardShowing('Q');

    expect(screen.getByLabelText('Front (Question / Term)')).toHaveValue('Q');
    expect(screen.getByLabelText('Back (Answer / Definition)')).toHaveValue(
      'A'
    );
  });

  // Card ids come from the loaded set, not the widget, so two widgets sharing a
  // set would collide on unprefixed ids and both labels would name the first input.
  it('keeps card inputs distinct across two widgets sharing a card id', () => {
    render(
      <>
        <RevealGridSettings widget={withCards} />
        <RevealGridSettings
          widget={{
            ...withCards,
            id: 'rg-test-2',
            config: {
              cards: [{ id: 'card-a', frontContent: 'Q2', backContent: 'A2' }],
            },
          }}
        />
      </>
    );

    expandCardShowing('Q');
    expandCardShowing('Q2');

    const fronts = screen.getAllByLabelText('Front (Question / Term)');
    expect(fronts).toHaveLength(2);
    expect(fronts[0]).toHaveValue('Q');
    expect(fronts[1]).toHaveValue('Q2');
  });

  // Only renders after "Paste from Sheet" is clicked — the conditional that hid
  // it from the original sweep.
  it('names the paste-data textarea from its label', () => {
    render(<RevealGridSettings widget={baseWidget} />);

    fireEvent.click(screen.getByRole('button', { name: /Paste from Sheet/i }));

    expect(
      screen.getByLabelText('Paste two columns (Term, Definition)')
    ).toHaveValue('');
  });
});
