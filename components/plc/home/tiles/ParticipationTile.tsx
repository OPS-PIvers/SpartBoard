// Participation tile: how many teachers ran each common assessment this school year.

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { UsersRound } from 'lucide-react';
import { getPlcFeatures } from '@/types';
import {
  usePlcAggregatesData,
  usePlcAssessmentsData,
  usePlcMembers,
} from '@/context/usePlcContext';
import { TileEmpty, TileFrame } from './TileFrame';
import { participationRows, type ParticipationRow } from './catalogSelectors';
import type { PlcHomeTileProps } from './tileTypes';

const HERO_ROW_LIMIT = 12;

const Ring: React.FC<{ ran: number; total: number; label: string }> = ({
  ran,
  total,
  label,
}) => {
  const r = 26;
  const circumference = 2 * Math.PI * r;
  const fraction = total > 0 ? Math.min(1, ran / total) : 0;
  return (
    <svg
      viewBox="0 0 64 64"
      className="h-20 w-20 shrink-0"
      role="img"
      aria-label={label}
    >
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        strokeWidth="8"
        className="stroke-slate-100"
      />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${fraction * circumference} ${circumference}`}
        transform="rotate(-90 32 32)"
        className="stroke-brand-blue-primary"
      />
      <text
        x="32"
        y="37"
        textAnchor="middle"
        className="fill-slate-800 text-[15px] font-bold"
      >
        {ran}/{total}
      </text>
    </svg>
  );
};

const HeroRow: React.FC<{ row: ParticipationRow }> = ({ row }) => {
  const { t } = useTranslation();
  const pct =
    row.expectedCount > 0 ? (row.ranCount / row.expectedCount) * 100 : 0;
  return (
    <li className="py-2">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
          {row.title}
        </span>
        <span className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-slate-100">
          <span
            className="block h-full rounded-full bg-brand-blue-primary"
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </span>
        <span className="w-24 shrink-0 text-right text-sm font-bold tabular-nums text-slate-700">
          {t('plcDashboard.home.participation.ranOf', {
            ran: row.ranCount,
            total: row.expectedCount,
            defaultValue: '{{ran}} of {{total}} ran it',
          })}
        </span>
      </div>
      {row.notRanNames.length > 0 && (
        <p className="mt-0.5 text-xs text-slate-500">
          {t('plcDashboard.home.participation.notYet', {
            names: row.notRanNames.join(', '),
            defaultValue: 'Not yet: {{names}}',
          })}
        </p>
      )}
    </li>
  );
};

export const ParticipationTile: React.FC<PlcHomeTileProps> = ({
  ctx,
  hero,
  controls,
}) => {
  const { t } = useTranslation();
  const { data: aggregates, loading: aggregatesLoading } =
    usePlcAggregatesData();
  const { data: assessments, loading: assessmentsLoading } =
    usePlcAssessmentsData();
  const members = usePlcMembers();
  const withNames = getPlcFeatures(ctx.plc).showPerTeacher;
  const rows = useMemo(
    () =>
      participationRows({
        aggregates,
        assessments,
        members,
        now: ctx.now,
        withNames,
      }),
    [aggregates, assessments, members, ctx.now, withNames]
  );
  const latest = rows[0];
  const loading = aggregatesLoading || assessmentsLoading;

  return (
    <TileFrame
      icon={UsersRound}
      title={t('plcDashboard.home.participation.title', {
        defaultValue: 'Participation',
      })}
      hero={hero}
      headerExtra={controls}
      link={{
        label: t('plcDashboard.home.results.open', {
          defaultValue: 'Open Assessments',
        }),
        onClick: () => ctx.onNavigate('assessments'),
      }}
    >
      {!latest ? (
        !loading && (
          <TileEmpty>
            {t('plcDashboard.home.participation.empty', {
              defaultValue: 'No common assessments this school year.',
            })}
          </TileEmpty>
        )
      ) : hero ? (
        <ul className="divide-y divide-slate-100">
          {rows.slice(0, HERO_ROW_LIMIT).map((row) => (
            <HeroRow key={row.assessmentId} row={row} />
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-4 py-2">
          <Ring
            ran={latest.ranCount}
            total={latest.expectedCount}
            label={t('plcDashboard.home.participation.ranOf', {
              ran: latest.ranCount,
              total: latest.expectedCount,
              defaultValue: '{{ran}} of {{total}} ran it',
            })}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800">
              {latest.title}
            </p>
            <p className="text-xs text-slate-500">
              {t('plcDashboard.home.participation.teachersRan', {
                ran: latest.ranCount,
                total: latest.expectedCount,
                defaultValue: '{{ran}} of {{total}} teachers ran it',
              })}
            </p>
          </div>
        </div>
      )}
    </TileFrame>
  );
};
