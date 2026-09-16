import { describe, expect, it } from 'vitest';
import { validateSchema } from '@/components/settings/schema/validateSchema';
import { isFieldVisible } from '@/components/settings/schema/types';
import { makeCtx } from '@/components/settings/renderer/fields/testUtils';
import schema from './settings.schema';

const noteFields = () =>
  schema.groups.find((group) => group.id === 'display')?.fields ?? [];

describe('text settings schema', () => {
  it('validates with no errors or warnings', () => {
    const result = validateSchema('text', schema);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('shows note color and vertical alignment only in the drawer', () => {
    const drawer = { ...makeCtx(), surface: 'drawer' as const };
    expect(
      noteFields()
        .filter((field) => isFieldVisible(field, drawer))
        .map((field) => field.key)
    ).toEqual(['bgColor', 'verticalAlign']);
    expect(
      noteFields().filter((field) => isFieldVisible(field, makeCtx()))
    ).toEqual([]);
  });

  it('reads the widget defaults when note keys are unset', () => {
    const drawer = { ...makeCtx(), surface: 'drawer' as const };
    const [bgColor, verticalAlign] = noteFields();
    expect(bgColor.readValue?.(drawer)).toBe('#fef9c3');
    expect(verticalAlign.readValue?.(drawer)).toBe('center');
  });
});
