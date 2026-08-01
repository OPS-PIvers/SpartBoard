/**
 * Regression test: dialogs must not close an open widget SettingsPanel.
 *
 * BUG: DialogContainer portals its overlay onto document.body. SettingsPanel
 * closes itself on any pointerdown outside its own subtree (and outside the
 * widget), so pressing "Delete" in a confirm dialog that the settings panel
 * had just opened closed the panel out from under the user — the schedule
 * widget's settings window appeared to vanish (taking the user's in-progress
 * edits with it, as far as they could tell) the moment they confirmed.
 *
 * FIX: the overlay carries `data-settings-exclude`, the opt-out marker
 * SettingsPanel's click-outside handler checks with `target.closest()`.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup, screen } from '@testing-library/react';

afterEach(cleanup);

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    currentDialog: {
      kind: 'confirm',
      message: 'Are you sure you want to delete this schedule?',
      options: { variant: 'danger', confirmLabel: 'Delete' },
      resolve: vi.fn(),
    },
    showAlert: vi.fn(),
    showConfirm: vi.fn(),
    showPrompt: vi.fn(),
  }),
}));

import { DialogContainer } from '@/components/common/DialogContainer';

describe('DialogContainer — settings-panel exclusion', () => {
  it('marks the overlay with data-settings-exclude so buttons inside it never read as a click-outside', () => {
    render(<DialogContainer />);

    const confirmButton = screen.getByRole('button', { name: 'Delete' });

    // This is exactly the lookup SettingsPanel's pointerdown handler performs.
    expect(confirmButton.closest('[data-settings-exclude]')).not.toBeNull();
  });
});
