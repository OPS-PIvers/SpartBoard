/**
 * PlcHome — the redesigned landing page for a PLC Dashboard session.
 *
 * Replaces the legacy draggable bento/grid overview with a clean,
 * responsive CSS grid layout. NOT a draggable grid — just cards.
 *
 * Layout (CSS grid, responsive):
 *   - xl: 3 columns — AttentionCard (2col) | QuickCreateCard (1col)
 *                      RecentDocsCard (1col) | [future slot]
 *                      MembersStripCard (full-width)
 *   - lg: 2 columns — AttentionCard (2col) | QuickCreateCard (1col)
 *   - sm/md: 1 column — stacked
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

      {/* Card grid */}
      <div className="flex-1 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 max-w-5xl">
          {/* Attention card: spans 2 cols on lg+ */}
          <div className="lg:col-span-2">
            <AttentionCard plc={plc} onNavigate={onNavigate} />
          </div>

          {/* Quick create: 1 col on lg+ */}
          <div className="lg:col-span-1">
            <QuickCreateCard onNavigate={onNavigate} />
          </div>

          {/* Recent docs */}
          <div className="lg:col-span-1">
            <RecentDocsCard plc={plc} onNavigate={onNavigate} />
          </div>

          {/* Members strip: spans full row on lg+ */}
          <div className="lg:col-span-3">
            <MembersStripCard plc={plc} onNavigate={onNavigate} />
          </div>
        </div>
      </div>
    </div>
  );
};
