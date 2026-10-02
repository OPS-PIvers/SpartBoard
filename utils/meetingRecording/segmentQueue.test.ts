import { describe, it, expect } from 'vitest';
import { memorySegmentQueue, parseQueuedSegment } from './segmentQueue';

describe('parseQueuedSegment', () => {
  it('keeps a well-formed segment', () => {
    const blob = new Blob(['a']);
    expect(
      parseQueuedSegment({ path: 'p/0/0.webm', blob, queuedAt: 5 })
    ).toEqual({ path: 'p/0/0.webm', blob, queuedAt: 5 });
  });

  it('drops records without a path or blob', () => {
    expect(parseQueuedSegment(null)).toBeNull();
    expect(parseQueuedSegment({ path: '', blob: new Blob(['a']) })).toBeNull();
    expect(parseQueuedSegment({ path: 'p', blob: 'not a blob' })).toBeNull();
  });
});

describe('memorySegmentQueue', () => {
  it('lists segments oldest first and removes by path', async () => {
    const q = memorySegmentQueue();
    await q.put({ path: 'b', blob: new Blob(['b']), queuedAt: 2 });
    await q.put({ path: 'a', blob: new Blob(['a']), queuedAt: 1 });
    expect((await q.list()).map((s) => s.path)).toEqual(['a', 'b']);
    await q.remove('a');
    expect((await q.list()).map((s) => s.path)).toEqual(['b']);
  });
});
