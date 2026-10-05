import type { ActivityWallLibraryEntry } from '@/types';
import { HARNESS_UID, defineFixtures, userPath } from './types';
import { STRESS, range } from './stress';

const T0 = Date.UTC(2026, 8, 1, 14, 0);

const entry = (
  id: string,
  title: string,
  prompt: string
): ActivityWallLibraryEntry => ({
  id,
  title,
  prompt,
  mode: 'text',
  moderationEnabled: false,
  identificationMode: 'anonymous',
  layout: 'wall',
  allowedTypes: { photo: false, link: false, file: false, video: false },
  createdAt: T0,
  updatedAt: T0,
});

const post = (id: string, i: number, content: string, pending = false) => ({
  id,
  content,
  type: 'text',
  submittedAt: T0 + i * 60_000,
  status: pending ? 'pending' : 'approved',
  participantLabel: `Student ${i + 1}`,
  isGuest: false,
});

const wallDocs = (
  wall: ActivityWallLibraryEntry,
  posts: ReturnType<typeof post>[]
): Record<string, Record<string, unknown>> => ({
  [userPath(`activity_wall_activities/${wall.id}`)]: { ...wall },
  ...Object.fromEntries(
    posts.map((p) => [
      `activity_wall_sessions/${HARNESS_UID}_${wall.id}/submissions/${p.id}`,
      p,
    ])
  ),
});

const typicalWall = entry(
  'wall-1',
  'Exit ticket: photosynthesis',
  'What is one thing you learned today?'
);
const stressWall = {
  ...entry('wall-2', STRESS.title, STRESS.sentence),
  moderationEnabled: true,
};

export const activityWallFixtures = defineFixtures<'activity-wall'>({
  empty: { config: { activities: [], activeActivityId: null } },
  typical: {
    firestoreDocs: wallDocs(
      typicalWall,
      [
        'Plants make their own food',
        'Sunlight is the energy source',
        'Chlorophyll is why leaves are green',
        'Oxygen is a by-product',
        'I still wonder how roots help',
        'Glucose gets stored as starch',
      ].map((text, i) => post(`p-${i}`, i, text))
    ),
    config: { activeActivityId: typicalWall.id },
  },
  stress: {
    firestoreDocs: wallDocs(
      stressWall,
      range(STRESS.itemCount + 6, (i) =>
        post(
          `p-${i}`,
          i,
          i % 3 === 0 ? STRESS.sentence : i % 3 === 1 ? STRESS.word : 'Short',
          i % 5 === 0
        )
      )
    ),
    config: { activeActivityId: stressWall.id, imageSize: 'large' },
  },
});
