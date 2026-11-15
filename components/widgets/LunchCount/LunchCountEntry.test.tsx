import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { LunchCountWidget } from './LunchCountEntry';
import type { WidgetData } from '@/types';

const canAccessFeature = vi.fn();
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ canAccessFeature }),
}));
vi.mock('./MiddleHighLunchCount', () => ({
  MiddleHighLunchCount: () => <div data-testid="middle-high-face" />,
}));
vi.mock('./redesign/RedesignedLunchCount', () => ({
  LunchCountRedesign: () => <div data-testid="new-face" />,
}));
vi.mock('./Widget', () => ({
  LunchCountWidget: () => <div data-testid="legacy-face" />,
}));

const widget = { id: 'w', type: 'lunchCount', config: {} } as WidgetData;
const siteWidget = (schoolSite: string) =>
  ({ id: 'w', type: 'lunchCount', config: { schoolSite } }) as WidgetData;

describe('LunchCountWidget face switch', () => {
  beforeEach(() => canAccessFeature.mockReset());

  it('renders the classic face when the redesign flag is off', () => {
    canAccessFeature.mockReturnValue(false);
    const { getByTestId, queryByTestId } = render(
      <LunchCountWidget widget={widget} />
    );
    expect(getByTestId('legacy-face')).toBeInTheDocument();
    expect(queryByTestId('new-face')).toBeNull();
    expect(canAccessFeature).toHaveBeenCalledWith('lunch-count-redesign');
  });

  it.each(['schumann-elementary', 'orono-intermediate-school'])(
    'renders the redesigned face for %s when the flag is on',
    (site) => {
      canAccessFeature.mockReturnValue(true);
      const { getByTestId, queryByTestId } = render(
        <LunchCountWidget widget={siteWidget(site)} />
      );
      expect(getByTestId('new-face')).toBeInTheDocument();
      expect(queryByTestId('legacy-face')).toBeNull();
    }
  );

  it.each(['orono-middle-school', 'orono-high-school'])(
    'renders the middle/high face for %s whatever the flag',
    (site) => {
      for (const on of [true, false]) {
        canAccessFeature.mockReturnValue(on);
        const { getByTestId, unmount } = render(
          <LunchCountWidget widget={siteWidget(site)} />
        );
        expect(getByTestId('middle-high-face')).toBeInTheDocument();
        unmount();
      }
    }
  );
});
