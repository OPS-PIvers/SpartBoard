import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { useDashboard } from '@/context/useDashboard';
import {
  MiniAppItem,
  MiniAppConfig,
  GlobalMiniAppItem,
  MiniAppAssignment,
  WidgetComponentProps,
  ClassLinkClass,
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
  Users,
} from 'lucide-react';
import { classLinkService } from '@/utils/classlinkService';
import { WidgetLayout } from '../WidgetLayout';
import { useAuth } from '@/context/useAuth';
import { useMiniAppSessionTeacher } from '@/hooks/useMiniAppSession';
import { useMiniAppAssignments } from '@/hooks/useMiniAppAssignments';
import { useFolders } from '@/hooks/useFolders';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { MiniAppEditorModal } from './components/MiniAppEditorModal';
import { AssignmentsModal } from './components/AssignmentsModal';
import { MiniAppManager } from './components/MiniAppManager';
import { useMiniAppSync } from './hooks/useMiniAppSync';
import { useDialog } from '@/context/useDialog';
import { ImportWizard } from '@/components/common/library/importer';
import {
  createMiniAppImportAdapter,
  type MiniAppImportData,
} from './adapters/miniAppImportAdapter';
import type { LibraryTab } from '@/components/common/library/types';

// --- ASSIGN MODAL ---
interface MiniAppAssignModalProps {
  appTitle: string;
  assignmentName: string;
  onNameChange: (name: string) => void;
  isCreating: boolean;
  createdSessionId: string | null;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
  /** ClassLink classes for the target-class picker. Hidden when empty. */
  classLinkClasses: ClassLinkClass[];
  /** Currently-selected ClassLink class sourcedIds (multi-select). */
  selectedClassIds: string[];
  onSelectedClassIdsChange: (next: string[]) => void;
  /** Whether submissions are enabled (Submit button shown, writes allowed). */
  submissionsEnabled: boolean;
  onSubmissionsEnabledChange: (next: boolean) => void;
}

/**
 * Human-readable label for a ClassLink class. Mirrors the format used by
 * `QuizManager` / `ActivityWallWidget` / etc. so teachers see the same class
 * names across every assignment-targeting flow.
 */
const formatClassLinkClassLabel = (cls: ClassLinkClass): string => {
  const subjectPrefix = cls.subject ? `${cls.subject} - ` : '';
  const codeSuffix = cls.classCode ? ` (${cls.classCode})` : '';
  return `${subjectPrefix}${cls.title}${codeSuffix}`;
};

const MiniAppAssignModal: React.FC<MiniAppAssignModalProps> = ({
  appTitle,
  assignmentName,
  onNameChange,
  isCreating,
  createdSessionId,
  error,
  onConfirm,
  onClose,
  classLinkClasses,
  selectedClassIds,
  onSelectedClassIdsChange,
  submissionsEnabled,
  onSubmissionsEnabledChange,
}) => {
  const toggleClassId = (sourcedId: string) => {
    if (selectedClassIds.includes(sourcedId)) {
      onSelectedClassIdsChange(
        selectedClassIds.filter((id) => id !== sourcedId)
      );
    } else {
      onSelectedClassIdsChange([...selectedClassIds, sourcedId]);
    }
  };
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
    <div className="absolute inset-0 z-overlay bg-brand-blue-dark/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div
          className={`p-4 flex items-center justify-between ${createdSessionId ? 'bg-emerald-600' : 'bg-brand-blue-primary'}`}
        >
          <div className="flex items-center gap-2 text-white">
            {createdSessionId ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <Link2 className="w-5 h-5" />
            )}
            <span className="font-black uppercase tracking-tight">
              {createdSessionId ? 'Assignment Created' : 'Assign'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {createdSessionId && link ? (
            /* Post-creation: show link */
            <>
              <div className="text-center">
                <p className="font-bold text-brand-blue-dark text-base truncate px-2">
                  {assignmentName}
                </p>
              </div>
              <p className="text-slate-600 text-sm text-center">
                Share this link with your students. They&apos;ll interact with
                the app immediately.
              </p>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 break-all text-xs text-slate-700 font-mono">
                {link}
              </div>
              <div className="grid gap-2">
                <button
                  onClick={() => void handleCopy()}
                  className="w-full flex items-center justify-center gap-2 bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold rounded-xl transition-all active:scale-95 shadow-sm py-3 text-sm"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy Link
                    </>
                  )}
                </button>
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors py-3 text-sm"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open in New Tab
                </a>
              </div>
            </>
          ) : (
            /* Pre-creation: name input */
            <>
              <div className="text-center">
                <p className="font-bold text-brand-blue-dark text-base truncate px-2">
                  {appTitle}
                </p>
                <p
                  className="text-brand-blue-primary/60 font-black uppercase tracking-widest mt-1"
                  style={{ fontSize: 'clamp(10px, 3cqmin, 12px)' }}
                >
                  Create Assignment Link
                </p>
              </div>
              <p className="text-slate-600 text-sm text-center">
                Name this assignment, then share the generated link with
                students.
              </p>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <label
                  htmlFor="miniapp-assignment-name"
                  className="block text-sm font-bold text-slate-700 mb-1.5"
                >
                  Assignment Name
                </label>
                <input
                  id="miniapp-assignment-name"
                  type="text"
                  value={assignmentName}
                  onChange={(e) => onNameChange(e.target.value)}
                  placeholder="1st period"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-brand-blue-primary"
                />
              </div>
              {classLinkClasses.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Users className="w-4 h-4 text-brand-blue-primary" />
                    <span className="text-sm font-bold text-slate-700">
                      Target classes (optional)
                    </span>
                  </div>
                  <div className="max-h-40 overflow-y-auto flex flex-col gap-1.5 pr-1">
                    {classLinkClasses.map((cls) => {
                      const checked = selectedClassIds.includes(cls.sourcedId);
                      return (
                        <label
                          key={cls.sourcedId}
                          className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer rounded-lg px-2 py-1 hover:bg-white"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleClassId(cls.sourcedId)}
                            className="w-4 h-4 accent-brand-blue-primary"
                          />
                          <span className="truncate">
                            {formatClassLinkClassLabel(cls)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    Enrolled students will see this in their assignments list.
                    Leave all boxes unchecked to share a link directly.
                  </p>
                </div>
              )}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <span className="block text-sm font-bold text-slate-700 mb-2">
                  Submissions
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onSubmissionsEnabledChange(false)}
                    className={`rounded-lg px-3 py-2 text-sm font-bold transition-colors border ${
                      !submissionsEnabled
                        ? 'bg-brand-blue-primary border-brand-blue-primary text-white'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    View only
                  </button>
                  <button
                    type="button"
                    onClick={() => onSubmissionsEnabledChange(true)}
                    className={`rounded-lg px-3 py-2 text-sm font-bold transition-colors border ${
                      submissionsEnabled
                        ? 'bg-brand-blue-primary border-brand-blue-primary text-white'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    Submissions on
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  {submissionsEnabled
                    ? 'Students will see a Submit button and their answers are saved to the submissions list.'
                    : 'Students can interact with the app but the Submit button is hidden and nothing is saved.'}
                </p>
              </div>
              {error && (
                <p className="text-sm text-brand-red-primary text-center font-medium">
                  {error}
                </p>
              )}
              <button
                onClick={onConfirm}
                disabled={isCreating || assignmentName.trim().length === 0}
                className="w-full flex items-center justify-center gap-2 bg-brand-blue-primary hover:bg-brand-blue-dark text-white font-bold rounded-xl transition-all active:scale-95 shadow-sm py-3 text-sm disabled:opacity-60"
              >
                {isCreating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Link2 className="w-4 h-4" />
                )}
                {isCreating ? 'Creating…' : 'Create Assignment Link'}
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
  const { updateWidget, addToast } = useDashboard();
  const { user, userRoles, orgId, roleId } = useAuth();
  // Gate testClasses read on the same role check the Firestore rules enforce
  // (`isSuperAdmin() || isDomainAdmin(orgId)`) rather than the legacy
  // `/admins/` membership flag. Building admins appear in `/admins/` in some
  // deployments — querying on that flag would trigger a permission-denied
  // round-trip for them. See `resolveActorRole` in OrganizationPanel for the
  // reference pattern.
  const isSuperAdminByEmail = Boolean(
    user?.email &&
    userRoles?.superAdmins?.some(
      (e) => e.toLowerCase() === user.email?.toLowerCase()
    )
  );
  const canReadTestClasses =
    isSuperAdminByEmail ||
    roleId === 'super_admin' ||
    roleId === 'domain_admin';
  const { showConfirm } = useDialog();
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

  // Per-teacher MiniApp assignment archive — populates the In Progress /
  // Archive tabs. Lives in `/users/{uid}/miniapp_assignments/`.
  const {
    assignments,
    loading: assignmentsLoading,
    createAssignment,
    endAssignment,
    deleteAssignment,
  } = useMiniAppAssignments(user?.uid);

  // Assign flow state
  const [assigningApp, setAssigningApp] = useState<MiniAppItem | null>(null);
  const [assignmentName, setAssignmentName] = useState('');
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignTargetClassIds, setAssignTargetClassIds] = useState<string[]>(
    []
  );
  const [assignSubmissionsEnabled, setAssignSubmissionsEnabled] =
    useState(false);
  const [assignmentsForApp, setAssignmentsForApp] =
    useState<MiniAppItem | null>(null);

  // ─── ClassLink target-class fetch (Phase 3E) ────────────────────────────────
  // Fetched once per widget mount via the shared classLinkService (5-min
  // cache). Hidden entirely when the teacher isn't on a ClassLink-provisioned
  // org. Errors are swallowed: ClassLink being unreachable must not block
  // shareable-link launches.
  const [classLinkClasses, setClassLinkClasses] = useState<ClassLinkClass[]>(
    []
  );
  const [testClasses, setTestClasses] = useState<ClassLinkClass[]>([]);

  // ClassLink roster fetch runs once per mount and does not depend on admin
  // state — splitting it from the test-class fetch avoids re-issuing the
  // ClassLink request when `roleId` hydrates from null.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await classLinkService.getRosters();
        if (cancelled) return;
        setClassLinkClasses(data.classes);
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn('[MiniAppWidget] ClassLink fetch failed:', err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Test-class fetch is gated on the same role check Firestore rules use.
  // Skipped when orgId is null — testClasses docs live under a specific org,
  // so there is no valid query to issue without one.
  useEffect(() => {
    if (!canReadTestClasses || !orgId) {
      setTestClasses([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const snap = await getDocs(
          collection(db, `organizations/${orgId}/testClasses`)
        );
        if (cancelled) return;
        setTestClasses(
          snap.docs.map((d) => {
            const data = d.data() as { title?: string; subject?: string };
            return {
              sourcedId: d.id,
              title: `${data.title ?? d.id} (test)`,
              subject: data.subject,
            };
          })
        );
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn('[MiniAppWidget] testClasses fetch failed:', err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canReadTestClasses, orgId]);

  const mergedClassList = useMemo(
    () => [...classLinkClasses, ...testClasses],
    [classLinkClasses, testClasses]
  );

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
    // Pre-populate the class picker and toggle with whatever the teacher
    // picked last time for this app, so repeated assignments don't require
    // re-picking.
    setAssignTargetClassIds(config.lastClassIdsByAppId?.[app.id] ?? []);
    setAssignSubmissionsEnabled(
      config.lastSubmissionsEnabledByAppId?.[app.id] ?? false
    );
  };

  const handleOpenAssignments = (app: MiniAppItem) => {
    setAssignmentsForApp(app);
  };

  const handleCloseAssignments = () => {
    setAssignmentsForApp(null);
  };

  // Subscribe to sessions for whichever app the teacher is managing
  const targetAppId = assignmentsForApp?.id ?? activeApp?.id;
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
      // Guard against stale selections: the class list refreshes on mount,
      // and a teacher could have picked classes that have since been removed
      // from the roster. Drop any sourcedIds we can't still see.
      const visibleClassIds = new Set(mergedClassList.map((c) => c.sourcedId));
      const resolvedClassIds = assignTargetClassIds.filter((id) =>
        visibleClassIds.has(id)
      );
      const sessionId = await createSession(
        assigningApp,
        user.uid,
        assignmentName,
        {
          classIds: resolvedClassIds,
          submissionsEnabled: assignSubmissionsEnabled,
        }
      );
      // Mirror the new session into the per-teacher archive so it shows up
      // in the In Progress / Archive tabs. Failures here are non-fatal —
      // the session itself still exists.
      try {
        await createAssignment({
          sessionId,
          app: { id: assigningApp.id, title: assigningApp.title },
          assignmentName,
          classIds: resolvedClassIds,
          submissionsEnabled: assignSubmissionsEnabled,
        });
      } catch (archiveErr) {
        console.warn(
          '[MiniAppWidget] Failed to archive assignment',
          archiveErr
        );
      }
      // Remember the teacher's choices for next time.
      try {
        const prevClasses = config.lastClassIdsByAppId ?? {};
        const nextClasses: Record<string, string[]> = { ...prevClasses };
        if (resolvedClassIds.length > 0) {
          nextClasses[assigningApp.id] = resolvedClassIds;
        } else {
          delete nextClasses[assigningApp.id];
        }
        const prevToggle = config.lastSubmissionsEnabledByAppId ?? {};
        const nextToggle: Record<string, boolean> = {
          ...prevToggle,
          [assigningApp.id]: assignSubmissionsEnabled,
        };
        updateWidget(widget.id, {
          config: {
            ...config,
            lastClassIdsByAppId: nextClasses,
            lastSubmissionsEnabledByAppId: nextToggle,
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
      try {
        await navigator.clipboard.writeText(url);
        addToast('Assignment link copied to clipboard!', 'success');
      } catch {
        addToast(`Assignment created! URL: ${url}`, 'info');
      }
    } catch (err) {
      setAssignError(
        err instanceof Error ? err.message : 'Failed to create assignment.'
      );
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
    a.download = `spartboard-apps-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addToast('Library exported successfully', 'success');
  };

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
      const confirmed = await showConfirm(
        `End "${assignment.assignmentName}"? Students will no longer be able to submit.`,
        { title: 'End Assignment', variant: 'danger', confirmLabel: 'End' }
      );
      if (!confirmed) return;
      try {
        await endAssignment(assignment.id);
        addToast('Assignment ended', 'info');
      } catch (err) {
        console.error(err);
        addToast('Failed to end assignment', 'error');
      }
    },
    [endAssignment, showConfirm, addToast]
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
          <div className="w-full h-full flex flex-col relative overflow-hidden group/miniapp">
            {!isStudentView && (
              <>
                {/* Left Actions: Assign controls */}
                <div className="absolute top-2 left-2 z-10 flex items-center gap-2 opacity-0 group-hover/miniapp:opacity-100 transition-opacity duration-200">
                  <button
                    onClick={() => handleOpenAssign(activeApp)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 font-black uppercase tracking-widest transition-all rounded-lg shadow-sm"
                    style={{
                      padding: 'min(4px, 1cqmin) min(8px, 2cqmin)',
                      fontSize: 'min(10px, 2.5cqmin)',
                    }}
                    title="Assign (copy student link)"
                  >
                    <Link2
                      style={{
                        width: 'min(12px, 3cqmin)',
                        height: 'min(12px, 3cqmin)',
                      }}
                    />
                    <span className="hidden sm:inline">Assign</span>
                  </button>
                  <button
                    onClick={() => handleOpenAssignments(activeApp)}
                    className="bg-white/90 hover:bg-white text-slate-700 backdrop-blur-sm flex items-center gap-1.5 font-black uppercase tracking-widest transition-all rounded-lg shadow-sm border border-slate-200/50"
                    style={{
                      padding: 'min(4px, 1cqmin) min(8px, 2cqmin)',
                      fontSize: 'min(10px, 2.5cqmin)',
                    }}
                    title="View assignments"
                  >
                    <BarChart3
                      style={{
                        width: 'min(12px, 3cqmin)',
                        height: 'min(12px, 3cqmin)',
                      }}
                    />
                    <span className="hidden sm:inline">Assignments</span>
                  </button>
                </div>

                {/* Right Actions: App Controls */}
                <div className="absolute top-2 right-2 z-10 flex items-center gap-1 opacity-0 group-hover/miniapp:opacity-100 transition-opacity duration-200">
                  {config.activeAppUnsaved && (
                    <>
                      <div
                        className="bg-red-500 text-white font-black uppercase tracking-tighter rounded-lg shadow-sm animate-pulse flex items-center justify-center border border-red-400"
                        style={{
                          padding: 'min(2px, 0.5cqmin) min(6px, 1.5cqmin)',
                          fontSize: 'min(8px, 2cqmin)',
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
                        className="bg-indigo-600/90 backdrop-blur-sm hover:bg-indigo-700 text-white rounded-lg uppercase tracking-wider flex items-center shadow-lg border border-indigo-500 font-black transition-all"
                        title="Save to library"
                        style={{
                          padding: 'min(4px, 1cqmin) min(8px, 2cqmin)',
                          fontSize: 'min(10px, 2.5cqmin)',
                          gap: 'min(6px, 1.5cqmin)',
                        }}
                      >
                        <Save
                          style={{
                            width: 'min(10px, 2.5cqmin)',
                            height: 'min(10px, 2.5cqmin)',
                          }}
                        />
                        <span className="hidden sm:inline">Save</span>
                      </button>
                    </>
                  )}
                  <button
                    onClick={handleCloseActive}
                    className="bg-white/90 hover:bg-white text-slate-700 backdrop-blur-sm rounded-lg uppercase tracking-wider flex items-center shadow-sm border border-slate-200/50 font-black transition-all"
                    style={{
                      padding: 'min(4px, 1cqmin) min(8px, 2cqmin)',
                      fontSize: 'min(10px, 2.5cqmin)',
                      gap: 'min(6px, 1.5cqmin)',
                    }}
                  >
                    <LayoutGrid
                      style={{
                        width: 'min(10px, 2.5cqmin)',
                        height: 'min(10px, 2.5cqmin)',
                      }}
                    />{' '}
                    <span className="hidden sm:inline">Library</span>
                  </button>
                </div>
              </>
            )}
            <iframe
              ref={iframeRef}
              srcDoc={activeApp.html}
              className="flex-1 w-full border-none bg-white" // Keep bg-white for iframe content visibility
              sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin"
              title={activeApp.title}
            />
            {/* Save-to-library overlay (shown when user pastes HTML and hasn't saved yet) */}
            {showSaveForm && (
              <div className="absolute inset-0 z-20 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
                <div className="bg-white rounded-2xl shadow-2xl p-5 w-full max-w-xs flex flex-col gap-3 animate-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between">
                    <h4 className="font-black text-slate-800 uppercase tracking-tight text-xs flex items-center gap-1.5">
                      <Save className="w-3.5 h-3.5 text-indigo-500" />
                      Save to Library
                    </h4>
                    <button
                      onClick={() => setShowSaveForm(false)}
                      className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"
                      aria-label="Cancel save"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={pendingSaveTitle}
                    onChange={(e) => setPendingSaveTitle(e.target.value)}
                    placeholder="App title…"
                    autoFocus
                    className="w-full px-3 py-2 bg-slate-100 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleSavePasted();
                      if (e.key === 'Escape') setShowSaveForm(false);
                    }}
                  />
                  <button
                    onClick={() => void handleSavePasted()}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    <Save className="w-3.5 h-3.5" /> Save App
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
                classLinkClasses={mergedClassList}
                selectedClassIds={assignTargetClassIds}
                onSelectedClassIdsChange={setAssignTargetClassIds}
                submissionsEnabled={assignSubmissionsEnabled}
                onSubmissionsEnabledChange={setAssignSubmissionsEnabled}
                onConfirm={() => void handleConfirmAssign()}
                onClose={() => {
                  setAssigningApp(null);
                  setCreatedSessionId(null);
                  setAssignError(null);
                  setAssignTargetClassIds([]);
                  setAssignSubmissionsEnabled(false);
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
                onEndSession={endSession}
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
              onArchiveDelete={(a) => void handleArchiveDelete(a)}
              initialLibraryViewMode={config.libraryViewMode}
              onLibraryViewModeChange={(mode) =>
                updateWidget(widget.id, {
                  config: { ...config, libraryViewMode: mode } as MiniAppConfig,
                })
              }
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
                classLinkClasses={mergedClassList}
                selectedClassIds={assignTargetClassIds}
                onSelectedClassIdsChange={setAssignTargetClassIds}
                submissionsEnabled={assignSubmissionsEnabled}
                onSubmissionsEnabledChange={setAssignSubmissionsEnabled}
                onConfirm={() => void handleConfirmAssign()}
                onClose={() => {
                  setAssigningApp(null);
                  setCreatedSessionId(null);
                  setAssignError(null);
                  setAssignTargetClassIds([]);
                  setAssignSubmissionsEnabled(false);
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
                onEndSession={endSession}
              />
            )}
          </div>
        }
      />
    </>
  );
};
