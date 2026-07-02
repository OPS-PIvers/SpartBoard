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
});
