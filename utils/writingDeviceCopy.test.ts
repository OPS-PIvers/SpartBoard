import { describe, expect, it } from 'vitest';
import {
  clearDeviceCopy,
  copyLogFits,
  decideDeviceCopy,
  deviceCopyKey,
  readDeviceCopy,
  writeDeviceCopy,
  type WritingDeviceCopy,
} from './writingDeviceCopy';
import { emptyWritingSummary } from './writingRecorder';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  full = false;
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  setItem(k: string, v: string) {
    if (this.full) throw new DOMException('full', 'QuotaExceededError');
    this.map.set(k, v);
  }
}

const copy = (over: Partial<WritingDeviceCopy> = {}): WritingDeviceCopy => ({
  v: 1,
  tabId: 'tabA',
  html: '<p>offline words</p>',
  summary: emptyWritingSummary(1),
  logChunk: 0,
  log: '0:offline words',
  logStartText: '',
  savedAt: 5,
  ...over,
});

describe('device copy storage', () => {
  it('is keyed by the signed-in student and the response', () => {
    const storage = new MemoryStorage();
    writeDeviceCopy(storage, 'stu1', 's1', copy());
    expect(readDeviceCopy(storage, 'stu1', 's1')?.html).toBe(
      '<p>offline words</p>'
    );
    expect(readDeviceCopy(storage, 'stu2', 's1')).toBeNull();
    expect(readDeviceCopy(storage, 'stu1', 's2')).toBeNull();
    expect(deviceCopyKey('stu1', 's1')).toContain('stu1');
  });

  it('reads nothing from a damaged entry or blocked storage', () => {
    const storage = new MemoryStorage();
    storage.setItem(deviceCopyKey('stu1', 's1'), '{"v":1,"html":3}');
    expect(readDeviceCopy(storage, 'stu1', 's1')).toBeNull();
    expect(readDeviceCopy(null, 'stu1', 's1')).toBeNull();
  });

  it('reports a full storage instead of throwing', () => {
    const storage = new MemoryStorage();
    storage.full = true;
    expect(writeDeviceCopy(storage, 'stu1', 's1', copy())).toBe(false);
  });

  it('clears only the one copy', () => {
    const storage = new MemoryStorage();
    writeDeviceCopy(storage, 'stu1', 's1', copy());
    writeDeviceCopy(storage, 'stu1', 's2', copy());
    clearDeviceCopy(storage, 'stu1', 's1');
    expect(readDeviceCopy(storage, 'stu1', 's1')).toBeNull();
    expect(readDeviceCopy(storage, 'stu1', 's2')).not.toBeNull();
  });
});

describe('decideDeviceCopy (D24)', () => {
  const server = { tabId: 'tabA', status: 'draft' as const, html: '<p>old</p>' };

  it('sends the copy while its tab still holds the unlocked piece', () => {
    expect(decideDeviceCopy(copy(), server)).toBe('send');
  });

  it('never sends over a piece another tab took over', () => {
    expect(decideDeviceCopy(copy(), { ...server, tabId: 'tabB' })).toBe(
      'unsent'
    );
  });

  it('never sends over locked work', () => {
    expect(decideDeviceCopy(copy(), { ...server, status: 'turned-in' })).toBe(
      'unsent'
    );
    expect(decideDeviceCopy(copy(), { ...server, status: 'returned' })).toBe(
      'unsent'
    );
  });

  it('clears a copy the server already has, wherever the piece is now', () => {
    const same = { ...server, html: '<p>offline   words</p>' };
    expect(decideDeviceCopy(copy(), { ...same, tabId: 'tabB' })).toBe('landed');
    expect(decideDeviceCopy(copy(), { ...same, status: 'turned-in' })).toBe(
      'landed'
    );
    expect(decideDeviceCopy(copy(), same)).toBe('send');
  });

  it('has nothing to decide without a copy', () => {
    expect(decideDeviceCopy(null, server)).toBe('none');
  });

  it('sends the log only into the chunk it was written for', () => {
    expect(copyLogFits(copy({ logChunk: 1 }), 1)).toBe(true);
    expect(copyLogFits(copy({ logChunk: 1 }), 2)).toBe(false);
  });
});
