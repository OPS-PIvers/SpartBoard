import type {
  ActivityWallAllowedTypes,
  ActivityWallSubmissionType,
} from '@/types';

/** Post kinds a non-word-cloud wall can switch on or off. */
export type WallPostType = Exclude<ActivityWallSubmissionType, 'word'>;

export const WALL_POST_TYPES: readonly WallPostType[] = [
  'text',
  'photo',
  'link',
  'file',
  'video',
];

/** Text is on unless the teacher turned it off; media types are off unless turned on. */
export const wallTypeOn = (
  allowed: Partial<ActivityWallAllowedTypes> | undefined,
  type: WallPostType
): boolean =>
  type === 'text' ? allowed?.text !== false : allowed?.[type] === true;

/** Teacher posts always allow text; Storage takes uploads only from the owner, so a co-teacher adds just links. */
export const teacherPostTypes = (
  session: { allowedTypes?: ActivityWallAllowedTypes },
  coTeacher: boolean
): ActivityWallAllowedTypes => {
  const allowed = session.allowedTypes;
  return {
    text: true,
    photo: !coTeacher && wallTypeOn(allowed, 'photo'),
    file: !coTeacher && wallTypeOn(allowed, 'file'),
    video: !coTeacher && wallTypeOn(allowed, 'video'),
    link: wallTypeOn(allowed, 'link'),
  };
};
