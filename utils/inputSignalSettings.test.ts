import { describe, expect, it } from 'vitest';
import type { GlobalFeaturePermission } from '@/types';
import type { AttemptFindings } from '@/utils/inputSignals';
import { DEFAULT_OTHER_CAUSES } from '@/utils/inputSignals';
import {
  INPUT_SIGNS,
  applyInputSignSettings,
  hiddenFindings,
  isSignShown,
  readInputSignSettings,
} from '@/utils/inputSignalSettings';

const perm = (config: Record<string, unknown>): GlobalFeaturePermission[] => [
  {
    featureId: 'input-signals',
    accessLevel: 'public',
    betaUsers: [],
    enabled: true,
    config,
  },
];

const attempt = (): AttemptFindings[] => [
  {
    attempt: 0,
    browsers: [],
    findings: [
      {
        id: 'pasted',
        text: 'Pasted 40 characters into answer boxes.',
        questions: ['q1'],
        otherCauses: DEFAULT_OTHER_CAUSES.pasted,
      },
      {
        id: 'jump-clicks',
        text: '3 of 4 mouse clicks landed with no mouse movement leading to them.',
        questions: [],
        otherCauses: DEFAULT_OTHER_CAUSES['jump-clicks'],
      },
      {
        id: 'unmanaged-profile',
        text: 'Not in a school-managed Chrome profile.',
        questions: [],
        otherCauses: DEFAULT_OTHER_CAUSES['unmanaged-profile'],
      },
    ],
  },
];

describe('readInputSignSettings', () => {
  it('treats a missing doc or config as every sign on with default wording', () => {
    expect(readInputSignSettings(undefined)).toEqual({});
    expect(readInputSignSettings(perm({}))).toEqual({});
    for (const s of INPUT_SIGNS) expect(isSignShown({}, s.id)).toBe(true);
  });

  it('drops unknown ids, malformed entries and blank text, and caps length', () => {
    const settings = readInputSignSettings(
      perm({
        signs: {
          pasted: { off: true, otherCauses: '  Shared notes.  ' },
          'jump-clicks': { off: 'yes', otherCauses: '   ' },
          'unmanaged-profile': { off: true },
          bogus: { off: true },
          scripted: 'off',
          'side-panel': { otherCauses: 'x'.repeat(500) },
        },
      })
    );
    expect(settings.pasted).toEqual({
      off: true,
      otherCauses: 'Shared notes.',
    });
    expect(settings['jump-clicks']).toEqual({});
    expect(settings).not.toHaveProperty('unmanaged-profile');
    expect(settings).not.toHaveProperty('bogus');
    expect(settings).not.toHaveProperty('scripted');
    expect(settings['side-panel']?.otherCauses).toHaveLength(200);
  });
});

describe('applyInputSignSettings', () => {
  it('changes nothing with no settings', () => {
    const shown = applyInputSignSettings(attempt(), {}, false);
    expect(
      shown[0].findings.map((f) => [f.id, f.otherCauses, f.hidden])
    ).toEqual(attempt()[0].findings.map((f) => [f.id, f.otherCauses, false]));
  });

  it('hides a sign switched off from teachers and uses admin wording', () => {
    const settings = readInputSignSettings(
      perm({
        signs: {
          pasted: { off: true },
          'jump-clicks': { otherCauses: 'A smartboard.' },
        },
      })
    );
    const teacher = applyInputSignSettings(attempt(), settings, false);
    expect(teacher[0].findings.map((f) => f.id)).toEqual([
      'jump-clicks',
      'unmanaged-profile',
    ]);
    expect(teacher[0].findings[0].otherCauses).toBe('A smartboard.');
  });

  it('keeps hidden signs for admins, marked hidden', () => {
    const settings = readInputSignSettings(
      perm({ signs: { pasted: { off: true } } })
    );
    const admin = applyInputSignSettings(attempt(), settings, true);
    const pasted = admin[0].findings.find((f) => f.id === 'pasted');
    expect(pasted?.hidden).toBe(true);
  });

  it('drops an attempt whose only signs are hidden', () => {
    const only = [{ ...attempt()[0], findings: [attempt()[0].findings[0]] }];
    const settings = readInputSignSettings(
      perm({ signs: { pasted: { off: true } } })
    );
    expect(applyInputSignSettings(only, settings, false)).toEqual([]);
  });
});

describe('hiddenFindings', () => {
  it('lists switched-off finding signs for teachers and none for admins', () => {
    const settings = readInputSignSettings(
      perm({
        signs: {
          'fast-typing': { off: true },
          'writing-playback': { off: true },
          pasted: { otherCauses: 'x' },
        },
      })
    );
    expect([...hiddenFindings(settings, false)]).toEqual(['fast-typing']);
    expect(hiddenFindings(settings, true).size).toBe(0);
  });
});
