/* eslint-disable @typescript-eslint/require-await -- act() is typed to
   accept an async callback; passing synchronous bodies is idiomatic for
   dispatching events that trigger React state updates. */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import type { GuidedLearningSet } from '@/types';

// Generator hand-off and container-query sizing.

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const generateGuidedLearningMock = vi.fn();
const storageUpload = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    url: 'https://example/img.png',
    storagePath: 'users/teacher-1/hotspot_images/1-img.png',
    thumbnailUrl: 'https://example/thumb.webp',
  })
);

vi.mock('@/utils/ai', () => ({
  generateGuidedLearning: (
    images: unknown,
    prompt?: string
  ): Promise<unknown> =>
    generateGuidedLearningMock(images, prompt) as Promise<unknown>,
  buildPromptWithFileContext: (prompt: string) => prompt,
}));

vi.mock('@/hooks/useStorage', () => ({
  useStorage: () => ({
    uploading: false,
    uploadGuidedLearningImage: storageUpload,
  }),
}));

vi.mock('@/utils/guidedLearningMedia', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/guidedLearningMedia')>()),
  prepareImageForUpload: (file: File) => Promise.resolve(file),
}));

vi.mock('@/utils/fileEncoding', () => ({
  blobToBase64: vi.fn().mockResolvedValue('base64data'),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1' },
    canAccessFeature: () => false,
  }),
}));

// The Drive pickers pull in Google APIs — stub them so the generator
// renders without a real gapi/GIS SDK loaded.
vi.mock('@/components/common/DriveImagePicker', () => ({
  DriveImagePicker: () => null,
}));
vi.mock('@/components/common/DriveFileAttachment', () => ({
  DriveFileAttachment: () => null,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

import { GuidedLearningAIGenerator } from '@/components/widgets/GuidedLearning/components/GuidedLearningAIGenerator';

/**
 * Seed the generator's `images` state by driving the hidden file input.
 * This is the same code path teachers use when picking files from disk.
 */
async function seedOneImage() {
  const file = new File(['fake-image-bytes'], 'diagram.png', {
    type: 'image/png',
  });
  const input = document.querySelector(
    'input[type="file"]'
  ) as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
  await waitFor(() => {
    expect(screen.getByText(/1 image/i)).toBeInTheDocument();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GuidedLearningAIGenerator — generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateGuidedLearningMock.mockResolvedValue({
      suggestedTitle: 'Photosynthesis',
      suggestedMode: 'structured',
      steps: [
        {
          id: 'step-1',
          xPct: 10,
          yPct: 20,
          interactionType: 'text-popover',
          imageIndex: 0,
          showOverlay: 'popover',
        },
      ],
    });
  });

  it('calls onGenerated directly after generating', async () => {
    const onGenerated = vi.fn<(set: GuidedLearningSet) => void>();
    const onClose = vi.fn();
    render(
      <GuidedLearningAIGenerator
        mediaHome="storage"
        onClose={onClose}
        onGenerated={onGenerated}
      />
    );

    await seedOneImage();

    const draftButton = screen.getByRole('button', { name: /draft with ai/i });
    await act(async () => {
      fireEvent.click(draftButton);
    });

    await waitFor(() => {
      expect(onGenerated).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(storageUpload.mock.calls[0][3]).toBe('storage');
    expect(onGenerated.mock.calls[0][0].isBuilding).toBe(true);
    expect(onGenerated.mock.calls[0][0].slideThumbnails).toEqual({
      'https://example/img.png': 'https://example/thumb.webp',
    });
  });
});

describe('GuidedLearningAIGenerator — media home', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateGuidedLearningMock.mockResolvedValue({
      suggestedTitle: 'Drafted',
      suggestedMode: 'structured',
      steps: [],
    });
  });

  it('uploads to Drive for a personal set and drafts a personal set', async () => {
    const onGenerated = vi.fn<(set: GuidedLearningSet) => void>();
    render(
      <GuidedLearningAIGenerator
        mediaHome="drive"
        onClose={vi.fn()}
        onGenerated={onGenerated}
      />
    );
    await seedOneImage();
    expect(storageUpload.mock.calls[0][3]).toBe('drive');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /draft with ai/i }));
    });
    await waitFor(() => expect(onGenerated).toHaveBeenCalledTimes(1));
    expect(onGenerated.mock.calls[0][0].isBuilding).toBeUndefined();
  });
});

describe('GuidedLearningAIGenerator — cqmin scaling', () => {
  it('sizes text and icons with cqmin source, never cqh/cqw', () => {
    // Same jsdom limitation as GuidedLearningResults.test.tsx: the CSS
    // parser doesn't recognize `min()`/`clamp()`, so React never writes
    // those inline-style values to the DOM here — assert on the source
    // instead of the rendered output.
    const source = readFileSync(
      resolve(
        __dirname,
        '../../../components/widgets/GuidedLearning/components/GuidedLearningAIGenerator.tsx'
      ),
      'utf8'
    );
    const cqminMatches = source.match(/cqmin/g) ?? [];
    expect(cqminMatches.length).toBeGreaterThan(20);
    expect(source).not.toMatch(/\bcqh\b/);
    expect(source).not.toMatch(/\bcqw\b/);
    // The per-image caption textarea is text a teacher types into, not
    // display text — it should floor at a readable size rather than
    // shrinking unbounded with `min()` on a narrowed widget.
    expect(source).toMatch(/clamp\(10px, 4cqmin, 11px\)/);
  });
});
