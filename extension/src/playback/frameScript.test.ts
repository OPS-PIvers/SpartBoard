import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { installFrameSeeker, isFrameCommand, type FrameReport } from './frameScript';

const orig = Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect = function () {
  return this.isConnected && this.tagName === 'BUTTON' ? new DOMRect(10, 10, 50, 20) : new DOMRect();
};

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
  globalThis.__sbWebTourFrame = undefined;
});

const seek = { type: 'wt:seek' as const, token: 't1', clues: { role: 'button', name: 'Load more' }, action: 'click' as const };

afterAll(() => {
  Element.prototype.getBoundingClientRect = orig;
});

describe('frame seeker', () => {
  it('finds a control that appears later and shares it with the overlay', async () => {
    vi.useFakeTimers();
    const reports: FrameReport[] = [];
    const run = installFrameSeeker(document, (r) => reports.push(r));
    run(seek);
    expect(reports).toEqual([]);
    document.body.innerHTML = '<button>Load more</button>';
    await vi.advanceTimersByTimeAsync(300);
    expect(reports[0]).toMatchObject({ type: 'wt:found', token: 't1', clue: 'role' });
    expect(globalThis.__sbWebTourFrame?.target?.el.tagName).toBe('BUTTON');
  });

  it('reports a lost target and ignores clicks the page script fakes', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<button>Load more</button>';
    const reports: FrameReport[] = [];
    const run = installFrameSeeker(document, (r) => reports.push(r));
    run(seek);
    document.querySelector('button')!.click();
    expect(reports.some((r) => r.type === 'wt:acted')).toBe(false);
    document.body.innerHTML = '';
    await vi.advanceTimersByTimeAsync(300);
    expect(reports.at(-1)).toEqual({ type: 'wt:lost', token: 't1' });
  });

  it('stops watching on stop', async () => {
    vi.useFakeTimers();
    const reports: FrameReport[] = [];
    const run = installFrameSeeker(document, (r) => reports.push(r));
    run(seek);
    run({ type: 'wt:stop' });
    document.body.innerHTML = '<button>Load more</button>';
    await vi.advanceTimersByTimeAsync(300);
    expect(reports).toEqual([]);
  });

  it('validates commands', () => {
    expect(isFrameCommand(seek)).toBe(true);
    expect(isFrameCommand({ ...seek, action: 'submit' })).toBe(false);
    expect(isFrameCommand({ type: 'wt:seek', token: 1 })).toBe(false);
    expect(isFrameCommand(null)).toBe(false);
  });
});

