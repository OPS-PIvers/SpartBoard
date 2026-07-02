import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from '@testing-library/react';

// Heavy mocking so we can render just the chip row without the full editor
vi.mock('@/components/common/SortableList', () => ({
  SortableList: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock(
  '@/components/widgets/GuidedLearning/components/GuidedLearningStepEditor',
  () => ({
    GuidedLearningStepEditor: () => <div data-testid="step-editor" />,
  })
);
vi.mock(
  '@/components/widgets/GuidedLearning/components/ScreenCaptureModal',
  () => ({
    ScreenCaptureModal: () => null,
  })
);
vi.mock('@/components/widgets/GuidedLearning/utils/imageUtils', () => ({
  calculateImageFootprint: () => ({
    offsetLeft: 0,
    offsetTop: 0,
    width: 100,
    height: 100,
  }),
}));
vi.mock('@/utils/guidedLearningMedia', () => ({
  GL_MEDIA_ACCEPT: 'image/*,video/*',
}));

import { GuidedLearningEditorContextPane } from '@/components/widgets/GuidedLearning/components/GuidedLearningEditor';
import type { GuidedLearningEditorController } from '@/components/widgets/GuidedLearning/components/useGuidedLearningEditorState';

afterEach(cleanup);

const makeState = (): GuidedLearningEditorController => ({
  title: 'Test',
  setTitle: vi.fn(),
  description: '',
  setDescription: vi.fn(),
  mode: 'structured',
  setMode: vi.fn(),
  hotspotPulse: 'consistent',
  setHotspotPulse: vi.fn(),
  imageTransition: 'none',
  setImageTransition: vi.fn(),
  welcomeEnabled: false,
  setWelcomeEnabled: vi.fn(),
  welcomeMessage: '',
  setWelcomeMessage: vi.fn(),
  imageUrls: [],
  imageKinds: [],
  videoTrims: [],
  setVideoTrim: vi.fn(),
  currentImageIndex: 0,
  setCurrentImageIndex: vi.fn(),
  uploading: false,
  uploadProgress: null,
  uploadFromFiles: vi.fn().mockResolvedValue(undefined),
  uploadFromClipboard: vi.fn().mockResolvedValue(undefined),
  addCapturedMedia: vi.fn().mockResolvedValue(undefined),
  deleteImage: vi.fn(),
  moveImage: vi.fn(),
  imageError: '',
  steps: [],
  setSteps: vi.fn(),
  selectedStepId: null,
  setSelectedStepId: vi.fn(),
  addingStep: false,
  setAddingStep: vi.fn(),
  addStepAt: vi.fn(),
  updateStep: vi.fn(),
  deleteStep: vi.fn(),
  reorderSteps: vi.fn(),
  selectedStep: null,
  currentImageSteps: [],
});

describe('GuidedLearningEditorContextPane — SettingChip Escape closes popover', () => {
  it('closes the Pulse SettingChip popover when Escape is pressed inside it', () => {
    render(<GuidedLearningEditorContextPane state={makeState()} />);

    // Open the Pulse chip popover
    const pulseChip = screen.getByRole('button', { name: /pulse/i });
    act(() => {
      fireEvent.click(pulseChip);
    });

    // The portal renders a menu via createPortal — look for it in the document
    const menu = document.querySelector('[role="menu"][data-widget-portal]');
    expect(menu).not.toBeNull();

    // Press Escape from inside the portal — popover should close
    act(() => {
      (menu as Element).dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
          cancelable: true,
        })
      );
    });

    expect(
      document.querySelector('[role="menu"][data-widget-portal]')
    ).toBeNull();
  });

  it('does not bubble the popover Escape to an ancestor onKeyDown (would close the settings panel)', () => {
    // Reproduces the real DraggableWindow nesting: the editor renders inside the
    // widget settings panel, whose wrapper has an onKeyDown that closes the panel
    // on Escape. createPortal preserves React-tree bubbling, so without
    // e.stopPropagation() in the popover handler the Escape reaches this ancestor
    // and closes the whole panel along with the popover.
    const ancestorEscape = vi.fn();
    render(
      <div
        onKeyDown={(e) => {
          if (e.key === 'Escape') ancestorEscape();
        }}
      >
        <GuidedLearningEditorContextPane state={makeState()} />
      </div>
    );

    const pulseChip = screen.getByRole('button', { name: /pulse/i });
    act(() => {
      fireEvent.click(pulseChip);
    });

    const menu = document.querySelector('[role="menu"][data-widget-portal]');
    expect(menu).not.toBeNull();

    // fireEvent routes through React's synthetic system, which traverses the
    // fiber tree across the portal boundary — the path that actually exercises
    // e.stopPropagation() (a raw dispatchEvent would not reliably reach the
    // ancestor's React onKeyDown).
    fireEvent.keyDown(menu as Element, { key: 'Escape' });

    // Popover closed, but the ancestor keydown must NOT have fired.
    expect(
      document.querySelector('[role="menu"][data-widget-portal]')
    ).toBeNull();
    expect(ancestorEscape).not.toHaveBeenCalled();
  });
});
