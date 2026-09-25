import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TourAnchorQueueItem } from '@/components/tours/anchorQueue';
import { UnmappedAnchorsSection } from './UnmappedAnchorsSection';

const h = vi.hoisted(() => ({
  items: [] as TourAnchorQueueItem[],
  rebind: vi.fn(),
}));

vi.mock('@/components/tours/anchorQueueStore', () => ({
  useTourAnchorQueue: () => ({ items: h.items, loading: false, error: false }),
  rebindQueueItem: h.rebind,
}));

const item = (
  fingerprint: string,
  extra: Partial<TourAnchorQueueItem>
): TourAnchorQueueItem => ({
  fingerprint,
  status: 'open',
  suggestedId: `button.${fingerprint}`,
  role: 'button',
  name: fingerprint,
  widgetType: null,
  pathname: '/',
  nearestAnchor: null,
  ancestors: [{ tag: 'button' }],
  htmlExcerpt: '<button></button>',
  occurrences: [{ setId: 'set-1', stepId: `step-${fingerprint}` }],
  ...extra,
});

const rowFor = (id: string) =>
  screen
    .getAllByTestId('unmapped-item')
    .find((row) => row.textContent?.includes(`button.${id}`)) as HTMLElement;

const renderSection = () => {
  const props = {
    titles: new Map([['set-1', 'Clock tour']]),
    onOpenStep: vi.fn(),
    loadSet: vi.fn(),
    saveSet: vi.fn(),
  };
  render(<UnmappedAnchorsSection {...props} />);
  return props;
};

beforeEach(() => {
  h.rebind.mockReset();
  h.rebind.mockResolvedValue(1);
  h.items = [
    item('open', {}),
    item('mapped', {
      status: 'pr-open',
      anchorId: 'sidebar.boards',
      prUrl: 'https://github.com/o/r/pull/7',
    }),
    item('waiting', { status: 'pr-open', anchorId: 'not.deployed.yet' }),
    item('human', {
      status: 'needs-human',
      reason: 'Rendered by a third-party embed',
    }),
    item('done', { status: 'rebound', anchorId: 'sidebar.boards' }),
  ];
});

describe('UnmappedAnchorsSection', () => {
  it('shows status chips, the PR link and the needs-human reason', () => {
    renderSection();
    expect(within(rowFor('open')).getByText('Open')).toBeInTheDocument();
    expect(within(rowFor('mapped')).getByText('Mapped')).toBeInTheDocument();
    expect(
      within(rowFor('mapped')).getByRole('link', { name: 'Pull request' })
    ).toHaveAttribute('href', 'https://github.com/o/r/pull/7');
    expect(
      within(rowFor('waiting')).getByText('Waiting for deploy')
    ).toBeInTheDocument();
    expect(
      within(rowFor('human')).getByText('Rendered by a third-party embed')
    ).toBeInTheDocument();
    expect(within(rowFor('done')).getByText('Rebound')).toBeInTheDocument();
  });

  it('offers Rebind only when this build registers the anchor', async () => {
    const props = renderSection();
    expect(
      within(rowFor('waiting')).queryByRole('button', { name: /Rebind/ })
    ).not.toBeInTheDocument();
    expect(
      within(rowFor('done')).queryByRole('button', { name: /Rebind/ })
    ).not.toBeInTheDocument();
    const rebind = within(rowFor('mapped')).getByRole('button', {
      name: 'Rebind 1 step',
    });
    await act(async () => {
      fireEvent.click(rebind);
      await Promise.resolve();
    });
    expect(h.rebind).toHaveBeenCalledWith(
      expect.objectContaining({ fingerprint: 'mapped' }),
      { load: props.loadSet, save: props.saveSet }
    );
  });

  it('says so when a rebind fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    h.rebind.mockRejectedValue(new Error('conflict'));
    renderSection();
    await act(async () => {
      fireEvent.click(
        within(rowFor('mapped')).getByRole('button', { name: /Rebind/ })
      );
      await Promise.resolve();
    });
    expect(within(rowFor('mapped')).getByRole('alert')).toHaveTextContent(
      "Couldn't rebind. Try again."
    );
  });

  it('opens a clicked-in step in the Studio', () => {
    const props = renderSection();
    fireEvent.click(
      within(rowFor('open')).getByRole('button', {
        name: 'Open in Studio: Clock tour',
      })
    );
    expect(props.onOpenStep).toHaveBeenCalledWith('set-1', 'step-open');
  });

  it('copies only the open items', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    renderSection();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy all' }));
      await Promise.resolve();
    });
    const text = (writeText.mock.calls[0] as unknown as [string])[0];
    expect(text).toContain('button.open');
    expect(text).not.toContain('button.mapped');
    expect(
      await screen.findByRole('button', { name: 'Copied' })
    ).toBeInTheDocument();
  });
});
