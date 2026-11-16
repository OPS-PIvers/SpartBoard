import { auth } from '@/config/firebase';
import { STUDENT_FIRST_NAME_KEY } from '@/context/StudentAuthContextValue';
import { useStudentTokenFirstName } from '@/components/activityWall/engagement/useStudentTokenFirstName';

const readSessionFirstName = (): string => {
  try {
    return window.sessionStorage.getItem(STUDENT_FIRST_NAME_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
};

/** Name on the results watermark: override, signed-in student's first name, display name, stored first name, PIN, then "Student". */
export function useWatermarkStudentName(
  override?: string,
  pin?: string
): string {
  const user = auth.currentUser;
  const tokenFirstName = useStudentTokenFirstName(user)?.trim() ?? '';
  const candidates = [
    override?.trim() ?? '',
    tokenFirstName,
    user?.displayName?.trim() ?? '',
    user && !user.isAnonymous ? readSessionFirstName() : '',
  ];
  const name = candidates.find((c) => c.length > 0);
  if (name) return name;
  return pin ? `PIN ${pin}` : 'Student';
}
