// Opens the Schoology review the extension asks for (docs/plans/SCHOOLOGY_QUIZ_IMPORT.md Q8), adding a Quiz widget when none takes it.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import { useIsActiveBoardReadOnly } from '@/context/dashboardCanvasStore';
import { SCHOOLOGY_REVIEW_EVENT } from '@/utils/schoologyReviewProtocol';
import {
  claimSchoologyReview,
  requestSchoologyReview,
  schoologyReviewPending,
  subscribeSchoologyReview,
} from '@/utils/schoologyInbox';
import {
  canConnectSchoology,
  connectExtension,
  extensionSignedIn,
  pingExtension,
} from '@/components/tours/web/extensionClient';

/** How long a Quiz widget already on the board (its code may still be loading) gets to take the request. */
export const SCHOOLOGY_REVIEW_WAIT_MS = 6000;

const CONNECT_OFFERED_KEY = 'spart:schoologyConnectOffered';

const connectDismissed = () => {
  try {
    return localStorage.getItem(CONNECT_OFFERED_KEY) === '1';
  } catch {
    return false;
  }
};

const dismissConnect = () => {
  try {
    localStorage.setItem(CONNECT_OFFERED_KEY, '1');
  } catch {
    // Without storage the offer comes back next time.
  }
};

export const SchoologyReviewHost: React.FC = () => {
  const pending = useSyncExternalStore(
    subscribeSchoologyReview,
    schoologyReviewPending
  );
  const { activeDashboard, addWidget, addToast } = useDashboard();
  const { canAccessWidget } = useAuth();
  const readOnly = useIsActiveBoardReadOnly();
  const boardId = activeDashboard?.id ?? null;
  const hasQuiz = !!activeDashboard?.widgets.some((w) => w.type === 'quiz');
  const canAddQuiz = canAccessWidget('quiz');
  const added = useRef(false);
  const connectChecked = useRef(false);

  // The extension fires this in a SpartBoard tab that is already open; cancelling it tells the extension it was heard.
  useEffect(() => {
    const onRequest = (event: Event) => {
      event.preventDefault();
      requestSchoologyReview();
    };
    window.addEventListener(SCHOOLOGY_REVIEW_EVENT, onRequest);
    return () => window.removeEventListener(SCHOOLOGY_REVIEW_EVENT, onRequest);
  }, []);

  // The extension can't check the flag until it holds a Google sign-in, so its Schoology button stays hidden until then.
  useEffect(() => {
    if (connectChecked.current || connectDismissed()) return;
    connectChecked.current = true;
    void (async () => {
      if (!canConnectSchoology(await pingExtension())) return;
      if ((await extensionSignedIn()) !== false) return;
      // Offered once per browser however the toast closes; a failed Connect offers a retry.
      dismissConnect();
      const connect = () => {
        void connectExtension().then((ok) => {
          if (ok) {
            addToast(
              'Connected. Reload your Schoology page to see Send to SpartBoard.',
              'success'
            );
            return;
          }
          addToast("Couldn't connect the extension.", 'error', {
            label: 'Try again',
            onClick: connect,
          });
        });
      };
      addToast(
        'Connect the SpartBoard extension so Send to SpartBoard shows in Schoology.',
        'info',
        {
          label: 'Connect',
          onClick: connect,
          secondary: { label: 'Not now', onClick: () => undefined },
        }
      );
    })();
  }, [addToast]);

  // A Quiz widget the teacher owns on this board takes the request at once; otherwise it is placed or dropped here, never left for a later board.
  useEffect(() => {
    if (!pending) {
      added.current = false;
      return;
    }
    if (!boardId) return;
    const timer = window.setTimeout(
      () => {
        if (!schoologyReviewPending()) return;
        // The widget added for this request never took it.
        if (added.current) {
          claimSchoologyReview();
          return;
        }
        if (readOnly) {
          claimSchoologyReview();
          addToast(
            'Switch to one of your own boards to review quizzes from Schoology.',
            'info'
          );
          return;
        }
        if (!canAddQuiz) {
          claimSchoologyReview();
          addToast('The Quiz widget is not available on your account.', 'info');
          return;
        }
        // The new widget takes the waiting request when it mounts.
        added.current = true;
        addWidget('quiz');
      },
      hasQuiz ? SCHOOLOGY_REVIEW_WAIT_MS : 0
    );
    return () => window.clearTimeout(timer);
  }, [pending, boardId, hasQuiz, readOnly, canAddQuiz, addWidget, addToast]);

  return null;
};
