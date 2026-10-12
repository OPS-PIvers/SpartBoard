import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuidedLearningSet } from '@/types';
import { mockStageLayout } from '@/tests/utils/mockStageLayout';
import {
  DashboardContext,
  type DashboardContextValue,
} from '@/context/DashboardContextValue';
import { GuidedLearningStudio } from './GuidedLearningStudio';
import type { GuidedLearningSaveGuard } from '../../utils/saveConflict';

type SaveFn = (
  set: GuidedLearningSet,
  driveFileId?: string,
  guard?: GuidedLearningSaveGuard
) => Promise<void>;

const features = vi.hoisted(() => new Set<string>());
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'test-user' },
    isAdmin: true,
    featurePermissions: [],
    canAccessFeature: (id: string) => features.has(id),
  }),
}));

vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({
    uploading: false,
    uploadHotspotImage: vi.fn(),
    uploadGuidedLearningMedia: vi.fn(),
    uploadGuidedLearningImage: vi.fn(),
    deleteFile: vi.fn(),
    deleteDriveFile: vi.fn(),
  }),
}));

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({
    currentDialog: null,
    showAlert: vi.fn().mockResolvedValue(undefined),
    showConfirm: vi.fn().mockResolvedValue(false),
    showPrompt: vi.fn().mockResolvedValue(null),
  }),
}));

function buildSet(title = 'Cell Parts'): GuidedLearningSet {
  return {
    id: 'set-1',
    schemaVersion: 3,
    title,
    imageUrls: ['https://example.com/slide-1.png'],
    steps: [
      {
        id: 'step-1',
        xPct: 40,
        yPct: 30,
        imageIndex: 0,
        interactionType: 'tooltip',
        showOverlay: 'tooltip',
        label: 'Nucleus',
        text: 'Click **Start**',
      },
    ],
    mode: 'guided',
    createdAt: 1,
    updatedAt: 1,
  };
}

const addToast = vi.fn();

function renderStudio(
  props: Partial<React.ComponentProps<typeof GuidedLearningStudio>> = {}
) {
  const onSave = vi.fn<SaveFn>().mockResolvedValue(undefined);
  const value = { addToast } as unknown as DashboardContextValue;
  render(
    <DashboardContext.Provider value={value}>
      <GuidedLearningStudio
        set={buildSet()}
        meta={null}
        onClose={vi.fn()}
        onSave={onSave}
        {...props}
      />
    </DashboardContext.Provider>
  );
  return { onSave: (props.onSave as typeof onSave | undefined) ?? onSave };
}

let restore: (() => void) | null = null;
beforeEach(() => {
  localStorage.clear();
  restore = mockStageLayout({
    container: { w: 720, h: 520 },
    image: { w: 1440, h: 1040 },
  }).restore;
});
afterEach(() => {
  cleanup();
  features.clear();
  restore?.();
  restore = null;
});

describe('GuidedLearningStudio Welcome card', () => {
  it('stays hidden without the flag, leaving the welcome fields in activity settings', () => {
    renderStudio();
    expect(screen.queryByTestId('gl-studio-welcome-card')).toBeNull();
    expect(
      screen.getByRole('checkbox', { name: /Show a welcome screen/ })
    ).toBeTruthy();
  });

  it('pins a Welcome card that opens the welcome editor and preview', () => {
    features.add('gl-welcome-card');
    renderStudio();
    expect(
      screen.queryByRole('checkbox', { name: /Show a welcome screen/ })
    ).toBeNull();
    const card = screen.getByRole('button', { name: 'Welcome off' });
    fireEvent.click(card);
    expect(screen.getByTestId('gl-studio-welcome-section')).toBeTruthy();
    expect(screen.getByTestId('gl-studio-welcome-preview')).toBeTruthy();
    expect(screen.queryByTestId('gl-studio-slide-section')).toBeNull();
    fireEvent.change(screen.getByLabelText('Welcome message'), {
      target: { value: 'Hello scientists' },
    });
    expect(
      screen.getByTestId('gl-studio-welcome-preview').textContent
    ).toContain('Hello scientists');
  });

  it('switches the welcome on from the card', () => {
    features.add('gl-welcome-card');
    renderStudio();
    const toggle = screen.getByTestId('gl-studio-welcome-toggle');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('button', { name: 'Welcome' })).toBeTruthy();
  });

  it('leaves the Welcome card when a slide is picked', () => {
    features.add('gl-welcome-card');
    renderStudio();
    fireEvent.click(screen.getByRole('button', { name: 'Welcome off' }));
    fireEvent.click(screen.getAllByRole('button', { name: /Slide 1/ })[0]);
    expect(screen.queryByTestId('gl-studio-welcome-section')).toBeNull();
    expect(screen.getByTestId('gl-studio-slide-section')).toBeTruthy();
  });
});
