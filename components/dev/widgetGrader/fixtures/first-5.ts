import { defineFixtures } from './types';

// The widget has no config; the admin day number comes from feature_permissions/first-5.
const configured = (activeDayNumber: number) => ({
  auth: { selectedBuildings: ['high'], userGradeLevels: ['9-12' as const] },
  firestoreDocs: {
    'feature_permissions/first-5': {
      config: { activeDayNumber, referenceDate: '2026-09-01' },
    },
  },
  config: {},
});

export const first5Fixtures = defineFixtures<'first-5'>({
  // Unconfigured: the admin has not set a day number.
  empty: { config: {} },
  // Typical and stress embed the live edtomorrow.com page; stub that route for a stable render.
  typical: configured(10),
  stress: configured(179),
});
