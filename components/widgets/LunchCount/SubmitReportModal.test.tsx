import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SubmitReportModal } from './SubmitReportModal';
import { useAuth } from '@/context/useAuth';

vi.mock('@/context/useAuth');

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

const allowResend = (allowed: boolean) =>
  vi.mocked(useAuth).mockReturnValue({
    canAccessFeature: () => allowed,
  } as unknown as ReturnType<typeof useAuth>);

const modal = (isOpen = true) => (
  <SubmitReportModal
    isOpen={isOpen}
    onClose={vi.fn()}
    onSubmit={vi.fn().mockResolvedValue(undefined)}
    data={data}
    isSubmitting={false}
    alreadySubmitted
  />
);

describe('SubmitReportModal resend', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps the one-a-day screen when the flag is off', () => {
    allowResend(false);
    render(modal());
    expect(screen.getByText('Lunch Count Already Submitted')).toBeTruthy();
    expect(screen.queryByText('Review and Resend')).toBeNull();
  });

  it('opens the review form from the already-sent screen', () => {
    allowResend(true);
    render(modal());
    expect(screen.getByText('Lunch Count Already Sent')).toBeTruthy();
    fireEvent.click(screen.getByText('Review and Resend'));
    expect(screen.getByText('Resend Lunch Report')).toBeTruthy();
    expect(screen.getByText('Confirm & Resend')).toBeTruthy();
  });

  it('returns to the already-sent screen after the parent closes it', () => {
    allowResend(true);
    const { rerender } = render(modal());
    fireEvent.click(screen.getByText('Review and Resend'));
    rerender(modal(false));
    rerender(modal(true));
    expect(screen.getByText('Lunch Count Already Sent')).toBeTruthy();
  });
});
