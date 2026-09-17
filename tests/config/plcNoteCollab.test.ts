import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PLC_NOTE_COLLAB_SETTINGS,
  normalizePlcNoteCollabSettings,
} from '@/config/plcNoteCollab';

/**
 * The kill switch must fail closed. Anything other than a literal `true` leaves
 * the legacy debounced-save editor in place, so a malformed or half-written
 * settings doc can never strand teachers on the collaborative path.
 */
describe('normalizePlcNoteCollabSettings', () => {
  it('ships disabled', () => {
    expect(DEFAULT_PLC_NOTE_COLLAB_SETTINGS.enabled).toBe(false);
  });

  it('enables only on a literal true', () => {
    expect(normalizePlcNoteCollabSettings({ enabled: true }).enabled).toBe(
      true
    );
  });

  it.each([
    ['missing doc', undefined],
    ['null', null],
    ['a string', 'enabled'],
    ['a number', 1],
    ['an empty object', {}],
    ['a truthy string value', { enabled: 'true' }],
    ['a truthy number value', { enabled: 1 }],
    ['an explicit false', { enabled: false }],
  ])('stays disabled for %s', (_label, raw) => {
    expect(normalizePlcNoteCollabSettings(raw).enabled).toBe(false);
  });
});
