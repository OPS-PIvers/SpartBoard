import type { GlobalFeaturePermission } from '@/types';
import {
  INPUT_SIGNALS_FEATURE,
  type AttemptFindings,
  type InputFinding,
  type InputFindingId,
} from '@/utils/inputSignals';

/** A sign an admin can show or hide on its own; the managed-profile sign has its own flag. */
export type InputSignId =
  Exclude<InputFindingId, 'unmanaged-profile'> | 'writing-playback';

export interface InputSignDef {
  id: InputSignId;
  label: string;
  group: string;
}

/** Every sign in the order the admin panel lists them. */
export const INPUT_SIGNS: readonly InputSignDef[] = [
  { id: 'jump-clicks', label: 'Clicks with no mouse movement', group: 'Mouse' },
  {
    id: 'line-clicks',
    label: 'Perfectly straight mouse paths',
    group: 'Mouse',
  },
  { id: 'scripted', label: 'Clicks or edits from a script', group: 'Mouse' },
  { id: 'instant-keys', label: 'Keys released instantly', group: 'Typing' },
  { id: 'fast-typing', label: 'Typing faster than a person', group: 'Typing' },
  { id: 'even-typing', label: 'Perfectly even typing', group: 'Typing' },
  { id: 'unkeyed-text', label: 'Text with no key presses', group: 'Typing' },
  {
    id: 'no-revisions',
    label: 'Long answers typed with no changes',
    group: 'Typing',
  },
  { id: 'pasted', label: 'Pasted text', group: 'Pasting' },
  { id: 'paste-attempts', label: 'Paste attempts', group: 'Pasting' },
  {
    id: 'fast-answers',
    label: 'Answered faster than reading',
    group: 'Timing',
  },
  { id: 'even-answers', label: 'Answers at even intervals', group: 'Timing' },
  { id: 'side-panel', label: 'Browser side panel opened', group: 'Screen' },
  { id: 'extra-screen', label: 'Second screen connected', group: 'Screen' },
  {
    id: 'writing-playback',
    label: 'Writing playback',
    group: 'Written answers',
  },
];

export const OTHER_CAUSES_MAX = 200;

/** One sign's admin choices; a missing entry is on with the default wording. */
export interface InputSignSetting {
  off?: boolean;
  otherCauses?: string;
}

export type InputSignSettings = Partial<Record<InputSignId, InputSignSetting>>;

const SIGN_IDS = new Set<string>(INPUT_SIGNS.map((s) => s.id));

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The `signs` map under the input-signals permission's config, with anything malformed dropped. */
export function readInputSignSettings(
  permissions: readonly GlobalFeaturePermission[] | undefined
): InputSignSettings {
  const raw = permissions?.find((p) => p.featureId === INPUT_SIGNALS_FEATURE)
    ?.config?.signs;
  if (!isRecord(raw)) return {};
  const out: InputSignSettings = {};
  for (const [id, v] of Object.entries(raw)) {
    if (!SIGN_IDS.has(id) || !isRecord(v)) continue;
    const s: InputSignSetting = {};
    if (v.off === true) s.off = true;
    if (typeof v.otherCauses === 'string' && v.otherCauses.trim())
      s.otherCauses = v.otherCauses.trim().slice(0, OTHER_CAUSES_MAX);
    out[id as InputSignId] = s;
  }
  return out;
}

export const isSignShown = (
  settings: InputSignSettings,
  id: InputSignId
): boolean => settings[id]?.off !== true;

/** Finding ids hidden from this viewer; empty for admins, who see every sign. */
export function hiddenFindings(
  settings: InputSignSettings,
  isAdmin: boolean
): Set<InputFindingId> {
  const out = new Set<InputFindingId>();
  if (isAdmin) return out;
  for (const [id, s] of Object.entries(settings))
    if (s?.off && id !== 'writing-playback') out.add(id as InputFindingId);
  return out;
}

export interface ShownFinding extends InputFinding {
  /** Off in admin settings; only admins still see it. */
  hidden: boolean;
}

export interface ShownAttemptFindings extends Omit<
  AttemptFindings,
  'findings'
> {
  findings: ShownFinding[];
}

/** Applies admin wording and drops signs switched off; admins keep them, marked hidden. */
export function applyInputSignSettings(
  attempts: AttemptFindings[],
  settings: InputSignSettings,
  isAdmin: boolean
): ShownAttemptFindings[] {
  return attempts
    .map((a) => ({
      ...a,
      findings: a.findings.flatMap((f): ShownFinding[] => {
        if (f.id === 'unmanaged-profile') return [{ ...f, hidden: false }];
        const s = settings[f.id];
        const hidden = s?.off === true;
        if (hidden && !isAdmin) return [];
        return [
          {
            ...f,
            otherCauses: s?.otherCauses ?? f.otherCauses,
            hidden,
          },
        ];
      }),
    }))
    .filter((a) => a.findings.length > 0);
}
