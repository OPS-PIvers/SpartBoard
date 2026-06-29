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
});
