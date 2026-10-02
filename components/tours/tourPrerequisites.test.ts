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
  isSettingsOpen: () => false,
  setSettingsOpen: vi.fn(),
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
    expect(satisfyPrerequisite(ctx)).toEqual([]);
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
    const [undo] = satisfyPrerequisite(ctxFor('dock.item:dice'));
    expect(isDockExpanded()).toBe(true);
    expect(satisfyPrerequisite(ctxFor('dock.item:dice'))).toEqual([]);
    undo.undo();
    expect(requests).toEqual([true, false]);
    dock.setAttribute('data-dock-expanded', 'false');
    undo.undo();
    expect(requests).toEqual([true, false]);
    window.removeEventListener(TOUR_DOCK_EVENT, listen);
  });

  it('scrolls a dock item into view once the dock is open', () => {
    const dock = document.createElement('div');
    dock.setAttribute('data-role', 'dock');
    dock.setAttribute('data-dock-expanded', 'true');
    const item = document.createElement('button');
    item.setAttribute('data-tour', 'dock.item');
    item.setAttribute('data-tour-widget-type', 'dice');
    const scroll = vi.fn();
    item.scrollIntoView = scroll;
    dock.appendChild(item);
    document.body.appendChild(dock);
    expect(satisfyPrerequisite(ctxFor('dock.item:dice'))).toEqual([]);
    expect(scroll).toHaveBeenCalledWith({
      block: 'nearest',
      inline: 'nearest',
    });
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
    const [undo] = satisfyPrerequisite(ctx);
    expect(ctx.restore).toHaveBeenCalledWith('w1');
    expect(selected).toBe('w1');
    undo.undo();
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

describe('settings-open', () => {
  const drawerCtx = (
    anchor: string,
    over: Partial<PrerequisiteContext> = {}
  ) => {
    let selected: string | null = null;
    const open = new Set<string>();
    const ctx = ctxFor(anchor, {
      isSelected: (id) => selected === id,
      select: vi.fn((id: string | null) => {
        selected = id;
      }),
      isSettingsOpen: (id) => open.has(id),
      setSettingsOpen: vi.fn((id: string, next: boolean) => {
        if (next) open.add(id);
        else open.delete(id);
      }),
      ...over,
    });
    return { ctx, open, selected: () => selected };
  };

  const addTabs = (widgetId: string, active: 'settings' | 'style') => {
    const tabs = (['settings', 'style'] as const).map((tab) => {
      const el = document.createElement('button');
      el.setAttribute('role', 'tab');
      el.setAttribute('data-tour', `settings.tab-${tab}`);
      el.setAttribute('data-tour-widget', widgetId);
      el.setAttribute('aria-selected', String(tab === active));
      el.addEventListener('click', () => {
        tabs.forEach((t) => t.setAttribute('aria-selected', String(t === el)));
      });
      document.body.appendChild(el);
      return el;
    });
    return tabs;
  };

  it('selects the widget and opens its drawer, closing both on undo', () => {
    const { ctx, open, selected } = drawerCtx('settings.field:clock#format24');
    const undos = satisfyPrerequisite(ctx);
    expect(selected()).toBe('w1');
    expect(open.has('w1')).toBe(true);
    expect(undos.map((u) => u.key)).toEqual(['select:w1', 'settings:w1']);
    // Running again while the drawer is open adds nothing to undo.
    expect(satisfyPrerequisite(ctx)).toEqual([]);
    undos.forEach((u) => u.undo());
    expect(open.has('w1')).toBe(false);
    expect(selected()).toBeNull();
  });

  it('leaves a drawer the teacher opened, and one the teacher closed', () => {
    const { ctx, open } = drawerCtx('settings.root:clock');
    open.add('w1');
    expect(satisfyPrerequisite(ctx).map((u) => u.key)).toEqual(['select:w1']);
    open.delete('w1');
    const second = drawerCtx('settings.root:clock');
    const undo = satisfyPrerequisite(second.ctx).find(
      (u) => u.key === 'settings:w1'
    );
    second.open.delete('w1');
    undo?.undo();
    expect(second.ctx.setSettingsOpen).toHaveBeenCalledTimes(1);
  });

  it("switches to the tab that renders the step's field", () => {
    const [settingsTab, styleTab] = addTabs('w1', 'settings');
    const fieldTab = vi.fn(() => 'style' as const);
    const { ctx, open } = drawerCtx('settings.field:clock#fontFamily', {
      fieldTab,
    });
    open.add('w1');
    satisfyPrerequisite(ctx);
    expect(fieldTab).toHaveBeenCalledWith('clock', 'fontFamily');
    expect(styleTab.getAttribute('aria-selected')).toBe('true');
    expect(settingsTab.getAttribute('aria-selected')).toBe('false');
  });

  it('waits for the schema, and stays put once the field is showing', () => {
    const [, styleTab] = addTabs('w1', 'settings');
    const { ctx, open } = drawerCtx('settings.field:clock#fontFamily', {
      fieldTab: () => undefined,
    });
    open.add('w1');
    satisfyPrerequisite(ctx);
    expect(styleTab.getAttribute('aria-selected')).toBe('false');
    const row = document.createElement('div');
    row.setAttribute('data-tour', 'settings.field');
    row.setAttribute('data-tour-widget-type', 'clock');
    row.setAttribute('data-tour-field', 'fontFamily');
    document.body.appendChild(row);
    const shown = drawerCtx('settings.field:clock#fontFamily', {
      fieldTab: () => 'style',
    });
    shown.open.add('w1');
    satisfyPrerequisite(shown.ctx);
    expect(styleTab.getAttribute('aria-selected')).toBe('false');
  });

  it('switches the legacy panel by its pressed tab buttons', () => {
    const style = document.createElement('button');
    style.setAttribute('data-tour', 'settings.tab-style');
    style.setAttribute('data-tour-widget', 'w1');
    style.setAttribute('aria-pressed', 'false');
    const click = vi.fn();
    style.addEventListener('click', click);
    document.body.appendChild(style);
    const { ctx, open } = drawerCtx('settings.toggle:clock#showSeconds', {
      fieldTab: () => 'style',
    });
    open.add('w1');
    satisfyPrerequisite(ctx);
    expect(click).toHaveBeenCalledTimes(1);
    style.setAttribute('aria-pressed', 'true');
    satisfyPrerequisite(ctx);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a widget on the board', () => {
    const { ctx } = drawerCtx('settings.root:clock', { widgetId: null });
    expect(satisfyPrerequisite(ctx)).toEqual([]);
    expect(ctx.setSettingsOpen).not.toHaveBeenCalled();
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

  it('points a settings field at a widget of its type', () => {
    expect(
      prerequisiteWidgetId({ anchor: 'settings.field:dice#count' }, widgets, {})
    ).toBe('c');
    expect(
      prerequisiteWidgetId(
        { anchor: 'settings.toggle:clock#showSeconds' },
        widgets,
        { widgetIds: ['b'] }
      )
    ).toBe('b');
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
