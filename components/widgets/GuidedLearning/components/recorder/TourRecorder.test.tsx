import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TourRecorder } from './TourRecorder';
import { buildNameMatcher, type NameMatcher } from './redaction';
import type { TourRecording } from './useTourCapture';

const h = vi.hoisted(() => ({
  pillVisibility: [] as string[],
  grabFrame: vi.fn(),
  redactImage: vi.fn(),
}));

vi.mock('../../utils/displayCapture', () => ({
  canCaptureDisplay: () => true,
  grabFrame: h.grabFrame,
}));

vi.mock('../../utils/redactImage', () => ({
  redactImage: h.redactImage,
}));

const RAW = new Blob(['raw frame']);
const REDACTED = new Blob(['redacted frame']);

const stopTrack = vi.fn();
const mockStream = (displaySurface: string) => {
  const track = {
    getSettings: () => ({ displaySurface }),
    stop: stopTrack,
    onended: null,
  };
  return {
    getVideoTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
};

const getDisplayMedia = vi.fn();

beforeEach(() => {
  h.pillVisibility = [];
  h.grabFrame.mockReset();
  h.grabFrame.mockImplementation(() => {
    h.pillVisibility.push(screen.getByTestId('tour-recorder').style.visibility);
    return Promise.resolve(RAW);
  });
  h.redactImage.mockReset();
  h.redactImage.mockResolvedValue(REDACTED);
  getDisplayMedia.mockReset();
  stopTrack.mockReset();
  vi.stubGlobal('navigator', {
    ...navigator,
    userAgentData: { brands: [{ brand: 'Chromium' }] },
    mediaDevices: { getDisplayMedia },
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(
    window.innerWidth
  );
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(
    window.innerHeight
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (Range.prototype as Partial<Range>).getClientRects;
});

const settle = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
};

const renderRecorder = (
  onFinish = vi.fn(),
  matcher: NameMatcher | null = null,
  board: React.ReactNode = <button data-tour="sidebar.boards">Boards</button>
) => {
  render(
    <>
      {board}
      <TourRecorder matcher={matcher} onFinish={onFinish} onDiscard={vi.fn()} />
    </>
  );
  return onFinish;
};

const startRecording = async () => {
  getDisplayMedia.mockResolvedValue(mockStream('browser'));
  fireEvent.click(screen.getByRole('button', { name: 'Record' }));
  await settle();
};

const finish = async (onFinish: ReturnType<typeof vi.fn>) => {
  fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
  await settle();
  return onFinish.mock.calls[0][0] as TourRecording;
};

describe('TourRecorder', () => {
  it('refuses a shared window or screen', async () => {
    getDisplayMedia.mockResolvedValue(mockStream('window'));
    renderRecorder();
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    await settle();
    expect(stopTrack).toHaveBeenCalled();
    expect(
      screen.getByText('Share this tab, not a window or screen, to record.')
    ).toBeInTheDocument();
  });

  it('asks for this tab without the pointer', async () => {
    getDisplayMedia.mockResolvedValue(mockStream('browser'));
    renderRecorder();
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    await settle();
    expect(getDisplayMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: { cursor: 'never' },
        preferCurrentTab: true,
      })
    );
    expect(screen.getByText('Recording · 0 steps')).toBeInTheDocument();
  });

  it('records a step per click with the pill hidden from the frame', async () => {
    getDisplayMedia.mockResolvedValue(mockStream('browser'));
    const onFinish = renderRecorder();
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    await settle();

    fireEvent.pointerDown(screen.getByText('Boards'), { button: 0 });
    await settle();
    expect(h.pillVisibility).toEqual(['hidden']);
    expect(screen.getByTestId('tour-recorder').style.visibility).toBe('');
    expect(screen.getByText('Recording · 1 step')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Pause' }), {
      button: 0,
    });
    await settle();
    expect(h.grabFrame).toHaveBeenCalledTimes(1);

    const recording = await finish(onFinish);
    expect(recording.frames).toEqual([REDACTED]);
    expect(recording.steps[0]).toMatchObject({
      tour: { anchor: 'sidebar.boards', action: 'click' },
      frameIndex: 0,
      untagged: false,
    });
    expect(stopTrack).toHaveBeenCalled();
  });

  it('blurs roster names and student media into each frame and keeps only the blurred frame', async () => {
    const matcher = buildNameMatcher([
      { firstName: 'Alice', lastName: 'Nguyen' },
    ]);
    const onFinish = renderRecorder(
      vi.fn(),
      matcher,
      <>
        <button data-tour="sidebar.boards">Boards</button>
        <p>Next up: Alice Nguyen</p>
        <video data-pii />
      </>
    );
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: () => [{ x: 100, y: 50, width: 80, height: 20 }],
    });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 10,
      y: 10,
      width: 40,
      height: 40,
    } as DOMRect);
    await startRecording();

    fireEvent.pointerDown(screen.getByText('Boards'), { button: 0 });
    await settle();
    expect(h.redactImage).toHaveBeenCalledTimes(1);
    const [frame, boxes, opts] = h.redactImage.mock.calls[0] as [
      Blob,
      unknown[],
      unknown,
    ];
    expect(frame).toBe(RAW);
    expect(opts).toEqual({ mode: 'blur' });
    // The name's text rect and the video's box, each padded.
    expect(boxes).toHaveLength(2);

    const recording = await finish(onFinish);
    expect(recording.frames).toEqual([REDACTED]);
    expect(recording.frames).not.toContain(RAW);
    expect(recording.redactions).toEqual([boxes]);
  });

  it("never stores a student's name as a step's fallback", async () => {
    const onFinish = renderRecorder(
      vi.fn(),
      buildNameMatcher([{ firstName: 'Alice', lastName: 'Nguyen' }]),
      <button>Alice Nguyen</button>
    );
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: () => [],
    });
    await startRecording();
    fireEvent.pointerDown(screen.getByText('Alice Nguyen'), { button: 0 });
    await settle();
    const recording = await finish(onFinish);
    expect(recording.steps[0].untagged).toBe(true);
    expect(recording.steps[0].tour).toEqual({ anchor: '', action: 'click' });
    expect(recording.steps[0].suggestedId).toBeUndefined();
    expect(JSON.stringify(recording.steps)).not.toMatch(/alice|nguyen/i);
  });

  it('keeps steps in click order when captures finish out of order', async () => {
    let release: (b: Blob) => void = () => undefined;
    h.redactImage
      .mockImplementationOnce(
        () => new Promise<Blob>((resolve) => (release = resolve))
      )
      .mockResolvedValueOnce(REDACTED);
    const onFinish = renderRecorder(
      vi.fn(),
      null,
      <>
        <button data-tour="sidebar.boards">Boards</button>
        <button data-tour="sidebar.classes">Classes</button>
      </>
    );
    await startRecording();
    fireEvent.pointerDown(screen.getByText('Boards'), { button: 0 });
    fireEvent.pointerDown(screen.getByText('Classes'), { button: 0 });
    await settle();
    expect(screen.getByTestId('tour-recorder').style.visibility).toBe('');
    // The second capture is done but waits behind the first.
    expect(screen.getByText('Recording · 0 steps')).toBeInTheDocument();
    const first = new Blob(['first']);
    release(first);
    await settle();
    expect(screen.getByText('Recording · 2 steps')).toBeInTheDocument();
    const recording = await finish(onFinish);
    expect(recording.frames).toEqual([first, REDACTED]);
    expect(recording.steps.map((s) => [s.tour.anchor, s.frameIndex])).toEqual([
      ['sidebar.boards', 0],
      ['sidebar.classes', 1],
    ]);
  });
});
