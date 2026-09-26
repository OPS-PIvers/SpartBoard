/**
 * Both roster-groups settings cards are gated on the `roster-groups`
 * permission (docs/plans/shipped/ROSTER_GROUPS_INTEGRATION.md D23).
 *
 * The lock card shipped without that check in a first pass while its sibling
 * had it, so a teacher without the permission saw a working-looking control
 * whose writes the widget then ignored. Asserting both together stops the two
 * from drifting again.
 */
import { describe, it, expect } from 'vitest';
import type { FieldCtx } from '@/components/settings/schema/types';
import { isFieldVisible } from '@/components/settings/schema/types';
import randomSchema from './settings.schema';

const ROSTER_GROUP_FIELD_LABELS = ['lockedGroups', 'saveAsClassGroups'];

const fields = randomSchema.groups
  .flatMap((group) => group.fields)
  .filter((field) => ROSTER_GROUP_FIELD_LABELS.includes(String(field.label)));

function fieldByLabel(label: string) {
  const field = fields.find((f) => String(f.label) === label);
  if (!field) throw new Error(`random settings has no "${label}" field`);
  return field;
}

const ctxWith = (
  permitted: boolean,
  mode: string,
  rosterMode: 'class' | 'custom' = 'class'
): FieldCtx =>
  ({
    config: { mode, rosterMode },
    widget: { type: 'random' },
    isAdmin: false,
    canAccessFeature: (id: string) =>
      id === 'roster-groups' ? permitted : true,
    t: (key: string) => key,
  }) as unknown as FieldCtx;

describe('random settings — roster-group cards', () => {
  it('registers both cards', () => {
    expect(fields.map((f) => String(f.label)).sort()).toEqual(
      ROSTER_GROUP_FIELD_LABELS.slice().sort()
    );
  });

  it('hides every roster-group card without the permission', () => {
    for (const field of fields) {
      for (const mode of ['groups', 'jigsaw']) {
        expect(
          isFieldVisible(field, ctxWith(false, mode)),
          `${String(field.label)} is visible in ${mode} mode without the permission`
        ).toBe(false);
      }
    }
  });

  it('shows the lock card in both grouping modes once permitted', () => {
    const lock = fieldByLabel('lockedGroups');
    expect(isFieldVisible(lock, ctxWith(true, 'groups'))).toBe(true);
    expect(isFieldVisible(lock, ctxWith(true, 'jigsaw'))).toBe(true);
    // Not a grouping mode — nothing to keep together.
    expect(isFieldVisible(lock, ctxWith(true, 'single'))).toBe(false);
  });

  it('hides every roster-group card in custom-names mode', () => {
    // No roster behind the widget, so both cards could only render a dead
    // control: the lock list has nothing to list and save-back has nowhere
    // to write. Caught in review on PR 2, where only the lock card had it.
    for (const field of fields) {
      for (const mode of ['groups', 'jigsaw']) {
        expect(
          isFieldVisible(field, ctxWith(true, mode, 'custom')),
          `${String(field.label)} is visible in ${mode} mode with a custom roster`
        ).toBe(false);
      }
    }
  });

  it('shows save-back in groups mode only', () => {
    const save = fieldByLabel('saveAsClassGroups');
    expect(isFieldVisible(save, ctxWith(true, 'groups'))).toBe(true);
    expect(isFieldVisible(save, ctxWith(true, 'jigsaw'))).toBe(false);
  });
});
