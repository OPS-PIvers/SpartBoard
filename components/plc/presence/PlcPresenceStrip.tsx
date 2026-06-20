/**
 * PlcPresenceStrip — the "who's here now" row for the PLC Home page (Decision
 * 2.1, PRD §6.3). Surfaces coarse per-section presence: which teammates are
 * active in the PLC right now (heartbeated within ~90s) and which section each
 * is viewing.
 *
 * Data:
 *   - `usePlcWhoIsHere()` (T2 selector) — the live ~90s-filtered presence set,
 *     so an abandoned tab drops off before the Wave-4 server GC sweep runs.
 *   - `usePlcMembers()` — canonical display-name resolution (the presence doc
 *     snapshots a `displayName`, but the member map is the source of truth and
 *     survives a member renaming themselves; we fall back to the snapshotted
 *     name, then the email, then the uid).
 *   - `useAuth()` — to split "you" from teammates and render the right copy
 *     ("Just you here" vs "N teammates here now").
 *
 * Rendering: avatar initials (overlapping cluster) for each present teammate,
 * each labelled "<name> · in <section>" for screen readers, plus a compact
 * "who's here" heading + count summary. This is modal chrome on a LIGHT surface
 * (the Home header), so it uses normal Tailwind sizing (no cqmin) and the
 * light-surface text palette.
 *
 * Accessibility: the cluster is a `role="list"` of `role="listitem"` avatars
 * (each `aria-label`led with name + section); the whole strip carries a single
 * descriptive `aria-label`. No looping animation — presence changes are
 * communicated by membership of the strip, not motion — so there is nothing to
 * gate behind `prefers-reduced-motion`.
 *
 * Renders nothing when no one (not even you) is present — e.g. outside a mounted
 * `PlcProvider`, where the selectors return their empty singletons.
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Plc } from '@/types';
import { useAuth } from '@/context/useAuth';
import { usePlcMembers, usePlcWhoIsHere } from '@/context/usePlcContext';
import type { PlcSectionId } from '@/components/plc/sections';

interface PlcPresenceStripProps {
  /** The PLC whose presence to display. Reserved for future per-PLC styling. */
  plc: Plc;
  /**
   * Layout variant. `home` is the full strip on the Home header; `compact` is a
   * condensed indicator suitable for the dashboard sub-header (smaller avatars,
   * no heading row).
   */
  variant?: 'home' | 'compact';
}

/** Map a presence section id to its translatable label key + English default. */
const SECTION_LABELS: Record<
  PlcSectionId,
  { key: string; defaultValue: string }
> = {
  home: { key: 'plcDashboard.tabs.home', defaultValue: 'Home' },
  assessments: {
    key: 'plcDashboard.tabs.assessments',
    defaultValue: 'Assessments',
  },
  sharedData: {
    key: 'plcDashboard.tabs.sharedData',
    defaultValue: 'Data',
  },
  docs: { key: 'plcDashboard.tabs.docs', defaultValue: 'Notes & Docs' },
  todos: { key: 'plcDashboard.tabs.todos', defaultValue: 'To-Dos' },
  sharedBoards: {
    key: 'plcDashboard.tabs.sharedBoards',
    defaultValue: 'Boards',
  },
  members: { key: 'plcDashboard.tabs.members', defaultValue: 'Members' },
  resources: { key: 'plcDashboard.tabs.resources', defaultValue: 'Resources' },
  settings: { key: 'plcDashboard.tabs.settings', defaultValue: 'Settings' },
  meeting: {
    key: 'plcDashboard.presence.meetingSection',
    defaultValue: 'the meeting',
  },
};

/** First trimmed, non-empty string among the candidates (last is the guaranteed fallback). */
function firstNonEmpty(...candidates: (string | undefined)[]): string {
  for (const c of candidates) {
    const trimmed = c?.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

/** 1-2 uppercase initials from a display name (or email fallback). */
function initialsFromName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  // Email-like → derive from the local part.
  const base = trimmed.includes('@') ? (trimmed.split('@')[0] ?? '') : trimmed;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return (base.charAt(0) || '?').toUpperCase();
  if (parts.length === 1) return (parts[0]?.charAt(0) ?? '?').toUpperCase();
  return (
    (parts[0]?.charAt(0) ?? '') + (parts[1]?.charAt(0) ?? '')
  ).toUpperCase();
}

const MAX_VISIBLE = 6;

/** A resolved present teammate ready to render. */
interface PresentMember {
  uid: string;
  displayName: string;
  section: PlcSectionId | 'meeting';
  isSelf: boolean;
}

export const PlcPresenceStrip: React.FC<PlcPresenceStripProps> = ({
  variant = 'home',
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const whoIsHere = usePlcWhoIsHere();
  const members = usePlcMembers();

  const selfUid = user?.uid ?? null;

  // Resolve each present uid to a stable display name via the member map (the
  // source of truth), falling back to the snapshotted presence name / email /
  // uid. De-dupe by uid (a member with two tabs heartbeats two near-identical
  // docs; the selector list is newest-first so the first wins).
  const present = useMemo<PresentMember[]>(() => {
    const byUid = new Map<string, { email: string; displayName: string }>();
    for (const m of members) {
      byUid.set(m.uid, { email: m.email, displayName: m.displayName });
    }
    const seen = new Set<string>();
    const out: PresentMember[] = [];
    for (const entry of whoIsHere) {
      if (seen.has(entry.uid)) continue;
      seen.add(entry.uid);
      const member = byUid.get(entry.uid);
      // First non-empty of: canonical member name → member email → snapshotted
      // presence name → uid. (`||`-style fall-through over EMPTY strings, which
      // `??` would not skip — hence the explicit firstNonEmpty helper.)
      const displayName = firstNonEmpty(
        member?.displayName,
        member?.email,
        entry.displayName,
        entry.uid
      );
      out.push({
        uid: entry.uid,
        displayName,
        section: entry.section,
        isSelf: entry.uid === selfUid,
      });
    }
    return out;
  }, [whoIsHere, members, selfUid]);

  // Nobody at all (not even you) — render nothing rather than an empty shell.
  if (present.length === 0) return null;

  const others = present.filter((p) => !p.isSelf);
  const selfPresent = present.some((p) => p.isSelf);

  const sectionLabel = (section: PlcSectionId | 'meeting'): string => {
    const def = SECTION_LABELS[section];
    return def
      ? t(def.key, { defaultValue: def.defaultValue })
      : t(SECTION_LABELS.home.key, {
          defaultValue: SECTION_LABELS.home.defaultValue,
        });
  };

  // Summary copy: "Just you here" / "N teammates here now".
  const summary =
    others.length === 0
      ? t('plcDashboard.presence.justYou', { defaultValue: 'Just you here' })
      : t('plcDashboard.presence.othersHere', {
          count: others.length,
          defaultValue: '{{count}} teammate here now',
          defaultValue_plural: '{{count}} teammates here now',
        });

  // Strip-level label for the whole region — names everyone present + sections.
  const stripAriaLabel = t('plcDashboard.presence.stripAria', {
    count: present.length,
    defaultValue: '{{count}} person here now',
    defaultValue_plural: '{{count}} people here now',
  });

  // Render order: teammates first (most relevant glance), then yourself last so
  // your own avatar trails the cluster.
  const ordered: PresentMember[] = [
    ...others,
    ...present.filter((p) => p.isSelf),
  ];
  const visible = ordered.slice(0, MAX_VISIBLE);
  const overflow = ordered.length - MAX_VISIBLE;

  const compact = variant === 'compact';
  const avatarSize = compact ? 'w-6 h-6 text-[10px]' : 'w-8 h-8 text-xs';

  return (
    <section
      aria-label={stripAriaLabel}
      className={
        compact
          ? 'flex items-center gap-2'
          : 'flex flex-col items-start gap-1.5'
      }
    >
      {!compact && (
        <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
          {t('plcDashboard.presence.heading', { defaultValue: 'Who’s here' })}
        </span>
      )}
      <div className="flex items-center gap-2">
        <div
          className="flex items-center -space-x-2"
          role="list"
          aria-label={summary}
        >
          {visible.map((p) => {
            const inSection = t('plcDashboard.presence.inSection', {
              section: sectionLabel(p.section),
              defaultValue: 'in {{section}}',
            });
            const itemLabel = p.isSelf
              ? `${t('plcDashboard.presence.youLabel', {
                  defaultValue: 'You',
                })} · ${inSection}`
              : `${p.displayName} · ${inSection}`;
            return (
              <div
                key={p.uid}
                role="listitem"
                aria-label={itemLabel}
                title={itemLabel}
                className={`relative flex items-center justify-center rounded-full font-bold shadow-sm ring-2 ring-white ${avatarSize} ${
                  p.isSelf
                    ? 'bg-brand-blue-primary text-white'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                <span aria-hidden="true">
                  {initialsFromName(p.displayName)}
                </span>
                {/* Solid "live" dot — color-coded, NOT animated (calm + a11y). */}
                <span
                  aria-hidden="true"
                  className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white"
                />
              </div>
            );
          })}
          {overflow > 0 && (
            <div
              role="listitem"
              aria-label={t('plcDashboard.presence.overflow', {
                count: overflow,
                defaultValue: '+{{count}} more here',
              })}
              title={t('plcDashboard.presence.overflow', {
                count: overflow,
                defaultValue: '+{{count}} more here',
              })}
              className={`flex items-center justify-center rounded-full bg-slate-200 ring-2 ring-white font-bold text-slate-600 ${avatarSize}`}
            >
              +{overflow}
            </div>
          )}
        </div>
        {compact ? (
          <span className="sr-only">{summary}</span>
        ) : (
          <span className="text-xs font-medium text-slate-500">
            {summary}
            {selfPresent && others.length > 0 && (
              <span className="text-slate-400">
                {' · '}
                {t('plcDashboard.presence.includingYou', {
                  defaultValue: 'including you',
                })}
              </span>
            )}
          </span>
        )}
      </div>
    </section>
  );
};
