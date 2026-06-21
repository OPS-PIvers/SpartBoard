/**
 * Render / interaction test for PlcQuizImportModal (Wave 0 — W0-T4).
 *
 * PlcQuizImportModal is the import-mode picker shown when a teacher adds a PLC
 * quiz to their personal library. It renders two ModeOption buttons (Synced /
 * Make a copy) inside the shared Modal primitive, with a "Recommended for PLCs"
 * pill on the sync option and an optional "shared by {{name}}" subtitle.
 *
 * The Modal primitive renders to the DOM (portal) in jsdom, so we render the
 * modal directly. We mock react-i18next so `t` returns its defaultValue with
 * {{title}}/{{name}} interpolation, which keeps the subtitle assertable.
 *
 * Coverage:
 *   (1) renders the two ModeOption buttons + the "Recommended for PLCs" pill
 *       on the sync option only
 *   (2) shows quizTitle and the "shared by {{name}}" subtitle when sharedByName
 *       is provided
 *   (3) clicking "Synced" calls onPick('sync'); "Make a copy" calls onPick('copy')
 *   (4) clicking the close button calls onClose
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { PlcQuizImportModal } from '@/components/plc/PlcQuizImportModal';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// t returns defaultValue, interpolating {{title}} and {{name}} so the subtitle
// (`{{title}} · shared by {{name}}`) is assertable.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _k: string,
      o?: { defaultValue?: string; title?: string; name?: string }
    ): string => {
      if (!o) return _k;
      let template = o.defaultValue ?? _k;
      if (o.title !== undefined) {
        template = template.replace(/\{\{title\}\}/g, o.title);
      }
      if (o.name !== undefined) {
        template = template.replace(/\{\{name\}\}/g, o.name);
      }
      return template;
    },
  }),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlcQuizImportModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the two mode options with the Recommended pill on Synced only', () => {
    render(
      <PlcQuizImportModal
        quizTitle="Fractions Quiz"
        onPick={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const sync = screen.getByRole('button', { name: /Synced/i });
    const copy = screen.getByRole('button', { name: /Make a copy/i });
    expect(sync).toBeInTheDocument();
    expect(copy).toBeInTheDocument();

    // The recommended pill lives inside the Synced option, not the copy option.
    const pill = screen.getByText('Recommended for PLCs');
    expect(pill).toBeInTheDocument();
    expect(sync).toContainElement(pill);
    expect(copy).not.toContainElement(pill);
  });

  it('shows the bare quizTitle when no sharedByName is provided', () => {
    render(
      <PlcQuizImportModal
        quizTitle="Fractions Quiz"
        onPick={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Fractions Quiz')).toBeInTheDocument();
    expect(screen.queryByText(/shared by/i)).not.toBeInTheDocument();
  });

  it('shows the "shared by {{name}}" subtitle when sharedByName is provided', () => {
    render(
      <PlcQuizImportModal
        quizTitle="Fractions Quiz"
        sharedByName="Ms. Rivera"
        onPick={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(
      screen.getByText('Fractions Quiz · shared by Ms. Rivera')
    ).toBeInTheDocument();
  });

  it("clicking Synced calls onPick('sync')", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(
      <PlcQuizImportModal
        quizTitle="Fractions Quiz"
        onPick={onPick}
        onClose={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /Synced/i }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('sync');
  });

  it("clicking Make a copy calls onPick('copy')", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(
      <PlcQuizImportModal
        quizTitle="Fractions Quiz"
        onPick={onPick}
        onClose={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /Make a copy/i }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('copy');
  });

  it('clicking the close button calls onClose', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <PlcQuizImportModal
        quizTitle="Fractions Quiz"
        onPick={vi.fn()}
        onClose={onClose}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
