import React, { useState } from 'react';
import { Check, Link2, Loader2 } from 'lucide-react';
import { functions } from '@/config/firebase';
import type { ClassRoster } from '@/types';
import {
  linkLtiSectionByUrl,
  previewLtiSectionByUrl,
  type LtiSectionByUrlPreview,
} from '@/utils/ltiCourseLinks';

interface SchoologyPasteLinkProps {
  /** The teacher's ClassLink and admin test-class rosters. */
  rosters: ClassRoster[];
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
  updateRoster: (id: string, updates: Partial<ClassRoster>) => Promise<void>;
}

const errorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

/** Paste a Schoology course link, pick the matching class, link (SCHOOLOGY_TOOL_COLUMNS.md D1–D2). */
export const SchoologyPasteLink: React.FC<SchoologyPasteLinkProps> = ({
  rosters,
  addToast,
  updateRoster,
}) => {
  const [url, setUrl] = useState('');
  const [checking, setChecking] = useState(false);
  const [linking, setLinking] = useState(false);
  const [preview, setPreview] = useState<LtiSectionByUrlPreview | null>(null);
  const [rosterId, setRosterId] = useState('');
  const [linkedTitle, setLinkedTitle] = useState<string | null>(null);

  const overlapFor = (id: string): number =>
    preview?.suggestions.find((s) => s.rosterId === id)?.overlap ?? 0;
  // Classes sharing students come first; a class with none can't be linked.
  const ordered = [...rosters].sort(
    (a, b) => overlapFor(b.id) - overlapFor(a.id)
  );

  const handleCheck = async () => {
    if (!url.trim()) return;
    setChecking(true);
    setPreview(null);
    setLinkedTitle(null);
    try {
      const res = await previewLtiSectionByUrl(functions, url.trim());
      setPreview(res);
      setRosterId(res.suggestions[0]?.rosterId ?? '');
      if (res.suggestions.length === 0) {
        addToast(
          'None of your classes share students with that course.',
          'info'
        );
      }
    } catch (err) {
      addToast(errorMessage(err, 'Couldn’t check that course link.'), 'error');
    } finally {
      setChecking(false);
    }
  };

  const handleLink = async () => {
    const roster = rosters.find((r) => r.id === rosterId);
    if (!preview || !roster) return;
    setLinking(true);
    try {
      const res = await linkLtiSectionByUrl(functions, url.trim(), roster.id);
      try {
        await updateRoster(roster.id, { ltiContextId: res.contextId });
      } catch {
        // The server link landed; the roster mirror resyncs later.
      }
      const title = res.contextTitle ?? 'the Schoology course';
      setLinkedTitle(title);
      setPreview(null);
      setUrl('');
      addToast(`Linked “${title}” to ${roster.name}.`, 'success');
    } catch (err) {
      addToast(errorMessage(err, 'Failed to link the course.'), 'error');
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 p-3 space-y-2">
      <label
        htmlFor="schoology-course-link"
        className="block text-xs font-bold text-slate-600"
      >
        Paste a Schoology course link
      </label>
      <div className="flex items-center gap-2">
        <input
          id="schoology-course-link"
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setPreview(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleCheck();
          }}
          placeholder="https://orono.schoology.com/course/…"
          title="Open the course in Schoology and copy the address bar."
          className="flex-1 min-w-0 px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40"
        />
        <button
          type="button"
          onClick={() => void handleCheck()}
          disabled={!url.trim() || checking || linking}
          className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-blue-primary border border-brand-blue-primary/30 hover:border-brand-blue-primary px-3 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {checking ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Link2 size={14} />
          )}
          Check
        </button>
      </div>
      {linkedTitle && (
        <p className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
          <Check size={14} /> Linked “{linkedTitle}”.
        </p>
      )}
      {preview && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-800">
            {preview.contextTitle ?? 'Schoology course'}
            <span className="font-normal text-slate-400">
              {' '}
              · {preview.learnerCount} student
              {preview.learnerCount === 1 ? '' : 's'}
            </span>
          </p>
          <div className="flex items-center gap-2">
            <select
              aria-label="Class to link"
              value={rosterId}
              disabled={linking}
              onChange={(e) => setRosterId(e.target.value)}
              className="flex-1 min-w-0 px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 disabled:opacity-50"
            >
              <option value="">Choose a class…</option>
              {ordered.map((r) => {
                const overlap = overlapFor(r.id);
                return (
                  <option key={r.id} value={r.id} disabled={overlap === 0}>
                    {r.name}
                    {overlap > 0
                      ? ` (${overlap} shared student${overlap === 1 ? '' : 's'})`
                      : ' (no shared students)'}
                  </option>
                );
              })}
            </select>
            <button
              type="button"
              onClick={() => void handleLink()}
              disabled={!rosterId || linking}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-brand-blue-primary hover:bg-brand-blue-dark px-3 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {linking && <Loader2 size={14} className="animate-spin" />}
              {preview.linkedRosterId ? 'Re-link' : 'Link'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
