import { describe, it, expect } from 'vitest';
import {
  applyCommand,
  type DrawingCommand,
} from '@/components/widgets/DrawingWidget/commands';
import type { DrawableObject, RectObject } from '@/types';

const rect = (overrides: Partial<RectObject> = {}): RectObject => ({
  id: 'r1',
  kind: 'rect',
  z: 0,
  x: 0,
  y: 0,
  w: 10,
  h: 10,
  stroke: '#000',
  strokeWidth: 1,
  ...overrides,
});

describe('applyCommand', () => {
  describe('add', () => {
    it('forward appends the new object', () => {
      const a = rect({ id: 'a' });
      const b = rect({ id: 'b' });
      const next = applyCommand([a], { kind: 'add', object: b }, 'forward');
      expect(next).toEqual([a, b]);
    });

    it('forward replaces a duplicate-id entry (defensive against double-apply)', () => {
      const a = rect({ id: 'a', x: 10 });
      const aPrime = rect({ id: 'a', x: 20 });
      const next = applyCommand(
        [a],
        { kind: 'add', object: aPrime },
        'forward'
      );
      expect(next).toHaveLength(1);
      expect((next[0] as RectObject).x).toBe(20);
    });

    it('reverse removes the added object', () => {
      const a = rect({ id: 'a' });
      const b = rect({ id: 'b' });
      const next = applyCommand([a, b], { kind: 'add', object: b }, 'reverse');
      expect(next).toEqual([a]);
    });

    it('reverse on absent id is a no-op (defensive against double-undo)', () => {
      const a = rect({ id: 'a' });
      const next = applyCommand(
        [a],
        { kind: 'add', object: rect({ id: 'gone' }) },
        'reverse'
      );
      expect(next).toEqual([a]);
    });
  });

  describe('remove', () => {
    it('forward filters out the matching id', () => {
      const a = rect({ id: 'a' });
      const b = rect({ id: 'b' });
      const next = applyCommand(
        [a, b],
        { kind: 'remove', object: a },
        'forward'
      );
      expect(next).toEqual([b]);
    });

    it('reverse re-inserts the captured snapshot', () => {
      const a = rect({ id: 'a' });
      const b = rect({ id: 'b' });
      const next = applyCommand([b], { kind: 'remove', object: a }, 'reverse');
      expect(next).toEqual([b, a]);
    });
  });

  describe('update', () => {
    it('forward replaces the matching object with `after`', () => {
      const before = rect({ id: 'a', x: 10 });
      const after = rect({ id: 'a', x: 50 });
      const next = applyCommand(
        [before],
        { kind: 'update', before, after },
        'forward'
      );
      expect((next[0] as RectObject).x).toBe(50);
    });

    it('reverse restores `before`', () => {
      const before = rect({ id: 'a', x: 10 });
      const after = rect({ id: 'a', x: 50 });
      const next = applyCommand(
        [after],
        { kind: 'update', before, after },
        'reverse'
      );
      expect((next[0] as RectObject).x).toBe(10);
    });

    it('throws when before.id !== after.id (id-mismatch invariant)', () => {
      const before = rect({ id: 'a' });
      const after = rect({ id: 'b' });
      const objs: DrawableObject[] = [before];
      const cmd: DrawingCommand = { kind: 'update', before, after };
      expect(() => applyCommand(objs, cmd, 'forward')).toThrow(/id mismatch/);
      expect(() => applyCommand(objs, cmd, 'reverse')).toThrow(/id mismatch/);
    });
  });

  describe('reorder', () => {
    it('forward sets z to toZ', () => {
      const a = rect({ id: 'a', z: 0 });
      const next = applyCommand(
        [a],
        { kind: 'reorder', objectId: 'a', fromZ: 0, toZ: 5 },
        'forward'
      );
      expect(next[0].z).toBe(5);
    });

    it('reverse sets z back to fromZ', () => {
      const a = rect({ id: 'a', z: 5 });
      const next = applyCommand(
        [a],
        { kind: 'reorder', objectId: 'a', fromZ: 0, toZ: 5 },
        'reverse'
      );
      expect(next[0].z).toBe(0);
    });
  });

  describe('clear', () => {
    it('forward wipes the array', () => {
      const a = rect({ id: 'a' });
      const b = rect({ id: 'b' });
      const next = applyCommand(
        [a, b],
        { kind: 'clear', objects: [a, b] },
        'forward'
      );
      expect(next).toEqual([]);
    });

    it('reverse restores the captured snapshot', () => {
      const a = rect({ id: 'a' });
      const b = rect({ id: 'b' });
      const next = applyCommand(
        [],
        { kind: 'clear', objects: [a, b] },
        'reverse'
      );
      expect(next).toEqual([a, b]);
    });

    it('reverse returns a fresh array (caller cannot mutate stored snapshot)', () => {
      const a = rect({ id: 'a' });
      const stored = [a];
      const next = applyCommand(
        [],
        { kind: 'clear', objects: stored },
        'reverse'
      );
      expect(next).not.toBe(stored);
      expect(next).toEqual(stored);
    });
  });

  describe('exhaustiveness', () => {
    it('throws on an unknown kind (runtime guard for the never-typed default)', () => {
      // The static `never` assertion would catch a missing case at compile
      // time. This test locks in the RUNTIME guard: a future caller passing
      // a hand-crafted unknown command (e.g. from a deserialized state file
      // older than the current code) should fail loudly rather than silently
      // returning the unchanged objects. The `as unknown as DrawingCommand`
      // cast launders away the type narrowing so the runtime code path is
      // actually exercised.
      const bogus = {
        kind: 'someFutureKind',
        payload: 42,
      } as unknown as DrawingCommand;
      expect(() => applyCommand([], bogus, 'forward')).toThrow(
        /unhandled command kind/
      );
    });
  });
});
