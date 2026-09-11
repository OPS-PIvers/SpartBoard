/** Content areas a teacher can mark as taught; admin-editable in `admin_settings/subjects`. */
export interface Subject {
  id: string;
  label: string;
  archived?: boolean;
}

export interface SubjectsDoc {
  subjects: Subject[];
  updatedAt: number;
}

export const SUBJECTS_DOC = 'subjects';

/** Subject ids the standards catalog is keyed on; admins can rename but never archive them. */
export const CATALOG_SUBJECT_IDS = ['ela', 'social-studies'] as const;

export const DEFAULT_SUBJECTS: Subject[] = [
  { id: 'ela', label: 'English Language Arts' },
  { id: 'math', label: 'Math' },
  { id: 'science', label: 'Science' },
  { id: 'social-studies', label: 'Social Studies' },
  { id: 'world-language', label: 'World Language' },
  { id: 'art', label: 'Art' },
  { id: 'music', label: 'Music' },
  { id: 'pe-health', label: 'PE / Health' },
  { id: 'other', label: 'Other' },
];

export const isCatalogSubjectId = (id: string): boolean =>
  (CATALOG_SUBJECT_IDS as readonly string[]).includes(id);

/** Lowercase kebab id from a label; returns '' when nothing usable remains. */
export const subjectIdFromLabel = (label: string): string =>
  label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Parses a Firestore doc; absent or malformed data falls back to the defaults. */
export function normalizeSubjectsDoc(raw: unknown): SubjectsDoc {
  if (!raw || typeof raw !== 'object') {
    return { subjects: DEFAULT_SUBJECTS, updatedAt: 0 };
  }
  const r = raw as Record<string, unknown>;
  const subjects: Subject[] = [];
  const seen = new Set<string>();
  if (Array.isArray(r.subjects)) {
    for (const item of r.subjects) {
      if (!item || typeof item !== 'object') continue;
      const s = item as Record<string, unknown>;
      if (typeof s.id !== 'string' || typeof s.label !== 'string') continue;
      const id = s.id.trim();
      const label = s.label.trim();
      if (!id || !label || seen.has(id)) continue;
      seen.add(id);
      const subject: Subject = { id, label };
      if (s.archived === true && !isCatalogSubjectId(id)) {
        subject.archived = true;
      }
      subjects.push(subject);
    }
  }
  // Catalog subjects must always exist so the standards tree has a home.
  for (const id of CATALOG_SUBJECT_IDS) {
    if (!seen.has(id)) {
      const fallback = DEFAULT_SUBJECTS.find((s) => s.id === id);
      if (fallback) subjects.push({ ...fallback });
    }
  }
  if (subjects.length === 0) {
    return { subjects: DEFAULT_SUBJECTS, updatedAt: 0 };
  }
  return {
    subjects,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0,
  };
}

export const activeSubjects = (subjects: Subject[]): Subject[] =>
  subjects.filter((s) => !s.archived);
