import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { ScreenCaptureModal } from '@/components/widgets/GuidedLearning/components/ScreenCaptureModal';

afterEach(cleanup);

describe('ScreenCaptureModal — portal root attribute', () => {
  it('has data-widget-portal="" on its portal root so isEscapeFromWidgetInput recognises it as a protected zone', () => {
    render(
      <ScreenCaptureModal
        mode="snap"
        onAddMedia={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />
    );
    // The portal div must carry data-widget-portal so that other components'
    // isEscapeFromWidgetInput guards bail when focus is inside this modal.
    expect(document.querySelector('[data-widget-portal]')).not.toBeNull();
  });

  it('calls onClose when Escape is fired from inside the portal root (no self-suppression)', () => {
    const onClose = vi.fn();
    render(
      <ScreenCaptureModal
        mode="snap"
        onAddMedia={vi.fn().mockResolvedValue(undefined)}
        onClose={onClose}
      />
    );

    // The modal root has data-widget-portal="". The old handler called
    // isEscapeFromWidgetInput which returned true for any element inside the
    // portal, silently blocking onClose — the self-suppression bug.
    const portalRoot = document.querySelector('[data-widget-portal]');
    if (!portalRoot) throw new Error('portal root not found');
    const innerEl = portalRoot.querySelector('button') ?? portalRoot;
    innerEl.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      })
    );

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('ScreenCaptureModal — capture-phase Escape guard', () => {
  it('does not call onClose when Escape is pressed from a text input inside data-draggable-window', () => {
    const onClose = vi.fn();
    render(
      <ScreenCaptureModal
        mode="snap"
        onAddMedia={vi.fn().mockResolvedValue(undefined)}
        onClose={onClose}
      />
    );

    // Simulate a widget text input that has focus on the dashboard behind the modal.
    const widgetWindow = document.createElement('div');
    widgetWindow.setAttribute('data-draggable-window', '');
    const input = document.createElement('input');
    widgetWindow.appendChild(input);
    document.body.appendChild(widgetWindow);

    // The capture-phase handler must yield to DraggableWindow's own Escape
    // handling (blur the input) and NOT close the modal.
    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      })
    );

    expect(onClose).not.toHaveBeenCalled();
    widgetWindow.remove();
  });

  it('does not call onClose when Escape is pressed from a portaled input with data-widget-portal=""', () => {
    // DraggableWindow's title-edit input is portaled to document.body and has
    // data-widget-portal="" directly on the <input> element — it is NOT inside
    // [data-draggable-window] in the DOM. The guard must recognise it as a
    // foreign portal and yield, rather than closing the modal.
    const onClose = vi.fn();
    render(
      <ScreenCaptureModal
        mode="snap"
        onAddMedia={vi.fn().mockResolvedValue(undefined)}
        onClose={onClose}
      />
    );

    const portaledInput = document.createElement('input');
    portaledInput.setAttribute('data-widget-portal', '');
    document.body.appendChild(portaledInput);

    portaledInput.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
      })
    );

    expect(onClose).not.toHaveBeenCalled();
    portaledInput.remove();
  });
});

describe('ScreenCaptureModal — unmount cleanup', () => {
  it('nulls onstop before stop() so onAddMedia is never called after unmount', async () => {
    // Track the onstop handler via getter/setter so we can capture it before
    // unmount nulls it, then verify the old handler is a no-op.
    let storedOnStop: (() => void) | null | undefined;

    class MockMediaRecorder {
      state: 'inactive' | 'recording' | 'paused' = 'inactive';
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      get onstop() {
        return storedOnStop;
      }
      set onstop(fn: (() => void) | null | undefined) {
        storedOnStop = fn;
      }
      start() {
        this.state = 'recording';
      }
      stop() {
        this.state = 'inactive';
      }
      static isTypeSupported() {
        return true;
      }
    }

    const mockTrack = { stop: vi.fn(), onended: null as (() => void) | null };
    const mockStream = {
      getVideoTracks: () => [mockTrack],
      getAudioTracks: () => [],
      getTracks: () => [mockTrack],
    };

    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getDisplayMedia: vi.fn().mockResolvedValue(mockStream) },
      writable: true,
      configurable: true,
    });
    global.MediaRecorder = MockMediaRecorder as unknown as typeof MediaRecorder;

    const onAddMedia = vi.fn().mockResolvedValue(undefined);
    const { getByText, unmount } = render(
      <ScreenCaptureModal
        mode="record"
        onAddMedia={onAddMedia}
        onClose={vi.fn()}
      />
    );

    // Click "Share your screen" — sets streamRef.current via getDisplayMedia.
    await act(async () => {
      fireEvent.click(getByText('Share your screen'));
      await Promise.resolve(); // flush getDisplayMedia microtask
    });

    // "Start recording" button is now visible (sharing && mode=record && !recording).
    fireEvent.click(getByText('Start recording'));

    // onstop is now set to the recording-complete handler.
    const onstopBeforeUnmount = storedOnStop;
    expect(onstopBeforeUnmount).toBeTypeOf('function');

    // Unmount — the fix: cleanup nulls onstop before calling stop().
    unmount();

    // storedOnStop must be null now (cleanup nulled it).
    expect(storedOnStop).toBeNull();

    // Firing the captured handler (as if it arrived after unmount) must not
    // call onAddMedia — the whole point of nulling onstop first.
    await act(async () => {
      onstopBeforeUnmount?.();
      await Promise.resolve(); // ensure any async side-effects settle
    });

    expect(onAddMedia).not.toHaveBeenCalled();
  });
});
