/**
 * LinkSchoologyModal — the "Link to Schoology" review screen (Item D part 2).
 *
 * Lists the Schoology sections SpartBoard has SEEN via a launch but the teacher
 * hasn't linked yet, each pre-matched (best-effort, by roster-email overlap) to
 * one of the teacher's ClassLink classes so the common case is a one-click
 * confirm. Schoology has no "list my courses" API, so the inventory comes from
 * the passive seen-sections feed (a section appears only after a student has
 * launched the teacher's assignment in it).
 *
 * Linking pairs a section's `context_id` to a ClassLink class server-side
 * (`linkLtiCourseV1`, trust-anchored on the carried sessionId) and mirrors the
 * `ltiContextId` onto the roster for link-state display. Shared by SidebarClasses
 * and the dashboard nudge.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GraduationCap, Loader2, Check, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import { functions } from '@/config/firebase';
import type { ClassRoster } from '@/types';
import {
  linkLtiCourse,
  suggestLtiClassLinkMatch,
} from '@/utils/ltiCourseLinks';
import type { SchoologySeenSection } from '@/hooks/useSchoologySeenSections';

interface LinkSchoologyModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** All of the teacher's rosters (ClassLink ones are the link candidates). */
  rosters: ClassRoster[];
  /** The seen-Schoology-section inventory (from useSchoologySeenSections). */
  seenSections: SchoologySeenSection[];
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
  updateRoster: (id: string, updates: Partial<ClassRoster>) => Promise<void>;
}

type RowState = 'idle' | 'linking' | 'linked' | 'error';

export const LinkSchoologyModal: React.FC<LinkSchoologyModalProps> = ({
  isOpen,
  onClose,
  rosters,
  seenSections,
  addToast,
  updateRoster,
}) => {
  // Only ClassLink rosters can be paired (the link is to a ClassLink class).
  const candidateRosters = useMemo(
    () => rosters.filter((r) => !!r.classlinkClassId),
    [rosters]
  );

  // A section is already linked when some roster mirrors its contextId. Track
  // ones linked in THIS session too, so a just-linked row leaves the list
  // immediately (before the roster snapshot round-trips).
  const [linkedHere, setLinkedHere] = useState<Set<string>>(new Set());
  const unlinkedSections = useMemo(
    () =>
      seenSections.filter(
        (s) =>
          !linkedHere.has(s.contextId) &&
          !rosters.some((r) => r.ltiContextId === s.contextId)
      ),
    [seenSections, rosters, linkedHere]
  );

  // Per-section chosen rosterId + row status + the auto-match hint.
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [hints, setHints] = useState<
    Record<string, { ambiguous: boolean } | undefined>
  >({});

  // Ask the server to auto-match each unlinked section ONCE per open (an
  // external call, so it belongs in an effect). Best-effort: a failure just
  // leaves the manual picker. Keyed by a per-open nonce so re-opening re-runs.
  const suggestedRef = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      suggestedRef.current = false;
      setLinkedHere(new Set());
      setSelections({});
      setRowState({});
      setHints({});
      return;
    }
    if (suggestedRef.current) return;
    suggestedRef.current = true;
    if (unlinkedSections.length === 0 || candidateRosters.length === 0) return;
    const candidates = candidateRosters.map((r) => ({
      classlinkClassId: r.classlinkClassId as string,
    }));
    void (async () => {
      for (const section of unlinkedSections) {
        try {
          const res = await suggestLtiClassLinkMatch(functions, {
            contextId: section.contextId,
            sessionId: section.sessionId,
            kind: section.kind,
            candidates,
          });
          if (!res.suggestion) continue;
          const roster = candidateRosters.find(
            (r) => r.classlinkClassId === res.suggestion?.classlinkClassId
          );
          if (!roster) continue;
          setSelections((prev) =>
            // Don't clobber a choice the teacher already made mid-suggest.
            prev[section.contextId]
              ? prev
              : { ...prev, [section.contextId]: roster.id }
          );
          setHints((prev) => ({
            ...prev,
            [section.contextId]: { ambiguous: !!res.ambiguous },
          }));
        } catch {
          // Ignore — the section stays on the manual picker.
        }
      }
    })();
    // unlinkedSections/candidateRosters are read once per open; re-running on
    // their identity churn would re-fire the suggest calls, so they're excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleLink = async (section: SchoologySeenSection) => {
    const rosterId = selections[section.contextId];
    const roster = candidateRosters.find((r) => r.id === rosterId);
    if (!roster?.classlinkClassId) {
      addToast('Pick one of your ClassLink classes first.', 'info');
      return;
    }
    setRowState((p) => ({ ...p, [section.contextId]: 'linking' }));
    try {
      await linkLtiCourse(functions, {
        contextId: section.contextId,
        sessionId: section.sessionId,
        kind: section.kind,
        classlinkClassId: roster.classlinkClassId,
        classlinkOrgId: roster.classlinkOrgId,
        rosterId: roster.id,
      });
      // Mirror onto the roster so link state shows everywhere (best-effort —
      // the canonical link is the server doc that just succeeded).
      try {
        await updateRoster(roster.id, { ltiContextId: section.contextId });
      } catch {
        // The link landed; the local mirror can resync later.
      }
      setRowState((p) => ({ ...p, [section.contextId]: 'linked' }));
      setLinkedHere((prev) => new Set(prev).add(section.contextId));
      addToast(
        `Linked “${section.contextTitle ?? 'Schoology section'}” to ${roster.name}.`,
        'success'
      );
    } catch (err) {
      setRowState((p) => ({ ...p, [section.contextId]: 'error' }));
      addToast(
        err instanceof Error ? err.message : 'Failed to link the section.',
        'error'
      );
    }
  };

  const linkableNow = unlinkedSections.filter(
    (s) => !!selections[s.contextId] && rowState[s.contextId] !== 'linking'
  );
  const handleLinkAll = async () => {
    for (const section of linkableNow) {
      // Sequential so one consent/error doesn't race the next; each is awaited.
      await handleLink(section);
    }
  };

  const header = (
    <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 shrink-0">
      <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-brand-blue-primary/10 text-brand-blue-primary">
        <GraduationCap size={20} />
      </span>
      <div className="min-w-0">
        <p className="text-xxs font-bold text-brand-blue-primary/60 uppercase tracking-widest">
          Link to Schoology
        </p>
        <h3 className="font-black text-base text-slate-800 truncate">
          Pair your Schoology sections with classes
        </h3>
      </div>
    </div>
  );

  const footer = (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-slate-400">
        {unlinkedSections.length} section
        {unlinkedSections.length === 1 ? '' : 's'} to link
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-bold text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg transition-colors"
        >
          Done
        </button>
        {linkableNow.length > 1 && (
          <button
            type="button"
            onClick={() => void handleLinkAll()}
            className="inline-flex items-center gap-2 text-sm font-bold text-white bg-brand-blue-primary hover:bg-brand-blue-dark px-4 py-2 rounded-lg transition-colors"
          >
            Link all ({linkableNow.length})
          </button>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      customHeader={header}
      footer={footer}
      maxWidth="max-w-lg"
      ariaLabel="Link to Schoology"
    >
      <div className="py-4 space-y-3">
        {candidateRosters.length === 0 ? (
          <p className="text-sm text-slate-500 py-6 text-center">
            Import your classes from ClassLink first — Schoology sections link
            to a ClassLink class.
          </p>
        ) : unlinkedSections.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <Check size={28} className="mx-auto text-emerald-500" />
            <p className="text-sm font-semibold text-slate-700">
              All your Schoology sections are linked.
            </p>
            <p className="text-xs text-slate-400">
              Open SpartBoard in a Schoology course once and it’ll appear here
              to link.
            </p>
          </div>
        ) : (
          unlinkedSections.map((section) => {
            const state = rowState[section.contextId] ?? 'idle';
            const hint = hints[section.contextId];
            return (
              <div
                key={section.contextId}
                className="rounded-lg border border-slate-200 p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-800 truncate">
                    {section.contextTitle ?? 'Schoology section'}
                  </span>
                  {state === 'linked' && (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                      <Check size={14} /> Linked
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    aria-label={`Class for ${section.contextTitle ?? 'Schoology section'}`}
                    value={selections[section.contextId] ?? ''}
                    disabled={state === 'linking' || state === 'linked'}
                    onChange={(e) =>
                      setSelections((p) => ({
                        ...p,
                        [section.contextId]: e.target.value,
                      }))
                    }
                    className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/40 disabled:opacity-50"
                  >
                    <option value="">Choose a class…</option>
                    {candidateRosters.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => void handleLink(section)}
                    disabled={
                      !selections[section.contextId] ||
                      state === 'linking' ||
                      state === 'linked'
                    }
                    className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-brand-blue-primary hover:bg-brand-blue-dark px-3 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    {state === 'linking' && (
                      <Loader2 size={14} className="animate-spin" />
                    )}
                    {state === 'linked' ? 'Linked' : 'Link'}
                  </button>
                </div>
                {hint?.ambiguous && state !== 'linked' && (
                  <p className="flex items-start gap-1.5 text-xs text-amber-600">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    More than one class looks similar — double-check the pick.
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
};
