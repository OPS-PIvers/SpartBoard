import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { WebcamWidget } from './Widget';
import type { WebcamConfig, WidgetData } from '@/types';

const flags = vi.hoisted(() => ({ docCam: true }));
const updateWidget = vi.hoisted(() =>
  vi.fn<(id: string, patch: { config: WebcamConfig }) => void>()
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
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }],
        getVideoTracks: () => [{ getSettings: () => ({ deviceId: 'a' }) }],
      }),
      enumerateDevices: vi.fn().mockResolvedValue([]),
    },
  });
  globalThis.ResizeObserver ??= class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  } as unknown as typeof ResizeObserver;
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
