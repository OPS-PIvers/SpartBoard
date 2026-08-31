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

/**
 * Lock down the clamp-warning UI in GuidedLearningAIGenerator.
 *
 * The AI occasionally returns steps whose `imageIndex` points past the end
 * of the uploaded image list. `generateGuidedLearning` clamps to 0 and
 * reports the clamped steps; the generator then pauses before `onGenerated`
 * so the teacher can review. A regression that either (a) fails to render
 * the banner or (b) forwards the set to `onGenerated` anyway would ship a
 * silently-wrong guided learning experience — these tests guard both.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const generateGuidedLearningMock = vi.fn();

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
    uploadHotspotImage: vi.fn().mockResolvedValue('https://example/img.png'),
  }),
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

describe('GuidedLearningAIGenerator — clamp banner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default successful response; individual tests override with clamped steps.
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
      clampedSteps: [],
    });
  });

  it('shows the amber clamp banner and withholds onGenerated when Gemini overshot imageIndex', async () => {
    generateGuidedLearningMock.mockResolvedValueOnce({
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
        {
          id: 'step-2',
          xPct: 40,
          yPct: 50,
          interactionType: 'tooltip',
          imageIndex: 0,
          showOverlay: 'tooltip',
        },
      ],
      clampedSteps: [
        {
          stepIndex: 1,
          stepId: 'step-2',
          originalImageIndex: 7,
          clampedTo: 0,
        },
      ],
    });

    const onGenerated = vi.fn<(set: GuidedLearningSet) => void>();
    const onClose = vi.fn();
    render(
      <GuidedLearningAIGenerator onClose={onClose} onGenerated={onGenerated} />
    );

    await seedOneImage();

    const draftButton = screen.getByRole('button', { name: /draft with ai/i });
    await act(async () => {
      fireEvent.click(draftButton);
    });

    // Banner is the clamp-warning amber alert; content must mention that
    // steps had image references that didn't exist. Singular/plural tested
    // via the presence of "1 step" because we supplied one clamped entry.
    const banner = await screen.findByRole('alert');
    expect(banner.textContent ?? '').toMatch(/1 step/i);
    expect(banner.textContent ?? '').toMatch(/didn't exist/i);

    // Most important invariant: the teacher has NOT been forwarded past the
    // warning yet. A regression that skipped the `pendingSet` gate would
    // call onGenerated here.
    expect(onGenerated).not.toHaveBeenCalled();

    // The primary CTA swaps from "Draft with AI" → "Open in editor to review".
    expect(
      screen.queryByRole('button', { name: /draft with ai/i })
    ).not.toBeInTheDocument();
    const reviewButton = screen.getByRole('button', {
      name: /open in editor to review/i,
    });

    await act(async () => {
      fireEvent.click(reviewButton);
    });

    // Now — and only now — the set is forwarded.
    expect(onGenerated).toHaveBeenCalledTimes(1);
    const set = onGenerated.mock.calls[0][0];
    expect(set.title).toBe('Photosynthesis');
    expect(set.steps).toHaveLength(2);
  });

  it('skips the banner and calls onGenerated directly when no steps were clamped', async () => {
    const onGenerated = vi.fn<(set: GuidedLearningSet) => void>();
    const onClose = vi.fn();
    render(
      <GuidedLearningAIGenerator onClose={onClose} onGenerated={onGenerated} />
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
