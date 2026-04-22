import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { ClassRoster, Student, UserRolesConfig } from '../types';
import { canReadTestClasses } from '../utils/testClassAccess';

/**
 * Prefix used for synthetic roster IDs, student IDs, and Drive-less student
 * records derived from test-class member emails. Namespaced so these IDs can
 * never collide with Firestore-generated user roster IDs.
 */
export const TEST_CLASS_ROSTER_PREFIX = 'test:';

export const isTestClassRosterId = (id: string): boolean =>
  id.startsWith(TEST_CLASS_ROSTER_PREFIX);

interface TestClassDoc {
  title?: string;
  subject?: string;
  memberEmails?: unknown;
  createdAt?: { toMillis?: () => number } | number;
}

/**
 * Adapt the admin-managed testClass doc shape into a synthetic ClassRoster so
 * the sidebar "My Classes" list can render it alongside real rosters. Member
 * emails become students with the email local-part as the baseline name —
 * proper display names only exist after the student logs in and is resolved
 * by the grading path.
 */
const adaptTestClass = (classId: string, data: TestClassDoc): ClassRoster => {
  const emails: string[] = Array.isArray(data.memberEmails)
    ? data.memberEmails.filter((e): e is string => typeof e === 'string')
    : [];
  const students: Student[] = emails.map((email, i) => ({
    id: `${TEST_CLASS_ROSTER_PREFIX}${email.toLowerCase()}`,
    firstName: email.split('@')[0] || email,
    lastName: '',
    pin: String(i + 1).padStart(2, '0'),
  }));
  const createdAt =
    typeof data.createdAt === 'number'
      ? data.createdAt
      : typeof data.createdAt?.toMillis === 'function'
        ? data.createdAt.toMillis()
        : Date.now();
  return {
    id: `${TEST_CLASS_ROSTER_PREFIX}${classId}`,
    name: `${data.title ?? classId} (test)`,
    driveFileId: null,
    studentCount: students.length,
    createdAt,
    students,
    source: 'testClass',
    readOnly: true,
  };
};

/**
 * Subscribe to the admin-managed testClasses subcollection and expose its docs
 * as synthetic read-only ClassRosters. Mirrors the role gate Firestore rules
 * enforce at `firestore.rules:345`; returns [] when the actor can't read it so
 * we never issue a doomed query.
 */
export const useTestClassRosters = (
  orgId: string | null,
  roleId: string | null,
  userRoles: UserRolesConfig | null,
  userEmail: string | null | undefined
): ClassRoster[] => {
  const [rosters, setRosters] = useState<ClassRoster[]>([]);

  const canRead = useMemo(
    () => canReadTestClasses(orgId, roleId, userRoles, userEmail),
    [orgId, roleId, userRoles, userEmail]
  );

  // Render-time reset: when the subscription key changes (can't read anymore
  // or the org switched), clear stale rosters immediately rather than letting
  // the previous org's test classes flash before the effect re-runs. Using
  // the "adjusting state while rendering" pattern avoids a setState-in-effect
  // lint error.
  const subKey = canRead && orgId ? orgId : '';
  const [prevSubKey, setPrevSubKey] = useState(subKey);
  if (prevSubKey !== subKey) {
    setPrevSubKey(subKey);
    if (rosters.length > 0) setRosters([]);
  }

  useEffect(() => {
    if (!canRead || !orgId) return;
    const col = collection(db, 'organizations', orgId, 'testClasses');
    const unsub = onSnapshot(
      col,
      (snap) => {
        setRosters(
          snap.docs
            .map((d) => adaptTestClass(d.id, d.data() as TestClassDoc))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      },
      (err) => {
        if (import.meta.env.DEV) {
          console.warn('[useTestClassRosters] snapshot failed:', err);
        }
        setRosters([]);
      }
    );
    return () => unsub();
  }, [canRead, orgId]);

  return rosters;
};
