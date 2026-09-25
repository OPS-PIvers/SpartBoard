import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isDockExpanded,
  prerequisiteWidgetId,
  satisfyPrerequisite,
  TOUR_DOCK_EVENT,
  type PrerequisiteContext,
} from './tourPrerequisites';

const ctxFor = (
  anchor: string,
  over: Partial<PrerequisiteContext> = {}
): PrerequisiteContext => ({
  binding: { anchor },
  scope: {},
  widgetId: 'w1',
  isMinimized: () => false,
  isSelected: () => false,
  select: vi.fn(),
  restore: vi.fn(),
  ...over,
});

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(10, 10, 40, 40)
  );
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('satisfyPrerequisite', () => {
  it('does nothing for an anchor with no prerequisite', () => {
    const ctx = ctxFor('sidebar.boards');
    expect(satisfyPrerequisite(ctx)).toBeNull();
    expect(ctx.select).not.toHaveBeenCalled();
  });

  it('opens a collapsed dock and closes it on undo only if it is still open', () => {
    const dock = document.createElement('div');
    dock.setAttribute('data-role', 'dock');
    dock.setAttribute('data-dock-expanded', 'false');
    document.body.appendChild(dock);
    const requests: boolean[] = [];
    const listen = (e: Event) => {
      const expanded = (e as CustomEvent<{ expanded: boolean }>).detail
        .expanded;
      requests.push(expanded);
      dock.setAttribute('data-dock-expanded', String(expanded));
    };
    window.addEventListener(TOUR_DOCK_EVENT, listen);
    const undo = satisfyPrerequisite(ctxFor('dock.item:dice'));
    expect(isDockExpanded()).toBe(true);
    expect(satisfyPrerequisite(ctxFor('dock.item:dice'))).toBeNull();
    undo?.undo();
    expect(requests).toEqual([true, false]);
    dock.setAttribute('data-dock-expanded', 'false');
    undo?.undo();
    expect(requests).toEqual([true, false]);
    window.removeEventListener(TOUR_DOCK_EVENT, listen);
  });

  it('selects the widget, restoring it first when minimized, and deselects on undo', () => {
    let selected: string | null = null;
    const ctx = ctxFor('widget.close:clock', {
      isMinimized: () => true,
      isSelected: (id) => selected === id,
      select: vi.fn((id: string | null) => {
        selected = id;
      }),
    });
    const undo = satisfyPrerequisite(ctx);
    expect(ctx.restore).toHaveBeenCalledWith('w1');
    expect(selected).toBe('w1');
    undo?.undo();
    expect(selected).toBeNull();
  });

  it('restores a minimized widget and leaves a shown one alone', () => {
    const minimized = ctxFor('widget.window:clock', {
      isMinimized: () => true,
    });
    satisfyPrerequisite(minimized);
    expect(minimized.restore).toHaveBeenCalledWith('w1');
    const shown = ctxFor('widget.window:clock');
    satisfyPrerequisite(shown);
    expect(shown.restore).not.toHaveBeenCalled();
  });

  it('scrolls an in-view anchor to the nearest edge', () => {
    const tile = document.createElement('button');
    tile.setAttribute('data-tour', 'library.item');
    tile.setAttribute('data-tour-widget-type', 'dice');
    const scroll = vi.fn();
    tile.scrollIntoView = scroll;
    document.body.appendChild(tile);
    satisfyPrerequisite(ctxFor('library.item:dice'));
    expect(scroll).toHaveBeenCalledWith({
      block: 'nearest',
      inline: 'nearest',
    });
  });
});

describe('prerequisiteWidgetId', () => {
  const widgets = [
    { id: 'a', type: 'clock' as const },
    { id: 'b', type: 'clock' as const },
    { id: 'c', type: 'dice' as const },
  ];

  it('uses the bound slot', () => {
    expect(
      prerequisiteWidgetId({ anchor: 'widget.close:clock', slot: 0 }, widgets, {
        slots: { 0: 'b' },
      })
    ).toBe('b');
  });

  it('prefers a tour widget of the type, then the first of the type', () => {
    expect(
      prerequisiteWidgetId({ anchor: 'widget.close:clock' }, widgets, {
        widgetIds: ['b'],
      })
    ).toBe('b');
    expect(
      prerequisiteWidgetId({ anchor: 'widget.close:dice' }, widgets, {})
    ).toBe('c');
    expect(
      prerequisiteWidgetId({ anchor: 'widget.close:timer' }, widgets, {})
    ).toBeNull();
  });

  it('points at no widget for board, dock and library anchors', () => {
    expect(
      prerequisiteWidgetId({ anchor: 'sidebar.boards' }, widgets, {})
    ).toBeNull();
    expect(
      prerequisiteWidgetId({ anchor: 'dock.item:clock' }, widgets, {})
    ).toBeNull();
  });
});
