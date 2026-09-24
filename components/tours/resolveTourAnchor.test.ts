import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseTourAnchorRef, tourAnchorRef } from '@/config/tourAnchors';
import {
  accessibleName,
  findTourAnchor,
  isAnchorVisible,
  roleOf,
} from './resolveTourAnchor';
import {
  claimTourWidgets,
  missingSetupWidgets,
  tourStepsOf,
  tourWidgetIds,
} from './tourSession';
import type { GuidedLearningSet, WidgetType } from '@/types';

const mount = (html: string) => {
  document.body.innerHTML = html;
};

// jsdom has no layout: `data-zero` marks a zero-size box, `data-invisible` a hidden one.
beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: Element) {
      const size = this.hasAttribute('data-zero') ? 0 : 20;
      return new DOMRect(0, 0, size, size);
    }
  );
  Object.defineProperty(Element.prototype, 'checkVisibility', {
    configurable: true,
    value(this: Element) {
      return !this.closest('[data-invisible]');
    },
  });
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  delete (Element.prototype as Partial<Element>).checkVisibility;
});

describe('tour anchor refs', () => {
  it('round-trips per-type refs', () => {
    expect(tourAnchorRef('dock.item', 'dice')).toBe('dock.item:dice');
    expect(parseTourAnchorRef('dock.item:dice')).toEqual({
      id: 'dock.item',
      widgetType: 'dice',
    });
    expect(parseTourAnchorRef('sidebar.boards')).toEqual({
      id: 'sidebar.boards',
    });
  });
});

describe('findTourAnchor', () => {
  it('finds a tagged element', () => {
    mount('<button data-tour="sidebar.boards">Boards</button>');
    expect(findTourAnchor({ anchor: 'sidebar.boards' })?.textContent).toBe(
      'Boards'
    );
  });

  it('prefers the scoped widget and otherwise takes the first', () => {
    mount(`
      <button data-tour="widget.close" data-tour-widget="a">A</button>
      <button data-tour="widget.close" data-tour-widget="b">B</button>`);
    expect(
      findTourAnchor({ anchor: 'widget.close' }, { widgetIds: ['b'] })
        ?.textContent
    ).toBe('B');
    expect(findTourAnchor({ anchor: 'widget.close' })?.textContent).toBe('A');
    expect(
      findTourAnchor({ anchor: 'widget.close' }, { widgetIds: ['z'] })
        ?.textContent
    ).toBe('A');
  });

  it('matches a per-type ref on its widget type', () => {
    mount(`
      <button data-tour="dock.item" data-tour-widget-type="clock">Clock</button>
      <button data-tour="dock.item" data-tour-widget-type="dice">Dice</button>`);
    expect(findTourAnchor({ anchor: 'dock.item:dice' })?.textContent).toBe(
      'Dice'
    );
    expect(findTourAnchor({ anchor: 'dock.item:poll' })).toBeNull();
  });

  it('skips anything inside data-tour-ignore', () => {
    mount(`
      <div data-tour-ignore><button data-tour="sidebar.boards">Copy</button></div>
      <button data-tour="sidebar.boards">Real</button>`);
    expect(findTourAnchor({ anchor: 'sidebar.boards' })?.textContent).toBe(
      'Real'
    );
  });

  it('skips zero-size and hidden matches so they read as missing', () => {
    mount(`
      <button data-tour="sidebar.boards" data-zero>Collapsed</button>
      <div data-invisible><button data-tour="sidebar.boards">Hidden</button></div>`);
    expect(findTourAnchor({ anchor: 'sidebar.boards' })).toBeNull();
    mount(`
      <button data-tour="sidebar.boards" data-zero>Collapsed</button>
      <button data-tour="sidebar.boards">Shown</button>`);
    expect(findTourAnchor({ anchor: 'sidebar.boards' })?.textContent).toBe(
      'Shown'
    );
  });

  it('applies the same visibility rule to the role fallback', () => {
    mount(
      `<div data-invisible><button aria-label="Save board">x</button></div>`
    );
    expect(
      findTourAnchor({
        anchor: 'board-actions.missing',
        fallback: { role: 'button', name: 'save board' },
      })
    ).toBeNull();
  });

  it('treats a missing checkVisibility as visible', () => {
    delete (Element.prototype as Partial<Element>).checkVisibility;
    mount('<button id="b">B</button>');
    expect(isAnchorVisible(document.getElementById('b') as Element)).toBe(true);
  });

  it('falls back to role and accessible name', () => {
    mount(`
      <div data-tour-ignore><button aria-label="Save board">x</button></div>
      <a href="#">Save board</a>
      <button aria-label="  Save   Board ">y</button>`);
    const el = findTourAnchor({
      anchor: 'board-actions.missing',
      fallback: { role: 'button', name: 'save board' },
    });
    expect(el?.textContent).toBe('y');
    expect(findTourAnchor({ anchor: 'board-actions.missing' })).toBeNull();
  });
});

describe('roleOf and accessibleName', () => {
  it('reads implicit roles and names', () => {
    mount(`
      <input id="c" type="checkbox" title="Pin" />
      <input id="s" placeholder="Find a setting" />
      <span id="lbl">Close menu</span>
      <div id="d" role="tab button" aria-labelledby="lbl"></div>`);
    const c = document.getElementById('c') as Element;
    const s = document.getElementById('s') as Element;
    const d = document.getElementById('d') as Element;
    expect([roleOf(c), accessibleName(c)]).toEqual(['checkbox', 'pin']);
    expect([roleOf(s), accessibleName(s)]).toEqual([
      'textbox',
      'find a setting',
    ]);
    expect([roleOf(d), accessibleName(d)]).toEqual(['tab', 'close menu']);
  });
});

describe('tour session helpers', () => {
  const set = {
    steps: [
      { id: 'a' },
      { id: 'b', tour: { anchor: 'sidebar.boards', action: 'click' } },
    ],
    tourSetup: { widgets: ['dice', 'clock', 'dice'] },
  } as unknown as GuidedLearningSet;

  it('keeps only tour steps', () => {
    expect(tourStepsOf(set).map((s) => s.id)).toEqual(['b']);
  });

  it('lists each missing setup widget once', () => {
    expect(missingSetupWidgets(set, [{ type: 'clock' }])).toEqual(['dice']);
    expect(missingSetupWidgets({}, [])).toEqual([]);
  });

  it('claims only the widget the tour added, never a same-type one added later', () => {
    const before = new Set(['old']);
    const board = [
      { id: 'old', type: 'dice' as WidgetType },
      { id: 'tour', type: 'dice' as WidgetType },
      { id: 'other', type: 'poll' as WidgetType },
    ];
    const claims = claimTourWidgets(board, before, ['dice']);
    expect(claims).toEqual({ dice: 'tour' });
    const later = [...board, { id: 'teacher', type: 'dice' as WidgetType }];
    const again = claimTourWidgets(later, before, ['dice'], claims);
    expect(again).toBe(claims);
    expect(tourWidgetIds(later, again)).toEqual(['tour']);
  });

  it('does not reclaim a type after the tour widget is closed', () => {
    const before = new Set<string>();
    const claims = claimTourWidgets(
      [{ id: 'tour', type: 'dice' as WidgetType }],
      before,
      ['dice']
    );
    const replaced = [{ id: 'teacher', type: 'dice' as WidgetType }];
    const again = claimTourWidgets(replaced, before, ['dice'], claims);
    expect(tourWidgetIds(replaced, again)).toEqual([]);
  });
});
