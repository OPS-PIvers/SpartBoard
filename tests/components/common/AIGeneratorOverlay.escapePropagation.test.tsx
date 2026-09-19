/**
 * Regression test: AIGeneratorOverlay's Escape handler closed the AI
 * generator panel, but never called stopPropagation(). The overlay is
 * rendered as `children` inside the shared `Modal` primitive (via
 * EditorModalShell, used by the Quiz/Video Activity/Mini App editors).
 * Modal registers its own unconditional `window`-level Escape handler
 * that calls the ancestor editor's onClose. Because AIGeneratorOverlay
 * never stopped propagation, pressing Escape while focus was inside the
 * "Draft with AI" panel (e.g. typing in the prompt textarea) bubbled past
 * the overlay and ALSO triggered Modal's onClose — closing/discarding the
 * entire editor instead of just dismissing the small AI panel.
 *
 * A second, more serious form of the same bug: the original fix attached
 * its stopPropagation() call to a div-level `onKeyDown`, which only fires
 * when focus is actually inside the overlay's DOM subtree. Nothing in
 * AIGeneratorOverlay (or in the Video Activity editor's usage, which has
 * no focusable field in the overlay body at all — just +/- stepper
 * buttons the user doesn't need to touch) ever moves focus there, so the
 * div-level handler could go its entire life without firing once.
 *
 * FIX: the handler is now a `document`-level `keydown` listener (mounted
 * for the lifetime of `open`, independent of focus), matching the same
 * fix already applied to ToolDockItem, RemoteControlMenu, ClassRosterMenu,
 * OverflowMenu, ActiveClassChip, and ImportWizard's AI overlay for this
 * exact bug class.
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Modal } from '@/components/common/Modal';
import { AIGeneratorOverlay } from '@/components/common/AIGeneratorOverlay';

afterEach(() => {
  cleanup();
  delete (document.body.style as { overflow?: string }).overflow;
  document.body.style.overflow = '';
});

describe('AIGeneratorOverlay — Escape does not leak to ancestor Modal', () => {
  it('closes only the overlay on Escape, not the ancestor Modal', () => {
    const onModalClose = vi.fn();
    const onOverlayClose = vi.fn();

    render(
      <Modal isOpen={true} onClose={onModalClose} title="Editor">
        <AIGeneratorOverlay
          open={true}
          onClose={onOverlayClose}
          title="Draft with AI"
          generating={false}
          canGenerate={true}
          onGenerate={vi.fn()}
        >
          <textarea aria-label="prompt" />
        </AIGeneratorOverlay>
      </Modal>
    );

    const textarea = screen.getByLabelText('prompt');
    textarea.focus();
    fireEvent.keyDown(textarea, { key: 'Escape', bubbles: true });

    expect(onOverlayClose).toHaveBeenCalledTimes(1);
    // This is the crux of the regression: Modal's Escape handler is a
    // window-level `keydown` listener. If the overlay's own handler
    // doesn't stopPropagation, the event still reaches window and closes
    // (or prompts to discard) the whole editor.
    expect(onModalClose).not.toHaveBeenCalled();
  });

  it('closes only the overlay on Escape even when focus never entered it (Video Activity has no focusable field)', () => {
    const onModalClose = vi.fn();
    const onOverlayClose = vi.fn();

    render(
      <Modal isOpen={true} onClose={onModalClose} title="Editor">
        {/* Simulates the Video Activity editor: the trigger that opened the
            panel lives outside AIGeneratorOverlay's DOM subtree and keeps
            focus after the click, and the overlay body below (mirroring
            the real +/- stepper-only body) has nothing focusable at all. */}
        <button type="button">Draft with AI trigger</button>
        <AIGeneratorOverlay
          open={true}
          onClose={onOverlayClose}
          title="Draft with AI"
          generating={false}
          canGenerate={true}
          onGenerate={vi.fn()}
        >
          <div>Question mix — no focusable field here</div>
        </AIGeneratorOverlay>
      </Modal>
    );

    // Focus stays on the trigger, outside the overlay — nothing in the real
    // component or its Video Activity usage ever moves focus into the panel.
    screen.getByText('Draft with AI trigger').focus();
    fireEvent.keyDown(document.activeElement as Element, {
      key: 'Escape',
      bubbles: true,
    });

    expect(onOverlayClose).toHaveBeenCalledTimes(1);
    expect(onModalClose).not.toHaveBeenCalled();
  });
});
