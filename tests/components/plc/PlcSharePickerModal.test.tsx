/**
 * Render / interaction test for PlcSharePickerModal (Wave 0 — W0-T4).
 *
 * PlcSharePickerModal is the generic personal-library picker shown from the PLC
 * Quiz Library / Video Activities tabs. It renders a title/subtitle/prompt, a
 * search box, and one row per item with a Share button. The caller's async
 * `onPick(itemId)` runs the share write; while it is pending the modal guards
 * reentry and disables the close button. Empty `items` shows an empty-state
 * instead of the search box.
 *
 * The Modal primitive renders to the DOM (portal) in jsdom, so we render the
 * modal directly. react-i18next is mocked so `t` returns its defaultValue.
 *
 * Coverage:
 *   (1) renders title/subtitle/prompt and one row per item with metaLine
 *   (2) the search input filters rows by title; "No matches." shows when nothing
 *       matches
 *   (3) empty items[] renders the emptyMessage empty-state instead of the search
 *   (4) clicking a row's Share button invokes onPick(itemId)
 *   (5) an item with alreadyShared:true renders the "Already shared" pill and a
 *       disabled Share button
 *   (6) busy reentry guard: while onPick is pending, the close button is disabled
 */

import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  PlcSharePickerModal,
  type PlcSharePickerItem,
} from '@/components/plc/PlcSharePickerModal';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }): string =>
      o?.defaultValue ?? _k,
  }),
}));

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

const ITEMS: PlcSharePickerItem[] = [
  {
    id: 'q1',
    title: 'Fractions Quiz',
    metaLine: '12 questions · Jan 14, 2026',
  },
  { id: 'q2', title: 'Geometry Basics', metaLine: '8 questions · Feb 2, 2026' },
];

interface RenderOpts {
  items?: PlcSharePickerItem[];
  onPick?: (itemId: string) => Promise<void>;
  onClose?: () => void;
}

const renderModal = (opts: RenderOpts = {}) => {
  const onPick = opts.onPick ?? vi.fn().mockResolvedValue(undefined);
  const onClose = opts.onClose ?? vi.fn();
  render(
    <PlcSharePickerModal
      title="Share a quiz with this PLC"
      subtitle="Grade 5 Math PLC"
      prompt="Pick one of your quizzes to share."
      emptyMessage="You have no quizzes to share yet."
      items={opts.items ?? ITEMS}
      onPick={onPick}
      onClose={onClose}
    />
  );
  return { onPick, onClose };
};

/** A promise whose resolution is controlled by the test. */
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlcSharePickerModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title, subtitle, prompt and one row per item with metaLine', () => {
    renderModal();

    expect(screen.getByText('Share a quiz with this PLC')).toBeInTheDocument();
    expect(screen.getByText('Grade 5 Math PLC')).toBeInTheDocument();
    expect(
      screen.getByText('Pick one of your quizzes to share.')
    ).toBeInTheDocument();

    expect(screen.getByText('Fractions Quiz')).toBeInTheDocument();
    expect(screen.getByText('12 questions · Jan 14, 2026')).toBeInTheDocument();
    expect(screen.getByText('Geometry Basics')).toBeInTheDocument();
    expect(screen.getByText('8 questions · Feb 2, 2026')).toBeInTheDocument();

    expect(screen.getAllByRole('button', { name: /Share/i })).toHaveLength(2);
  });

  it('filters rows by title and shows "No matches." when nothing matches', async () => {
    const user = userEvent.setup();
    renderModal();

    const search = screen.getByPlaceholderText('Search…');

    // Filter to the matching row only.
    await user.type(search, 'geometry');
    expect(screen.getByText('Geometry Basics')).toBeInTheDocument();
    expect(screen.queryByText('Fractions Quiz')).not.toBeInTheDocument();

    // Now type a query that matches nothing.
    await user.clear(search);
    await user.type(search, 'zzz no such quiz');
    expect(screen.queryByText('Geometry Basics')).not.toBeInTheDocument();
    expect(screen.queryByText('Fractions Quiz')).not.toBeInTheDocument();
    expect(screen.getByText('No matches.')).toBeInTheDocument();
  });

  it('renders the empty-state (no search box) when items is empty', () => {
    renderModal({ items: [] });

    expect(
      screen.getByText('You have no quizzes to share yet.')
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Search…')).not.toBeInTheDocument();
  });

  it('clicking a row Share button invokes onPick with the item id', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn().mockResolvedValue(undefined);
    renderModal({ onPick });

    const fractionsRow = screen
      .getByText('Fractions Quiz')
      .closest('div.rounded-xl') as HTMLElement;
    await user.click(
      within(fractionsRow).getByRole('button', { name: /Share/i })
    );

    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    expect(onPick).toHaveBeenCalledWith('q1');
  });

  it('renders the "Already shared" pill and disables Share for alreadyShared items', () => {
    renderModal({
      items: [
        { id: 'q1', title: 'Fractions Quiz', alreadyShared: true },
        { id: 'q2', title: 'Geometry Basics' },
      ],
    });

    expect(screen.getByText('Already shared')).toBeInTheDocument();

    const sharedRow = screen
      .getByText('Fractions Quiz')
      .closest('div.rounded-xl') as HTMLElement;
    expect(
      within(sharedRow).getByRole('button', { name: /Share/i })
    ).toBeDisabled();

    // The non-shared row's Share button remains enabled.
    const openRow = screen
      .getByText('Geometry Basics')
      .closest('div.rounded-xl') as HTMLElement;
    expect(
      within(openRow).getByRole('button', { name: /Share/i })
    ).toBeEnabled();
  });

  it('disables the close button while onPick is pending (busy reentry guard)', async () => {
    const user = userEvent.setup();
    const gate = deferred();
    const onPick = vi.fn().mockReturnValue(gate.promise);
    renderModal({ onPick });

    const closeBtn = screen.getByRole('button', { name: 'Close' });
    expect(closeBtn).toBeEnabled();

    const fractionsRow = screen
      .getByText('Fractions Quiz')
      .closest('div.rounded-xl') as HTMLElement;
    await user.click(
      within(fractionsRow).getByRole('button', { name: /Share/i })
    );

    // onPick is still pending — close button must be disabled.
    await waitFor(() => expect(closeBtn).toBeDisabled());

    // Resolve the pending share; the guard releases and close re-enables.
    gate.resolve();
    await waitFor(() => expect(closeBtn).toBeEnabled());
  });
});
