import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useDashboard } from '@/context/useDashboard';
import { useBusyIdSet } from '@/hooks/useBusyIdSet';
import {
  AssignmentMode,
  MiniAppItem,
  MiniAppConfig,
  GlobalMiniAppItem,
  MiniAppAssignment,
  WidgetComponentProps,
} from '@/types';
import {
  LayoutGrid,
  Save,
  X,
  Link2,
  Copy,
  Check,
  BarChart3,
  Loader2,
  CheckCircle2,
  ExternalLink,
  Bookmark,
  QrCode,
} from 'lucide-react';
import { Z_INDEX } from '@/config/zIndex';
import { suggestDuplicateTitle } from '@/components/common/library/libraryDuplicate';
import { logError } from '@/utils/logError';
import { buildMiniAppExportFilename } from './exportFilename';
import { WidgetLayout } from '../WidgetLayout';
import { useAuth } from '@/context/useAuth';
import { useMiniAppSessionTeacher } from '@/hooks/useMiniAppSession';
import { useMiniAppAssignments } from '@/hooks/useMiniAppAssignments';
import { useFolders } from '@/hooks/useFolders';
import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  setDoc,
  deleteDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, functions } from '@/config/firebase';
import { httpsCallable } from 'firebase/functions';
import { AssignClassPicker } from '@/components/common/AssignClassPicker';
import {
  makeEmptyPickerValue,
  resolveSelectedRosters,
  type AssignClassPickerValue,
} from '@/components/common/AssignClassPicker.helpers';
import {
  deriveSessionTargetsFromRosters,
  mapLegacyClassIdsToRosterIds,
} from '@/utils/resolveAssignmentTargets';
import { AssignTargetingSection } from '@/components/common/library/AssignTargetingSection';
import {
  buildSetAssignmentTargetsPayload,
  EMPTY_ASSIGN_TARGETING_VALUE,
  type AssignTargetingValue,
} from '@/utils/studentTargetRef';
import type { StudentOverride, StudentTargetRef } from '@/types';
import { MiniAppEditorModal } from './components/MiniAppEditorModal';
import { AssignmentsModal } from './components/AssignmentsModal';
import { MiniAppManager } from './components/MiniAppManager';
import { SaveAsWidgetModal } from './components/SaveAsWidgetModal';
import { useMiniAppSync } from './hooks/useMiniAppSync';
import { useDialog } from '@/context/useDialog';
import { useSavedWidgets } from '@/context/useSavedWidgets';
import { ImportWizard } from '@/components/common/library/importer';
import {
  createMiniAppImportAdapter,
  type MiniAppImportData,
} from './adapters/miniAppImportAdapter';
import type { LibraryTab } from '@/components/common/library/types';

// --- M17 B3: setAssignmentTargetsV1 client caller ---
// Mirrors `functions/src/studentAssignmentTargets.ts` — kept local (not the
// shared `utils/studentTargetRef.ts`) so each B3 PR's save-wiring stays
// independent per the spec's "differ only in save-wiring" contract.
interface SetAssignmentTargetsParams {
  assignmentId: string;
  kind: 'quiz' | 'video-activity' | 'guided-learning' | 'mini-app';
  sessionId: string;
  add: StudentTargetRef[];
  remove: StudentTargetRef[];
  overridesBySourcedId: Record<string, StudentOverride | null>;
  window: {
    openAt?: number | null;
    closeAt?: number | null;
    dueAt?: number | null;
  };
  targetMode?: 'class' | 'students';
}
interface SetAssignmentTargetsResult {
  written: number;
  removed: number;
  skipped: { ref: StudentTargetRef; reason: string }[];
}

// --- ASSIGN / SHARE MODAL ---
interface MiniAppAssignModalProps {
  appTitle: string;
  assignmentName: string;
  onNameChange: (name: string) => void;
  isCreating: boolean;
  createdSessionId: string | null;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
  /** Rosters available for targeting (unified picker). */
  rosters: import('@/types').ClassRoster[];
  /** Current picker selection. */
  pickerValue: AssignClassPickerValue;
  onPickerChange: (next: AssignClassPickerValue) => void;
  /** Org-wide mode. Drives the modal copy (Assign vs Share) and whether the
   *  underlying session is created with submissions enabled. */
  mode: AssignmentMode;
  /** M17 B3 — schedule + individual-student targeting (spec §5 B3, §4). */
  targetingValue: AssignTargetingValue;
  onTargetingChange: (next: AssignTargetingValue) => void;
  /** M17 B3 — names of students `setAssignmentTargetsV1` could not target,
   *  surfaced after creation so a skip is never silent (spec §5 B3(4)). */
  skippedStudentNames: string[];
}

const MiniAppAssignModal: React.FC<MiniAppAssignModalProps> = ({
  appTitle,
  assignmentName,
  onNameChange,
  isCreating,
  createdSessionId,
  error,
  onConfirm,
  onClose,
  rosters,
  pickerValue,
  onPickerChange,
  mode,
  targetingValue,
  onTargetingChange,
  skippedStudentNames,
}) => {
  const isViewOnly = mode === 'view-only';
  const link = createdSessionId
    ? `${window.location.origin}/miniapp/${createdSessionId}`
    : null;
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="absolute inset-0 z-overlay bg-brand-blue-dark/60 backdrop-blur-sm flex items-center justify-center"
      style={{ padding: 'min(16px, 4cqmin)' }}
    >
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div
          className={`flex items-center justify-between ${createdSessionId ? 'bg-emerald-600' : 'bg-brand-blue-primary'}`}
          style={{ padding: 'min(16px, 4cqmin)' }}
        >
          <div
            className="flex items-center text-white"
            style={{ gap: 'min(8px, 2cqmin)' }}
          >
            {createdSessionId ? (
              <CheckCircle2
                style={{
                  width: 'min(20px, 6cqmin)',
                  height: 'min(20px, 6cqmin)',
                }}
              />
            ) : (
              <Link2
                style={{
                  width: 'min(20px, 6cqmin)',
                  height: 'min(20px, 6cqmin)',
                }}
              />
            )}
            <span className="font-black uppercase tracking-tight">
              {createdSessionId
                ? isViewOnly
                  ? 'Share Link Ready'
                  : 'Assignment Created'
                : isViewOnly
                  ? 'Share'
                  : 'Assign'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors"
          >
            <X
              style={{
                width: 'min(20px, 6cqmin)',
                height: 'min(20px, 6cqmin)',
              }}
            />
          </button>
        </div>

        <div style={{ padding: 'min(20px, 5cqmin)' }} className="space-y-4">
          {createdSessionId && link ? (
            /* Post-creation: show link */
            <>
              <div className="text-center">
                <p
                  className="font-bold text-brand-blue-dark truncate"
                  style={{
                    fontSize: 'min(16px, 6cqmin)',
                    paddingLeft: 'min(8px, 2cqmin)',
                    paddingRight: 'min(8px, 2cqmin)',
                  }}
                >
                  {assignmentName}
                </p>
              </div>
              <p
                className="text-slate-600 text-center"
                style={{ fontSize: 'min(14px, 5.5cqmin)' }}
              >
                Share this link with your students. They&apos;ll interact with
                the app immediately.
              </p>
              {skippedStudentNames.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs font-bold text-amber-800">
                    Couldn&apos;t target {skippedStudentNames.length} student
                    {skippedStudentNames.length === 1 ? '' : 's'}
                  </p>
                  <ul className="mt-1 text-xs text-amber-700 list-disc list-inside">
                    {skippedStudentNames.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div
                className="bg-slate-50 border border-slate-200 rounded-xl break-all text-slate-700 font-mono"
                style={{
                  padding: 'min(12px, 3cqmin)',
                  fontSize: 'min(12px, 4.5cqmin)',
                }}
              >
                {link}
              </div>
              <div className="grid" style={{ gap: 'min(8px, 2cqmin)' }}>
                <button
                  onClick={() => void handleCopy()}
                  className="w-full flex items-center justify-center bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold rounded-xl transition-all active:scale-95 shadow-sm"
                  style={{
                    gap: 'min(8px, 2cqmin)',
                    paddingTop: 'min(12px, 3cqmin)',
                    paddingBottom: 'min(12px, 3cqmin)',
                    fontSize: 'min(14px, 5.5cqmin)',
                  }}
                >
                  {copied ? (
                    <>
                      <Check
                        style={{
                          width: 'min(16px, 5cqmin)',
                          height: 'min(16px, 5cqmin)',
                        }}
                      />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy
                        style={{
                          width: 'min(16px, 5cqmin)',
                          height: 'min(16px, 5cqmin)',
                        }}
                      />
                      Copy Link
                    </>
                  )}
                </button>
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                  style={{
                    gap: 'min(8px, 2cqmin)',
                    paddingTop: 'min(12px, 3cqmin)',
                    paddingBottom: 'min(12px, 3cqmin)',
                    fontSize: 'min(14px, 5.5cqmin)',
                  }}
                >
                  <ExternalLink
                    style={{
                      width: 'min(16px, 5cqmin)',
                      height: 'min(16px, 5cqmin)',
                    }}
                  />
                  Open in New Tab
                </a>
              </div>
            </>
          ) : (
            /* Pre-creation: zero form fields in view-only; name input + class
               picker in submissions. */
            <>
              <div className="text-center">
                <p
                  className="font-bold text-brand-blue-dark truncate"
                  style={{
                    fontSize: 'min(16px, 6cqmin)',
                    paddingLeft: 'min(8px, 2cqmin)',
                    paddingRight: 'min(8px, 2cqmin)',
                  }}
                >
                  {appTitle}
                </p>
                <p
                  className="text-brand-blue-primary/60 font-black uppercase tracking-widest"
                  style={{
                    marginTop: 'min(4px, 1cqmin)',
                    fontSize: 'min(12px, 4.5cqmin)',
                  }}
                >
                  {isViewOnly ? 'Create Share Link' : 'Create Assignment Link'}
                </p>
              </div>
              {isViewOnly ? (
                /* View-only: zero form fields. Class targeting has no effect
                   (rules don't gate views by class; sessions are filtered out
                   of /my-assignments anyway). The auto-generated share name
                   is used behind the scenes for the Shared archive — teachers
                   can rename later from the archive's overflow menu. */
                <p
                  className="text-slate-600 text-center"
                  style={{ fontSize: 'min(14px, 5.5cqmin)' }}
                >
                  Anyone with the link can view this app. No submissions are
                  collected — view counts appear in the Shared archive.
                </p>
              ) : (
                <>
                  <p
                    className="text-slate-600 text-center"
                    style={{ fontSize: 'min(14px, 5.5cqmin)' }}
                  >
                    Name this assignment, then share the generated link with
                    students.
                  </p>
                  <div
                    className="bg-slate-50 border border-slate-200 rounded-xl"
                    style={{ padding: 'min(12px, 3cqmin)' }}
                  >
                    <label
                      htmlFor="miniapp-assignment-name"
                      className="block font-bold text-slate-700"
                      style={{
                        fontSize: 'min(14px, 5.5cqmin)',
                        marginBottom: 'min(6px, 1.5cqmin)',
                      }}
                    >
                      Assignment Name
                    </label>
                    <input
                      id="miniapp-assignment-name"
                      type="text"
                      value={assignmentName}
                      onChange={(e) => onNameChange(e.target.value)}
                      placeholder="1st period"
                      className="w-full rounded-xl border border-slate-200 font-medium text-slate-700 outline-none focus:border-brand-blue-primary"
                      style={{
                        paddingLeft: 'min(12px, 3cqmin)',
                        paddingRight: 'min(12px, 3cqmin)',
                        paddingTop: 'min(8px, 2cqmin)',
                        paddingBottom: 'min(8px, 2cqmin)',
                        fontSize: 'min(14px, 5.5cqmin)',
                      }}
                    />
                  </div>
                  <div
                    className="bg-slate-50 border border-slate-200 rounded-xl"
                    style={{ padding: 'min(12px, 3cqmin)' }}
                  >
                    <AssignClassPicker
                      rosters={rosters}
                      value={pickerValue}
                      onChange={onPickerChange}
                    />
                    <p
                      className="text-slate-500"
                      style={{
                        fontSize: 'min(11px, 4cqmin)',
                        marginTop: 'min(8px, 2cqmin)',
                      }}
                    >
                      Enrolled students will see this in their assignments list.
                      Leave unselected to share the link directly.
                    </p>
                  </div>
                  <AssignTargetingSection
                    rosters={rosters}
                    value={targetingValue}
                    onChange={onTargetingChange}
                    kind="mini-app"
                    showDueAt
                  />
                </>
              )}
              {error && (
                <p
                  className="text-brand-red-primary text-center font-medium"
                  style={{ fontSize: 'min(14px, 5.5cqmin)' }}
                >
                  {error}
                </p>
              )}
              <button
                onClick={onConfirm}
                disabled={
                  isCreating ||
                  (!isViewOnly && assignmentName.trim().length === 0)
                }
                className="w-full flex items-center justify-center bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold rounded-xl transition-all active:scale-95 shadow-sm disabled:opacity-60"
                style={{
                  gap: 'min(8px, 2cqmin)',
                  paddingTop: 'min(12px, 3cqmin)',
                  paddingBottom: 'min(12px, 3cqmin)',
                  fontSize: 'min(14px, 5.5cqmin)',
                }}
              >
                {isCreating ? (
                  <Loader2
                    style={{
                      width: 'min(16px, 5cqmin)',
                      height: 'min(16px, 5cqmin)',
                    }}
                    className="animate-spin"
                  />
                ) : (
                  <Link2
                    style={{
                      width: 'min(16px, 5cqmin)',
                      height: 'min(16px, 5cqmin)',
                    }}
                  />
                )}
                {isCreating
                  ? 'Creating…'
                  : isViewOnly
                    ? 'Create Share Link'
                    : 'Create Assignment Link'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// --- MAIN WIDGET COMPONENT ---
export const MiniAppWidget: React.FC<WidgetComponentProps> = ({
  widget,
  isStudentView,
}) => {
  const {
    updateWidget,
    addToast,
    rosters,
    addWidget,
    selectedWidgetId,
    isActiveBoardReadOnly,
  } = useDashboard();
  const { user, getAssignmentMode } = useAuth();
  const assignmentMode: AssignmentMode = getAssignmentMode('miniApp');
  const { showConfirm } = useDialog();
  const { saveSavedWidget } = useSavedWidgets();
  const config = (widget.config ?? {}) as MiniAppConfig;
  const activeApp = config.activeApp ?? null;

  const {
    createSession,
    sessions,
    sessionsLoading,
    subscribeToAppSessions,
    unsubscribeFromAppSessions,
    renameSession,
    endSession,
  } = useMiniAppSessionTeacher();

  const { library, globalLibrary } = useMiniAppSync(addToast);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [managerTab, setManagerTab] = useState<LibraryTab>('library');
  const [savingGlobalId, setSavingGlobalId] = useState<string | null>(null);
  const [showImportWizard, setShowImportWizard] = useState(false);
  // Shared rapid-click guard. See `hooks/useBusyIdSet.ts`.
  const duplicateBusy = useBusyIdSet();

  // Per-teacher MiniApp assignment archive — populates the In Progress /
  // Archive tabs. Lives in `/users/{uid}/miniapp_assignments/`.
  const {
    assignments,
    loading: assignmentsLoading,
    createAssignment,
    endAssignment,
    reactivateAssignment,
    deleteAssignment,
    setTargetSkippedCount,
  } = useMiniAppAssignments(user?.uid);

  // Assign flow state
  const [assigningApp, setAssigningApp] = useState<MiniAppItem | null>(null);
  const [assignmentName, setAssignmentName] = useState('');
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignPickerValue, setAssignPickerValue] =
    useState<AssignClassPickerValue>(makeEmptyPickerValue());
  const [assignmentsForApp, setAssignmentsForApp] =
    useState<MiniAppItem | null>(null);
  // M17 B3 — schedule + individual-student targeting (spec §5 B3).
  const [assignTargetingValue, setAssignTargetingValue] =
    useState<AssignTargetingValue>(EMPTY_ASSIGN_TARGETING_VALUE);
  const [skippedStudentNames, setSkippedStudentNames] = useState<string[]>([]);

  const buildDefaultAssignmentName = (appTitle: string) => {
    const formatted = new Date().toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    return `${appTitle} — ${formatted}`;
  };

  const handleOpenAssign = (app: MiniAppItem) => {
    setAssigningApp(app);
    setAssignmentName(buildDefaultAssignmentName(app.title));
    setCreatedSessionId(null);
    setAssignError(null);
    setAssignTargetingValue(EMPTY_ASSIGN_TARGETING_VALUE);
    setSkippedStudentNames([]);
    // Pre-populate the roster picker with the teacher's last selection for
    // this app. Prefer unified roster memory; fall back to the legacy
    // ClassLink-sourcedId map so teachers upgrading from pre-unification
    // configs keep their preselection.
    let lastRosterIds = config.lastRosterIdsByAppId?.[app.id] ?? [];
    if (lastRosterIds.length === 0) {
      lastRosterIds = mapLegacyClassIdsToRosterIds(
        config.lastClassIdsByAppId?.[app.id],
        rosters
      );
    }
    setAssignPickerValue({ rosterIds: lastRosterIds });
  };

  const handleOpenAssignments = (app: MiniAppItem) => {
    setAssignmentsForApp(app);
  };

  const handleCloseAssignments = () => {
    setAssignmentsForApp(null);
  };

  // Subscribe to sessions only when the Assignments modal is open. The
  // previous `?? activeApp?.id` fallback kept this listener live whenever a
  // teacher had ever opened a mini-app (since `activeApp` is persisted in
  // `widget.config.activeApp`), producing constant `mini_app_sessions`
  // listener traffic and "requires an index" console spam for users who
  // never open the Assignments modal.
  const targetAppId = assignmentsForApp?.id;
  useEffect(() => {
    if (!user?.uid || !targetAppId) {
      unsubscribeFromAppSessions();
      return;
    }
    subscribeToAppSessions(targetAppId, user.uid);
    return () => unsubscribeFromAppSessions();
  }, [
    targetAppId,
    user?.uid,
    subscribeToAppSessions,
    unsubscribeFromAppSessions,
  ]);

  const handleConfirmAssign = async () => {
    if (!user || !assigningApp) return;
    setIsCreatingSession(true);
    setAssignError(null);
    try {
      // Resolve the picker selection against current rosters — dropped IDs
      // (deleted) or rosters that failed to load students from Drive
      // (`loadError`) are silently filtered so we never produce a session
      // with zero PINs that no student can join.
      const selectedRosters = resolveSelectedRosters(
        assignPickerValue,
        rosters
      ).filter((r) => !r.loadError);
      const derived = deriveSessionTargetsFromRosters(selectedRosters);

      // NOTE ON GATING ASYMMETRY: `mini_app_sessions` Firestore rules use
      // `passesStudentClassGateList`, which treats an empty `classIds[]` as
      // "open to any student-role user." This means local-only rosters (no
      // `classlinkClassId` metadata) still let any SSO student see the
      // session — matching today's behavior. For the strict-gate collections
      // (quiz, video activity, guided learning), empty classIds block SSO
      // students entirely; PIN-joining students still pass.
      // Mode is locked org-wide by the admin and frozen onto the session at
      // creation. The session/assignment hooks derive `submissionsEnabled`
      // from `mode` so the two fields can never diverge.
      // M17 B3 — individual-student targeting is orthogonal to the roster
      // picker: `targetMode:'students'` narrows delivery to the picked
      // students within the targeted rosters, and the Schedule window
      // applies regardless of targeting mode (spec Decision 5/§3a-G).
      const isIndividualTargeting =
        assignTargetingValue.targetMode === 'students';
      const sessionId = await createSession(
        assigningApp,
        user.uid,
        assignmentName,
        {
          classIds: derived.classIds,
          rosterIds: derived.rosterIds,
          mode: assignmentMode,
          openAt: assignTargetingValue.openAt ?? null,
          closeAt: assignTargetingValue.closeAt ?? null,
          dueAt: assignTargetingValue.dueAt ?? null,
        }
      );
      // Mirror the new session into the per-teacher archive so it shows up
      // in the In Progress / Archive tabs. Failures here are non-fatal —
      // the session itself still exists. NOTE: only roster-level targeting
      // (`rosterIds`) is mirrored; `classIds` lives on the session doc for
      // the student SSO gate, matching the Quiz/VA/GL assignment shape.
      let assignmentId: string | null = null;
      try {
        assignmentId = await createAssignment({
          sessionId,
          app: { id: assigningApp.id, title: assigningApp.title },
          assignmentName,
          rosterIds: derived.rosterIds,
          mode: assignmentMode,
          targetMode: assignTargetingValue.targetMode,
          targetGroupIds: assignTargetingValue.targetGroupIds,
          overridesBySourcedId: assignTargetingValue.overridesByKey,
          dueAt: assignTargetingValue.dueAt ?? null,
          openAt: assignTargetingValue.openAt ?? null,
          closeAt: assignTargetingValue.closeAt ?? null,
        });
      } catch (archiveErr) {
        console.warn(
          '[MiniAppWidget] Failed to archive assignment',
          archiveErr
        );
      }

      // Fan out per-student pointer docs. Only invoked when the teacher
      // actually used individual targeting — `targetMode:'class'` never
      // touches the Cloud Function, keeping the class-wide flow's click
      // count and latency unchanged from today (spec §3a-G).
      if (isIndividualTargeting && assignmentId) {
        try {
          const payload = buildSetAssignmentTargetsPayload(
            undefined,
            assignTargetingValue
          );
          const setAssignmentTargets = httpsCallable<
            SetAssignmentTargetsParams,
            SetAssignmentTargetsResult
          >(functions, 'setAssignmentTargetsV1');
          const result = await setAssignmentTargets({
            assignmentId,
            kind: 'mini-app',
            sessionId,
            ...payload,
          });
          const skipped = result.data.skipped ?? [];
          if (skipped.length > 0) {
            // Durability: persist a plain PII-free count onto the teacher's
            // own assignment doc so the "N skipped" marker survives beyond
            // this toast/modal session (canonical B3 skipped-ref rule).
            // Best-effort — the toast below still surfaces the names now
            // regardless of whether this write succeeds.
            try {
              await setTargetSkippedCount(assignmentId, skipped.length);
            } catch (persistErr) {
              console.warn(
                '[MiniAppWidget] Failed to persist targetSkippedCount',
                persistErr
              );
            }
            // Names, not raw refs — resolve via the same student index the
            // targeting section already built, so the teacher sees who was
            // dropped rather than an opaque sourcedId/email (spec §5 B3(4)).
            const nameByKey = new Map<string, string>();
            for (const roster of rosters) {
              for (const student of roster.students) {
                if (student.classLinkSourcedId) {
                  nameByKey.set(
                    `classlink:${student.classLinkSourcedId}`,
                    `${student.firstName} ${student.lastName}`.trim()
                  );
                } else if (roster.testClassId && student.email) {
                  nameByKey.set(
                    `test:${student.email.toLowerCase()}`,
                    `${student.firstName} ${student.lastName}`.trim()
                  );
                }
              }
            }
            const names = skipped.map(({ ref }) => {
              const key =
                ref.kind === 'classlink'
                  ? `classlink:${ref.sourcedId}`
                  : `test:${ref.email.toLowerCase()}`;
              return nameByKey.get(key) ?? key;
            });
            setSkippedStudentNames(names);
            addToast(
              `Assignment created, but ${names.length} student${names.length === 1 ? ' was' : 's were'} not targeted — see the assignment dialog.`,
              'error'
            );
          }
        } catch (targetErr) {
          console.error(
            '[MiniAppWidget] Failed to set individual assignment targets',
            targetErr
          );
          addToast(
            'Assignment created, but individual student targeting failed to apply. Edit the assignment to retry.',
            'error'
          );
        }
      }
      // Remember the teacher's roster picker selection for next time. The
      // legacy `lastSubmissionsEnabledByAppId` per-assignment toggle is
      // intentionally no longer written — submissions/view-only is now an
      // org-wide admin setting (see GlobalPermissionsManager).
      try {
        const prevRosters = config.lastRosterIdsByAppId ?? {};
        const nextRosters: Record<string, string[]> = { ...prevRosters };
        if (derived.rosterIds.length > 0) {
          nextRosters[assigningApp.id] = derived.rosterIds;
        } else {
          delete nextRosters[assigningApp.id];
        }
        updateWidget(widget.id, {
          config: {
            ...config,
            lastRosterIdsByAppId: nextRosters,
          } as MiniAppConfig,
        });
      } catch (cfgErr) {
        console.warn(
          '[MiniAppWidget] Failed to persist last-assign config',
          cfgErr
        );
      }
      setCreatedSessionId(sessionId);
      const url = `${window.location.origin}/miniapp/${sessionId}`;
      const successCopy =
        assignmentMode === 'view-only'
          ? 'Share link copied to clipboard!'
          : 'Assignment link copied to clipboard!';
      const fallbackCopy =
        assignmentMode === 'view-only'
          ? `Share link created! URL: ${url}`
          : `Assignment created! URL: ${url}`;
      try {
        await navigator.clipboard.writeText(url);
        addToast(successCopy, 'success');
      } catch {
        addToast(fallbackCopy, 'info');
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to create assignment.';
      setAssignError(message);
      // Also surface as a toast so the user sees the failure even if they
      // dismissed the modal mid-error. Matches the Quiz / GL widgets'
      // outer-error UX.
      addToast(message, 'error');
    } finally {
      setIsCreatingSession(false);
    }
  };
  const [editingApp, setEditingApp] = useState<MiniAppItem | null>(null);

  const { folders: miniAppFolders, moveItem: moveMiniAppItem } = useFolders(
    user?.uid,
    'miniapp'
  );

  // Unsaved paste state: shown as an overlay when activeAppUnsaved is true
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [pendingSaveTitle, setPendingSaveTitle] = useState('');

  // "Save as Widget" — surface the active mini app as a one-tap shortcut in
  // the user's dock + Widget Library. Distinct from `showSaveForm` (which
  // saves an unsaved-paste app to the user's Mini App library).
  const [showSaveAsWidget, setShowSaveAsWidget] = useState(false);
  const [isSavingAsWidget, setIsSavingAsWidget] = useState(false);

  const handleSaveAsWidget = useCallback(
    async (values: { title: string; icon: string; color: string }) => {
      if (!activeApp) return;
      setIsSavingAsWidget(true);
      try {
        await saveSavedWidget({
          widgetType: 'miniApp',
          title: values.title,
          icon: values.icon,
          color: values.color,
          pinnedToDock: true,
          // Snapshot the mini app so the saved widget keeps working even if
          // the original library entry is renamed or deleted. Keep the
          // original `title` on the MiniAppItem so the assignment flow,
          // session names, and the in-widget chrome still show the app's
          // real name — `values.title` is the *widget shortcut* label, not
          // the mini app's name.
          config: {
            activeApp: {
              id: activeApp.id,
              title: activeApp.title,
              html: activeApp.html,
              createdAt: activeApp.createdAt,
            },
          },
        });
        addToast(`"${values.title}" added to your dock!`, 'success');
        setShowSaveAsWidget(false);
      } catch (err) {
        console.error('[MiniAppWidget] Failed to save as widget', err);
        addToast('Failed to save widget', 'error');
      } finally {
        setIsSavingAsWidget(false);
      }
    },
    [activeApp, saveSavedWidget, addToast]
  );

  // --- FLOATING TOOLBAR ANCHORING ---
  // The running-mode action toolbar lives in a portal under <body> so it
  // never overlaps the iframe content (the old hover-revealed buttons sat
  // on top of the app). Pattern copied from EmbedWidget — same rect-tracking
  // observers, but no hover gating: the toolbar is always visible while a
  // mini app is running because hover doesn't reliably fire on touch.
  const runningContentRef = useRef<HTMLDivElement | null>(null);
  const [widgetEl, setWidgetEl] = useState<HTMLElement | null>(null);
  const [widgetRect, setWidgetRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const el =
      runningContentRef.current?.closest<HTMLElement>(
        `[data-widget-id="${widget.id}"]`
      ) ?? null;
    setWidgetEl(el);
    if (el) setWidgetRect(el.getBoundingClientRect());
  }, [widget.id, activeApp]);

  const updateWidgetRect = useCallback(() => {
    if (!widgetEl) return;
    setWidgetRect(widgetEl.getBoundingClientRect());
  }, [widgetEl]);

  useEffect(() => {
    if (!widgetEl) return;
    updateWidgetRect();

    // Coalesce all rect updates into one per animation frame. DraggableWindow
    // updates inline `transform`/`left`/`top` on every pointermove during
    // drag, which would otherwise trigger a synchronous getBoundingClientRect
    // + setState + re-render at pointer rate.
    let rafId: number | null = null;
    const scheduleUpdate = () => {
      if (rafId != null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        updateWidgetRect();
      });
    };

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(widgetEl);

    const mutationObserver = new MutationObserver(scheduleUpdate);
    mutationObserver.observe(widgetEl, {
      attributes: true,
      attributeFilter: ['style'],
    });

    window.addEventListener('scroll', scheduleUpdate, true);
    window.addEventListener('resize', scheduleUpdate);

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('scroll', scheduleUpdate, true);
      window.removeEventListener('resize', scheduleUpdate);
      if (rafId != null) window.cancelAnimationFrame(rafId);
    };
  }, [widgetEl, updateWidgetRect]);

  // --- QR SHARE ---
  // Tap the QR icon to one-shot create a view-only share session and spawn
  // a QR-code widget pre-loaded with the student URL. Always view-only,
  // regardless of the widget's admin-configured assignmentMode — the QR
  // flow is inherently a "students view on iPads" use case.
  const [isCreatingQrShare, setIsCreatingQrShare] = useState(false);

  const handleCreateQrShare = useCallback(async () => {
    if (!user) {
      addToast('Sign in to create a share link', 'info');
      return;
    }
    if (!activeApp) return;
    if (isCreatingQrShare) return;
    setIsCreatingQrShare(true);
    try {
      const sessionId = await createSession(activeApp, user.uid, '', {
        mode: 'view-only',
      });
      // Mirror into the per-teacher archive so this share appears in the
      // Shared tab and can be renamed / ended / reactivated later from the
      // library UI. Matches the handleConfirmAssign flow above. Failures
      // here are non-fatal — the session itself still exists.
      try {
        await createAssignment({
          sessionId,
          app: { id: activeApp.id, title: activeApp.title },
          assignmentName: '',
          mode: 'view-only',
        });
      } catch (archiveErr) {
        console.warn(
          '[MiniAppWidget] Failed to archive QR share assignment',
          archiveErr
        );
      }
      const url = `${window.location.origin}/miniapp/${sessionId}`;
      addWidget('qr', { config: { url, showUrl: true } });
      addToast('Share link ready — students can scan the QR code', 'success');
    } catch (err) {
      console.error('[MiniAppWidget] Failed to create QR share', err);
      addToast('Could not create share link', 'error');
    } finally {
      setIsCreatingQrShare(false);
    }
  }, [
    user,
    activeApp,
    isCreatingQrShare,
    createSession,
    createAssignment,
    addWidget,
    addToast,
  ]);

  // --- HANDLERS ---

  const handleRun = (app: MiniAppItem) => {
    updateWidget(widget.id, {
      config: { ...config, activeApp: app },
    });
  };

  const handleCloseActive = () => {
    updateWidget(widget.id, {
      config: { ...config, activeApp: null, activeAppUnsaved: false },
    });
  };

  const handleSavePasted = async () => {
    if (!user || !activeApp) return;
    const title =
      pendingSaveTitle.trim() || (activeApp.title ?? 'Untitled App');
    try {
      const id = activeApp.id;
      const appsRef = collection(db, 'users', user.uid, 'miniapps');
      const appData: MiniAppItem = {
        id,
        title,
        html: activeApp.html,
        createdAt: activeApp.createdAt,
        order:
          library.length > 0
            ? library.reduce((min, a) => Math.min(min, a.order ?? 0), 0) - 1
            : 0,
      };
      await setDoc(doc(appsRef, id), appData);
      // Clear unsaved flag and update title
      updateWidget(widget.id, {
        config: {
          ...config,
          activeApp: { ...activeApp, title },
          activeAppUnsaved: false,
        },
      });
      setShowSaveForm(false);
      setPendingSaveTitle('');
      addToast(`"${title}" saved to library!`, 'success');
    } catch (err) {
      console.error(err);
      addToast('Failed to save app', 'error');
    }
  };

  const handleCreate = () => {
    setEditingApp({
      id: crypto.randomUUID(),
      title: '',
      html: '',
      createdAt: Date.now(),
      order:
        library.length > 0
          ? library.reduce((min, a) => Math.min(min, a.order ?? 0), 0) - 1
          : 0,
    });
  };

  const handleEdit = (app: MiniAppItem) => {
    setEditingApp({ ...app });
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    const confirmed = await showConfirm('Delete this app from your library?', {
      title: 'Delete App',
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    if (confirmed) {
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'miniapps', id));
        addToast('App deleted', 'info');
      } catch (err) {
        console.error(err);
        addToast('Delete failed', 'error');
      }
    }
  };

  /**
   * Phase 5 — duplicate a mini-app. MiniApps are Firestore-only (no
   * Drive backing), so this is a simple deep-clone + new id + suggested
   * title. Ordering uses the same "new items go to the front" rule that
   * `handleCreate` uses, so the duplicate appears at the top of the
   * personal library where the teacher just acted.
   */
  const handleDuplicate = (app: MiniAppItem) => {
    if (!user) return;
    void duplicateBusy.run(app.id, async () => {
      try {
        const copy: MiniAppItem = {
          ...app,
          id: crypto.randomUUID(),
          title: suggestDuplicateTitle(app.title),
          createdAt: Date.now(),
          order:
            library.length > 0
              ? library.reduce((min, a) => Math.min(min, a.order ?? 0), 0) - 1
              : 0,
        };
        const appsRef = collection(db, 'users', user.uid, 'miniapps');
        await setDoc(doc(appsRef, copy.id), copy);
        addToast(`Duplicated as "${copy.title}".`, 'success');
      } catch (err) {
        logError('MiniAppWidget.handleDuplicate', err, {
          userId: user.uid,
          sourceAppId: app.id,
        });
        addToast(
          err instanceof Error ? err.message : 'Duplicate failed',
          'error'
        );
      }
    });
  };

  const saveMiniApp = async (updated: MiniAppItem) => {
    if (!user) throw new Error('Not authenticated');
    const existing = library.find((a) => a.id === updated.id);
    const appData: MiniAppItem = {
      ...updated,
      createdAt: existing?.createdAt ?? updated.createdAt,
      order: existing?.order ?? updated.order ?? 0,
    };
    const docRef = doc(db, 'users', user.uid, 'miniapps', appData.id);
    await setDoc(docRef, appData);
    addToast('App saved to cloud', 'success');
  };

  const handleReorder = useCallback(
    async (nextOrderedIds: string[]) => {
      if (!user) return;

      const byId = new Map(library.map((a) => [a.id, a]));
      const orderedIdSet = new Set(nextOrderedIds);
      const reordered: MiniAppItem[] = [];
      for (const id of nextOrderedIds) {
        const app = byId.get(id);
        if (app) reordered.push(app);
      }
      // Append any library items whose ids weren't in the requested ordering
      // (defensive — should not happen, but keeps data consistent). Using a
      // Set keeps this O(n) even if the teacher's library grows large.
      for (const app of library) {
        if (!orderedIdSet.has(app.id)) reordered.push(app);
      }

      const batch = writeBatch(db);
      reordered.forEach((app, index) => {
        const docRef = doc(db, 'users', user.uid, 'miniapps', app.id);
        batch.set(docRef, { ...app, order: index });
      });

      try {
        await batch.commit();
      } catch (err) {
        console.error('Failed to save reorder', err);
        addToast('Failed to save order', 'error');
      }
    },
    [library, user, addToast]
  );

  const handleSaveToLibrary = async (app: GlobalMiniAppItem) => {
    if (!user) return;
    if (library.some((a) => a.title === app.title && a.html === app.html)) {
      addToast('App is already in your library', 'info');
      return;
    }
    setSavingGlobalId(app.id);
    try {
      const id = crypto.randomUUID() as string;
      const appsRef = collection(db, 'users', user.uid, 'miniapps');
      const appData: MiniAppItem = {
        id,
        title: app.title,
        html: app.html,
        createdAt: Date.now(),
        order: library.length,
      };
      await setDoc(doc(appsRef, id), appData);
      addToast(`"${app.title}" added to your library`, 'success');
    } catch (err) {
      console.error(err);
      addToast('Failed to save app', 'error');
    } finally {
      setSavingGlobalId(null);
    }
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(library, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildMiniAppExportFilename();
    a.click();
    URL.revokeObjectURL(url);
    addToast('Library exported successfully', 'success');
  };

  // Ends a session from the AssignmentsModal and keeps the miniapp_assignments
  // archive row in sync. If an active assignment row already exists for the
  // session, endAssignment handles both the row and the session doc. For old
  // sessions that predate the miniapp_assignments collection (no row exists),
  // we fall back to ending the session doc directly so the student's
  // /my-assignments view clears immediately.
  //
  // The local `assignments` snapshot can be stale (still loading, or the
  // row was just created and the listener hasn't fired yet). When the
  // local lookup misses we re-query Firestore by sessionId before falling
  // back to a bare `endSession`, otherwise the archive row could stay
  // stuck as `active` even though the session ended.
  const handleEndSessionFromModal = useCallback(
    async (sessionId: string) => {
      const localMatch = assignments.find(
        (a) => a.sessionId === sessionId && a.status === 'active'
      );
      if (localMatch) {
        await endAssignment(localMatch.id);
        return;
      }

      if (user?.uid) {
        try {
          const snap = await getDocs(
            query(
              collection(db, 'users', user.uid, 'miniapp_assignments'),
              where('sessionId', '==', sessionId),
              where('status', '==', 'active'),
              limit(1)
            )
          );
          const row = snap.docs[0];
          if (row) {
            await endAssignment(row.id);
            return;
          }
        } catch (err) {
          // Fall through to endSession; logging only.
          console.warn(
            '[MiniAppWidget] miniapp_assignments lookup failed; ending session directly',
            err
          );
        }
      }

      await endSession(sessionId);
    },
    [endSession, endAssignment, assignments, user?.uid]
  );

  // Archive / In Progress handlers ─────────────────────────────────────────
  const handleArchiveCopyUrl = useCallback(
    async (assignment: MiniAppAssignment) => {
      const url = `${window.location.origin}/miniapp/${assignment.sessionId}`;
      try {
        await navigator.clipboard.writeText(url);
        addToast('Link copied to clipboard', 'success');
      } catch {
        addToast(`Link: ${url}`, 'info');
      }
    },
    [addToast]
  );

  const handleArchiveEnd = useCallback(
    async (assignment: MiniAppAssignment) => {
      // Branch all of the user-visible copy on the assignment's frozen mode.
      // For view-only shares "submit" is the wrong verb (no submissions are
      // collected) and "Assignment" is the wrong noun (it's a tracked link).
      const isViewOnlyAssignment = assignment.mode === 'view-only';
      const confirmed = await showConfirm(
        isViewOnlyAssignment
          ? `End "${assignment.assignmentName}"? The link will stop working.`
          : `End "${assignment.assignmentName}"? Students will no longer be able to submit.`,
        {
          title: isViewOnlyAssignment ? 'End share' : 'End Assignment',
          variant: 'danger',
          confirmLabel: 'End',
        }
      );
      if (!confirmed) return;
      try {
        await endAssignment(assignment.id);
        addToast(
          isViewOnlyAssignment ? 'Share ended' : 'Assignment ended',
          'info'
        );
      } catch (err) {
        console.error(err);
        addToast(
          isViewOnlyAssignment
            ? 'Failed to end share'
            : 'Failed to end assignment',
          'error'
        );
      }
    },
    [endAssignment, showConfirm, addToast]
  );

  const handleArchiveReactivate = useCallback(
    async (assignment: MiniAppAssignment) => {
      try {
        await reactivateAssignment(assignment.id);
        addToast('Share reactivated', 'success');
      } catch (err) {
        console.error(err);
        addToast('Failed to reactivate share', 'error');
      }
    },
    [reactivateAssignment, addToast]
  );

  const handleArchiveDelete = useCallback(
    async (assignment: MiniAppAssignment) => {
      const confirmed = await showConfirm(
        `Delete "${assignment.assignmentName}" from the archive?`,
        {
          title: 'Delete Assignment',
          variant: 'danger',
          confirmLabel: 'Delete',
        }
      );
      if (!confirmed) return;
      try {
        await deleteAssignment(assignment.id);
        addToast('Assignment deleted', 'info');
      } catch (err) {
        console.error(err);
        addToast('Failed to delete assignment', 'error');
      }
    },
    [deleteAssignment, showConfirm, addToast]
  );

  // Import Wizard adapter (rebuilt per user so save() closes over uid).
  const importAdapter = React.useMemo(() => {
    if (!user?.uid) return null;
    return createMiniAppImportAdapter(user.uid);
  }, [user?.uid]);

  const handleImportSaved = useCallback(() => {
    addToast('Mini-apps imported', 'success');
  }, [addToast]);

  // --- RENDER: RUNNING MODE ---
  if (activeApp) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <div
            ref={runningContentRef}
            className="w-full h-full flex flex-col relative overflow-hidden"
          >
            {!isStudentView &&
              widgetRect &&
              !widget.minimized &&
              !widget.flipped &&
              // Mirror the DraggableWindow chrome: only show the floating
              // toolbar while this widget is the selected one. Avoids leaving
              // an orphaned action bar floating below an unfocused widget.
              selectedWidgetId === widget.id &&
              // The toolbar lives at Z_INDEX.popover (11000), which is above
              // the running-mode modals (z-overlay = 9910). Hide it whenever
              // one of those modals is open so it doesn't float on top of the
              // dialog the teacher is interacting with.
              !assigningApp &&
              !assignmentsForApp &&
              !showSaveAsWidget &&
              !showSaveForm &&
              typeof document !== 'undefined' &&
              createPortal(
                (() => {
                  // Smart flip: render above the widget when there isn't room
                  // below. The toolbar is single-row (no flex-wrap) — labels
                  // are dropped instead of wrapping when the widget gets
                  // narrow, so 48px is a tight upper bound.
                  const TOOLBAR_GAP = 8;
                  const ESTIMATED_TOOLBAR_HEIGHT = 48;
                  const flipAbove =
                    widgetRect.bottom + ESTIMATED_TOOLBAR_HEIGHT + TOOLBAR_GAP >
                    window.innerHeight;
                  // Show button labels only when the widget is wide enough
                  // to fit them. The toolbar's width tracks the widget
                  // (`width: widgetRect.width`), so gating on viewport-based
                  // `sm:` would let labels render-then-overflow on a narrow
                  // widget on a wide screen. 480px clears all five labeled
                  // buttons (Assign / Assignments / QR Share / Save as Widget
                  // / Library) at default sizing without horizontal clipping;
                  // narrower widgets fall back to icons-only.
                  const showLabels = widgetRect.width >= 480;
                  const labelStyle: React.CSSProperties = {
                    display: showLabels ? 'inline' : 'none',
                  };
                  // The toolbar is portaled to document.body, so it lives
                  // outside the widget's container query context. Mirror the
                  // `min(Xpx, Ycqmin)` cqmin-cap pattern used inside the
                  // widget by computing a `cqmin` unit in JS from widgetRect
                  // and applying caps at the same px values as the original
                  // Tailwind utilities. At the default 500×600 widget size
                  // every value matches its Tailwind original; small widgets
                  // scale down proportionally.
                  // Floor at 1 so a zero `widgetRect` (before the
                  // ResizeObserver fires) doesn't collapse every size to 0
                  // and render an invisible toolbar.
                  const cqmin =
                    Math.max(Math.min(widgetRect.width, widgetRect.height), 1) /
                    100;
                  // Round to whole pixels so `gap` / `height` / `padding` /
                  // `fontSize` don't pick up hairline sub-pixel differences
                  // across display densities. The original Tailwind utilities
                  // always produced integer pixel values.
                  const px = (cap: number, factor: number) =>
                    Math.round(Math.min(cap, cqmin * factor));
                  const sz = {
                    barGap: px(6, 1.5),
                    barPaddingX: px(8, 2),
                    barPaddingY: px(6, 1.5),
                    buttonGap: px(6, 1.5),
                    buttonHeight: px(32, 8),
                    buttonPaddingX: px(12, 3),
                    badgePaddingX: px(8, 2),
                    fontXs: px(12, 4.5),
                    fontBadge: px(10, 3.5),
                    icon: px(14, 4),
                    dividerHeight: px(20, 5),
                    dividerMarginX: px(2, 0.5),
                  };
                  const iconStyle: React.CSSProperties = {
                    width: sz.icon,
                    height: sz.icon,
                  };
                  const buttonBaseStyle: React.CSSProperties = {
                    height: sz.buttonHeight,
                    paddingLeft: sz.buttonPaddingX,
                    paddingRight: sz.buttonPaddingX,
                    gap: sz.buttonGap,
                    fontSize: sz.fontXs,
                  };
                  return (
                    <div
                      data-settings-exclude
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: 'fixed',
                        left: widgetRect.left,
                        width: widgetRect.width,
                        top: flipAbove
                          ? widgetRect.top - TOOLBAR_GAP
                          : widgetRect.bottom + TOOLBAR_GAP,
                        transform: flipAbove ? 'translateY(-100%)' : undefined,
                        zIndex: Z_INDEX.popover,
                        display: 'flex',
                        justifyContent: 'center',
                        pointerEvents: 'none',
                      }}
                    >
                      <div
                        className="flex items-center bg-white/90 backdrop-blur-md border border-slate-200/60 shadow-lg rounded-xl max-w-full"
                        style={{
                          pointerEvents: 'auto',
                          gap: sz.barGap,
                          paddingLeft: sz.barPaddingX,
                          paddingRight: sz.barPaddingX,
                          paddingTop: sz.barPaddingY,
                          paddingBottom: sz.barPaddingY,
                        }}
                      >
                        {/* Left group: Assign / Assignments — hidden in
                            view-only mode (these are submission-tracking
                            flows that don't apply). */}
                        {assignmentMode !== 'view-only' && (
                          <>
                            <button
                              onClick={() => handleOpenAssign(activeApp)}
                              className="bg-indigo-600 hover:bg-indigo-500 text-white flex items-center font-black uppercase tracking-widest transition-colors rounded-lg shadow-sm"
                              style={buttonBaseStyle}
                              title="Assign (copy student link)"
                            >
                              <Link2 style={iconStyle} />
                              <span style={labelStyle}>Assign</span>
                            </button>
                            <button
                              onClick={() => handleOpenAssignments(activeApp)}
                              className="bg-white hover:bg-slate-50 text-slate-700 flex items-center font-black uppercase tracking-widest transition-colors rounded-lg shadow-sm border border-slate-200/60"
                              style={buttonBaseStyle}
                              title="View assignments"
                            >
                              <BarChart3 style={iconStyle} />
                              <span style={labelStyle}>Assignments</span>
                            </button>
                            <div
                              className="bg-slate-200/80"
                              style={{
                                width: 1,
                                height: sz.dividerHeight,
                                marginLeft: sz.dividerMarginX,
                                marginRight: sz.dividerMarginX,
                              }}
                            />
                          </>
                        )}

                        {/* Right group: QR Share + Save-as-Widget + Library
                            (or Unsaved + Save when activeAppUnsaved). */}
                        {/* Substitute / view-only boards hide every active-
                            app authoring affordance below. Save to library,
                            QR Share (which adds a NEW widget to the board),
                            and Save as Widget all alter the teacher's
                            content. The active app itself still runs and the
                            "Back to library" button (further down) stays. */}
                        {config.activeAppUnsaved && !isActiveBoardReadOnly && (
                          <>
                            <div
                              className="bg-red-500 text-white font-black uppercase tracking-tighter rounded-lg shadow-sm animate-pulse flex items-center justify-center border border-red-400"
                              style={{
                                height: sz.buttonHeight,
                                paddingLeft: sz.badgePaddingX,
                                paddingRight: sz.badgePaddingX,
                                fontSize: sz.fontBadge,
                              }}
                            >
                              Unsaved
                            </div>
                            <button
                              onClick={() => {
                                setPendingSaveTitle(
                                  activeApp.title !== 'Untitled App'
                                    ? activeApp.title
                                    : ''
                                );
                                setShowSaveForm(true);
                              }}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg uppercase tracking-wider flex items-center shadow-sm border border-indigo-500 font-black transition-colors"
                              style={buttonBaseStyle}
                              title="Save to library"
                            >
                              <Save style={iconStyle} />
                              <span style={labelStyle}>Save</span>
                            </button>
                          </>
                        )}
                        {!isActiveBoardReadOnly && (
                          <button
                            onClick={() => void handleCreateQrShare()}
                            disabled={isCreatingQrShare || !user}
                            className="bg-white hover:bg-slate-50 text-slate-700 rounded-lg uppercase tracking-wider flex items-center shadow-sm border border-slate-200/60 font-black transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                            style={buttonBaseStyle}
                            title="Share via QR — drops a QR-code widget that students can scan"
                          >
                            {isCreatingQrShare ? (
                              <Loader2
                                style={iconStyle}
                                className="animate-spin"
                              />
                            ) : (
                              <QrCode style={iconStyle} />
                            )}
                            <span style={labelStyle}>QR Share</span>
                          </button>
                        )}
                        {!config.activeAppUnsaved &&
                          user &&
                          !isActiveBoardReadOnly && (
                            <button
                              onClick={() => setShowSaveAsWidget(true)}
                              className="bg-white hover:bg-slate-50 text-slate-700 rounded-lg uppercase tracking-wider flex items-center shadow-sm border border-slate-200/60 font-black transition-colors"
                              style={buttonBaseStyle}
                              title="Save as widget — pin this mini app to your dock"
                            >
                              <Bookmark style={iconStyle} />
                              <span style={labelStyle}>Save as Widget</span>
                            </button>
                          )}
                        <button
                          onClick={handleCloseActive}
                          className="bg-white hover:bg-slate-50 text-slate-700 rounded-lg uppercase tracking-wider flex items-center shadow-sm border border-slate-200/60 font-black transition-colors"
                          style={buttonBaseStyle}
                          title="Back to library"
                        >
                          <LayoutGrid style={iconStyle} />
                          <span style={labelStyle}>Library</span>
                        </button>
                      </div>
                    </div>
                  );
                })(),
                document.body
              )}
            <iframe
              ref={iframeRef}
              srcDoc={activeApp.html}
              className="flex-1 w-full border-none bg-white" // Keep bg-white for iframe content visibility
              // No allow-same-origin: untrusted app html + srcDoc would inherit the parent's origin (DOM/localStorage access); the init/result protocol is postMessage-only.
              sandbox="allow-scripts allow-forms allow-popups allow-modals"
              title={activeApp.title}
            />
            {/* Save-to-library overlay (shown when user pastes HTML and hasn't saved yet) */}
            {showSaveForm && (
              <div
                className="absolute inset-0 z-20 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-150"
                style={{ padding: 'min(16px, 4cqmin)' }}
              >
                <div
                  className="bg-white rounded-2xl shadow-2xl w-full max-w-xs flex flex-col animate-in zoom-in-95 duration-150"
                  style={{
                    padding: 'min(20px, 5cqmin)',
                    gap: 'min(12px, 3cqmin)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <h4
                      className="font-black text-slate-800 uppercase tracking-tight flex items-center"
                      style={{
                        fontSize: 'min(12px, 4.5cqmin)',
                        gap: 'min(6px, 1.5cqmin)',
                      }}
                    >
                      <Save
                        className="text-indigo-500"
                        style={{
                          width: 'min(14px, 4.5cqmin)',
                          height: 'min(14px, 4.5cqmin)',
                        }}
                      />
                      Save to Library
                    </h4>
                    <button
                      onClick={() => setShowSaveForm(false)}
                      className="rounded-lg hover:bg-slate-100 text-slate-400"
                      style={{ padding: 'min(4px, 1cqmin)' }}
                      aria-label="Cancel save"
                    >
                      <X
                        style={{
                          width: 'min(14px, 4.5cqmin)',
                          height: 'min(14px, 4.5cqmin)',
                        }}
                      />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={pendingSaveTitle}
                    onChange={(e) => setPendingSaveTitle(e.target.value)}
                    placeholder="App title…"
                    autoFocus
                    className="w-full bg-slate-100 rounded-xl font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    style={{
                      paddingLeft: 'min(12px, 3cqmin)',
                      paddingRight: 'min(12px, 3cqmin)',
                      paddingTop: 'min(8px, 2cqmin)',
                      paddingBottom: 'min(8px, 2cqmin)',
                      fontSize: 'min(14px, 5.5cqmin)',
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleSavePasted();
                      if (e.key === 'Escape') setShowSaveForm(false);
                    }}
                  />
                  <button
                    onClick={() => void handleSavePasted()}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black uppercase tracking-widest shadow-md transition-all flex items-center justify-center active:scale-95"
                    style={{
                      paddingTop: 'min(10px, 2.5cqmin)',
                      paddingBottom: 'min(10px, 2.5cqmin)',
                      fontSize: 'min(12px, 4.5cqmin)',
                      gap: 'min(6px, 1.5cqmin)',
                    }}
                  >
                    <Save
                      style={{
                        width: 'min(14px, 4.5cqmin)',
                        height: 'min(14px, 4.5cqmin)',
                      }}
                    />{' '}
                    Save App
                  </button>
                </div>
              </div>
            )}
            {/* Assign modal */}
            {!isStudentView && assigningApp && (
              <MiniAppAssignModal
                appTitle={assigningApp.title}
                assignmentName={assignmentName}
                onNameChange={setAssignmentName}
                isCreating={isCreatingSession}
                createdSessionId={createdSessionId}
                error={assignError}
                rosters={rosters}
                pickerValue={assignPickerValue}
                onPickerChange={setAssignPickerValue}
                mode={assignmentMode}
                targetingValue={assignTargetingValue}
                onTargetingChange={setAssignTargetingValue}
                skippedStudentNames={skippedStudentNames}
                onConfirm={() => void handleConfirmAssign()}
                onClose={() => {
                  setAssigningApp(null);
                  setCreatedSessionId(null);
                  setAssignError(null);
                  setAssignPickerValue(makeEmptyPickerValue());
                  setAssignTargetingValue(EMPTY_ASSIGN_TARGETING_VALUE);
                  setSkippedStudentNames([]);
                }}
              />
            )}
            {/* Assignments modal */}
            {!isStudentView && assignmentsForApp && (
              <AssignmentsModal
                appTitle={assignmentsForApp.title}
                sessions={sessions}
                loading={sessionsLoading}
                onClose={handleCloseAssignments}
                onRenameSession={renameSession}
                onEndSession={handleEndSessionFromModal}
              />
            )}
            {/* Save-as-Widget modal — conditional render so each open is a
                fresh mount with state derived from `activeApp.title`. */}
            {!isStudentView && activeApp && showSaveAsWidget && (
              <SaveAsWidgetModal
                defaultTitle={activeApp.title}
                isSaving={isSavingAsWidget}
                onSave={(values) => void handleSaveAsWidget(values)}
                onClose={() => setShowSaveAsWidget(false)}
              />
            )}
          </div>
        }
      />
    );
  }

  return (
    <>
      {/* Editor Modal (rendered as sibling — always mounted, controlled by isOpen) */}
      <MiniAppEditorModal
        isOpen={!!editingApp}
        app={editingApp}
        folders={editingApp ? miniAppFolders : undefined}
        folderId={editingApp?.folderId ?? null}
        onFolderChange={
          editingApp
            ? async (folderId) => {
                try {
                  await moveMiniAppItem(editingApp.id, folderId);
                  addToast('Folder updated.', 'success');
                } catch (err) {
                  addToast(
                    err instanceof Error
                      ? err.message
                      : 'Failed to update folder',
                    'error'
                  );
                }
              }
            : undefined
        }
        onClose={() => setEditingApp(null)}
        onSave={saveMiniApp}
      />
      {/* Import wizard (Wave 2 shared primitive) */}
      {importAdapter && (
        <ImportWizard<MiniAppImportData>
          isOpen={showImportWizard}
          onClose={() => setShowImportWizard(false)}
          adapter={importAdapter}
          onSaved={handleImportSaved}
        />
      )}
      <WidgetLayout
        padding="p-0"
        content={
          <div className="relative flex flex-col w-full h-full min-h-0">
            <MiniAppManager
              userId={user?.uid}
              tab={managerTab}
              onTabChange={setManagerTab}
              personalLibrary={library}
              globalLibrary={globalLibrary}
              assignments={assignments}
              assignmentsLoading={assignmentsLoading}
              onCreate={handleCreate}
              onEdit={handleEdit}
              onDelete={(app) => void handleDelete(app.id)}
              onDuplicate={(app) => void handleDuplicate(app)}
              isDuplicating={duplicateBusy.isBusy}
              onRun={handleRun}
              onAssign={handleOpenAssign}
              onShowAssignments={handleOpenAssignments}
              onReorder={handleReorder}
              onSaveGlobalToLibrary={(app) => void handleSaveToLibrary(app)}
              savingGlobalId={savingGlobalId}
              onImport={() => setShowImportWizard(true)}
              onExport={handleExport}
              onArchiveCopyUrl={(a) => void handleArchiveCopyUrl(a)}
              onArchiveEnd={(a) => void handleArchiveEnd(a)}
              onArchiveReactivate={(a) => void handleArchiveReactivate(a)}
              onArchiveDelete={(a) => void handleArchiveDelete(a)}
              assignmentMode={assignmentMode}
              readOnly={isActiveBoardReadOnly}
            />
            {/* Assign modal */}
            {!isStudentView && assigningApp && (
              <MiniAppAssignModal
                appTitle={assigningApp.title}
                assignmentName={assignmentName}
                onNameChange={setAssignmentName}
                isCreating={isCreatingSession}
                createdSessionId={createdSessionId}
                error={assignError}
                rosters={rosters}
                pickerValue={assignPickerValue}
                onPickerChange={setAssignPickerValue}
                mode={assignmentMode}
                targetingValue={assignTargetingValue}
                onTargetingChange={setAssignTargetingValue}
                skippedStudentNames={skippedStudentNames}
                onConfirm={() => void handleConfirmAssign()}
                onClose={() => {
                  setAssigningApp(null);
                  setCreatedSessionId(null);
                  setAssignError(null);
                  setAssignPickerValue(makeEmptyPickerValue());
                  setAssignTargetingValue(EMPTY_ASSIGN_TARGETING_VALUE);
                  setSkippedStudentNames([]);
                }}
              />
            )}
            {/* Assignments modal (live sessions for a specific app) */}
            {!isStudentView && assignmentsForApp && (
              <AssignmentsModal
                appTitle={assignmentsForApp.title}
                sessions={sessions}
                loading={sessionsLoading}
                onClose={handleCloseAssignments}
                onRenameSession={renameSession}
                onEndSession={handleEndSessionFromModal}
              />
            )}
          </div>
        }
      />
    </>
  );
};
