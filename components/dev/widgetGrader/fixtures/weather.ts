import { defineFixtures } from './types';
import { STRESS } from './stress';
import { WEATHER_DETAIL_FIELDS } from '@/types';

// Details show only with the weather-details flag on (authBypassFeatureOverrides).
const detailsAuth = {
  selectedBuildings: ['intermediate'],
  featurePermissions: [
    {
      widgetType: 'weather' as const,
      accessLevel: 'public' as const,
      betaUsers: [],
      enabled: true,
      config: { detailsBuildingIds: ['intermediate'] },
    },
  ],
};

const stationDetails = {
  high: 46,
  low: 39,
  dewPoint: 40,
  humidity: 92,
  pressure: 30.44,
  rainDaily: 0.34,
  rainMonthly: 0.91,
  windSpeedAvg: 10,
  windDirectionAvg: 67,
  windGust: 16,
  uvHours: {
    date: new Date().toLocaleDateString('en-CA'),
    values: Array.from({ length: 24 }, () => 3),
  },
};

export const weatherFixtures = defineFixtures<'weather'>({
  empty: { config: { isAuto: false } },
  typical: {
    auth: detailsAuth,
    config: {
      isAuto: false,
      temp: 54,
      feelsLike: 49,
      showFeelsLike: true,
      condition: 'cloudy',
      locationName: 'Orono, MN',
      detailFields: [
        'dewPoint',
        'humidity',
        'windAvg',
        'sunrise',
        'sunset',
        'moon',
      ],
      details: stationDetails,
    },
  },
  stress: {
    customTitle: STRESS.title,
    auth: detailsAuth,
    config: {
      isAuto: false,
      temp: -23,
      feelsLike: -41,
      showFeelsLike: true,
      condition: 'snowy',
      locationName: `${STRESS.word}, ${STRESS.title}`,
      detailFields: [...WEATHER_DETAIL_FIELDS],
      details: { ...stationDetails, high: -12, low: -38, dewPoint: -30 },
    },
  },
});
