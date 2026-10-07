import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILT_IN_TEAM_TYPE_PRESETS } from '@/config/teamTypePresets';
import { DEFAULT_GOAL_COACH_RUBRIC } from '@/config/goalCoachRubric';

const DELETE = { __delete: true };
const setDoc = vi.fn((..._args: unknown[]) => Promise.resolve());

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join('/') }),
  setDoc: (...args: unknown[]) => setDoc(...args),
  deleteField: () => DELETE,
}));
vi.mock('@/config/firebase', () => ({ db: {} }));

import { saveTeamTypeDefaults } from './saveTeamTypeDefaults';

const lastCall = () => {
  const [ref, data, options] = setDoc.mock.calls[0] as [
    { path: string },
    Record<string, unknown>,
    { mergeFields: string[] },
  ];
  return { ref, data, options };
};

describe('saveTeamTypeDefaults', () => {
  beforeEach(() => setDoc.mockClear());

  it('replaces only the saved type and leaves the rubric alone', async () => {
    await saveTeamTypeDefaults('building', BUILT_IN_TEAM_TYPE_PRESETS.building);
    const { ref, data, options } = lastCall();
    expect(ref.path).toBe('admin_settings/team_type_defaults');
    expect(options).toEqual({ mergeFields: ['types.building'] });
    expect(data).not.toHaveProperty('goalCoachRubric');
    expect(data.types).toEqual({
      building: expect.objectContaining({
        landing: 'hub',
        meetingNoteTemplate: '',
        resourceCategories: [],
      }) as unknown,
    });
  });

  it('writes an edited rubric with the PLC preset', async () => {
    const rubric = [
      { id: 'evidence', label: 'Evidence', description: 'Evidence' },
    ];
    await saveTeamTypeDefaults('plc', BUILT_IN_TEAM_TYPE_PRESETS.plc, rubric);
    const { data, options } = lastCall();
    expect(options).toEqual({ mergeFields: ['types.plc', 'goalCoachRubric'] });
    expect(data.goalCoachRubric).toEqual(rubric);
  });

  it.each([
    ['the default', [...DEFAULT_GOAL_COACH_RUBRIC]],
    ['an empty', []],
  ])('clears the override for %s rubric', async (_name, rubric) => {
    await saveTeamTypeDefaults('plc', BUILT_IN_TEAM_TYPE_PRESETS.plc, rubric);
    const { data, options } = lastCall();
    expect(options.mergeFields).toContain('goalCoachRubric');
    expect(data.goalCoachRubric).toBe(DELETE);
  });
});
