import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECORDER_POS_KEY, TourRecorder } from './TourRecorder';
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

  it('waits for a frame the shared tab captured after the pill hid', async () => {
    const pending: VideoFrameRequestCallback[] = [];
    Object.defineProperty(
      HTMLVideoElement.prototype,
      'requestVideoFrameCallback',
      {
        configurable: true,
        value: (cb: VideoFrameRequestCallback) => pending.push(cb),
      }
    );
    const deliver = (captureTime: number) => {
      const cb = pending.shift();
      cb?.(performance.now(), { captureTime } as VideoFrameCallbackMetadata);
    };
    try {
      const onFinish = renderRecorder();
      await startRecording();
      fireEvent.pointerDown(screen.getByText('Boards'), { button: 0 });
      await settle();
      expect(pending).toHaveLength(1);
      // Still in the pipeline from before the pill hid.
      deliver(0);
      await settle();
      expect(h.grabFrame).not.toHaveBeenCalled();
      expect(screen.getByTestId('tour-recorder').style.visibility).toBe(
        'hidden'
      );
      deliver(performance.now());
      await settle();
      expect(h.pillVisibility).toEqual(['hidden']);
      expect(screen.getByTestId('tour-recorder').style.visibility).toBe('');
      const recording = await finish(onFinish);
      expect(recording.steps).toHaveLength(1);
    } finally {
      delete (HTMLVideoElement.prototype as Partial<HTMLVideoElement>)
        .requestVideoFrameCallback;
    }
  });

  it('marks the element hovered before the pointer reached Mark step', async () => {
    const onFinish = renderRecorder();
    await startRecording();
    fireEvent.pointerMove(screen.getByText('Boards'));
    const mark = screen.getByRole('button', { name: 'Mark step' });
    fireEvent.pointerMove(mark);
    fireEvent.click(mark);
    await settle();
    const recording = await finish(onFinish);
    expect(recording.steps.map((s) => [s.tour.anchor, s.tour.action])).toEqual([
      ['sidebar.boards', 'observe'],
    ]);
  });

  it('records a click that opens a menu as its own step, then the menu item', async () => {
    const Board = () => {
      const [open, setOpen] = React.useState(false);
      return (
        <div data-tour="settings.root">
          <button
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            Layout options
          </button>
          {open && (
            <div role="menu">
              <button data-tour="sidebar.classes">Two columns</button>
            </div>
          )}
        </div>
      );
    };
    const onFinish = renderRecorder(vi.fn(), null, <Board />);
    await startRecording();
    const opener = screen.getByText('Layout options');
    fireEvent.pointerDown(opener, { button: 0 });
    fireEvent.click(opener, { detail: 1 });
    await settle();
    fireEvent.pointerDown(screen.getByText('Two columns'), { button: 0 });
    await settle();
    const recording = await finish(onFinish);
    expect(recording.steps.map((s) => s.tour)).toEqual([
      {
        anchor: '',
        fallback: { role: 'button', name: 'layout options' },
        action: 'click',
      },
      {
        anchor: 'sidebar.classes',
        fallback: { role: 'button', name: 'two columns' },
        action: 'click',
      },
    ]);
    expect(recording.steps[0]).toMatchObject({
      untagged: true,
      suggestedId: 'button.layout-options',
    });
  });

  it('records a keyboard-opened menu as its own step', async () => {
    const onFinish = renderRecorder(
      vi.fn(),
      null,
      <>
        <button data-tour="sidebar.open-menu" aria-expanded="false">
          Menu
        </button>
        <button>Plain</button>
      </>
    );
    await startRecording();
    fireEvent.click(screen.getByText('Menu'), { detail: 0 });
    // A keyboard click on a control that opens nothing stays unrecorded.
    fireEvent.click(screen.getByText('Plain'), { detail: 0 });
    await settle();
    const recording = await finish(onFinish);
    expect(recording.steps.map((s) => s.tour.anchor)).toEqual([
      'sidebar.open-menu',
    ]);
  });

  it('re-records one step: finishes itself on the first captured click', async () => {
    const onFinish = vi.fn();
    render(
      <>
        <button data-tour="sidebar.boards">Boards</button>
        <TourRecorder
          single
          matcher={null}
          onFinish={onFinish}
          onDiscard={vi.fn()}
        />
      </>
    );
    await startRecording();
    expect(
      screen.getByText('Click what this step should show')
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finish' })).toBeNull();
    fireEvent.pointerDown(screen.getByText('Boards'), { button: 0 });
    await settle();
    expect(onFinish).toHaveBeenCalledTimes(1);
    const recording = onFinish.mock.calls[0][0] as TourRecording;
    expect(recording.frames).toEqual([REDACTED]);
    expect(recording.steps[0].tour.anchor).toBe('sidebar.boards');
    expect(stopTrack).toHaveBeenCalled();
  });

  describe('position', () => {
    const pillRect = (x: number, y: number) =>
      ({ x, y, left: x, top: y, width: 300, height: 40 }) as DOMRect;

    beforeEach(() => {
      localStorage.clear();
      vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1000);
      vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
    });

    const grip = () => screen.getByRole('button', { name: 'Move toolbar' });
    const pill = () => screen.getByTestId('tour-recorder');

    it('starts at the top centre, clear of the dock', () => {
      renderRecorder();
      expect(pill().className).toContain('left-1/2');
      expect(pill().className).not.toContain('bottom-4');
      expect(pill().style.top).toContain('1rem');
    });

    it('drags by the grip, clamps to the viewport and remembers the spot', () => {
      renderRecorder();
      vi.spyOn(pill(), 'getBoundingClientRect').mockReturnValue(
        pillRect(350, 16)
      );
      fireEvent.pointerDown(grip(), { button: 0, clientX: 360, clientY: 30 });
      fireEvent.pointerMove(grip(), { clientX: 2000, clientY: 500 });
      expect(pill().style.left).toBe('700px');
      expect(pill().style.top).toBe('486px');
      expect(localStorage.getItem(RECORDER_POS_KEY)).toBeNull();

      fireEvent.pointerUp(grip(), { clientX: -50, clientY: -50 });
      expect(pill().style.left).toBe('0px');
      expect(pill().style.top).toBe('0px');
      expect(JSON.parse(localStorage.getItem(RECORDER_POS_KEY) ?? '')).toEqual({
        x: 0,
        y: 0,
      });
    });

    it('opens where it was left and double-click puts it back', () => {
      localStorage.setItem(
        RECORDER_POS_KEY,
        JSON.stringify({ x: 120, y: 300 })
      );
      renderRecorder();
      expect(pill().style.left).toBe('120px');
      expect(pill().style.top).toBe('300px');
      expect(pill().className).not.toContain('left-1/2');

      fireEvent.doubleClick(grip());
      expect(pill().className).toContain('left-1/2');
      expect(localStorage.getItem(RECORDER_POS_KEY)).toBeNull();
    });

    it('moves with the arrow keys', () => {
      renderRecorder();
      vi.spyOn(pill(), 'getBoundingClientRect').mockReturnValue(
        pillRect(350, 16)
      );
      fireEvent.keyDown(grip(), { key: 'ArrowDown' });
      expect(pill().style.top).toBe('36px');
      expect(pill().style.left).toBe('350px');
    });

    it('ignores a corrupt saved position', () => {
      localStorage.setItem(RECORDER_POS_KEY, '{nope');
      renderRecorder();
      expect(pill().className).toContain('left-1/2');
    });

    it('never records a grip drag as a step', async () => {
      renderRecorder();
      await startRecording();
      fireEvent.pointerDown(grip(), { button: 0, clientX: 10, clientY: 10 });
      fireEvent.pointerUp(grip(), { clientX: 10, clientY: 10 });
      await settle();
      expect(h.grabFrame).not.toHaveBeenCalled();
      expect(screen.getByText('Recording · 0 steps')).toBeInTheDocument();
    });
  });
});
