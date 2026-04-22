import { useContext } from 'react';
import { StudentAuthContext } from './StudentAuthContextValue';

/**
 * Access the active student auth state from inside a `<StudentAuthProvider>`.
 *
 * Throws if called outside a provider — this is intentional. Student pages
 * must mount the provider (typically via `<RequireStudentAuth>`) before
 * calling this hook. Silent fallbacks would mask routing mistakes that
 * leak protected UI to unauthenticated users.
 */
export const useStudentAuth = () => {
  const context = useContext(StudentAuthContext);
  if (!context) {
    throw new Error('useStudentAuth must be used within a StudentAuthProvider');
  }
  return context;
};
