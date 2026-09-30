// `/gradebook` route grammar (docs/plans/GRADEBOOK.md D4); navigate with spaNavigate from utils/plcPath.

export type GradebookView = 'grid' | 'analysis' | 'student' | 'assignment';

export interface ParsedGradebookPath {
  rosterId: string | null;
  view: GradebookView;
  studentUid: string | null;
  sessionId: string | null;
}

export function isGradebookRoute(pathname: string): boolean {
  return pathname === '/gradebook' || pathname.startsWith('/gradebook/');
}

export function parseGradebookPath(
  pathname: string
): ParsedGradebookPath | null {
  if (!isGradebookRoute(pathname)) return null;
  const segments = pathname
    .replace(/^\/gradebook/, '')
    .split('/')
    .filter((s) => s.length > 0)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
  const base: ParsedGradebookPath = {
    rosterId: segments[0] ?? null,
    view: 'grid',
    studentUid: null,
    sessionId: null,
  };
  const [, section, id] = segments;
  if (section === 'analysis') return { ...base, view: 'analysis' };
  if (section === 'student' && id) {
    return { ...base, view: 'student', studentUid: id };
  }
  if (section === 'assignment' && id) {
    return { ...base, view: 'assignment', sessionId: id };
  }
  return base;
}

export function buildGradebookPath(
  rosterId?: string | null,
  view: GradebookView = 'grid',
  id?: string | null
): string {
  if (!rosterId) return '/gradebook';
  const base = `/gradebook/${encodeURIComponent(rosterId)}`;
  if (view === 'analysis') return `${base}/analysis`;
  if (view === 'student' && id) {
    return `${base}/student/${encodeURIComponent(id)}`;
  }
  if (view === 'assignment' && id) {
    return `${base}/assignment/${encodeURIComponent(id)}`;
  }
  return base;
}
