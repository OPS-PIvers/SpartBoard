/**
 * PlcHome — the redesigned landing page for a PLC Dashboard session.
 *
 * Replaces the legacy draggable bento/grid overview with a clean,
 * responsive two-column layout. NOT a draggable grid — just cards.
 *
 * Layout:
 *   - lg+: two columns — a wider primary column (Attention + Recent Docs)
 *          and a narrower sidebar column (Quick Create + Members). The two
 *          columns flow independently (no forced row alignment), so there
 *          are no empty grid holes regardless of how tall each card grows.
 *   - sm/md: single column — cards stack in priority order.
 *
 * Design intent: "calm, clean, professional" — glassmorphism card surfaces,
 * generous whitespace, strong type hierarchy. Normal Tailwind sizing (this
 * is modal chrome, NOT a widget front-face — no cqmin units needed).
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Plc } from '@/types';
import type { PlcSectionId } from '../sections';
import { AttentionCard } from './cards/AttentionCard';
import { QuickCreateCard } from './cards/QuickCreateCard';
import { RecentDocsCard } from './cards/RecentDocsCard';
import { MembersStripCard } from './cards/MembersStripCard';

interface PlcHomeProps {
  plc: Plc;
  onNavigate: (id: PlcSectionId) => void;
}

export const PlcHome: React.FC<PlcHomeProps> = ({ plc, onNavigate }) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Page header */}
      <div className="px-6 pt-6 pb-4 border-b border-slate-100 bg-white/50 backdrop-blur-sm">
        <h2 className="text-xl font-bold text-slate-900 truncate">
          {plc.name}
        </h2>
        <p className="text-sm text-slate-500 mt-0.5">
          {t('plcDashboard.home.subtitle', {
            defaultValue: 'Your collaborative space',
          })}
        </p>
      </div>

      {/* Two-column dashboard */}
      <div className="flex-1 p-6">
        <div className="mx-auto w-full max-w-6xl grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          {/* Primary column — what the PLC is working on */}
          <div className="lg:col-span-2 flex flex-col gap-5">
            <AttentionCard plc={plc} onNavigate={onNavigate} />
            <RecentDocsCard plc={plc} onNavigate={onNavigate} />
          </div>

          {/* Sidebar column — actions + people */}
          <div className="lg:col-span-1 flex flex-col gap-5">
            <QuickCreateCard onNavigate={onNavigate} />
            <MembersStripCard plc={plc} onNavigate={onNavigate} />
          </div>
        </div>
      </div>
    </div>
  );
};
