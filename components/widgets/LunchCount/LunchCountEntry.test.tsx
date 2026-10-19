import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { LunchCountWidget } from './LunchCountEntry';
import { useAuth } from '@/context/useAuth';
import type { WidgetData } from '@/types';

vi.mock('@/context/useAuth');
vi.mock('./Widget', () => ({
  LunchCountWidget: () => <div data-testid="legacy-face" />,
}));
vi.mock('./redesign/RedesignedLunchCount', () => ({
  LunchCountRedesign: () => <div data-testid="new-face" />,
}));

const widget = { id: 'w', type: 'lunchCount', config: {} } as WidgetData;

describe('LunchCountWidget flag switch', () => {
  const canAccessFeature = vi.fn();
  beforeEach(() => {
    canAccessFeature.mockReset();
    (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      canAccessFeature,
    });
  });

  it('renders the legacy face with the flag off', () => {
    canAccessFeature.mockReturnValue(false);
    const { getByTestId, queryByTestId } = render(
      <LunchCountWidget widget={widget} />
    );
    expect(getByTestId('legacy-face')).toBeInTheDocument();
    expect(queryByTestId('new-face')).toBeNull();
    expect(canAccessFeature).toHaveBeenCalledWith('lunch-count-redesign');
  });

  it('renders the redesigned face with the flag on', () => {
    canAccessFeature.mockReturnValue(true);
    const { getByTestId, queryByTestId } = render(
      <LunchCountWidget widget={widget} />
    );
    expect(getByTestId('new-face')).toBeInTheDocument();
    expect(queryByTestId('legacy-face')).toBeNull();
  });
});
