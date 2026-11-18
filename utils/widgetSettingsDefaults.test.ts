import { describe, expect, it } from 'vitest';
import {
  cleanSavedSettingsDefault,
  computeSettingsDefaults,
  pickSettingsDefault,
  settingsDefaultKeys,
} from './widgetSettingsDefaults';

describe('settingsDefaultKeys', () => {
  it('drops appearance keys, notices and live data', () => {
    expect(
      settingsDefaultKeys('poll', [
        'questions',
        'activePollSessionId',
        'fontColor',
        'managedNotice',
        'questions',
      ])
    ).toEqual(['questions']);
  });
});

describe('pickSettingsDefault', () => {
  it('turns legacy schedule items into a clean saved schedule', () => {
    expect(
      pickSettingsDefault('schedule', ['schedules', 'autoScroll'], {
        items: [
          { id: 'a', task: 'Literacy', startTime: '09:40', done: true },
          { id: 'b', task: 'Assembly', oneOffDate: '2026-11-18' },
        ],
        autoScroll: true,
        warningsFired: { a: '2026-11-18' },
      })
    ).toEqual({
      autoScroll: true,
      items: [],
      schedules: [
        {
          id: 'saved-default',
          name: 'Default Schedule',
          days: [],
          items: [{ id: 'a', task: 'Literacy', startTime: '09:40' }],
        },
      ],
    });
  });

  it('clears check marks and scores', () => {
    expect(
      pickSettingsDefault('checklist', ['items'], {
        items: [{ id: '1', text: 'Read', completed: true }],
      })
    ).toEqual({ items: [{ id: '1', text: 'Read', completed: false }] });
    expect(
      pickSettingsDefault('scoreboard', ['teams'], {
        teams: [{ id: 't', name: 'Red', score: 7, linkedGroupId: 'g' }],
      })
    ).toEqual({ teams: [{ id: 't', name: 'Red', score: 0 }] });
  });
});

describe('cleanSavedSettingsDefault', () => {
  it('strips keys excluded after saving and empty results', () => {
    expect(
      cleanSavedSettingsDefault('weather', { temp: 70, showFeelsLike: true })
    ).toEqual({ showFeelsLike: true });
    expect(cleanSavedSettingsDefault('weather', { temp: 70 })).toBeUndefined();
    expect(cleanSavedSettingsDefault('weather', undefined)).toBeUndefined();
  });
});

describe('computeSettingsDefaults', () => {
  it('compares against defaults, building config and my default in order', () => {
    const state = computeSettingsDefaults(
      'music',
      ['stationId'],
      { stationId: 'jazz' },
      { stationId: '' },
      { stationId: 'school' },
      { stationId: 'jazz' }
    );
    expect(state.differs).toBe(false);
    expect(state.resetPatch).toEqual({ stationId: 'jazz' });
  });
});
