import React, { createRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WhiteboardStartingPage } from '@/types';
import {
  WhiteboardCanvas,
  type WhiteboardCanvasHandle,
  type WhiteboardCaptureSink,
} from './WhiteboardCanvas';

const drawStartingPage = vi.fn();
vi.mock('@/utils/whiteboard/startingPage', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  drawStartingPage: (...args: unknown[]) => {
    drawStartingPage(...args);
  },
}));

const PAGE: WhiteboardStartingPage = { pattern: { kind: 'grid' } };

const ctxStub = () => {
  const target: Record<string | symbol, unknown> = {
    canvas: { width: 0, height: 0 },
  };
  return new Proxy(target, {
    get: (t, key): unknown => {
      if (!(key in t)) t[key] = vi.fn();
      return t[key];
    },
  });
};

const makeRecorder = () => ({
  push: vi.fn<WhiteboardCaptureSink['push']>(),
  undo: vi.fn<WhiteboardCaptureSink['undo']>(),
  redo: vi.fn<WhiteboardCaptureSink['redo']>(),
});

const ink = () => screen.getByTestId('whiteboard-ink');

// The ink canvas renders 800x600 on screen, so screen px = page px / 2.
const stroke = (points: [number, number][], pointerId = 1) => {
  const [first, ...rest] = points;
  fireEvent.pointerDown(ink(), {
    clientX: first[0],
    clientY: first[1],
    pointerId,
  });
  for (const [x, y] of rest)
    fireEvent.pointerMove(ink(), { clientX: x, clientY: y, pointerId });
  fireEvent.pointerUp(ink(), { pointerId });
};

describe('WhiteboardCanvas', () => {
  beforeEach(() => {
    drawStartingPage.mockClear();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => ctxStub() as unknown as CanvasRenderingContext2D
    );
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('paints the starting page on its own 3200x2400 layer', () => {
    const { container } = render(<WhiteboardCanvas startingPage={PAGE} />);
    expect(drawStartingPage).toHaveBeenCalledTimes(1);
    expect(drawStartingPage.mock.calls[0][1]).toBe(PAGE);
    const [background, inkLayer] = container.querySelectorAll('canvas');
    expect(inkLayer).toBe(ink());
    expect([background.width, background.height]).toEqual([3200, 2400]);
    expect([inkLayer.width, inkLayer.height]).toEqual([3200, 2400]);
  });

  it('records a pen stroke in page space with per-point times', () => {
    const recorder = makeRecorder();
    const handle = createRef<WhiteboardCanvasHandle>();
    render(
      <WhiteboardCanvas ref={handle} startingPage={PAGE} recorder={recorder} />
    );
    stroke([
      [10, 20],
      [100, 200],
    ]);
    expect(recorder.push).toHaveBeenCalledTimes(1);
    const [cmd, meta] = recorder.push.mock.calls[0];
    expect(cmd.kind).toBe('add');
    if (cmd.kind !== 'add' || cmd.object.kind !== 'path') throw new Error();
    expect(cmd.object.points).toEqual([
      { x: 20, y: 40 },
      { x: 200, y: 400 },
    ]);
    expect(meta?.pointTimes).toHaveLength(2);
    expect(handle.current?.flush()).toHaveLength(1);
  });

  it('logs undo and redo only when the stack moves', () => {
    const recorder = makeRecorder();
    render(<WhiteboardCanvas startingPage={PAGE} recorder={recorder} />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(recorder.undo).not.toHaveBeenCalled();

    stroke([
      [10, 10],
      [50, 50],
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(recorder.undo).toHaveBeenCalledTimes(1);
    act(() => {
      fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    });
    expect(recorder.redo).toHaveBeenCalledTimes(1);
    act(() => {
      fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    });
    expect(recorder.redo).toHaveBeenCalledTimes(1);
  });

  it('ignores drawing and disables the tools while disabled', () => {
    const recorder = makeRecorder();
    render(
      <WhiteboardCanvas startingPage={PAGE} recorder={recorder} disabled />
    );
    stroke([
      [10, 10],
      [50, 50],
    ]);
    expect(recorder.push).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Pen' })).toBeDisabled();
  });

  it('ignores a second pointer while one is drawing', () => {
    const recorder = makeRecorder();
    render(<WhiteboardCanvas startingPage={PAGE} recorder={recorder} />);
    fireEvent.pointerDown(ink(), { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerDown(ink(), { clientX: 300, clientY: 300, pointerId: 2 });
    fireEvent.pointerMove(ink(), { clientX: 400, clientY: 400, pointerId: 2 });
    fireEvent.pointerMove(ink(), { clientX: 60, clientY: 60, pointerId: 1 });
    fireEvent.pointerUp(ink(), { pointerId: 2 });
    fireEvent.pointerUp(ink(), { pointerId: 1 });
    expect(recorder.push).toHaveBeenCalledTimes(1);
    const [cmd] = recorder.push.mock.calls[0];
    if (cmd.kind !== 'add' || cmd.object.kind !== 'path') throw new Error();
    expect(cmd.object.points).toEqual([
      { x: 20, y: 20 },
      { x: 120, y: 120 },
    ]);
  });

  it("drops the first finger's stroke when a second finger starts a pinch", () => {
    const recorder = makeRecorder();
    render(<WhiteboardCanvas startingPage={PAGE} recorder={recorder} />);
    const touch = { pointerType: 'touch' };
    fireEvent.pointerDown(ink(), {
      ...touch,
      clientX: 10,
      clientY: 10,
      pointerId: 1,
      isPrimary: true,
    });
    fireEvent.pointerMove(ink(), {
      ...touch,
      clientX: 30,
      clientY: 30,
      pointerId: 1,
    });
    fireEvent.pointerDown(ink(), {
      ...touch,
      clientX: 300,
      clientY: 300,
      pointerId: 2,
      isPrimary: false,
    });
    fireEvent.pointerMove(ink(), {
      ...touch,
      clientX: 400,
      clientY: 400,
      pointerId: 2,
    });
    fireEvent.pointerUp(ink(), { ...touch, pointerId: 2 });
    fireEvent.pointerUp(ink(), { ...touch, pointerId: 1 });
    expect(recorder.push).not.toHaveBeenCalled();

    fireEvent.pointerDown(ink(), {
      ...touch,
      clientX: 10,
      clientY: 10,
      pointerId: 3,
      isPrimary: true,
    });
    fireEvent.pointerMove(ink(), {
      ...touch,
      clientX: 60,
      clientY: 60,
      pointerId: 3,
    });
    fireEvent.pointerUp(ink(), { ...touch, pointerId: 3 });
    expect(recorder.push).toHaveBeenCalledTimes(1);
  });

  it('zooms the page view without logging anything', () => {
    const recorder = makeRecorder();
    render(<WhiteboardCanvas startingPage={PAGE} recorder={recorder} />);
    const content = ink().parentElement as HTMLElement;
    expect(content.style.width).toBe('100cqw');
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(content.style.width).toBe('150cqw');
    expect(content.style.height).toBe('150cqh');
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(content.style.width).toBe('300cqw');
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Fit page' }));
    expect(content.style.width).toBe('100cqw');
    expect(recorder.push).not.toHaveBeenCalled();
  });

  it('keeps zoom available while drawing is off', () => {
    render(<WhiteboardCanvas startingPage={PAGE} disabled />);
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeEnabled();
  });

  it('object eraser removes touched ink but never an eraser stroke', () => {
    const recorder = makeRecorder();
    render(<WhiteboardCanvas startingPage={PAGE} recorder={recorder} />);
    stroke([
      [100, 100],
      [200, 100],
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Eraser' }));
    stroke([
      [100, 150],
      [200, 150],
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Object eraser' }));
    stroke([
      [150, 100],
      [150, 152],
    ]);
    const last = recorder.push.mock.calls.at(-1)?.[0];
    expect(last?.kind).toBe('bulkRemove');
    if (last?.kind !== 'bulkRemove') throw new Error();
    expect(last.objects).toHaveLength(1);
    expect(last.objects[0].kind === 'path' && last.objects[0].color).not.toBe(
      'eraser'
    );
  });

  it('hides colors for the eraser and sizes for the lasso', () => {
    render(<WhiteboardCanvas startingPage={PAGE} />);
    expect(screen.getByRole('button', { name: 'Black' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Eraser' }));
    expect(screen.queryByRole('button', { name: 'Black' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Thick' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lasso eraser' }));
    expect(screen.queryByRole('button', { name: 'Thick' })).toBeNull();
  });
});
