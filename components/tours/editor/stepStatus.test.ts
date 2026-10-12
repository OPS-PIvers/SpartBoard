import { describe, expect, it } from 'vitest';
import { panelSide, PANEL_WIDTH } from './panelPlacement';
import { tourControlLabel, tourStepStatus, withAction } from './stepStatus';

describe('tourStepStatus', () => {
  it('reads each kind of step', () => {
    expect(tourStepStatus({ id: 'a' }, [])).toBe('board');
    expect(
      tourStepStatus(
        { id: 'a', tour: { anchor: 'board.whole', action: 'observe' } },
        []
      )
    ).toBe('board');
    expect(
      tourStepStatus({ id: 'a', tour: { anchor: '', action: 'click' } }, [])
    ).toBe('unbound');
    expect(
      tourStepStatus(
        {
          id: 'a',
          tour: {
            anchor: '',
            action: 'click',
            fallback: { role: 'menuitem', name: 'open guides' },
          },
        },
        []
      )
    ).toBe('ok');
    expect(
      tourStepStatus(
        { id: 'a', tour: { anchor: 'gone.button', action: 'click' } },
        []
      )
    ).toBe('unregistered');
    const bound = {
      id: 'a',
      tour: { anchor: 'sidebar.boards', action: 'click' as const },
    };
    expect(tourStepStatus(bound, [])).toBe('ok');
    expect(tourStepStatus(bound, ['a'])).toBe('missing');
  });

  it('labels a per-widget control with its widget', () => {
    expect(tourControlLabel({ anchor: 'dock.item:dice' })).toBe(
      'Widget button in the dock: Dice'
    );
    expect(tourControlLabel({ anchor: 'nope' })).toBeNull();
    expect(
      tourControlLabel({
        anchor: '',
        fallback: { role: 'button', name: 'stroke eraser' },
      })
    ).toBe('"stroke eraser"');
  });

  it('keeps a value only where the new kind uses it', () => {
    const toggle = withAction(
      { anchor: 'x', action: 'type', value: 'Hi' },
      'toggle'
    );
    expect(toggle.value).toBe(true);
    expect(withAction(toggle, 'click').value).toBeUndefined();
  });
});

describe('panelSide', () => {
  const vw = 1280;
  it('stays on its side unless the control is under it', () => {
    expect(panelSide('right', null, vw, PANEL_WIDTH)).toBe('right');
    expect(
      panelSide('right', { x: 100, y: 0, w: 40, h: 40 }, vw, PANEL_WIDTH)
    ).toBe('right');
    expect(
      panelSide('right', { x: 1100, y: 0, w: 40, h: 40 }, vw, PANEL_WIDTH)
    ).toBe('left');
    expect(
      panelSide('left', { x: 20, y: 0, w: 40, h: 40 }, vw, PANEL_WIDTH)
    ).toBe('right');
  });
});
