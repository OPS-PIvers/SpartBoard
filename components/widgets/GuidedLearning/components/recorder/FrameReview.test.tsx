import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FrameReview } from './FrameReview';
import type { TourRecording } from './useTourCapture';

const h = vi.hoisted(() => ({ redactImage: vi.fn() }));
vi.mock('../../utils/redactImage', () => ({ redactImage: h.redactImage }));

const frames = [new Blob(['one']), new Blob(['two']), new Blob(['three'])];
const raw = [
  new Blob(['raw one']),
  new Blob(['raw two']),
  new Blob(['raw three']),
];
const AUTO = { xPct: 10, yPct: 10, wPct: 20, hPct: 5 };

const recording = (): TourRecording => ({
  frames,
  redactions: [[AUTO], [], []],
  raw,
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

const upload = () => screen.getByRole('button', { name: 'Upload and open' });
const clickAsync = async (el: HTMLElement) => {
  await act(async () => {
    fireEvent.click(el);
    await Promise.resolve();
    await Promise.resolve();
  });
};
const sizeLayer = () => {
  const layer = screen.getByTestId('gl-frame-review-draw');
  vi.spyOn(layer, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 200,
    height: 100,
  } as DOMRect);
  return layer;
};
const renderReview = (rec = recording()) => {
  const onUpload = vi.fn();
  render(
    <FrameReview recording={rec} onUpload={onUpload} onDiscard={vi.fn()} />
  );
  return onUpload;
};
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
  it('uploads straight away, without viewing every frame', async () => {
    const onUpload = renderReview();
    expect(screen.getByText('Blur on 1 of 3 frames')).toBeInTheDocument();
    expect(screen.getAllByTestId('gl-frame-review-blurred')).toHaveLength(1);
    expect(upload()).toBeEnabled();
    await clickAsync(upload());
    expectUploaded(onUpload, frames);
    expect(h.redactImage).not.toHaveBeenCalled();
    expect(onUpload.mock.calls[0][0]).not.toHaveProperty('raw');
  });

  it('removing an automatic blur uploads the unblurred frame', async () => {
    const onUpload = renderReview();
    fireEvent.focus(screen.getByRole('button', { name: 'Blur area 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove this blur' }));
    expect(screen.queryAllByTestId('gl-frame-review-blurred')).toHaveLength(0);
    await clickAsync(upload());
    expectUploaded(onUpload, [raw[0], frames[1], frames[2]]);
    expect((onUpload.mock.calls[0][0] as TourRecording).redactions).toEqual([
      [],
      [],
      [],
    ]);
  });

  it('Remove all blur clears the frame, and Restore blur puts it back', async () => {
    const onUpload = renderReview();
    fireEvent.click(screen.getByRole('button', { name: 'Remove all blur' }));
    expect(screen.queryAllByTestId('gl-frame-review-blurred')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Restore blur' }));
    expect(screen.getAllByTestId('gl-frame-review-blurred')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Restore blur' })).toBeNull();
    await clickAsync(upload());
    expectUploaded(onUpload, frames);
  });

  it('moves a blur by dragging and bakes it into the unblurred frame', async () => {
    const moved = new Blob(['raw one, moved blur']);
    h.redactImage.mockResolvedValue(moved);
    const onUpload = renderReview();
    const layer = sizeLayer();
    const box = screen.getByRole('button', { name: 'Blur area 1' });
    fireEvent.pointerDown(box, { button: 0, clientX: 30, clientY: 10 });
    fireEvent.pointerMove(layer, { clientX: 50, clientY: 30 });
    fireEvent.pointerUp(layer, { clientX: 50, clientY: 30 });
    await clickAsync(upload());
    expect(h.redactImage).toHaveBeenCalledWith(
      raw[0],
      [{ xPct: 20, yPct: 30, wPct: 20, hPct: 5 }],
      { mode: 'blur' }
    );
    expectUploaded(onUpload, [moved, frames[1], frames[2]]);
  });

  it('resizes a blur from a corner handle', () => {
    renderReview();
    const layer = sizeLayer();
    fireEvent.focus(screen.getByRole('button', { name: 'Blur area 1' }));
    const handle = screen.getByTestId('gl-frame-review-handle-se');
    fireEvent.pointerDown(handle, { button: 0, clientX: 60, clientY: 15 });
    fireEvent.pointerMove(layer, { clientX: 100, clientY: 50 });
    fireEvent.pointerUp(layer, { clientX: 100, clientY: 50 });
    const box = screen.getByRole('button', { name: 'Blur area 1' });
    expect(box.style.width).toBe('40%');
    expect(box.style.height).toBe('40%');
  });

  it('nudges a selected blur with the arrow keys and deletes it with Delete', () => {
    renderReview();
    const box = screen.getByRole('button', { name: 'Blur area 1' });
    fireEvent.keyDown(box, { key: 'ArrowRight' });
    expect(box.style.left).toBe('11%');
    fireEvent.keyDown(box, { key: 'Delete' });
    expect(screen.queryByRole('button', { name: 'Blur area 1' })).toBeNull();
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

  it('a drawn blur is baked in at upload, reusing the bake on retry', async () => {
    const drawn = new Blob(['raw two, drawn blur']);
    h.redactImage.mockResolvedValue(drawn);
    const onUpload = renderReview();
    fireEvent.click(next());
    const layer = sizeLayer();
    fireEvent.pointerDown(layer, { button: 0, clientX: 20, clientY: 10 });
    fireEvent.pointerMove(layer, { clientX: 60, clientY: 40 });
    fireEvent.pointerUp(layer, { clientX: 60, clientY: 40 });
    expect(screen.getAllByTestId('gl-frame-review-blurred')).toHaveLength(1);
    await clickAsync(upload());
    await clickAsync(upload());
    expect(h.redactImage).toHaveBeenCalledTimes(1);
    expect(h.redactImage).toHaveBeenCalledWith(
      raw[1],
      [{ xPct: 10, yPct: 10, wPct: 20, hPct: 30 }],
      { mode: 'blur' }
    );
    expectUploaded(onUpload, [frames[0], drawn, frames[2]]);
    expect((onUpload.mock.calls[1][0] as TourRecording).frames[1]).toBe(drawn);
  });

  it('without unblurred frames, automatic blur stays and new blur goes on top', async () => {
    const reblurred = new Blob(['one, blurred again']);
    h.redactImage.mockResolvedValue(reblurred);
    const rec = { ...recording(), raw: undefined };
    const onUpload = renderReview(rec);
    expect(screen.queryByRole('button', { name: 'Blur area 1' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Remove all blur' })
    ).toBeNull();
    const layer = sizeLayer();
    fireEvent.pointerDown(layer, { button: 0, clientX: 20, clientY: 10 });
    fireEvent.pointerMove(layer, { clientX: 60, clientY: 40 });
    fireEvent.pointerUp(layer, { clientX: 60, clientY: 40 });
    expect(screen.getAllByTestId('gl-frame-review-blurred')).toHaveLength(2);
    await clickAsync(upload());
    expect(h.redactImage).toHaveBeenCalledWith(
      frames[0],
      [{ xPct: 10, yPct: 10, wPct: 20, hPct: 30 }],
      { mode: 'blur' }
    );
    expectUploaded(onUpload, [reblurred, frames[1], frames[2]]);
    expect((onUpload.mock.calls[0][0] as TourRecording).redactions[0]).toEqual([
      AUTO,
      { xPct: 10, yPct: 10, wPct: 20, hPct: 30 },
    ]);
  });

  it('discards a frame with its steps, and Undo brings it back', async () => {
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
    expect(screen.getByText('Blur on 1 of 2 frames')).toBeInTheDocument();
    await clickAsync(upload());
    const reviewed = onUpload.mock.calls[0][0] as TourRecording;
    expect(reviewed.frames[0]).toBe(frames[0]);
    expect(reviewed.frames[1]).toBe(frames[2]);
    expect(reviewed.redactions).toEqual([recording().redactions[0], []]);
    expect(reviewed.steps.map((s) => [s.id, s.frameIndex])).toEqual([
      ['s0', 0],
      ['s2', 1],
    ]);
  });

  it('shows an upload error with Retry, which uploads again', async () => {
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
    await clickAsync(screen.getByRole('button', { name: 'Retry' }));
    expectUploaded(onUpload, frames);
  });
});
