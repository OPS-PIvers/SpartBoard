import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { useGoogleDrive } from '@/hooks/useGoogleDrive';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { WidgetData } from '@/types';
import { RevealGridCardsField } from './settingsFields';

vi.mock('@/context/useDashboard', () => ({ useDashboard: vi.fn() }));
vi.mock('@/context/useDialog', () => ({ useDialog: vi.fn() }));
vi.mock('@/hooks/useGoogleDrive', () => ({ useGoogleDrive: vi.fn() }));

const updateConfig = vi.fn();
const addToast = vi.fn();
const showAlert = vi.fn();
const baseWidget: WidgetData = {
  id: 'reveal-grid-test',
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
    revealMode: 'flip',
  },
};

const labels: Record<string, string> = {
  generator: 'Reveal Grid Set Generator',
  generatorComingSoon: 'Reveal Grid set generation is coming soon!',
  pasteFromSheet: 'Paste from Sheet',
  pasteColumns: 'Paste two columns (Term, Definition)',
  frontContent: 'Front (Question / Term)',
  backContent: 'Back (Answer / Definition)',
  addCard: 'Add Card',
};

const makeCtx = (widget: WidgetData = baseWidget): CustomRenderCtx => ({
  config: widget.config as unknown as Record<string, unknown>,
  widget,
  isAdmin: false,
  canAccessFeature: () => true,
  t: (key) => labels[key.split('.').pop() ?? key] ?? key,
  updateConfig,
  id: `${widget.id}-cards`,
  labelId: `${widget.id}-cards-label`,
});

describe('RevealGridCardsField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDashboard).mockReturnValue({ addToast } as never);
    vi.mocked(useGoogleDrive).mockReturnValue({ driveService: null } as never);
    vi.mocked(useDialog).mockReturnValue({ showAlert } as never);
  });

  it('gives the set generator button visible feedback', () => {
    render(<RevealGridCardsField ctx={makeCtx()} />);
    fireEvent.click(
      screen.getByRole('button', { name: /reveal grid set generator/i })
    );
    expect(addToast).toHaveBeenCalledWith(
      expect.stringMatching(/coming soon/i),
      'info'
    );
  });

  it('keeps each expanded card editor labelled and widget-scoped', () => {
    const firstCardWidget: WidgetData = {
      ...baseWidget,
      config: {
        ...baseWidget.config,
        cards: [
          {
            id: 'shared-card-id',
            frontContent: 'Q',
            backContent: 'A',
            isRevealed: false,
          },
        ],
      },
    };
    const secondCardWidget: WidgetData = {
      ...firstCardWidget,
      id: 'reveal-grid-test-2',
      config: {
        ...firstCardWidget.config,
        cards: [
          {
            id: 'shared-card-id',
            frontContent: 'Q2',
            backContent: 'A2',
            isRevealed: false,
          },
        ],
      },
    };

    render(
      <>
        <RevealGridCardsField ctx={makeCtx(firstCardWidget)} />
        <RevealGridCardsField ctx={makeCtx(secondCardWidget)} />
      </>
    );
    fireEvent.click(
      screen
        .getByText('Q')
        .parentElement?.querySelector('button') as HTMLElement
    );
    fireEvent.click(
      screen
        .getByText('Q2')
        .parentElement?.querySelector('button') as HTMLElement
    );

    const fronts = screen.getAllByLabelText('Front (Question / Term)');
    expect(fronts).toHaveLength(2);
    expect(fronts[0]).toHaveValue('Q');
    expect(fronts[1]).toHaveValue('Q2');
  });

  it('labels the paste-data editor when the import action is opened', () => {
    render(<RevealGridCardsField ctx={makeCtx()} />);
    fireEvent.click(screen.getByRole('button', { name: /paste from sheet/i }));
    expect(
      screen.getByLabelText('Paste two columns (Term, Definition)')
    ).toBeInTheDocument();
  });
});
