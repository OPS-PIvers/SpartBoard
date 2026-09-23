import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { SubShareVideoActivityWidget } from './SubShareWidget';
import { SubShareContentContext } from '@/context/SubShareContentContextValue';
import type { WidgetData } from '@/types';
import { subShareContextValue } from '@/tests/helpers/subShareContext';

// This suite is about which view a substitute gets; the preview has its own.
vi.mock('./components/VideoActivityPreview', () => ({
  VideoActivityPreview: ({ activity }: { activity: { title: string } }) => (
    <div data-testid="va-preview">{activity.title}</div>
  ),
}));

// Launching has its own suite; here it only matters that the widget hands the
// panel the activity and widget it is looking at.
vi.mock('@/components/subs/SubLaunchPanel', () => ({
  SubLaunchPanel: ({
    kind,
    widgetId,
    itemId,
  }: {
    kind: string;
    widgetId: string;
    itemId?: string | null;
  }) => (
    <div data-testid="sub-launch" data-kind={kind} data-widget={widgetId}>
      {itemId}
    </div>
  ),
}));

const widget = (config: Record<string, unknown>) =>
  ({ id: 'w1', type: 'video-activity', config }) as unknown as WidgetData;

const inShare = (
  loadKey: () => Promise<{ payload: unknown; denied: boolean }>
) =>
  function InShare({ children }: { children: React.ReactNode }) {
    return (
      <SubShareContentContext.Provider
        value={subShareContextValue({
          shareId: 'share-1',
          version: 0,
          load: (() => Promise.resolve(null)) as never,
          loadKey,
        })}
      >
        {children}
      </SubShareContentContext.Provider>
    );
  };

const open = {
  selectedActivityId: 'va-1',
  selectedActivityTitle: 'Mitosis',
};

describe('SubShareVideoActivityWidget', () => {
  it('shows the activity the share carried, not a library', async () => {
    render(<SubShareVideoActivityWidget widget={widget(open)} />, {
      wrapper: inShare(() =>
        Promise.resolve({
          payload: { activity: { id: 'va-1', title: 'Mitosis' } },
          denied: false,
        })
      ),
    });

    expect(await screen.findByTestId('va-preview')).toHaveTextContent(
      'Mitosis'
    );
  });

  it('offers to launch the activity it is showing', async () => {
    render(<SubShareVideoActivityWidget widget={widget(open)} />, {
      wrapper: inShare(() =>
        Promise.resolve({
          payload: { activity: { id: 'va-1', title: 'Mitosis' } },
          denied: false,
        })
      ),
    });

    const panel = await screen.findByTestId('sub-launch');
    expect(panel).toHaveAttribute('data-kind', 'videoActivity');
    expect(panel).toHaveAttribute('data-widget', 'w1');
    expect(panel).toHaveTextContent('va-1');
  });

  // Nothing on screen to start, so nothing to start it with.
  it('offers no launch when the activity did not come along', async () => {
    render(<SubShareVideoActivityWidget widget={widget(open)} />, {
      wrapper: inShare(() => Promise.resolve({ payload: null, denied: false })),
    });

    expect(await screen.findByText('No video activity')).toBeInTheDocument();
    expect(screen.queryByTestId('sub-launch')).not.toBeInTheDocument();
  });

  // The share's keys are readable only by the subs it names; anyone else with
  // the link should be told that, not told the teacher forgot the activity.
  it('says so when the share does not name this reader', async () => {
    render(<SubShareVideoActivityWidget widget={widget(open)} />, {
      wrapper: inShare(() => Promise.resolve({ payload: null, denied: true })),
    });

    expect(await screen.findByText('Not shared with you')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Mitosis is only for the substitutes your teacher named on the share.'
      )
    ).toBeInTheDocument();
  });

  it('names the activity that did not come along', async () => {
    render(<SubShareVideoActivityWidget widget={widget(open)} />, {
      wrapper: inShare(() => Promise.resolve({ payload: null, denied: false })),
    });

    expect(await screen.findByText('No video activity')).toBeInTheDocument();
    expect(
      screen.getByText('Mitosis did not come along with the share.')
    ).toBeInTheDocument();
  });

  it('reads nothing when the widget had no activity open', () => {
    const loadKey = vi.fn();
    render(
      <SubShareVideoActivityWidget
        widget={widget({ selectedActivityId: null })}
      />,
      { wrapper: inShare(loadKey as never) }
    );

    expect(loadKey).not.toHaveBeenCalled();
    expect(screen.getByText('No video activity')).toBeInTheDocument();
  });
});
