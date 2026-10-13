import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tourAttr } from '@/config/tourAnchors';
import { healAnchor, remainingClicks } from './tourSelfHeal';

describe('tour self-heal', () => {
  it('starts from the deepest opener on screen', () => {
    const shown = new Set(['a', 'b']);
    expect(remainingClicks(['a', 'b', 'c'], (r) => shown.has(r))).toEqual([
      'b',
      'c',
    ]);
    expect(remainingClicks(['x', 'y'], () => false)).toBeNull();
  });

  describe('replaying a route', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.spyOn(
        HTMLElement.prototype,
        'getBoundingClientRect'
      ).mockImplementation(function (this: HTMLElement) {
        return new DOMRect(10, 10, this.hidden ? 0 : 40, this.hidden ? 0 : 40);
      });
      const menu = document.createElement('div');
      menu.hidden = true;
      const item = document.createElement('button');
      Object.entries(tourAttr('library.search')).forEach(([k, v]) =>
        item.setAttribute(k, String(v))
      );
      menu.append(item);
      const opener = document.createElement('button');
      Object.entries(tourAttr('sidebar.boards')).forEach(([k, v]) =>
        opener.setAttribute(k, String(v))
      );
      opener.addEventListener('click', () => {
        menu.hidden = false;
      });
      document.body.append(opener, menu);
    });
    afterEach(() => {
      document.body.innerHTML = '';
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('clicks the opener and resolves once the control shows', async () => {
      const done = healAnchor(
        'library.search',
        () => [{ path: ['sidebar.boards'] }],
        {},
        new AbortController().signal
      );
      await vi.advanceTimersByTimeAsync(1000);
      await expect(done).resolves.toBe(true);
    });

    it('never replays a click that changes or removes something', async () => {
      const click = vi.fn();
      document
        .querySelector('[data-tour="sidebar.boards"]')
        ?.addEventListener('click', click);
      const done = healAnchor(
        'library.search',
        () => [
          { path: ['widget.close'] },
          { path: ['sidebar.boards', 'assign-modal.confirm'] },
        ],
        {},
        new AbortController().signal
      );
      await vi.advanceTimersByTimeAsync(1000);
      await expect(done).resolves.toBe(false);
      expect(click).not.toHaveBeenCalled();
    });
  });
});
