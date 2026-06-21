/**
 * PlcSharedDataFilters — controlled filter bar for the (aggregate-driven) Shared
 * Data view (Wave 3). Filters now operate over the anonymized
 * `PlcAssessmentAggregate` rollups + their designated `PlcCommonAssessment`
 * metadata, NOT raw contributions — so there are no student names anywhere in
 * this bar.
 *
 * Props:
 *   filters    — current filter state (controlled)
 *   onChange   — callback when any filter changes
 *   teachers   — teachers seen across aggregates' perTeacher rows (teacher dropdown)
 *   unitLabels — unit labels from designated assessments (unit dropdown)
 *   hasDesignated — whether any designated assessment exists (gates the status filter)
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import type {
  AssessmentStatusFilter,
  SharedDataAggregateFilters,
} from './sharedDataSelectors';

export interface PlcSharedDataFiltersProps {
  filters: SharedDataAggregateFilters;
  onChange: (next: SharedDataAggregateFilters) => void;
  /** Unique teachers derived from aggregates' perTeacher rows. */
  teachers: { uid: string; name: string }[];
  /** Distinct unit labels from designated assessments. */
  unitLabels: string[];
  /** Whether the team has designated any common assessment (gates status filter). */
  hasDesignated: boolean;
}

const STATUS_OPTIONS: AssessmentStatusFilter[] = [
  'planning',
  'active',
  'reviewing',
  'closed',
];

export const PlcSharedDataFilters: React.FC<PlcSharedDataFiltersProps> = ({
  filters,
  onChange,
  teachers,
  unitLabels,
  hasDesignated,
}) => {
  const { t } = useTranslation();

  function set<K extends keyof SharedDataAggregateFilters>(
    key: K,
    value: SharedDataAggregateFilters[K]
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
      {/* Search */}
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
        <Search className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
        <span className="sr-only" id="sd-filter-search-label">
          {t('plcDashboard.sharedData.filters.search', {
            defaultValue: 'Search assessments',
          })}
        </span>
        <input
          type="search"
          aria-labelledby="sd-filter-search-label"
          aria-label={t('plcDashboard.sharedData.filters.search', {
            defaultValue: 'Search assessments',
          })}
          value={filters.search}
          onChange={(e) => set('search', e.target.value)}
          placeholder={t('plcDashboard.sharedData.filters.searchPlaceholder', {
            defaultValue: 'Search…',
          })}
          className="w-36 text-xs bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/30"
        />
      </label>

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
            {teachers.map((teacher) => (
              <option key={teacher.uid} value={teacher.uid}>
                {teacher.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Unit filter */}
      {unitLabels.length > 0 && (
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <span id="sd-filter-unit-label">
            {t('plcDashboard.sharedData.filters.unit', {
              defaultValue: 'Unit',
            })}
          </span>
          <select
            aria-labelledby="sd-filter-unit-label"
            aria-label={t('plcDashboard.sharedData.filters.unit', {
              defaultValue: 'Unit',
            })}
            value={filters.unitLabel}
            onChange={(e) => set('unitLabel', e.target.value)}
            className="max-w-[160px] text-xs bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/30"
          >
            <option value="all">
              {t('plcDashboard.sharedData.filters.unitAll', {
                defaultValue: 'All units',
              })}
            </option>
            {unitLabels.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Status filter — only meaningful once a common assessment is designated */}
      {hasDesignated && (
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          <span id="sd-filter-status-label">
            {t('plcDashboard.sharedData.filters.status', {
              defaultValue: 'Status',
            })}
          </span>
          <select
            aria-labelledby="sd-filter-status-label"
            aria-label={t('plcDashboard.sharedData.filters.status', {
              defaultValue: 'Status',
            })}
            value={filters.status}
            onChange={(e) =>
              set('status', e.target.value as AssessmentStatusFilter)
            }
            className="text-xs bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/30"
          >
            <option value="all">
              {t('plcDashboard.sharedData.filters.statusAll', {
                defaultValue: 'All statuses',
              })}
            </option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {t(`plcDashboard.sharedData.status.${status}`, {
                  defaultValue: status,
                })}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
};
