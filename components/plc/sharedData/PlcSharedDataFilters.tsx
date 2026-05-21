/**
 * PlcSharedDataFilters — controlled filter bar for the Shared Data view.
 *
 * Props:
 *   filters    — current filter state (controlled)
 *   onChange   — callback when any filter changes
 *   teachers   — list of teachers who have contributed, for the teacher dropdown
 *   entries    — list of assignment index entries, for the assignment dropdown
 *   classPeriods — list of class periods seen in contributions, for the period dropdown
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { PlcAssignmentIndexEntry } from '@/types';
import type { SharedDataFilters } from './sharedDataSelectors';

export interface PlcSharedDataFiltersProps {
  filters: SharedDataFilters & { classPeriod: string };
  onChange: (next: SharedDataFilters & { classPeriod: string }) => void;
  /** Unique teachers derived from contributions. */
  teachers: { uid: string; name: string }[];
  /** All assignment index entries for the assignment filter. */
  entries: PlcAssignmentIndexEntry[];
  /** Distinct class periods seen across contribution responses. */
  classPeriods: string[];
}

export const PlcSharedDataFilters: React.FC<PlcSharedDataFiltersProps> = ({
  filters,
  onChange,
  teachers,
  entries,
  classPeriods,
}) => {
  const { t } = useTranslation();

  function set<K extends keyof typeof filters>(
    key: K,
    value: (typeof filters)[K]
  ) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div
      role="group"
      aria-label={t('plcDashboard.sharedData.filters.label', {
        defaultValue: 'Filter shared data',
      })}
      className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3"
    >
      {/* Type filter */}
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
        <span id="sd-filter-type-label">
          {t('plcDashboard.sharedData.filters.type', {
            defaultValue: 'Type',
          })}
        </span>
        <select
          aria-labelledby="sd-filter-type-label"
          aria-label={t('plcDashboard.sharedData.filters.type', {
            defaultValue: 'Type',
          })}
          value={filters.type}
          onChange={(e) =>
            set('type', e.target.value as 'all' | 'quiz' | 'video-activity')
          }
          className="text-xs bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/30"
        >
          <option value="all">
            {t('plcDashboard.sharedData.filters.typeAll', {
              defaultValue: 'All types',
            })}
          </option>
          <option value="quiz">
            {t('plcDashboard.sharedData.filters.typeQuiz', {
              defaultValue: 'Quizzes',
            })}
          </option>
          <option value="video-activity">
            {t('plcDashboard.sharedData.filters.typeVA', {
              defaultValue: 'Video Activities',
            })}
          </option>
        </select>
      </label>

      {/* Teacher filter */}
      {teachers.length > 0 && (
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <span id="sd-filter-teacher-label">
            {t('plcDashboard.sharedData.filters.teacher', {
              defaultValue: 'Teacher',
            })}
          </span>
          <select
            aria-labelledby="sd-filter-teacher-label"
            aria-label={t('plcDashboard.sharedData.filters.teacher', {
              defaultValue: 'Teacher',
            })}
            value={filters.teacherUid}
            onChange={(e) => set('teacherUid', e.target.value)}
            className="text-xs bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/30"
          >
            <option value="all">
              {t('plcDashboard.sharedData.filters.teacherAll', {
                defaultValue: 'All teachers',
              })}
            </option>
            {teachers.map((t) => (
              <option key={t.uid} value={t.uid}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Assignment filter */}
      {entries.length > 0 && (
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <span id="sd-filter-assignment-label">
            {t('plcDashboard.sharedData.filters.assignment', {
              defaultValue: 'Assignment',
            })}
          </span>
          <select
            aria-labelledby="sd-filter-assignment-label"
            aria-label={t('plcDashboard.sharedData.filters.assignment', {
              defaultValue: 'Assignment',
            })}
            value={filters.assignmentId}
            onChange={(e) => set('assignmentId', e.target.value)}
            className="max-w-[180px] text-xs bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/30"
          >
            <option value="all">
              {t('plcDashboard.sharedData.filters.assignmentAll', {
                defaultValue: 'All assignments',
              })}
            </option>
            {entries.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Class-period filter */}
      {classPeriods.length > 0 && (
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <span id="sd-filter-period-label">
            {t('plcDashboard.sharedData.filters.classPeriod', {
              defaultValue: 'Class Period',
            })}
          </span>
          <select
            aria-labelledby="sd-filter-period-label"
            aria-label={t('plcDashboard.sharedData.filters.classPeriod', {
              defaultValue: 'Class Period',
            })}
            value={filters.classPeriod}
            onChange={(e) => set('classPeriod', e.target.value)}
            className="text-xs bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/30"
          >
            <option value="all">
              {t('plcDashboard.sharedData.filters.classPeriodAll', {
                defaultValue: 'All periods',
              })}
            </option>
            {classPeriods.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
};
