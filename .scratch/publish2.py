p = 'hooks/useQuizAssignments.ts'
s = open(p).read()

def sub(o, n):
    global s
    assert o in s, 'NOT FOUND: ' + o[:120]
    s = s.replace(o, n, 1)

sub("""      const batch = writeBatch(db);
      batch.set(
        doc(db, 'users', userId, QUIZ_ASSIGNMENTS_COLLECTION, assignmentId),""",
    """      if (Object.keys(translations.byLocale).length > 0) {
        enforceSessionSizeBudget(session, targetedLocaleCountByCode);
      }

      const batch = writeBatch(db);
      batch.set(
        doc(db, 'users', userId, QUIZ_ASSIGNMENTS_COLLECTION, assignmentId),""")

sub("""  const authContext = useContext(AuthContext);
  const mediaResponseGranted =""",
    """  const authContext = useContext(AuthContext);
  const googleAccessToken = authContext?.googleAccessToken ?? null;
  // Drive handle for publish-time sidecar reads; null when Drive isn't connected.
  const translationLoader = useCallback((): TranslationLoader | null => {
    if (isAuthBypass) return userId ? new MockQuizDriveService(userId) : null;
    return googleAccessToken ? new QuizDriveService(googleAccessToken) : null;
  }, [googleAccessToken, userId]);
  const mediaResponseGranted =""")

sub("import { auth, db } from '@/config/firebase';",
    """import { auth, db, isAuthBypass } from '@/config/firebase';
import { QuizDriveService } from '@/utils/quizDriveService';
import { MockQuizDriveService } from '@/utils/mockQuizDriveService';
import type { TranslationLoader } from '@/utils/quizTranslationPublish';
import {
  enforceSessionSizeBudget,
  loadTranslationsForPublish,
  targetedLocaleCounts,
} from '@/utils/quizTranslationPublish';""")

open(p, 'w').write(s)
print('ok')
