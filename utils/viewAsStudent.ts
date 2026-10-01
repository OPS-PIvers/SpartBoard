// View as student (docs/plans/ADMIN_VIEW_AS.md D15): the teacher tab opens and hands off; the student tab signs in read-only.
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '@/config/firebase';
import type {
  StartViewAsStudentRequest,
  StartViewAsStudentResponse,
  StudentPreviewHandoff,
  StudentPreviewKind,
} from '@/types/viewAs';
import {
  VIEW_AS_PARAM,
  VIEW_AS_READY,
  VIEW_AS_STUDENT,
  VIEW_AS_STUDENT_HANDOFF,
  getViewAsTabState,
  updateViewAsTabState,
  viewAsStorageIsolated,
} from '@/utils/viewAsTab';

const HANDOFF_TIMEOUT_MS = 60_000;

const STUDENT_PATHS: Record<StudentPreviewKind, (sessionId: string) => string> =
  {
    quiz: () => '/quiz',
    'video-activity': (id) => `/activity/${encodeURIComponent(id)}`,
    'guided-learning': (id) => `/guided-learning/${encodeURIComponent(id)}`,
    'activity-wall': (id) => `/activity-wall/${encodeURIComponent(id)}`,
  };

export function studentPreviewUrl(req: StartViewAsStudentRequest): string {
  return `${STUDENT_PATHS[req.kind](req.sessionId)}?${VIEW_AS_PARAM}=${VIEW_AS_STUDENT}`;
}

/** Teacher View as tab: opens the student tab synchronously, mints, then posts the token after its ready. */
export async function openStudentPreviewTab(
  req: StartViewAsStudentRequest
): Promise<void> {
  const win = window.open(studentPreviewUrl(req), '_blank');
  if (!win) throw new Error('Allow pop-ups for SpartBoard to use View as.');

  let ready = false;
  let preview: StudentPreviewHandoff | null = null;
  const deliver = () => {
    if (!ready || !preview) return;
    window.removeEventListener('message', onMessage);
    win.postMessage(
      { type: VIEW_AS_STUDENT_HANDOFF, preview },
      window.location.origin
    );
  };
  const onMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin || event.source !== win) {
      return;
    }
    const data = event.data as { type?: unknown } | null;
    if (data?.type !== VIEW_AS_READY) return;
    ready = true;
    deliver();
  };
  window.addEventListener('message', onMessage);

  try {
    const start = httpsCallable<
      StartViewAsStudentRequest,
      StartViewAsStudentResponse
    >(functions, 'startViewAsStudentV1');
    preview = (await start(req)).data;
  } catch (err) {
    window.removeEventListener('message', onMessage);
    win.close();
    throw err;
  }
  deliver();
}

function isPreview(value: unknown): value is StudentPreviewHandoff {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.sid === 'string' &&
    typeof v.token === 'string' &&
    typeof v.studentUid === 'string' &&
    typeof v.kind === 'string' &&
    v.kind in STUDENT_PATHS &&
    typeof v.sessionId === 'string' &&
    typeof v.studentKey === 'string' &&
    typeof v.expiresAt === 'number'
  );
}

function awaitPreviewHandoff(): Promise<StudentPreviewHandoff | null> {
  return new Promise((resolve) => {
    const opener = window.opener as Window | null;
    if (!opener || !viewAsStorageIsolated) {
      resolve(null);
      return;
    }
    const finish = (value: StudentPreviewHandoff | null) => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(value);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.source !== opener) return;
      const data = event.data as { type?: unknown; preview?: unknown } | null;
      if (data?.type === VIEW_AS_STUDENT_HANDOFF && isPreview(data.preview)) {
        finish(data.preview);
      }
    };
    const timer = setTimeout(() => finish(null), HANDOFF_TIMEOUT_MS);
    window.addEventListener('message', onMessage);
    opener.postMessage({ type: VIEW_AS_READY }, window.location.origin);
  });
}

let bootPromise: Promise<void> | null = null;

/** Student tab: runs once per page load; a reload gets no second token and ends. */
export function bootStudentPreviewTab(): Promise<void> {
  bootPromise ??= (async () => {
    const preview = await awaitPreviewHandoff();
    if (!preview) {
      updateViewAsTabState({ ended: true });
      return;
    }
    try {
      await signInWithCustomToken(auth, preview.token);
    } catch (err) {
      console.error('[viewAs] student sign-in failed', err);
      updateViewAsTabState({ ended: true });
      return;
    }
    updateViewAsTabState({ student: preview, unlocked: false });
  })();
  return bootPromise;
}

export async function endStudentPreview(): Promise<void> {
  if (getViewAsTabState().ended) return;
  updateViewAsTabState({ ended: true });
  await signOut(auth).catch(() => undefined);
}
