import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  act,
  render,
  screen,
  waitFor,
  fireEvent,
} from '@testing-library/react';
import { WebcamWidget } from './Widget';
import type { WebcamConfig, WidgetData } from '@/types';

const flags = vi.hoisted(() => ({ docCam: true }));
const updateWidget = vi.hoisted(() =>
  vi.fn<(id: string, patch: { config: WebcamConfig }) => void>()
);
const getUserMedia = vi.hoisted(() =>
  vi.fn<(c: MediaStreamConstraints) => Promise<unknown>>()
);
const lastSaved = () => updateWidget.mock.calls.at(-1)?.[1].config;

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    canAccessFeature: (id: string) =>
      id === 'document-camera-pro' && flags.docCam,
  }),
}));
vi.mock('@/context/dashboardCanvasStore', () => ({
  useDashboardActions: () => ({
    addWidget: vi.fn(),
    addToast: vi.fn(),
    updateWidget,
  }),
}));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showAlert: vi.fn(), showConfirm: vi.fn() }),
}));

const makeWidget = (config = {}) =>
  ({
    id: 'w1',
    type: 'webcam',
    x: 0,
    y: 0,
    w: 400,
    h: 300,
    z: 1,
    flipped: false,
    config,
  }) as unknown as WidgetData;

beforeEach(() => {
  flags.docCam = true;
  updateWidget.mockReset();
  getUserMedia.mockReset();
  getUserMedia.mockResolvedValue({
    getTracks: () => [{ stop: vi.fn() }],
    getVideoTracks: () => [{ getSettings: () => ({ deviceId: 'a' }) }],
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia,
      enumerateDevices: vi.fn().mockResolvedValue([]),
    },
  });
  globalThis.ResizeObserver ??= class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const video = (container: HTMLElement) =>
  container.querySelector('video') as HTMLVideoElement;

describe('WebcamWidget document camera view', () => {
  it('shows no view controls with the flag off', () => {
    flags.docCam = false;
    const { container } = render(<WebcamWidget widget={makeWidget()} />);
    expect(screen.queryByTitle('Zoom in')).toBeNull();
    expect(screen.queryByTitle('Rotate')).toBeNull();
    expect(video(container).style.transform).toBe('');
  });

  it('zooms in and saves the zoom level on the board', async () => {
    const { container } = render(<WebcamWidget widget={makeWidget()} />);
    const zoomIn = await screen.findByTitle('Zoom in');
    await waitFor(() => expect(zoomIn).not.toHaveProperty('disabled', true));
    fireEvent.click(zoomIn);
    expect(video(container).style.transform).toContain('scale(1.25)');
    expect(lastSaved()).toMatchObject({ zoomLevel: 1.25, rotation: 0 });
  });

  it('turns the picture a quarter turn per click', async () => {
    render(<WebcamWidget widget={makeWidget({ rotation: 270 })} />);
    const rotate = await screen.findByTitle('Rotate');
    await waitFor(() => expect(rotate).not.toHaveProperty('disabled', true));
    fireEvent.click(rotate);
    expect(lastSaved()).toMatchObject({ rotation: 0 });
  });

  it('restores the saved view and offers Reset view', () => {
    const { container } = render(
      <WebcamWidget widget={makeWidget({ zoomLevel: 2, rotation: 90 })} />
    );
    expect(video(container).style.transform).toContain('scale(2)');
    expect(video(container).style.transform).toContain('rotate(90deg)');
    fireEvent.click(screen.getByTitle('Reset view'));
    expect(lastSaved()).toMatchObject({ zoomLevel: 1, rotation: 0 });
  });
});

describe('WebcamWidget document camera gestures', () => {
  it('zooms with a plain wheel but leaves Ctrl+wheel to the board', () => {
    const { container } = render(<WebcamWidget widget={makeWidget()} />);
    const feed = container.querySelector('[data-inking-surface]') as Element;
    fireEvent.wheel(feed, { deltaY: -100, ctrlKey: true });
    expect(video(container).style.transform).toContain('scale(1)');
    fireEvent.wheel(feed, { deltaY: -100 });
    expect(video(container).style.transform).not.toContain('scale(1)');
  });
});

describe('WebcamWidget freeze', () => {
  it('holds the frame with a Frozen label and returns to live', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (cb: BlobCallback) => cb(new Blob(['x']))
    );
    const revoke = vi.fn();
    URL.createObjectURL = vi.fn(() => 'blob:frame');
    URL.revokeObjectURL = revoke;
    const { container } = render(<WebcamWidget widget={makeWidget()} />);
    Object.defineProperty(video(container), 'videoWidth', { value: 640 });
    Object.defineProperty(video(container), 'videoHeight', { value: 480 });
    const freeze = await screen.findByTitle('Freeze');
    await waitFor(() => expect(freeze).not.toHaveProperty('disabled', true));
    fireEvent.click(freeze);
    expect(screen.getByText('Frozen')).toBeTruthy();
    expect(screen.getByAltText('Frozen camera frame')).toBeTruthy();
    expect(video(container).className).toContain('invisible');
    fireEvent.click(screen.getByTitle('Unfreeze'));
    expect(screen.queryByText('Frozen')).toBeNull();
    expect(revoke).toHaveBeenCalledWith('blob:frame');
  });

  it('drops and frees the held frame when a phone photo takes over', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (cb: BlobCallback) => cb(new Blob(['x']))
    );
    const revoke = vi.fn();
    URL.createObjectURL = vi.fn(() => 'blob:frame');
    URL.revokeObjectURL = revoke;
    const { container, rerender } = render(
      <WebcamWidget widget={makeWidget()} />
    );
    Object.defineProperty(video(container), 'videoWidth', { value: 640 });
    Object.defineProperty(video(container), 'videoHeight', { value: 480 });
    const freeze = await screen.findByTitle('Freeze');
    await waitFor(() => expect(freeze).not.toHaveProperty('disabled', true));
    fireEvent.click(freeze);
    expect(screen.getByText('Frozen')).toBeTruthy();
    rerender(
      <WebcamWidget
        widget={makeWidget({
          isRemoteMode: true,
          remoteCaptureDataUrl: 'data:image/jpeg;base64,AAAA',
        })}
      />
    );
    expect(screen.queryByText('Frozen')).toBeNull();
    expect(revoke).toHaveBeenCalledWith('blob:frame');
  });

  it('has no Freeze button with the flag off', () => {
    flags.docCam = false;
    render(<WebcamWidget widget={makeWidget()} />);
    expect(screen.queryByTitle('Freeze')).toBeNull();
  });
});

describe('WebcamWidget drawing', () => {
  const stubFeedSize = () =>
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private cb: ResizeObserverCallback) {}
        observe() {
          this.cb(
            [
              {
                contentRect: { width: 400, height: 300 },
              } as ResizeObserverEntry,
            ],
            this as unknown as ResizeObserver
          );
        }
        disconnect() {
          return undefined;
        }
      }
    );
  const drawOn = (container: HTMLElement) => {
    Object.defineProperty(video(container), 'videoWidth', { value: 640 });
    Object.defineProperty(video(container), 'videoHeight', { value: 480 });
    fireEvent.loadedMetadata(video(container));
    const ink = container.querySelector('[data-doccam-ink]') as HTMLElement;
    return () => {
      fireEvent.pointerDown(ink, {
        button: 0,
        pointerId: 1,
        clientX: 5,
        clientY: 5,
      });
      fireEvent.pointerMove(ink, { pointerId: 1, clientX: 20, clientY: 20 });
      fireEvent.pointerUp(ink, { pointerId: 1, clientX: 20, clientY: 20 });
    };
  };
  const clearButton = () => screen.getByTitle('Clear drawing');

  it('shows drawing tools only in draw mode and keeps strokes off the board', () => {
    stubFeedSize();
    const { container } = render(<WebcamWidget widget={makeWidget()} />);
    const stroke = drawOn(container);
    expect(screen.queryByRole('toolbar', { name: 'Drawing tools' })).toBeNull();
    const ink = container.querySelector('[data-doccam-ink]') as HTMLElement;
    expect(ink.style.pointerEvents).toBe('none');
    fireEvent.click(screen.getByTitle('Draw'));
    expect(screen.getByRole('toolbar', { name: 'Drawing tools' })).toBeTruthy();
    expect(ink.style.pointerEvents).toBe('auto');
    const undo = screen.getByTitle('Undo');
    expect(undo).toHaveProperty('disabled', true);
    stroke();
    expect(undo).toHaveProperty('disabled', false);
    fireEvent.click(undo);
    expect(clearButton()).toHaveProperty('disabled', true);
    stroke();
    expect(clearButton()).toHaveProperty('disabled', false);
    fireEvent.click(clearButton());
    expect(clearButton()).toHaveProperty('disabled', true);
    expect(updateWidget).not.toHaveBeenCalled();
  });

  it('starts a fresh drawing when a phone photo replaces the picture', () => {
    stubFeedSize();
    const { container, rerender } = render(
      <WebcamWidget widget={makeWidget()} />
    );
    const stroke = drawOn(container);
    fireEvent.click(screen.getByTitle('Draw'));
    stroke();
    expect(clearButton()).toHaveProperty('disabled', false);
    rerender(
      <WebcamWidget
        widget={makeWidget({
          isRemoteMode: true,
          remoteCaptureDataUrl: 'data:image/jpeg;base64,AAAA',
        })}
      />
    );
    expect(clearButton()).toHaveProperty('disabled', true);
  });

  it('has no Draw button with the flag off', () => {
    flags.docCam = false;
    const { container } = render(<WebcamWidget widget={makeWidget()} />);
    expect(screen.queryByTitle('Draw')).toBeNull();
    expect(container.querySelector('[data-doccam-ink]')).toBeNull();
  });
});

describe('WebcamWidget compare', () => {
  it('picks a photo and the live camera and shows them side by side', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/png;base64,AAAA'
    );
    const { container } = render(<WebcamWidget widget={makeWidget()} />);
    Object.defineProperty(video(container), 'videoWidth', { value: 640 });
    Object.defineProperty(video(container), 'videoHeight', { value: 480 });
    const take = await screen.findByTitle('Take Photo');
    await waitFor(() => expect(take).not.toHaveProperty('disabled', true));
    fireEvent.click(take);
    fireEvent.click(screen.getByTitle('View Gallery'));
    fireEvent.click(screen.getByTitle('Compare'));
    expect(screen.getByText('Pick two to compare')).toBeTruthy();
    const show = screen.getByText('Show side by side');
    expect(show).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByLabelText('Live camera'));
    fireEvent.click(screen.getByLabelText('Photo 1'));
    expect(show).toHaveProperty('disabled', false);
    fireEvent.click(show);
    expect(screen.getByAltText('Photo 1')).toBeTruthy();
    expect(screen.queryByText('Pick two to compare')).toBeNull();
    fireEvent.click(screen.getByTitle('Exit compare'));
    expect(screen.queryByAltText('Photo 1')).toBeNull();
  });

  it('closes a live comparison for good when a phone photo takes over', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/png;base64,AAAA'
    );
    const { container, rerender } = render(
      <WebcamWidget widget={makeWidget()} />
    );
    Object.defineProperty(video(container), 'videoWidth', { value: 640 });
    Object.defineProperty(video(container), 'videoHeight', { value: 480 });
    const take = await screen.findByTitle('Take Photo');
    await waitFor(() => expect(take).not.toHaveProperty('disabled', true));
    fireEvent.click(take);
    fireEvent.click(screen.getByTitle('View Gallery'));
    fireEvent.click(screen.getByTitle('Compare'));
    fireEvent.click(screen.getByLabelText('Live camera'));
    fireEvent.click(screen.getByLabelText('Photo 1'));
    fireEvent.click(screen.getByText('Show side by side'));
    expect(screen.getByTitle('Exit compare')).toBeTruthy();
    rerender(
      <WebcamWidget
        widget={makeWidget({
          isRemoteMode: true,
          remoteCaptureDataUrl: 'data:image/jpeg;base64,AAAA',
        })}
      />
    );
    expect(screen.queryByTitle('Exit compare')).toBeNull();
    rerender(<WebcamWidget widget={makeWidget()} />);
    expect(screen.queryByTitle('Exit compare')).toBeNull();
  });

  it('has no Compare button with the flag off', async () => {
    flags.docCam = false;
    render(<WebcamWidget widget={makeWidget()} />);
    fireEvent.click(await screen.findByTitle('View Gallery'));
    expect(screen.queryByTitle('Compare')).toBeNull();
  });
});

describe('WebcamWidget camera quality', () => {
  const gum = () => getUserMedia;

  it('asks for the saved resolution only with the flag on', async () => {
    render(<WebcamWidget widget={makeWidget({ resolution: '1080p' })} />);
    await waitFor(() => expect(gum()).toHaveBeenCalled());
    expect(gum().mock.calls[0][0]).toMatchObject({
      video: { width: { ideal: 1920 } },
    });
  });

  it('ignores a saved resolution with the flag off', async () => {
    flags.docCam = false;
    render(<WebcamWidget widget={makeWidget({ resolution: '1080p' })} />);
    await waitFor(() => expect(gum()).toHaveBeenCalled());
    expect(gum().mock.calls[0][0]).toEqual({
      video: { facingMode: 'user' },
      audio: false,
    });
  });

  it('shows Camera disconnected when the camera is unplugged and reconnects on Retry', async () => {
    let ended: (() => void) | undefined;
    gum().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
      getVideoTracks: () => [
        {
          getSettings: () => ({}),
          addEventListener: (_: string, cb: () => void) => {
            ended = cb;
          },
        },
      ],
    });
    render(<WebcamWidget widget={makeWidget()} />);
    await waitFor(() => expect(ended).toBeDefined());
    act(() => ended?.());
    expect(screen.getByText('Camera disconnected')).toBeTruthy();
    fireEvent.click(screen.getByText('Retry Camera'));
    await waitFor(() => expect(gum()).toHaveBeenCalledTimes(2));
  });

  it('keeps waiting for an unplugged camera instead of falling back to another one', async () => {
    const ended: Record<string, () => void> = {};
    const streamOf = (deviceId: string) => ({
      getTracks: () => [{ stop: vi.fn() }],
      getVideoTracks: () => [
        {
          getSettings: () => ({ deviceId }),
          addEventListener: (_: string, cb: () => void) => {
            ended[deviceId] = cb;
          },
        },
      ],
    });
    gum()
      .mockResolvedValueOnce(streamOf('a'))
      .mockResolvedValueOnce(streamOf('b'))
      .mockRejectedValue(new DOMException('gone', 'OverconstrainedError'));
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia,
        enumerateDevices: vi.fn().mockResolvedValue([
          { kind: 'videoinput', deviceId: 'a' },
          { kind: 'videoinput', deviceId: 'b' },
        ]),
      },
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<WebcamWidget widget={makeWidget()} />);
    fireEvent.click(await screen.findByTitle('Switch Camera'));
    await waitFor(() => expect(ended.b).toBeDefined());
    act(() => ended.b());
    fireEvent.click(screen.getByText('Retry Camera'));
    await waitFor(() => expect(gum()).toHaveBeenCalledTimes(3));
    expect(gum().mock.calls[2][0]).toMatchObject({
      video: { deviceId: { exact: 'b' } },
    });
    expect(await screen.findByText('Camera disconnected')).toBeTruthy();
    expect(gum()).toHaveBeenCalledTimes(3);
  });

  it('shows the usual error, not Camera disconnected, when a camera is busy at start', async () => {
    gum().mockRejectedValue(new DOMException('busy', 'NotReadableError'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<WebcamWidget widget={makeWidget()} />);
    expect(await screen.findByText('Could not access webcam')).toBeTruthy();
    expect(screen.queryByText('Camera disconnected')).toBeNull();
  });

  it('closes the quality menu on Escape without the key reaching the window', async () => {
    const onKey = vi.fn();
    render(
      <div onKeyDown={onKey}>
        <WebcamWidget widget={makeWidget()} />
      </div>
    );
    const button = await screen.findByTitle('Camera quality');
    fireEvent.click(button);
    expect(screen.getByText('Best available')).toBeTruthy();
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(screen.queryByText('Best available')).toBeNull();
    expect(onKey).not.toHaveBeenCalled();
  });
});

describe('WebcamWidget flag change', () => {
  it('hands the running camera to the new video when the flag turns on', async () => {
    flags.docCam = false;
    const { container, rerender } = render(
      <WebcamWidget widget={makeWidget()} />
    );
    await waitFor(() => expect(video(container).srcObject).toBeTruthy());
    const stream = video(container).srcObject;
    flags.docCam = true;
    rerender(<WebcamWidget widget={makeWidget({ zoomLevel: 1 })} />);
    expect(container.querySelector('[data-inking-surface]')).toBeTruthy();
    expect(video(container).srcObject).toBe(stream);
  });
});
