import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { ScreenCaptureModal } from '@/components/widgets/GuidedLearning/components/ScreenCaptureModal';

afterEach(cleanup);

describe('ScreenCaptureModal — portal root attribute', () => {
  it('has data-widget-portal="" on its portal root so isEscapeFromWidgetInput recognises it as a protected zone', () => {
    render(
      <ScreenCaptureModal
        mode="snap"
        onAddMedia={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />
    );
    // The portal div must carry data-widget-portal so that other components'
    // isEscapeFromWidgetInput guards bail when focus is inside this modal.
    expect(document.querySelector('[data-widget-portal]')).not.toBeNull();
  });

  it('calls onClose when Escape is fired from inside the portal root (no self-suppression)', () => {
    const onClose = vi.fn();
    render(
      <ScreenCaptureModal
        mode="snap"
        onAddMedia={vi.fn().mockResolvedValue(undefined)}
        onClose={onClose}
      />
    );

    // The modal root has data-widget-portal="". The old handler called
    // isEscapeFromWidgetInput which returned true for any element inside the
    // portal, silently blocking onClose — the self-suppression bug.
    const portalRoot = document.querySelector('[data-widget-portal]');
    if (!portalRoot) throw new Error('portal root not found');
    const innerEl = portalRoot.querySelector('button') ?? portalRoot;
    innerEl.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      })
    );

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
