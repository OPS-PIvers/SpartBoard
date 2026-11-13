import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { LunchCountWidget } from './LunchCountEntry';
import type { WidgetData } from '@/types';

vi.mock('./MiddleHighLunchCount', () => ({
  MiddleHighLunchCount: () => <div data-testid="middle-high-face" />,
}));
vi.mock('./redesign/RedesignedLunchCount', () => ({
  LunchCountRedesign: () => <div data-testid="new-face" />,
}));

const widget = { id: 'w', type: 'lunchCount', config: {} } as WidgetData;
const siteWidget = (schoolSite: string) =>
  ({ id: 'w', type: 'lunchCount', config: { schoolSite } }) as WidgetData;

describe('LunchCountWidget site switch', () => {
  it('renders the redesigned face with no site saved', () => {
    const { getByTestId, queryByTestId } = render(
      <LunchCountWidget widget={widget} />
    );
    expect(getByTestId('new-face')).toBeInTheDocument();
    expect(queryByTestId('middle-high-face')).toBeNull();
  });

  it.each(['orono-middle-school', 'orono-high-school'])(
    'renders the middle/high face for %s',
    (site) => {
      const { getByTestId, queryByTestId } = render(
        <LunchCountWidget widget={siteWidget(site)} />
      );
      expect(getByTestId('middle-high-face')).toBeInTheDocument();
      expect(queryByTestId('new-face')).toBeNull();
    }
  );

  it.each(['schumann-elementary', 'orono-intermediate-school'])(
    'renders the redesigned face for %s',
    (site) => {
      const { getByTestId } = render(
        <LunchCountWidget widget={siteWidget(site)} />
      );
      expect(getByTestId('new-face')).toBeInTheDocument();
    }
  );
});
