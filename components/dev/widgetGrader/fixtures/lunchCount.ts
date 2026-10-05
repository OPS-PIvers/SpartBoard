import { defineFixtures } from './types';
import { STRESS, STRESS_ROSTER, TYPICAL_ROSTER } from './stress';

const names = (r: { students: { firstName: string; lastName: string }[] }) =>
  r.students.map((s) => `${s.firstName} ${s.lastName}`);

// A menu cached today (or manual mode) keeps the widget off the Nutrislice network sync.
const menu = (hot: string, bento: string) => ({
  cachedMenu: {
    hotLunch: { name: hot },
    hotLunchSides: [{ name: 'Seasonal fruit' }, { name: 'Steamed carrots' }],
    bentoBox: { name: bento },
    date: new Date().toISOString(),
  },
  lastSyncDate: new Date().toISOString(),
});

export const lunchCountFixtures = defineFixtures<'lunchCount'>({
  empty: { config: { isManualMode: true } },
  typical: {
    rosters: [TYPICAL_ROSTER],
    config: {
      ...menu('Chicken patty on a bun', 'Turkey and cheese bento'),
      isManualMode: false,
      manualHotLunch: 'Chicken patty on a bun',
      manualBentoBox: 'Turkey and cheese bento',
      roster: names(TYPICAL_ROSTER).slice(0, 12),
      assignments: {
        [names(TYPICAL_ROSTER)[0]]: 'hot',
        [names(TYPICAL_ROSTER)[1]]: 'bento',
        [names(TYPICAL_ROSTER)[2]]: 'home',
      },
    },
  },
  stress: {
    customTitle: STRESS.title,
    rosters: [STRESS_ROSTER],
    config: {
      ...menu(`${STRESS.word} ${STRESS.sentence}`, STRESS.longLabel(0)),
      isManualMode: false,
      manualHotLunch: `${STRESS.word} ${STRESS.sentence}`,
      manualBentoBox: STRESS.longLabel(0),
      roster: names(STRESS_ROSTER),
      assignments: Object.fromEntries(
        names(STRESS_ROSTER).map((n, i) => [
          n,
          (['hot', 'bento', 'home', null] as const)[i % 4],
        ])
      ),
      recipient: STRESS.word,
      lunchTimeHour: '11',
      lunchTimeMinute: '45',
      gradeLevel: STRESS.word,
    },
  },
});
