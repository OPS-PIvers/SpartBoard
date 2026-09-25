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
// Identity, not toEqual: any two Blobs compare equal.
const expectUploaded = (fn: ReturnType<typeof vi.fn>, expected: Blob[]) => {
  const got = (fn.mock.calls[0][0] as TourRecording).frames;
  expect(got).toHaveLength(expected.length);
  got.forEach((f, i) => expect(f).toBe(expected[i]));
};

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
    expectUploaded(onUpload, frames);
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

  it('copies every untagged click in the recording as Markdown', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    const rec = recording();
    rec.steps[1] = {
      ...rec.steps[1],
      context: {
        suggestedId: 'button.add-a-class',
        role: 'button',
        name: 'add a class',
        widgetType: null,
        pathname: '/',
        nearestAnchor: null,
        ancestors: [{ tag: 'button' }],
        htmlExcerpt: '<button>Add a class</button>',
      },
    };
    render(
      <FrameReview recording={rec} onUpload={vi.fn()} onDiscard={vi.fn()} />
    );
    fireEvent.click(next());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy all' }));
      await Promise.resolve();
    });
    const text = (writeText.mock.calls[0] as unknown as [string])[0];
    expect(text).toContain('## 1. button.add-a-class');
    expect(text).toContain('<button>Add a class</button>');
    expect(
      await screen.findByRole('button', { name: 'Copied' })
    ).toBeInTheDocument();
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
    expectUploaded(onUpload, [reblurred, frames[1], frames[2]]);
  });

  it('discards a frame with its steps, and Undo brings it back', () => {
    const onUpload = vi.fn();
    render(
      <FrameReview
        recording={recording()}
        onUpload={onUpload}
        onDiscard={vi.fn()}
      />
    );
    fireEvent.click(next());
    fireEvent.click(screen.getByRole('button', { name: 'Remove frame' }));
    expect(screen.getByText('Frame removed.')).toBeInTheDocument();
    expect(screen.getByText('Frame 2 of 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByText('Frame 2 of 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove frame' }));
    expect(screen.getByText('2 of 2 frames checked')).toBeInTheDocument();
    fireEvent.click(upload());
    const reviewed = onUpload.mock.calls[0][0] as TourRecording;
    expect(reviewed.frames[0]).toBe(frames[0]);
    expect(reviewed.frames[1]).toBe(frames[2]);
    expect(reviewed.redactions).toEqual([recording().redactions[0], []]);
    expect(reviewed.steps.map((s) => [s.id, s.frameIndex])).toEqual([
      ['s0', 0],
      ['s2', 1],
    ]);
  });

  it('shows an upload error with Retry, which uploads again', () => {
    const onUpload = vi.fn();
    render(
      <FrameReview
        recording={recording()}
        onUpload={onUpload}
        onDiscard={vi.fn()}
        error="Couldn't save."
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't save.");
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expectUploaded(onUpload, frames);
  });
});
