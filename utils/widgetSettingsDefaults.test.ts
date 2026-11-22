import { describe, expect, it } from 'vitest';
import {
  addCarriesContent,
  cleanSavedSettingsDefault,
  settingsDefaultBudget,
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

describe('student data and live state', () => {
  it('never saves student names or class-group links', () => {
    expect(
      settingsDefaultKeys('random', [
        'firstNames',
        'lastNames',
        'rosterPoolGroupId',
        'lockedRosterGroupIds',
        'groupSize',
      ])
    ).toEqual(['groupSize']);
    expect(
      settingsDefaultKeys('seating-chart', ['names', 'furniture'])
    ).toEqual(['furniture']);
    expect(
      cleanSavedSettingsDefault('checklist', { firstNames: 'Ana', mode: 'x' })
    ).toEqual({ mode: 'x' });
  });

  it('strips student ids from scoreboard teams', () => {
    expect(
      pickSettingsDefault('scoreboard', ['teams'], {
        teams: [
          {
            id: 't',
            name: 'Red',
            score: 3,
            linkedRosterGroupId: 'g',
            memberStudentIds: ['s1'],
          },
        ],
      })
    ).toEqual({ teams: [{ id: 't', name: 'Red', score: 0 }] });
  });

  it('resets votes, flipped cards, ticked tiles and attached widgets', () => {
    expect(
      pickSettingsDefault('poll', ['questions'], {
        questions: [{ id: 'q', options: [{ id: 'o', label: 'A', votes: 4 }] }],
      })
    ).toEqual({
      questions: [{ id: 'q', options: [{ id: 'o', label: 'A', votes: 0 }] }],
    });
    expect(
      pickSettingsDefault('reveal-grid', ['cards'], {
        cards: [{ id: 'c', isRevealed: true }],
      })
    ).toEqual({ cards: [{ id: 'c', isRevealed: false }] });
    expect(
      pickSettingsDefault('need-do-put-then', ['needItems', 'doItems'], {
        needItems: [{ id: 'n', checked: true }],
        doItems: ['Read'],
      })
    ).toEqual({ needItems: [{ id: 'n', checked: false }], doItems: ['Read'] });
    expect(
      pickSettingsDefault('instructionalRoutines', ['customSteps'], {
        customSteps: [
          { id: 's', text: 'Go', attachedWidget: { type: 'text' } },
        ],
      })
    ).toEqual({ customSteps: [{ id: 's', text: 'Go' }] });
  });

  it('saves concept web edges with their nodes', () => {
    expect(settingsDefaultKeys('concept-web', ['nodes'])).toEqual([
      'edges',
      'nodes',
    ]);
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

  it('saves unset keys as null so an old value cannot survive the merge', () => {
    const state = computeSettingsDefaults(
      'music',
      ['stationId', 'source'],
      { stationId: 'jazz' },
      undefined,
      undefined,
      { stationId: 'lofi', source: 'personal' }
    );
    expect(state.toSave).toEqual({ stationId: 'jazz', source: null });
    expect(cleanSavedSettingsDefault('music', state.toSave)).toEqual({
      stationId: 'jazz',
    });
  });
});

describe('add paths and limits', () => {
  it('treats a building seed as a plain add', () => {
    expect(addCarriesContent(undefined)).toBe(false);
    expect(addCarriesContent({ schoolSite: 'schumann' })).toBe(false);
    expect(addCarriesContent({ items: [] })).toBe(true);
  });

  it('saves keys a field writes beside its own and never a lunch roster', () => {
    expect(
      settingsDefaultKeys('lunchCount', ['lunchTimeHour', 'roster'])
    ).toEqual(['lunchTimeHour', 'lunchTimeMinute']);
    expect(settingsDefaultKeys('weather', ['showFeelsLike'])).toEqual([
      'city',
      'detailFields',
      'showFeelsLike',
      'source',
    ]);
  });

  it('shrinks the room for a default as other presets grow', () => {
    const big = 'x'.repeat(500_000);
    expect(
      settingsDefaultBudget({ stations: { savedLibrary: big } }, 'schedule')
    ).toBeLessThan(100_000);
    expect(settingsDefaultBudget(undefined, 'schedule')).toBe(200_000);
  });
});
