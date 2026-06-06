/**
 * SchoologyLinkNudge — the dashboard entry point for Schoology linking (the
 * second of the two surfaces; the first is SidebarClasses). A teacher can't link
 * from inside the Schoology iframe (no SpartBoard auth there), so this gentle,
 * dismissible banner surfaces unlinked seen sections where the teacher IS signed
 * in — the dashboard — and opens the shared LinkSchoologyModal.
 *
 * Dismissal is per-section (the dismissed context_ids are remembered), so it
 * stays quiet about sections you've waved off but reappears when a genuinely NEW
 * Schoology section shows up.
 */
import React, { useMemo, useState } from 'react';
import { GraduationCap, X } from 'lucide-react';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import { useSchoologySeenSections } from '@/hooks/useSchoologySeenSections';
import { LinkSchoologyModal } from './LinkSchoologyModal';

const DISMISS_STORAGE_KEY = 'spart_schoology_nudge_dismissed';

const readDismissed = (): string[] => {
  try {
    const raw = localStorage.getItem(DISMISS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string')
      : [];
  } catch {
    return [];
  }
};

const writeDismissed = (ids: string[]): void => {
  try {
    localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // localStorage unavailable — dismiss falls back to in-memory only.
  }
};

export const SchoologyLinkNudge: React.FC = () => {
  const { user } = useAuth();
  const { rosters, updateRoster, addToast } = useDashboard();
  const seenSections = useSchoologySeenSections(user?.uid);
  const [dismissed, setDismissed] = useState<string[]>(readDismissed);
  const [modalOpen, setModalOpen] = useState(false);

  // Sections seen but neither linked (mirrored on a roster) nor dismissed.
  const pending = useMemo(() => {
    const dismissedSet = new Set(dismissed);
    return seenSections.filter(
      (s) =>
        !dismissedSet.has(s.contextId) &&
        !rosters.some((r) => r.ltiContextId === s.contextId)
    );
  }, [seenSections, rosters, dismissed]);

  const handleDismiss = () => {
    const next = [
      ...new Set([...dismissed, ...pending.map((s) => s.contextId)]),
    ];
    setDismissed(next);
    writeDismissed(next);
  };

  if (!user) return null;

  return (
    <>
      {pending.length > 0 && !modalOpen && (
        // Offset above the DriveDisconnectBanner (also fixed bottom-4 right-4 at
        // z-system-banner) so the two never stack on the same spot when both show.
        <div className="fixed bottom-24 right-4 z-system-banner animate-in slide-in-from-bottom-2 duration-300">
          <div className="bg-white rounded-xl shadow-xl border border-brand-blue-primary/20 p-3 flex items-center gap-3 max-w-[300px]">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand-blue-lighter text-brand-blue-primary shrink-0">
              <GraduationCap className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-800 leading-tight">
                {pending.length === 1
                  ? '1 Schoology section to link'
                  : `${pending.length} Schoology sections to link`}
              </p>
              <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                Pair them with your classes so names and grades route
                automatically.
              </p>
              <button
                onClick={() => setModalOpen(true)}
                className="mt-2 text-xs font-bold text-brand-blue-primary hover:underline"
              >
                Review &amp; link
              </button>
            </div>
            <button
              onClick={handleDismiss}
              aria-label="Dismiss"
              className="text-slate-400 hover:text-slate-600 shrink-0 self-start"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <LinkSchoologyModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        rosters={rosters}
        seenSections={seenSections}
        addToast={addToast}
        updateRoster={updateRoster}
      />
    </>
  );
};
