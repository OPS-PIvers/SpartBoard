import { describe, it, expect, vi } from 'vitest';
import { mockPointerEvent, mockCanvasGetContext } from './mocks';
import { clipboardWriteTextInitScript } from './e2eMocks';

describe('mockPointerEvent', () => {
  it('returns a constructor producing bubbling Event instances', () => {
    const Ctor = mockPointerEvent();
    const evt = new Ctor('pointerdown');
    expect(evt).toBeInstanceOf(Event);
    expect(evt.type).toBe('pointerdown');
    expect(evt.bubbles).toBe(true);
  });

  it('defaults pointer fields and honours overrides', () => {
    const Ctor = mockPointerEvent();
    const defaulted = new Ctor('pointermove');
    expect(defaulted.pointerId).toBe(1);
    expect(defaulted.pointerType).toBe('mouse');

    const overridden = new Ctor('pointermove', {
      pointerId: 7,
      pointerType: 'touch',
      clientX: 42,
      clientY: 99,
    });
    expect(overridden.pointerId).toBe(7);
    expect(overridden.pointerType).toBe('touch');
    expect(overridden.clientX).toBe(42);
    expect(overridden.clientY).toBe(99);
  });
});

describe('mockCanvasGetContext', () => {
  it('returns a 2D stub with the methods widgets paint with', () => {
    const getContext = mockCanvasGetContext();
    const ctx = getContext('2d');
    expect(ctx).not.toBeNull();
    // Spot-check the calls DrawingWidget's selection chrome makes. The stub is
    // a plain record of vi.fn()s, so read it through an index signature.
    const fields = ctx as unknown as Record<string, unknown>;
    for (const method of [
      'beginPath',
      'stroke',
      'setLineDash',
      'drawImage',
      'fillText',
    ] as const) {
      expect(typeof fields[method]).toBe('function');
    }
    expect(fields.globalAlpha).toBe(1);
  });

  it('returns null for non-2d context ids', () => {
    const getContext = mockCanvasGetContext();
    expect(getContext('webgl')).toBeNull();
  });
});

describe('clipboardWriteTextInitScript', () => {
  it('rewires navigator.clipboard.writeText to the exposed host binding', async () => {
    const writes: string[] = [];
    const win = window as unknown as {
      mockWriteText: (text: string) => Promise<void>;
    };
    win.mockWriteText = vi.fn((text: string) => {
      writes.push(text);
      return Promise.resolve();
    });

    // Ensure a clipboard object exists so the primary branch runs.
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.resolve() },
    });

    clipboardWriteTextInitScript();
    await navigator.clipboard.writeText('hello board');

    expect(writes).toEqual(['hello board']);
  });
});
