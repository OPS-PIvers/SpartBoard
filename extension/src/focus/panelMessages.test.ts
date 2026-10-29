import { describe, expect, it } from 'vitest';
import {
  minutesLeft,
  parseFocusPanelList,
  parseFocusPanelMessage,
  siteForTab,
} from './panelMessages';

const desmos = { host: 'desmos.com', path: '' };

describe('parseFocusPanelMessage', () => {
  it('passes the five actions through with only their own fields', () => {
    expect(
      parseFocusPanelMessage({
        type: 'focus/panel',
        body: { action: 'list', x: 1 },
      })
    ).toEqual({ type: 'focus/panel', body: { action: 'list' } });
    for (const action of ['extend', 'release', 'end'])
      expect(
        parseFocusPanelMessage({
          type: 'focus/panel',
          body: { action, sessionId: 's1', shareId: 'sub', studentUid: 'u' },
        })
      ).toEqual({ type: 'focus/panel', body: { action, sessionId: 's1' } });
    expect(
      parseFocusPanelMessage({
        type: 'focus/panel',
        body: {
          action: 'start',
          classId: 'c1',
          className: 'Period 3',
          minutes: 30,
          sites: [{ ...desmos, extra: true }],
          level: 'lock',
        },
      })
    ).toEqual({
      type: 'focus/panel',
      body: {
        action: 'start',
        classId: 'c1',
        className: 'Period 3',
        minutes: 30,
        sites: [desmos],
      },
    });
  });

  it('drops malformed requests', () => {
    const start = {
      action: 'start',
      classId: 'c1',
      className: 'P3',
      minutes: 30,
      sites: [desmos],
    };
    for (const body of [
      { ...start, classId: 'a/b' },
      { ...start, minutes: 0 },
      { ...start, minutes: 61 },
      { ...start, minutes: 1.5 },
      { ...start, sites: [] },
      { ...start, sites: [{ host: 'www.desmos.com', path: '' }] },
      { ...start, className: 'x'.repeat(101) },
      { action: 'end', sessionId: '' },
      { action: 'add-site', sessionId: 's1' },
    ])
      expect(parseFocusPanelMessage({ type: 'focus/panel', body })).toBeNull();
    expect(
      parseFocusPanelMessage({ type: 'tours/list', refresh: true })
    ).toBeNull();
    expect(parseFocusPanelMessage(null)).toBeNull();
  });
});

describe('parseFocusPanelList', () => {
  it('keeps well-formed rows only', () => {
    const session = {
      sessionId: 's1',
      classId: 'c1',
      className: 'P3',
      level: 'redirect',
      sites: [desmos],
      endsAt: 5,
      studentCount: 2,
    };
    expect(
      parseFocusPanelList({
        classes: [{ classId: 'c1', name: 'P3' }, { classId: 7 }],
        sessions: [session, { ...session, level: 'nope' }],
      })
    ).toEqual({
      canStart: false,
      classes: [{ classId: 'c1', name: 'P3' }],
      sessions: [session],
    });
    expect(parseFocusPanelList({ classes: [] })).toBeNull();
  });
});

describe('siteForTab', () => {
  it('suggests the whole site, or the one Google file', () => {
    expect(siteForTab('https://www.desmos.com/calculator/abc')).toEqual(desmos);
    expect(
      siteForTab('https://docs.google.com/document/d/abc/edit?tab=t.0')
    ).toEqual({ host: 'docs.google.com', path: '/document/d/abc' });
    expect(siteForTab('https://drive.google.com/file/d/xyz/view')).toEqual({
      host: 'drive.google.com',
      path: '/file/d/xyz',
    });
    expect(siteForTab('https://drive.google.com/drive/my-drive')).toEqual({
      host: 'drive.google.com',
      path: '',
    });
    expect(siteForTab('chrome://extensions')).toBeNull();
    expect(siteForTab(undefined)).toBeNull();
  });
});

describe('minutesLeft', () => {
  it('rounds up and never reads zero', () => {
    expect(minutesLeft(10 * 60_000 + 1, 0)).toBe('11 min left');
    expect(minutesLeft(30_000, 0)).toBe('1 min left');
    expect(minutesLeft(0, 5)).toBe('1 min left');
  });
});
