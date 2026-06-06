import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users,
  Plus,
  Star,
  Pencil,
  Trash2,
  RefreshCw,
  Download,
  GraduationCap,
  Check,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { httpsCallable } from 'firebase/functions';

import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useDialog } from '@/context/useDialog';
import { useClassLinkEnabled } from '@/hooks/useClassLinkEnabled';
import { ClassRoster, Student } from '@/types';
import { auth, functions } from '@/config/firebase';
import { RosterEditorModal } from '@/components/classes/RosterEditorModal';
import { Modal } from '@/components/common/Modal';
import {
  ensureGis,
  requestAccessToken,
} from '@/components/classroomAddon/gisOAuth';
import {
  ClassLinkImportDialog,
  ClassLinkDialogMode,
} from '@/components/classes/ClassLinkImportDialog';
import { LinkSchoologyModal } from '@/components/classes/LinkSchoologyModal';
import { useSchoologySeenSections } from '@/hooks/useSchoologySeenSections';

/** Google Classroom OAuth scope for read-only course listing. */
const CLASSROOM_COURSES_READONLY_SCOPE =
  'https://www.googleapis.com/auth/classroom.courses.readonly';

/** `courses.list` page size for the client's course picker. */
const COURSES_PAGE_SIZE = 100;

/**
 * Runaway guard on pagination: a single teacher with >2500 active courses is
 * implausible, so this is a cap to avoid an unbounded loop — not an expected
 * limit.
 */
const MAX_COURSE_PAGES = 25;

/**
 * Per-request timeout for the Classroom course listing. Mirrors `API_TIMEOUT_MS`
 * in the server-side add-on CF so a hung Classroom call can't pin the dropdown's
 * loading spinner forever — it surfaces a retryable error instead.
 */
const COURSES_API_TIMEOUT_MS = 10000;

/** Minimal shape of a Google Classroom course we care about. */
interface GoogleClassroomCourse {
  id: string;
  name: string;
  section?: string;
}

/**
 * Args for the `linkClassroomCourse` Cloud Function. The link doc is written
 * server-side (not via `setDoc`) so the CF can verify — with the teacher's own
 * courses token — that the caller actually teaches the Google course before
 * recording the link. `teacherUid` is intentionally omitted: the CF derives it
 * from the authenticated caller, so a client can't claim to be another teacher.
 */
interface LinkClassroomCourseParams {
  accessToken: string;
  courseId: string;
  classlinkClassId: string | null;
  classlinkOrgId: string | null;
  rosterId: string;
}

interface LinkClassroomCourseResult {
  ok: boolean;
  courseId: string;
}

/**
 * Args for the `unlinkClassroomCourse` Cloud Function — the correction path for
 * a wrong/stale course→roster mapping. Like the link CF, the delete is written
 * server-side (client deletes to classroom_course_links are blocked by the
 * rules) and the CF re-verifies — with the teacher's own courses token — that
 * the caller actually teaches the Google course before removing the link.
 */
interface UnlinkClassroomCourseParams {
  accessToken: string;
  courseId: string;
}

interface UnlinkClassroomCourseResult {
  ok: boolean;
  courseId: string;
  removed: boolean;
}

interface SidebarClassesProps {
  isVisible: boolean;
}

/**
 * "My Classes" sidebar page.
 *
 * Replaces the in-widget roster editor and ClassLink import that used to live
 * inside the Classes dashboard widget. Roster management is account-level, not
 * dashboard-level, so it belongs here in the app shell.
 */
export const SidebarClasses: React.FC<SidebarClassesProps> = ({
  isVisible,
}) => {
  const { t } = useTranslation();
  const { showConfirm } = useDialog();
  const {
    rosters,
    activeRosterId,
    addRoster,
    updateRoster,
    deleteRoster,
    setActiveRoster,
    addToast,
  } = useDashboard();
  const { user, selectedBuildings } = useAuth();
  const classLinkEnabled = useClassLinkEnabled(selectedBuildings[0]);

  const [editingRosterId, setEditingRosterId] = useState<string | null>(null);
  const [classLinkMode, setClassLinkMode] =
    useState<ClassLinkDialogMode | null>(null);

  // ── "Link to Schoology" review screen ────────────────────────────────────
  // Schoology sections SpartBoard has SEEN via a launch (passive inventory —
  // there's no "list my courses" API). The CTA + modal appear only when there's
  // at least one seen section not yet paired to a class.
  const [showLinkSchoology, setShowLinkSchoology] = useState(false);
  const seenSchoologySections = useSchoologySeenSections(user?.uid);
  const unlinkedSchoologyCount = seenSchoologySections.filter(
    (s) => !rosters.some((r) => r.ltiContextId === s.contextId)
  ).length;

  // ── "Link to Google Classroom" modal state ──────────────────────────────
  // The roster currently being linked (null = modal closed).
  const [linkingRoster, setLinkingRoster] = useState<ClassRoster | null>(null);
  const [courseLoadState, setCourseLoadState] = useState<
    'loading' | 'loaded' | 'error'
  >('loading');
  const [courses, setCourses] = useState<GoogleClassroomCourse[]>([]);
  const [courseLoadError, setCourseLoadError] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  // The `classroom.courses.readonly` token used to LIST the teacher's courses is
  // the same one the link CF needs to RE-VERIFY teaching authority server-side.
  // Captured here so confirming the link reuses it (no second OAuth popup);
  // cleared when the modal closes.
  const coursesAccessTokenRef = useRef<string | null>(null);

  const loadCourses = useCallback(async () => {
    setCourseLoadState('loading');
    setCourseLoadError(null);
    setCourses([]);
    setSelectedCourseId(null);
    try {
      await ensureGis();
      const token = await requestAccessToken(
        CLASSROOM_COURSES_READONLY_SCOPE,
        user?.email ?? undefined
      );
      // Reused at confirm time to verify teaching authority server-side.
      coursesAccessTokenRef.current = token;
      // Page through ALL the teacher's active courses (a teacher with many
      // courses would otherwise be truncated to the first page), following
      // `nextPageToken` until exhausted, capped by MAX_COURSE_PAGES so a buggy
      // token loop can't spin unbounded.
      const all: GoogleClassroomCourse[] = [];
      let pageToken: string | undefined;
      let pages = 0;
      do {
        const qs = new URLSearchParams({
          teacherId: 'me',
          courseStates: 'ACTIVE',
          pageSize: String(COURSES_PAGE_SIZE),
        });
        if (pageToken) qs.set('pageToken', pageToken);
        // Time-box each request so a slow/hung Classroom call surfaces a
        // retryable error instead of pinning the loading spinner forever.
        let res: Response;
        try {
          res = await fetch(
            `https://classroom.googleapis.com/v1/courses?${qs.toString()}`,
            {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(COURSES_API_TIMEOUT_MS),
            }
          );
        } catch (fetchErr) {
          // AbortSignal.timeout rejects with a DOMException('TimeoutError') —
          // which isn't an `Error` in every engine — so match either type.
          if (
            (fetchErr instanceof DOMException || fetchErr instanceof Error) &&
            (fetchErr.name === 'TimeoutError' || fetchErr.name === 'AbortError')
          ) {
            throw new Error(
              'Timed out loading your Google Classroom courses. Please try again.'
            );
          }
          throw fetchErr;
        }
        if (!res.ok) {
          throw new Error(`Classroom API returned ${res.status}`);
        }
        const data = (await res.json()) as {
          courses?: GoogleClassroomCourse[];
          nextPageToken?: string;
        };
        for (const c of data.courses ?? []) all.push(c);
        pageToken = data.nextPageToken;
        pages += 1;
      } while (pageToken && pages < MAX_COURSE_PAGES);
      setCourses(all);
      setCourseLoadState('loaded');
    } catch (err) {
      setCourseLoadError(
        err instanceof Error ? err.message : 'Failed to load courses.'
      );
      setCourseLoadState('error');
    }
  }, [user?.email]);

  // Fetch the teacher's active courses whenever the link modal opens.
  useEffect(() => {
    if (!linkingRoster) return;
    void loadCourses();
  }, [linkingRoster, loadCourses]);

  const closeLinkModal = useCallback(() => {
    setLinkingRoster(null);
    setCourses([]);
    setSelectedCourseId(null);
    setCourseLoadError(null);
    setIsSaving(false);
    setIsUnlinking(false);
    coursesAccessTokenRef.current = null;
  }, []);

  const handleConfirmLink = useCallback(async () => {
    if (!linkingRoster || !selectedCourseId) return;
    const uid = auth.currentUser?.uid;
    if (!uid) {
      addToast(
        t('sidebar.classes.linkGoogleClassroom.notSignedIn', {
          defaultValue: 'You must be signed in to link a class.',
        }),
        'error'
      );
      return;
    }
    setIsSaving(true);
    try {
      // The link doc is written by the `linkClassroomCourse` Cloud Function, NOT
      // a direct setDoc: Firestore rules can't verify Google-course teaching, so
      // client writes to classroom_course_links are blocked. The CF re-verifies
      // — with the teacher's own courses token — that the caller actually teaches
      // this course before recording the link, closing the course-squatting hole.
      let accessToken = coursesAccessTokenRef.current;
      if (!accessToken) {
        // The list token expired or was cleared; re-acquire (silent if already
        // consented this session) and cache it so a retry after a failed link
        // doesn't pop another token request.
        await ensureGis();
        accessToken = await requestAccessToken(
          CLASSROOM_COURSES_READONLY_SCOPE,
          user?.email ?? undefined
        );
        coursesAccessTokenRef.current = accessToken;
      }
      const linkCourse = httpsCallable<
        LinkClassroomCourseParams,
        LinkClassroomCourseResult
      >(functions, 'linkClassroomCourse');
      await linkCourse({
        accessToken,
        courseId: selectedCourseId,
        classlinkClassId: linkingRoster.classlinkClassId ?? null,
        classlinkOrgId: linkingRoster.classlinkOrgId ?? null,
        rosterId: linkingRoster.id,
      });
      await updateRoster(linkingRoster.id, {
        googleClassroomCourseId: selectedCourseId,
      });
      addToast(
        t('sidebar.classes.linkGoogleClassroom.success', {
          defaultValue: 'Linked to Google Classroom.',
        }),
        'success'
      );
      closeLinkModal();
    } catch (err) {
      addToast(
        t('sidebar.classes.linkGoogleClassroom.failed', {
          defaultValue: 'Failed to link to Google Classroom.',
        }),
        'error'
      );
      // The CF surfaces an actionable message (e.g. "you can only link a course
      // you teach", "already linked by another teacher") — show it in the modal.
      setCourseLoadError(
        err instanceof Error ? err.message : 'Failed to link to Classroom.'
      );
      setIsSaving(false);
    }
  }, [
    linkingRoster,
    selectedCourseId,
    addToast,
    t,
    updateRoster,
    closeLinkModal,
    user?.email,
  ]);

  const handleUnlink = useCallback(async () => {
    const courseId = linkingRoster?.googleClassroomCourseId;
    if (!linkingRoster || !courseId) return;
    const uid = auth.currentUser?.uid;
    if (!uid) {
      addToast(
        t('sidebar.classes.linkGoogleClassroom.notSignedIn', {
          defaultValue: 'You must be signed in to link a class.',
        }),
        'error'
      );
      return;
    }
    setIsUnlinking(true);
    try {
      // The link doc is removed by the `unlinkClassroomCourse` Cloud Function,
      // not a direct delete: client deletes to classroom_course_links are blocked
      // by the rules, and the CF re-verifies — with the teacher's own courses
      // token — that the caller actually teaches this course before removing the
      // link (a verified co-teacher may also clear a departed colleague's link).
      let accessToken = coursesAccessTokenRef.current;
      if (!accessToken) {
        await ensureGis();
        accessToken = await requestAccessToken(
          CLASSROOM_COURSES_READONLY_SCOPE,
          user?.email ?? undefined
        );
        coursesAccessTokenRef.current = accessToken;
      }
      const unlinkCourse = httpsCallable<
        UnlinkClassroomCourseParams,
        UnlinkClassroomCourseResult
      >(functions, 'unlinkClassroomCourse');
      await unlinkCourse({ accessToken, courseId });
      // Clear the roster's local mirror so the UI shows it as unlinked again
      // (the canonical mapping lives in classroom_course_links, now removed).
      await updateRoster(linkingRoster.id, { googleClassroomCourseId: '' });
      addToast(
        t('sidebar.classes.linkGoogleClassroom.unlinkSuccess', {
          defaultValue: 'Unlinked from Google Classroom.',
        }),
        'success'
      );
      closeLinkModal();
    } catch (err) {
      addToast(
        t('sidebar.classes.linkGoogleClassroom.unlinkFailed', {
          defaultValue: 'Failed to unlink from Google Classroom.',
        }),
        'error'
      );
      // The CF surfaces an actionable message (e.g. "you can only unlink a course
      // you teach") — show it in the modal.
      setCourseLoadError(
        err instanceof Error ? err.message : 'Failed to unlink from Classroom.'
      );
      setIsUnlinking(false);
    }
  }, [linkingRoster, addToast, t, updateRoster, closeLinkModal, user?.email]);

  const editingRoster: ClassRoster | null =
    editingRosterId && editingRosterId !== 'new'
      ? (rosters.find((r) => r.id === editingRosterId) ?? null)
      : null;

  const handleSaveRoster = async (name: string, students: Student[]) => {
    if (editingRosterId === 'new') {
      await addRoster(name, students);
    } else if (editingRosterId) {
      await updateRoster(editingRosterId, { name, students });
    }
  };

  const handleDelete = async (roster: ClassRoster) => {
    const confirmed = await showConfirm(
      t('sidebar.classes.confirmDelete', {
        defaultValue: `Delete "${roster.name}"? This cannot be undone.`,
        name: roster.name,
      }),
      {
        title: t('sidebar.classes.confirmDeleteTitle', {
          defaultValue: 'Delete Class',
        }),
        variant: 'danger',
        confirmLabel: t('common.delete', { defaultValue: 'Delete' }),
      }
    );
    if (confirmed) {
      await deleteRoster(roster.id);
    }
  };

  return (
    <>
      <div
        className={`absolute inset-0 flex flex-col transition-all duration-300 ease-in-out ${
          isVisible
            ? 'translate-x-0 opacity-100 visible'
            : 'translate-x-full opacity-0 invisible'
        }`}
      >
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-5 space-y-5">
            {/* Page Header */}
            <div>
              <div className="flex items-center gap-2.5 mb-1.5">
                <div className="w-8 h-8 rounded-lg bg-brand-blue-lighter flex items-center justify-center">
                  <Users className="w-4 h-4 text-brand-blue-primary" />
                </div>
                <h2 className="text-sm font-bold text-slate-800">
                  {t('sidebar.classes.title', { defaultValue: 'My Classes' })}
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                {t('sidebar.classes.description', {
                  defaultValue:
                    'Manage your class rosters here. The active class is used by seating charts, random picker, polls, and more.',
                })}
              </p>
            </div>

            {/* Top CTAs */}
            <div
              className={`grid gap-2 ${
                classLinkEnabled ? 'grid-cols-2' : 'grid-cols-1'
              }`}
            >
              <button
                onClick={() => setEditingRosterId('new')}
                className="flex flex-col items-center justify-center gap-1.5 p-3 bg-brand-blue-primary text-white rounded-xl shadow-sm hover:bg-brand-blue-dark transition-all"
              >
                <Plus className="w-4 h-4" />
                <span className="text-xxs font-bold uppercase tracking-wider">
                  {t('sidebar.classes.newClass', {
                    defaultValue: 'New Class',
                  })}
                </span>
              </button>
              {classLinkEnabled && (
                <button
                  onClick={() => setClassLinkMode({ kind: 'new' })}
                  className="flex flex-col items-center justify-center gap-1.5 p-3 bg-white border border-slate-200 text-slate-600 rounded-xl hover:border-brand-blue-primary hover:text-brand-blue-primary transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span className="text-xxs font-bold uppercase tracking-wider">
                    {t('sidebar.classes.importClassLink', {
                      defaultValue: 'ClassLink',
                    })}
                  </span>
                </button>
              )}
            </div>

            {/* Link-to-Schoology CTA — only when sections have been seen but not
                yet linked (Schoology has no course-list API, so this surfaces the
                passive seen-section inventory). */}
            {unlinkedSchoologyCount > 0 && (
              <button
                onClick={() => setShowLinkSchoology(true)}
                className="w-full flex items-center justify-center gap-2 p-2.5 bg-white border border-brand-blue-primary/30 text-brand-blue-primary rounded-xl hover:border-brand-blue-primary hover:bg-brand-blue-lighter/30 transition-all"
              >
                <GraduationCap className="w-4 h-4" />
                <span className="text-xxs font-bold uppercase tracking-wider">
                  {t('sidebar.classes.linkSchoology', {
                    defaultValue: 'Link {{count}} Schoology section',
                    defaultValue_other: 'Link {{count}} Schoology sections',
                    count: unlinkedSchoologyCount,
                  })}
                </span>
              </button>
            )}

            {/* Roster list */}
            {rosters.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-400">
                <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                  <Users className="w-6 h-6 text-slate-300" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-slate-600">
                    {t('sidebar.classes.emptyTitle', {
                      defaultValue: 'No classes yet',
                    })}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {t('sidebar.classes.emptySubtitle', {
                      defaultValue:
                        'Create a class or import from ClassLink to get started.',
                    })}
                  </p>
                </div>
                <button
                  onClick={() => setEditingRosterId('new')}
                  className="mt-2 px-4 py-2 bg-brand-blue-primary text-white rounded-xl text-xxs font-bold uppercase tracking-wider hover:bg-brand-blue-dark shadow-sm transition-colors"
                >
                  {t('sidebar.classes.createNewClass', {
                    defaultValue: 'Create New Class',
                  })}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <h3 className="text-xxs font-bold text-slate-400 uppercase tracking-widest px-1">
                  {t('sidebar.classes.myClasses', {
                    defaultValue: 'Your Classes',
                  })}
                </h3>
                <div className="flex flex-col gap-2">
                  {rosters.map((r) => {
                    const isActive = activeRosterId === r.id;
                    return (
                      <div
                        key={r.id}
                        className={`flex items-center gap-2 p-2.5 bg-white border rounded-xl transition-all ${
                          isActive
                            ? 'border-brand-blue-primary shadow-sm ring-1 ring-brand-blue-primary/20'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <button
                          onClick={() =>
                            setActiveRoster(isActive ? null : r.id)
                          }
                          className={`shrink-0 p-1.5 rounded-lg transition-colors ${
                            isActive
                              ? 'text-amber-500 hover:bg-amber-50'
                              : 'text-slate-300 hover:text-amber-400 hover:bg-amber-50'
                          }`}
                          title={
                            isActive
                              ? t('sidebar.classes.activeClass', {
                                  defaultValue: 'Active Class',
                                })
                              : t('sidebar.classes.setActive', {
                                  defaultValue: 'Set as Active',
                                })
                          }
                          aria-label={
                            isActive
                              ? t('sidebar.classes.activeClass', {
                                  defaultValue: 'Active Class',
                                })
                              : t('sidebar.classes.setActive', {
                                  defaultValue: 'Set as Active',
                                })
                          }
                        >
                          <Star
                            className="w-4 h-4"
                            fill={isActive ? 'currentColor' : 'none'}
                          />
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className="text-sm font-bold text-slate-800 truncate">
                              {r.name}
                            </div>
                          </div>
                          {r.loadError ? (
                            <div
                              className="text-xxs font-semibold text-red-500 uppercase tracking-widest truncate"
                              title={r.loadError}
                            >
                              {t('sidebar.classes.loadFailed', {
                                defaultValue: 'Failed to load',
                              })}
                            </div>
                          ) : (
                            <div className="text-xxs font-semibold text-slate-400 uppercase tracking-widest">
                              {t('sidebar.classes.studentCount', {
                                count: r.students.length,
                                defaultValue: '{{count}} Student',
                                defaultValue_other: '{{count}} Students',
                              })}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            onClick={() => setEditingRosterId(r.id)}
                            className="p-1.5 text-slate-400 hover:text-brand-blue-primary hover:bg-brand-blue-lighter rounded-lg transition-colors"
                            title={t('sidebar.classes.edit', {
                              defaultValue: 'Edit Class',
                            })}
                            aria-label={t('sidebar.classes.edit', {
                              defaultValue: 'Edit Class',
                            })}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {classLinkEnabled &&
                            (() => {
                              // Rosters whose students carry
                              // `classLinkSourcedId` but whose doc lacks
                              // `classlinkClassId` predate the unified
                              // metadata and are invisible to the student
                              // SSO gate. Surface an amber dot on Sync so
                              // the teacher knows to re-sync — the merge
                              // handler now backfills metadata for them.
                              const needsBackfill =
                                !r.classlinkClassId &&
                                r.students.some((s) => s.classLinkSourcedId);
                              const syncLabel = needsBackfill
                                ? t('sidebar.classes.linkClassLink', {
                                    defaultValue: 'Link to ClassLink class',
                                  })
                                : t('sidebar.classes.syncClassLink', {
                                    defaultValue: 'Sync with ClassLink',
                                  });
                              const linkLabel = r.googleClassroomCourseId
                                ? t(
                                    'sidebar.classes.linkGoogleClassroom.relink',
                                    {
                                      defaultValue:
                                        'Linked to Google Classroom — change link',
                                    }
                                  )
                                : t(
                                    'sidebar.classes.linkGoogleClassroom.button',
                                    {
                                      defaultValue: 'Link to Google Classroom',
                                    }
                                  );
                              return (
                                <>
                                  <button
                                    onClick={() =>
                                      setClassLinkMode({
                                        kind: 'merge',
                                        rosterId: r.id,
                                        rosterName: r.name,
                                      })
                                    }
                                    className="relative p-1.5 text-slate-400 hover:text-brand-blue-primary hover:bg-brand-blue-lighter rounded-lg transition-colors"
                                    title={syncLabel}
                                    aria-label={syncLabel}
                                  >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    {needsBackfill && (
                                      <span
                                        aria-hidden="true"
                                        className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-500"
                                      />
                                    )}
                                  </button>
                                  <button
                                    onClick={() => setLinkingRoster(r)}
                                    className={`relative p-1.5 rounded-lg transition-colors ${
                                      r.googleClassroomCourseId
                                        ? 'text-emerald-600 hover:bg-emerald-50'
                                        : 'text-slate-400 hover:text-brand-blue-primary hover:bg-brand-blue-lighter'
                                    }`}
                                    title={linkLabel}
                                    aria-label={linkLabel}
                                  >
                                    <GraduationCap className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              );
                            })()}
                          <button
                            onClick={() => void handleDelete(r)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title={t('sidebar.classes.delete', {
                              defaultValue: 'Delete Class',
                            })}
                            aria-label={t('sidebar.classes.delete', {
                              defaultValue: 'Delete Class',
                            })}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {editingRosterId !== null && (
        <RosterEditorModal
          key={editingRosterId}
          isOpen
          roster={editingRoster}
          onClose={() => setEditingRosterId(null)}
          onSave={handleSaveRoster}
        />
      )}

      {classLinkMode && (
        <ClassLinkImportDialog
          isOpen={classLinkMode !== null}
          mode={classLinkMode}
          onClose={() => setClassLinkMode(null)}
        />
      )}

      <LinkSchoologyModal
        isOpen={showLinkSchoology}
        onClose={() => setShowLinkSchoology(false)}
        rosters={rosters}
        seenSections={seenSchoologySections}
        addToast={addToast}
        updateRoster={updateRoster}
      />

      {linkingRoster && (
        <Modal
          isOpen
          onClose={closeLinkModal}
          maxWidth="max-w-lg"
          title={t('sidebar.classes.linkGoogleClassroom.title', {
            defaultValue: 'Link to Google Classroom',
          })}
          footer={
            <div className="flex items-center justify-between gap-2">
              {/* Unlink (correction path) — only when this roster is already
                  linked. Removes the canonical classroom_course_links mapping via
                  the unlinkClassroomCourse CF so a wrong/stale link can be fixed
                  without Firestore Console access. */}
              <div>
                {linkingRoster.googleClassroomCourseId && (
                  <button
                    onClick={() => void handleUnlink()}
                    disabled={isSaving || isUnlinking}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isUnlinking && (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    )}
                    {t('sidebar.classes.linkGoogleClassroom.unlink', {
                      defaultValue: 'Unlink',
                    })}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={closeLinkModal}
                  disabled={isSaving || isUnlinking}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  {t('common.cancel', { defaultValue: 'Cancel' })}
                </button>
                <button
                  onClick={() => void handleConfirmLink()}
                  disabled={!selectedCourseId || isSaving || isUnlinking}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-brand-blue-primary hover:bg-brand-blue-dark shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t('sidebar.classes.linkGoogleClassroom.confirm', {
                    defaultValue: 'Link Class',
                  })}
                </button>
              </div>
            </div>
          }
        >
          <div className="pb-2">
            <p className="text-sm text-slate-500 mb-4 leading-relaxed">
              {t('sidebar.classes.linkGoogleClassroom.description', {
                defaultValue:
                  'Choose the Google Classroom course to link with "{{name}}". Students launching from that course will be matched to this roster.',
                name: linkingRoster.name,
              })}
            </p>

            {courseLoadState === 'loading' && (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-400">
                <Loader2 className="w-7 h-7 animate-spin text-brand-blue-primary" />
                <p className="text-sm font-semibold">
                  {t('sidebar.classes.linkGoogleClassroom.loading', {
                    defaultValue: 'Loading your Google Classroom courses…',
                  })}
                </p>
              </div>
            )}

            {courseLoadState === 'error' && (
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-700">
                    {t('sidebar.classes.linkGoogleClassroom.errorTitle', {
                      defaultValue: 'Could not load courses',
                    })}
                  </p>
                  {courseLoadError && (
                    <p className="text-xs text-slate-400 mt-1 max-w-xs">
                      {courseLoadError}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => void loadCourses()}
                  className="mt-1 px-4 py-2 bg-brand-blue-primary text-white rounded-xl text-xxs font-bold uppercase tracking-wider hover:bg-brand-blue-dark shadow-sm transition-colors"
                >
                  {t('common.retry', { defaultValue: 'Try Again' })}
                </button>
              </div>
            )}

            {courseLoadState === 'loaded' && courses.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-400">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                  <GraduationCap className="w-6 h-6 text-slate-300" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-slate-600">
                    {t('sidebar.classes.linkGoogleClassroom.emptyTitle', {
                      defaultValue: 'No active courses found',
                    })}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5 max-w-xs">
                    {t('sidebar.classes.linkGoogleClassroom.emptySubtitle', {
                      defaultValue:
                        'You don’t teach any active Google Classroom courses on this account.',
                    })}
                  </p>
                </div>
              </div>
            )}

            {courseLoadState === 'loaded' && courses.length > 0 && (
              <div className="flex flex-col gap-2 max-h-80 overflow-y-auto custom-scrollbar -mx-1 px-1">
                {courses.map((course) => {
                  const isSelected = selectedCourseId === course.id;
                  return (
                    <button
                      key={course.id}
                      onClick={() => setSelectedCourseId(course.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'border-brand-blue-primary bg-brand-blue-lighter ring-1 ring-brand-blue-primary/20'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div
                        className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
                          isSelected
                            ? 'bg-brand-blue-primary text-white'
                            : 'bg-slate-100 text-slate-400'
                        }`}
                      >
                        <GraduationCap className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-slate-800 truncate">
                          {course.name}
                        </div>
                        {course.section && (
                          <div className="text-xs text-slate-400 truncate">
                            {course.section}
                          </div>
                        )}
                      </div>
                      {isSelected && (
                        <Check className="shrink-0 w-4 h-4 text-brand-blue-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
};
