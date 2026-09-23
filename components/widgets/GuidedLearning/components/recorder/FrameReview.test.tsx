import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FrameReview } from './FrameReview';
import type { TourRecording } from './useTourCapture';

const h = vi.hoisted(() => ({ redactImage: vi.fn() }));
vi.mock('../../utils/redactImage', () => ({ redactImage: h.redactImage }));

const frames = [new Blob(['one']), new Blob(['two']), new Blob(['three'])];

const recording = (): TourRecording => ({
  frames,
  redactions: [[{ xPct: 10, yPct: 10, wPct: 20, hPct: 5 }], [], []],
  steps: frames.map((_, i) => ({
    id: `s${i}`,
    xPct: 50,
    yPct: 50,
    region: { shape: 'rect', wPct: 10, hPct: 10 },
    tour: { anchor: i === 1 ? '' : 'sidebar.boards', action: 'click' },
    frameIndex: i,
    untagged: i === 1,
    ...(i === 1 ? { suggestedId: 'button.add-a-class' } : {}),
  })),
});

const upload = () =>
  screen.getByRole('button', { name: 'Upload and open in Studio' });
const next = () => screen.getByRole('button', { name: 'Next frame' });

beforeEach(() => {
  h.redactImage.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('FrameReview', () => {
  it('keeps upload disabled until every frame has been viewed', () => {
    const onUpload = vi.fn();
    render(
      <FrameReview
        recording={recording()}
        onUpload={onUpload}
        onDiscard={vi.fn()}
      />
    );
    expect(screen.getByText('1 of 3 frames checked')).toBeInTheDocument();
    expect(screen.getAllByTestId('gl-frame-review-blurred')).toHaveLength(1);
    expect(upload()).toBeDisabled();
    fireEvent.click(next());
    expect(upload()).toBeDisabled();
    fireEvent.click(next());
    expect(screen.getByText('3 of 3 frames checked')).toBeInTheDocument();
    fireEvent.click(upload());
    expect(onUpload).toHaveBeenCalledWith(frames);
  });

  it('lists an untagged step with its suggested id', () => {
    render(
      <FrameReview
        recording={recording()}
        onUpload={vi.fn()}
        onDiscard={vi.fn()}
      />
    );
    expect(screen.queryByText('button.add-a-class')).toBeNull();
    fireEvent.click(next());
    expect(screen.getByText('Not tagged in code yet')).toBeInTheDocument();
    expect(screen.getByText('button.add-a-class')).toBeInTheDocument();
  });

  it('bakes extra blur into the already-blurred frame and uploads that', async () => {
    const reblurred = new Blob(['one, blurred again']);
    h.redactImage.mockResolvedValue(reblurred);
    const onUpload = vi.fn();
    render(
      <FrameReview
        recording={recording()}
        onUpload={onUpload}
        onDiscard={vi.fn()}
      />
    );
    const layer = screen.getByTestId('gl-frame-review-draw');
    vi.spyOn(layer, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 100,
    } as DOMRect);
    fireEvent.click(next());
    fireEvent.click(next());
    fireEvent.click(screen.getByRole('button', { name: 'Previous frame' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous frame' }));
    expect(upload()).toBeEnabled();
    fireEvent.pointerDown(layer, { button: 0, clientX: 20, clientY: 10 });
    fireEvent.pointerMove(layer, { clientX: 60, clientY: 40 });
    fireEvent.pointerUp(layer, { clientX: 60, clientY: 40 });
    // A drawn but unapplied area blocks upload.
    expect(upload()).toBeDisabled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Blur 1 area' }));
      await Promise.resolve();
    });
    expect(h.redactImage).toHaveBeenCalledWith(
      frames[0],
      [{ xPct: 10, yPct: 10, wPct: 20, hPct: 30 }],
      { mode: 'blur' }
    );
    expect(screen.getAllByTestId('gl-frame-review-blurred')).toHaveLength(2);
    fireEvent.click(upload());
    expect(onUpload).toHaveBeenCalledWith([reblurred, frames[1], frames[2]]);
  });
});
