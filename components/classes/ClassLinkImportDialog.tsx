import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { collection, getDocs } from 'firebase/firestore';
import { Download, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { ClassLinkClass, ClassRoster, ClassRosterMeta, Student } from '@/types';
import { Modal } from '@/components/common/Modal';
import { db } from '@/config/firebase';
import { classLinkService } from '@/utils/classlinkService';
import { canReadTestClasses } from '@/utils/testClassAccess';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { mergeClassLinkStudents } from './mergeClassLinkStudents';

const TEST_PREFIX = 'test:';

/**
 * Build the ClassLink provenance metadata to persist on a roster document.
 * Returns `null` for test classes (they aren't real ClassLink classes and
 * must not claim `origin: 'classlink'` — they'd otherwise feed garbage
 * sourcedIds into session `classIds[]` and break the student SSO gate).
 *
 * NOTE: fields missing from `cls` (e.g., `classCode` cleared upstream) are
 * omitted rather than set to `deleteField()`, so `updateRoster` at merge
 * time additively refreshes metadata without wiping previously-stored
 * values. ClassLink rarely drops these fields in practice; if upstream
 * ever clears a classCode/subject, the badge tooltip shows stale data
 * until the teacher re-imports. Acceptable tradeoff vs. an extra
 * `deleteField()` code path on every merge.
 */
const buildClassLinkRosterMeta = (
  cls: ClassLinkClass,
  orgId: string | null | undefined
): Partial<ClassRosterMeta> | null => {
  if (cls.sourcedId.startsWith(TEST_PREFIX)) return null;
  const meta: Partial<ClassRosterMeta> = {
    origin: 'classlink',
    classlinkClassId: cls.sourcedId,
    classlinkSyncedAt: Date.now(),
  };
  if (cls.classCode) meta.classlinkClassCode = cls.classCode;
  if (cls.subject) meta.classlinkSubject = cls.subject;
  if (orgId) meta.classlinkOrgId = orgId;
  return meta;
};

// Materialize test-class member emails into placeholder students. The email
// local-part becomes the display name and PINs are sequential zero-padded
// two-digit strings (01, 02, …) so the teacher has something to hand out
// before editing. The imported roster is a normal user-owned roster and can
// be renamed, PIN-edited, or deleted afterwards like any ClassLink import.
const materializeTestClassStudents = (emails: string[]): Student[] =>
  emails.map((email, i) => ({
    id: crypto.randomUUID(),
    firstName: email.split('@')[0] || email,
    lastName: '',
    pin: String(i + 1).padStart(2, '0'),
  }));

export type ClassLinkDialogMode =
  | { kind: 'new' }
  | { kind: 'merge'; rosterId: string; rosterName: string };

interface ClassLinkImportDialogProps {
  isOpen: boolean;
  mode: ClassLinkDialogMode;
  onClose: () => void;
}

/**
 * Unified ClassLink dialog.
 *
 * - `new` mode: lists all ClassLink classes with an "Import" action that
 *   creates a fresh local roster (name derived from subject/title/classCode).
 * - `merge` mode: lists all ClassLink classes with a "Merge" action that
 *   pulls missing students into the existing local roster (dedup by
 *   `classLinkSourcedId` → normalized name → append).
 */
export const ClassLinkImportDialog: React.FC<ClassLinkImportDialogProps> = ({
  isOpen,
  mode,
  onClose,
}) => {
  const { t } = useTranslation();
  const { rosters, addRoster, updateRoster, addToast } = useDashboard();
  const { user, userRoles, orgId, roleId } = useAuth();

  const canReadTestClassesForOrg = useMemo(
    () => canReadTestClasses(orgId, roleId, userRoles, user?.email),
    [orgId, roleId, userRoles, user?.email]
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classes, setClasses] = useState<ClassLinkClass[]>([]);
  const [studentsByClass, setStudentsByClass] = useState<
    Record<string, import('@/types').ClassLinkStudent[]>
  >({});
  // Emails per synthetic test class, keyed by `test:<classId>`. Kept separate
  // from studentsByClass (which is typed for ClassLink students) so the import
  // handler can branch cleanly on the id prefix.
  const [testEmailsByClass, setTestEmailsByClass] = useState<
    Record<string, string[]>
  >({});
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setClasses([]);
    setStudentsByClass({});
    setTestEmailsByClass({});
    void (async () => {
      // ClassLink fetch + test-class fetch run in parallel. Test-class fetch is
      // only attempted when the actor clears the super/domain admin gate
      // Firestore rules enforce; otherwise it's skipped entirely to avoid a
      // guaranteed permission-denied round-trip.
      const testPromise =
        canReadTestClassesForOrg && orgId
          ? getDocs(collection(db, 'organizations', orgId, 'testClasses'))
              .then((snap) => {
                const extraClasses: ClassLinkClass[] = [];
                const extraEmails: Record<string, string[]> = {};
                for (const d of snap.docs) {
                  const data = d.data() as {
                    title?: string;
                    subject?: string;
                    memberEmails?: unknown;
                  };
                  const emails = Array.isArray(data.memberEmails)
                    ? data.memberEmails.filter(
                        (e): e is string => typeof e === 'string'
                      )
                    : [];
                  const key = `${TEST_PREFIX}${d.id}`;
                  extraClasses.push({
                    sourcedId: key,
                    title: `${data.title ?? d.id} (test)`,
                    subject: data.subject,
                  });
                  extraEmails[key] = emails;
                }
                return { extraClasses, extraEmails };
              })
              .catch((err) => {
                if (import.meta.env.DEV) {
                  console.warn(
                    '[ClassLinkImportDialog] testClasses fetch failed:',
                    err
                  );
                }
                return {
                  extraClasses: [] as ClassLinkClass[],
                  extraEmails: {} as Record<string, string[]>,
                };
              })
          : Promise.resolve({
              extraClasses: [] as ClassLinkClass[],
              extraEmails: {} as Record<string, string[]>,
            });

      try {
        const [data, testResult] = await Promise.all([
          classLinkService.getRosters(true),
          testPromise,
        ]);
        if (cancelled) return;
        // Sort the merged list alphabetically so the real ClassLink rosters
        // and synthetic test classes interleave predictably in the picker.
        const combinedClasses = [
          ...data.classes,
          ...testResult.extraClasses,
        ].sort((a, b) => a.title.localeCompare(b.title));
        setClasses(combinedClasses);
        setStudentsByClass(data.studentsByClass);
        setTestEmailsByClass(testResult.extraEmails);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to fetch from ClassLink', err);
        setError(
          t('toasts.classLink.fetchFailed', {
            defaultValue: 'Failed to fetch from ClassLink. Check console.',
          })
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, t, canReadTestClassesForOrg, orgId]);

  const handleImportNew = async (cls: ClassLinkClass) => {
    setPendingId(cls.sourcedId);
    try {
      const isTestClass = cls.sourcedId.startsWith(TEST_PREFIX);
      const students: Student[] = isTestClass
        ? materializeTestClassStudents(testEmailsByClass[cls.sourcedId] ?? [])
        : (studentsByClass[cls.sourcedId] ?? []).map((s) => ({
            id: crypto.randomUUID(),
            firstName: s.givenName,
            lastName: s.familyName,
            pin: '',
            classLinkSourcedId: s.sourcedId,
          }));
      const subjectPrefix = cls.subject ? `${cls.subject} - ` : '';
      const codeSuffix = cls.classCode ? ` (${cls.classCode})` : '';
      const displayName = `${subjectPrefix}${cls.title}${codeSuffix}`;
      const rosterMeta = buildClassLinkRosterMeta(cls, orgId);
      await addRoster(displayName, students, rosterMeta ?? undefined);
      addToast(
        t('toasts.classLink.imported', {
          defaultValue: 'Imported {{name}}',
          name: cls.title,
        }),
        'success'
      );
      onClose();
    } catch (err) {
      console.error(err);
      addToast(
        t('toasts.classLink.importFailed', {
          defaultValue: 'Failed to import {{name}}',
          name: cls.title,
        }),
        'error'
      );
    } finally {
      setPendingId(null);
    }
  };

  const handleMergeInto = async (cls: ClassLinkClass) => {
    if (mode.kind !== 'merge') return;
    setPendingId(cls.sourcedId);
    try {
      const target: ClassRoster | undefined = rosters.find(
        (r) => r.id === mode.rosterId
      );
      if (!target) {
        addToast(
          t('toasts.classLink.targetMissing', {
            defaultValue: 'Target class no longer exists',
          }),
          'error'
        );
        onClose();
        return;
      }
      const result = mergeClassLinkStudents(
        target.students,
        studentsByClass[cls.sourcedId] ?? []
      );
      // Backfill ClassLink provenance on the roster doc itself — rosters
      // imported before the metadata fields existed (or merged with a new
      // ClassLink class) still need `classlinkClassId` so the student SSO
      // gate resolves via session `classIds[]` derivation downstream.
      const rosterMeta = buildClassLinkRosterMeta(cls, orgId);
      await updateRoster(mode.rosterId, {
        students: result.students,
        ...(rosterMeta ?? {}),
      });
      if (result.addedCount === 0 && result.matchedCount === 0) {
        addToast(
          t('toasts.classLink.noStudents', {
            defaultValue: 'No students found in {{name}}',
            name: cls.title,
          }),
          'info'
        );
      } else if (result.addedCount === 0) {
        addToast(
          t('toasts.classLink.allAlreadyPresent', {
            count: result.matchedCount,
            defaultValue: 'All {{count}} students already in {{name}}',
            name: target.name,
          }),
          'info'
        );
      } else {
        addToast(
          t('toasts.classLink.addedStudents', {
            count: result.addedCount,
            defaultValue: 'Added {{count}} student to {{name}}',
            defaultValue_other: 'Added {{count}} students to {{name}}',
            name: target.name,
          }),
          'success'
        );
      }
      onClose();
    } catch (err) {
      console.error(err);
      addToast(
        t('toasts.classLink.syncFailed', {
          defaultValue: 'Failed to sync {{name}}',
          name: cls.title,
        }),
        'error'
      );
    } finally {
      setPendingId(null);
    }
  };

  const title =
    mode.kind === 'new'
      ? t('sidebar.classes.classLinkImportTitle', {
          defaultValue: 'Import from ClassLink',
        })
      : t('sidebar.classes.classLinkMergeTitle', {
          defaultValue: 'Sync "{{name}}" with ClassLink',
          name: mode.rosterName,
        });
  const subtitle =
    mode.kind === 'new'
      ? t('sidebar.classes.classLinkImportSubtitle', {
          defaultValue: 'Pick a class to import as a new roster.',
        })
      : t('sidebar.classes.classLinkMergeSubtitle', {
          defaultValue:
            'Pick the ClassLink class whose students should be pulled in. Existing students are preserved.',
        });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-lg"
      title={title}
      contentClassName="px-6 pb-6"
    >
      <p className="text-xs text-slate-500 mb-4">{subtitle}</p>

      {loading && (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-brand-blue-primary" />
          <p className="text-xxs font-bold uppercase tracking-widest">
            {t('sidebar.classes.classLinkConnecting', {
              defaultValue: 'Connecting to ClassLink…',
            })}
          </p>
        </div>
      )}

      {error && !loading && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && classes.length === 0 && (
        <div className="py-10 text-center text-slate-400 text-sm italic">
          {t('sidebar.classes.classLinkNoClasses', {
            defaultValue: 'No classes found in ClassLink.',
          })}
        </div>
      )}

      {!loading && !error && classes.length > 0 && (
        <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
          {classes
            // Test classes don't carry ClassLinkStudent records (no sourcedIds
            // or full names), so `mergeClassLinkStudents` can't diff them
            // against an existing roster. Hide them in merge mode.
            .filter(
              (cls) =>
                !(
                  mode.kind === 'merge' && cls.sourcedId.startsWith(TEST_PREFIX)
                )
            )
            .map((cls) => {
              const isTestClass = cls.sourcedId.startsWith(TEST_PREFIX);
              const count = isTestClass
                ? (testEmailsByClass[cls.sourcedId]?.length ?? 0)
                : (studentsByClass[cls.sourcedId]?.length ?? 0);
              const isPending = pendingId === cls.sourcedId;
              return (
                <div
                  key={cls.sourcedId}
                  className="flex items-center justify-between gap-3 p-3 border border-slate-200 rounded-xl bg-white hover:border-brand-blue-primary hover:shadow-sm transition-all"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="text-sm font-bold text-slate-800 truncate">
                        {cls.title}
                      </div>
                      {isTestClass && (
                        <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
                          {t('sidebar.classes.testBadge', {
                            defaultValue: 'TEST',
                          })}
                        </span>
                      )}
                    </div>
                    <div className="text-xxs font-semibold text-slate-400 uppercase tracking-widest">
                      {t('sidebar.classes.studentCount', {
                        count,
                        defaultValue: '{{count}} Student',
                        defaultValue_other: '{{count}} Students',
                      })}
                      {cls.classCode ? ` · ${cls.classCode}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      mode.kind === 'new'
                        ? void handleImportNew(cls)
                        : void handleMergeInto(cls)
                    }
                    disabled={isPending}
                    className="shrink-0 bg-brand-blue-primary text-white px-3 py-2 rounded-xl text-xxs font-bold uppercase tracking-wider hover:bg-brand-blue-dark transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : mode.kind === 'new' ? (
                      <Download className="w-3 h-3" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                    {mode.kind === 'new'
                      ? t('sidebar.classes.classLinkImport', {
                          defaultValue: 'Import',
                        })
                      : t('sidebar.classes.classLinkMerge', {
                          defaultValue: 'Merge',
                        })}
                  </button>
                </div>
              );
            })}
        </div>
      )}
    </Modal>
  );
};
