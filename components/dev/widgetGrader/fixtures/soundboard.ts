import type { FeaturePermission, SoundboardSound } from '@/types';
import { SOUND_LIBRARY } from '@/config/soundLibrary';
import { defineFixtures } from './types';
import { STRESS, range } from './stress';

const CUSTOM_SOUNDS: SoundboardSound[] = range(16, (i) => ({
  id: `custom-${i + 1}`,
  label: i % 2 === 0 ? STRESS.word : `Transition song number ${i + 1}`,
  url: `https://example.com/sounds/${i + 1}.mp3`,
  color: ['#6366f1', '#ef4444', '#0ea5e9', '#f59e0b'][i % 4],
}));

// The admin sound library the widget reads through feature_permissions/soundboard.
const permission: FeaturePermission = {
  widgetType: 'soundboard',
  accessLevel: 'public',
  betaUsers: [],
  enabled: true,
  config: {
    customLibrarySounds: CUSTOM_SOUNDS,
    buildingDefaults: {
      harness: {
        availableSounds: [],
        enabledLibrarySoundIds: SOUND_LIBRARY.map((s) => s.id),
        enabledCustomSoundIds: CUSTOM_SOUNDS.map((s) => s.id),
      },
    },
  },
};

const libraryIds = SOUND_LIBRARY.map((s) => s.id);
const customIds = CUSTOM_SOUNDS.map((s) => s.id);

export const soundboardFixtures = defineFixtures<'soundboard'>({
  empty: {
    auth: { featurePermissions: [permission] },
    config: { selectedSoundIds: [], activeSoundIds: [] },
  },
  typical: {
    auth: { featurePermissions: [permission] },
    config: {
      selectedSoundIds: libraryIds.slice(0, 6),
      activeSoundIds: libraryIds.slice(0, 6),
    },
  },
  stress: {
    auth: { featurePermissions: [permission] },
    config: {
      selectedSoundIds: [...libraryIds, ...customIds],
      activeSoundIds: [...libraryIds, ...customIds],
    },
  },
});
