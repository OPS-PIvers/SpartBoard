import { afterEach, describe, expect, it } from 'vitest';
import { parseTourAnchorRef, tourAnchorRef } from '@/config/tourAnchors';
import { accessibleName, findTourAnchor, roleOf } from './resolveTourAnchor';
import {
  addedWidgetIds,
  missingSetupWidgets,
  tourStepsOf,
} from './tourSession';
import type { GuidedLearningSet, WidgetType } from '@/types';

const mount = (html: string) => {
  document.body.innerHTML = html;
};

afterEach(() => {
  document.body.innerHTML = '';
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

  it('finds only new widgets of added types', () => {
    const widgets = [
      { id: 'old', type: 'dice' as WidgetType },
      { id: 'new', type: 'dice' as WidgetType },
      { id: 'other', type: 'poll' as WidgetType },
    ];
    expect(addedWidgetIds(widgets, new Set(['old']), ['dice'])).toEqual([
      'new',
    ]);
  });
});
