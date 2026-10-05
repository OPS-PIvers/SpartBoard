import type { ProjectDefinition } from '@/types';
import { defineFixtures, userPath } from './types';
import { STRESS, range } from './stress';

const T0 = Date.UTC(2026, 8, 1, 14, 0);

const makeProject = (
  id: string,
  title: string,
  stepCount: number,
  i: number
): ProjectDefinition => ({
  id,
  title,
  description: '',
  steps: range(stepCount, (s) => ({
    id: `${id}-step-${s}`,
    title: `Step ${s + 1}`,
    requiresApproval: s === stepCount - 1,
  })),
  folderId: null,
  createdAt: T0 - i * 86_400_000,
  updatedAt: T0 - i * 86_400_000,
});

// The widget face stays off until the admin rollout switch is on, so every fixture turns it on.
const ROLLOUT_ON = { 'admin_settings/projects_widget': { enabled: true } };

const docsFor = (
  projects: ProjectDefinition[]
): Record<string, Record<string, unknown>> => ({
  ...ROLLOUT_ON,
  ...Object.fromEntries(
    projects.map((p) => [userPath(`projects/${p.id}`), { ...p }])
  ),
});

export const projectsFixtures = defineFixtures<'projects'>({
  empty: {
    firestoreDocs: ROLLOUT_ON,
    config: { view: 'manager', managerTab: 'library' },
  },
  typical: {
    firestoreDocs: docsFor(
      ['Science fair', 'Book report', 'Ecosystem model', 'Local history'].map(
        (title, i) => makeProject(`project-${i}`, title, 3 + i, i)
      )
    ),
    config: { view: 'manager', managerTab: 'library' },
  },
  stress: {
    firestoreDocs: docsFor(
      range(STRESS.itemCount, (i) =>
        makeProject(
          `project-${i}`,
          i % 2 === 0 ? STRESS.title : STRESS.word,
          i === 0 ? 20 : 2 + (i % 6),
          i
        )
      )
    ),
    config: { view: 'manager', managerTab: 'library' },
  },
});
