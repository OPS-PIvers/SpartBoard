import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SubmitReportModal } from './SubmitReportModal';

const data = {
  date: '11/09/2026',
  staffName: 'A. Teacher',
  hotLunch: 10,
  bentoBox: 2,
  hotLunchName: 'Pizza',
  bentoBoxName: 'Bento',
  schoolSite: 'schumann-elementary' as const,
  lunchTime: '11:30',
  gradeLabel: 'GR1',
  submissionLabel: '11:30 - GR1 - A. Teacher',
};

const modal = (
  isOpen = true,
  sentDetails: { notes: string; extraPizza: number } | null = {
    notes: '',
    extraPizza: 0,
  }
) => (
  <SubmitReportModal
    isOpen={isOpen}
    onClose={vi.fn()}
    onSubmit={vi.fn().mockResolvedValue(undefined)}
    data={data}
    isSubmitting={false}
    alreadySubmitted
    sentDetails={sentDetails ?? undefined}
  />
);

describe('SubmitReportModal resend', () => {
  beforeEach(() => vi.clearAllMocks());

  it('offers no resend for a count sent without its details', () => {
    render(modal(true, null));
    expect(screen.getByText('Lunch Count Already Submitted')).toBeTruthy();
    expect(screen.queryByText('Review and Resend')).toBeNull();
  });

  it('opens the review form from the already-sent screen', () => {
    render(modal());
    expect(screen.getByText('Lunch Count Already Sent')).toBeTruthy();
    fireEvent.click(screen.getByText('Review and Resend'));
    expect(screen.getByText('Resend Lunch Report')).toBeTruthy();
    expect(screen.getByText('Confirm & Resend')).toBeTruthy();
  });

  it('prefills what was sent earlier when resending', () => {
    render(
      <SubmitReportModal
        isOpen
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        data={{ ...data, schoolSite: 'orono-intermediate-school' }}
        isSubmitting={false}
        alreadySubmitted
        sentDetails={{ notes: '2 gluten free', extraPizza: 4 }}
      />
    );
    fireEvent.click(screen.getByText('Review and Resend'));
    expect(screen.getByDisplayValue('2 gluten free')).toBeTruthy();
    expect(screen.getByDisplayValue('4')).toBeTruthy();
  });

  it('returns to the already-sent screen after the parent closes it', () => {
    const { rerender } = render(modal());
    fireEvent.click(screen.getByText('Review and Resend'));
    rerender(modal(false));
    rerender(modal(true));
    expect(screen.getByText('Lunch Count Already Sent')).toBeTruthy();
  });
});
