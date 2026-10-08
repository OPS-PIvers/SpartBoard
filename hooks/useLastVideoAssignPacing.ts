import type { VideoActivitySessionMode } from '@/types';
import {
  resetLastAssignSettingsCache,
  useLastAssignSettings,
  type LastAssignSettings,
  type LastAssignSettingsSpec,
} from '@/hooks/useLastAssignSettings';

/** Profile field holding this teacher's last-used Video Activity pacing (plan D12). */
export const LAST_VIDEO_ASSIGN_PACING_FIELD = 'lastVideoAssignPacing';

/** Today's default when nothing is saved: self-paced. */
export const DEFAULT_VIDEO_ASSIGN_PACING: VideoActivitySessionMode = 'student';

export function parseLastVideoAssignPacing(
  raw: unknown
): VideoActivitySessionMode | null {
  return raw === 'student' || raw === 'teacher' ? raw : null;
}

const VIDEO_PACING_SPEC: LastAssignSettingsSpec<VideoActivitySessionMode> = {
  field: LAST_VIDEO_ASSIGN_PACING_FIELD,
  parse: parseLastVideoAssignPacing,
  logTag: 'useLastVideoAssignPacing',
};

/** Test hook: forget cached reads between cases. */
export function resetLastVideoAssignPacingCache(): void {
  resetLastAssignSettingsCache(LAST_VIDEO_ASSIGN_PACING_FIELD);
}

/** Reads and writes the teacher's last-used Video Activity pacing; inert when `enabled` is false. */
export function useLastVideoAssignPacing(
  uid: string | null | undefined,
  enabled: boolean
): LastAssignSettings<VideoActivitySessionMode> {
  return useLastAssignSettings(VIDEO_PACING_SPEC, uid, enabled);
}
