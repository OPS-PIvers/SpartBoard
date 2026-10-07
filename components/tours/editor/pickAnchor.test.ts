import { describe, expect, it } from 'vitest';
import { applyAnchorPick, resolvePickTarget } from './pickAnchor';

const mount = (html: string) => {
  document.body.innerHTML = html;
  return document.body;
};

describe('resolvePickTarget', () => {
  it('finds the nearest registered anchor and its label', () => {
    mount(
      '<div data-tour="board.whole"><button data-tour="dock.open-tools" aria-label="Open tools"><svg id="icon"></svg></button></div>'
    );
    const hit = resolvePickTarget(document.getElementById('icon'));
    expect(hit?.pick).toEqual({
      anchor: 'dock.open-tools',
      fallback: { role: 'button', name: 'open tools' },
    });
    expect(hit?.label).toBe('Open Tools button in the collapsed dock');
  });

  it('skips unregistered tags and the whole board', () => {
    mount(
      '<div data-tour="board.whole"><div data-tour="not.registered"><span id="t">x</span></div></div>'
    );
    expect(resolvePickTarget(document.getElementById('t'))).toBeNull();
  });

  it('walks past an unregistered tag to a registered ancestor', () => {
    mount(
      '<div data-tour="dock.open-tools"><div data-tour="not.registered"><span id="t">x</span></div></div>'
    );
    expect(resolvePickTarget(document.getElementById('t'))?.pick.anchor).toBe(
      'dock.open-tools'
    );
  });

  it('ignores the picker and editor UI', () => {
    mount(
      '<div data-tour-ignore><button data-tour="dock.open-tools" id="t">x</button></div>'
    );
    expect(resolvePickTarget(document.getElementById('t'))).toBeNull();
  });

  it('records the widget type, field and slot of a widget-scoped anchor', () => {
    mount(
      '<div data-tour="widget.window" data-tour-widget="w-2" data-tour-widget-type="time-tool"><button id="t" data-tour="widget.settings-opener" data-tour-widget="w-2" data-tour-widget-type="time-tool">s</button></div>'
    );
    const hit = resolvePickTarget(document.getElementById('t'), {
      0: 'w-1',
      1: 'w-2',
    });
    expect(hit?.pick.anchor).toBe('widget.settings-opener:time-tool');
    expect(hit?.pick.slot).toBe(1);
  });

  it('leaves the slot off for a widget the tour did not add', () => {
    mount(
      '<button id="t" data-tour="widget.settings-opener" data-tour-widget="w-9" data-tour-widget-type="clock">s</button>'
    );
    const hit = resolvePickTarget(document.getElementById('t'), { 0: 'w-1' });
    expect(hit?.pick).not.toHaveProperty('slot');
  });

  it('builds a field ref', () => {
    mount(
      '<div data-tour-widget="w-1"><div id="t" data-tour="settings.field" data-tour-widget-type="clock" data-tour-field="format24">f</div></div>'
    );
    expect(resolvePickTarget(document.getElementById('t'))?.pick.anchor).toBe(
      'settings.field:clock#format24'
    );
  });
});

describe('applyAnchorPick', () => {
  it('keeps the action and value and clears the old binding details', () => {
    expect(
      applyAnchorPick(
        {
          anchor: '',
          action: 'toggle',
          value: true,
          slot: 3,
          unmapped: 'abc',
          fallback: { role: 'button', name: 'old' },
          teacherMustClick: true,
        },
        { anchor: 'dock.open-tools', slot: 1 }
      )
    ).toEqual({
      anchor: 'dock.open-tools',
      action: 'toggle',
      value: true,
      slot: 1,
      teacherMustClick: true,
    });
  });

  it('starts a new binding as a click', () => {
    expect(applyAnchorPick(undefined, { anchor: 'dock.open-tools' })).toEqual({
      anchor: 'dock.open-tools',
      action: 'click',
    });
  });

  it('makes a whole-board step an observe step', () => {
    expect(
      applyAnchorPick(
        { anchor: 'dock.open-tools', action: 'type', value: 'hi' },
        { anchor: 'board.whole' }
      )
    ).toEqual({ anchor: 'board.whole', action: 'observe' });
  });
});
