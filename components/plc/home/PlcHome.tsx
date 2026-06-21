/**
 * PlcHome — the redesigned landing page for a PLC Dashboard session.
 *
 * Replaces the legacy draggable bento/grid overview with a clean,
 * responsive layout. NOT a draggable grid — just cards.
 *
 * Layout:
 *   - Header: title/subtitle (left) + members cluster (right), with a
 *     quick-create button bar directly beneath.
 *   - lg+: two columns filling the full content width — Attention (wider)
 *          and Recent Docs (narrower). Columns flow independently, so there
 *          are no empty grid holes.
 *   - sm/md: single column — cards stack in priority order.
 *
 * Design intent: "calm, clean, professional" — glassmorphism card surfaces,
 * generous whitespace, strong type hierarchy. Normal Tailwind sizing (this
 * is modal chrome, NOT a widget front-face — no cqmin units needed).
 */

import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Plc } from '@/types';
import type { PlcSectionId } from '../sections';
import { usePlcActivity } from '@/context/usePlcContext';
import { usePlcUnread } from '@/hooks/usePlcUnread';
import { AttentionCard } from './cards/AttentionCard';
import { CommonAssessmentBanner } from './cards/CommonAssessmentBanner';
import { QuickCreateBar } from './cards/QuickCreateBar';
import { RecentDocsCard } from './cards/RecentDocsCard';
import { MembersHeaderCluster } from './cards/MembersHeaderCluster';
import { SinceYouWereHereCard } from './cards/SinceYouWereHereCard';
import { YourActionItemsCard } from './cards/YourActionItemsCard';
import { PlcPresenceStrip } from '../presence/PlcPresenceStrip';
import { PlcActivityFeed } from '../activity/PlcActivityFeed';

interface PlcHomeProps {
  plc: Plc;
  onNavigate: (id: PlcSectionId) => void;
}

export const PlcHome: React.FC<PlcHomeProps> = ({ plc, onNavigate }) => {
  const { t } = useTranslation();

  // The provider already runs the bounded activity listener — pass it through so
  // usePlcUnread reads the cursor only (no second activity listener), per its
  // contract (T3).
  const activity = usePlcActivity();
  const { lastSeenAt, loading, markSeen } = usePlcUnread(plc.id, { activity });

  // Freeze the cursor as it was when Home was opened. markSeen() (below) advances
  // the live cursor to "now" to clear the sidebar badge; if the digest read the
  // live cursor it would immediately empty out. We snapshot the first SETTLED
  // cursor value (prev-prop pattern, not an effect) and render the digest against
  // that frozen value for the lifetime of this Home mount.
  const [frozenCursor, setFrozenCursor] = React.useState<number | null>(null);
  const [cursorFrozen, setCursorFrozen] = React.useState(false);
  // Re-arm the freeze if the PLC changes underneath us (prev-prop pattern) so a
  // stale cursor never bleeds across PLCs even without a remount.
  const [prevPlcId, setPrevPlcId] = React.useState(plc.id);
  if (plc.id !== prevPlcId) {
    setPrevPlcId(plc.id);
    setCursorFrozen(false);
    setFrozenCursor(null);
  }
  if (!cursorFrozen && !loading) {
    setCursorFrozen(true);
    setFrozenCursor(lastSeenAt);
  }

  // Mark the PLC seen when the teacher views Home — the one legitimate
  // external-sync use of useEffect (writing the owner-only plc_state cursor so
  // the T3 sidebar unread badge clears). Re-runs if the PLC changes (markSeen's
  // identity is keyed on plcId + uid).
  useEffect(() => {
    void markSeen();
  }, [markSeen]);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Page header — title/subtitle + members, then a quick-create bar */}
      <div className="px-6 pt-6 pb-4 border-b border-slate-100 bg-white/50 backdrop-blur-sm">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-slate-900 truncate">
              {plc.name}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {t('plcDashboard.home.subtitle', {
                defaultValue: 'Your collaborative space',
              })}
            </p>
          </div>
          <MembersHeaderCluster plc={plc} onNavigate={onNavigate} />
        </div>
        {/* Who's here now — live per-section presence (PRD §6.3). */}
        <div className="mt-3">
          <PlcPresenceStrip plc={plc} />
        </div>
        <div className="mt-4">
          <QuickCreateBar plc={plc} onNavigate={onNavigate} />
        </div>
      </div>

      {/* Two-column dashboard — fills the full content width */}
      <div className="flex-1 p-6">
        {/* Common-assessment status banner + Start/Resume Meeting CTA — the
            hero strip spanning both columns (PRD §6.3). */}
        <div className="mb-5">
          <CommonAssessmentBanner plc={plc} onNavigate={onNavigate} />
        </div>

        <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          {/* Primary column — the since-you-were-here digest, then what the
              PLC is working on */}
          <div className="lg:col-span-2 flex flex-col gap-5">
            <SinceYouWereHereCard
              plc={plc}
              activity={activity}
              lastSeenAt={frozenCursor}
            />
            <AttentionCard plc={plc} onNavigate={onNavigate} />
          </div>

          {/* Sidebar column — your action items, recent docs, then the full
              activity feed */}
          <div className="lg:col-span-1 flex flex-col gap-5">
            <YourActionItemsCard plc={plc} onNavigate={onNavigate} />
            <RecentDocsCard plc={plc} onNavigate={onNavigate} />
            <PlcActivityFeed plc={plc} />
          </div>
        </div>
      </div>
    </div>
  );
};
