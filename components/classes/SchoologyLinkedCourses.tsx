import React, { useState } from 'react';
import { Loader2, Unlink } from 'lucide-react';
import { functions } from '@/config/firebase';
import type { ClassRoster } from '@/types';
import { unlinkLtiSection } from '@/utils/ltiCourseLinks';
import type { SchoologyCourseLink } from '@/hooks/useSchoologyCourseLinks';
import { tourFieldAttr } from '@/config/tourAnchors';

interface SchoologyLinkedCoursesProps {
  links: SchoologyCourseLink[];
  rosters: ClassRoster[];
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
  updateRoster: (id: string, updates: Partial<ClassRoster>) => Promise<void>;
}

/** The teacher's linked Schoology courses, each with an Unlink button. */
export const SchoologyLinkedCourses: React.FC<SchoologyLinkedCoursesProps> = ({
  links,
  rosters,
  addToast,
  updateRoster,
}) => {
  const [busy, setBusy] = useState<string | null>(null);
  if (links.length === 0) return null;

  const rosterName = (id: string | null): string =>
    rosters.find((r) => r.id === id)?.name ?? 'a class you no longer have';
  const sorted = [...links].sort((a, b) =>
    rosterName(a.rosterId).localeCompare(rosterName(b.rosterId))
  );

  const handleUnlink = async (link: SchoologyCourseLink) => {
    const title = link.contextTitle ?? 'the Schoology course';
    setBusy(link.contextId);
    try {
      await unlinkLtiSection(functions, link.contextId);
      for (const r of rosters.filter(
        (x) => x.ltiContextId === link.contextId
      )) {
        try {
          await updateRoster(r.id, { ltiContextId: '' });
        } catch {
          // The server link is gone; the roster mirror resyncs later.
        }
      }
      addToast(`Unlinked “${title}”.`, 'success');
    } catch (err) {
      addToast(
        err instanceof Error && err.message
          ? err.message
          : 'Failed to unlink the course.',
        'error'
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 p-3 space-y-2">
      <p className="text-xs font-bold text-slate-600">Linked courses</p>
      <ul className="space-y-1.5">
        {sorted.map((link, i) => (
          <li key={link.contextId} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800 truncate">
                {link.contextTitle ?? 'Schoology course'}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {rosterName(link.rosterId)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleUnlink(link)}
              disabled={busy !== null}
              aria-label={`Unlink ${link.contextTitle ?? 'Schoology course'}`}
              {...tourFieldAttr(
                'schoology-link.unlink',
                'schoology-link',
                `linked-${i + 1}`
              )}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-brand-red-primary border border-slate-200 hover:border-brand-red-primary/40 px-3 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {busy === link.contextId ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Unlink size={14} />
              )}
              Unlink
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
