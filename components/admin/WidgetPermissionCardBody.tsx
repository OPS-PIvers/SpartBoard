import React, { useState } from 'react';
import { tourFieldAttr } from '@/config/tourAnchors';
import type { FeaturePermission, GradeLevel, ToolMetadata } from '@/types';
import { ALL_GRADE_LEVELS } from '@/config/widgetGradeLevels';
import { ChevronDown, Save, Settings } from 'lucide-react';
import { Toggle } from '@/components/common/Toggle';
import { BetaUsersPanel } from '@/components/admin/BetaUsersPanel';
import { MinTierSelect } from '@/components/admin/MinTierSelect';
import {
  AccessLevelPicker,
  Chip,
} from '@/components/admin/access/AccessFeatureRow';

const TIER_CHIP: Record<string, string> = {
  free: 'Free tier',
  org: 'Org tier',
  internal: 'Internal tier',
};

interface WidgetPermissionCardBodyProps {
  tool: ToolMetadata;
  permission: FeaturePermission;
  currentLevels: GradeLevel[];
  isAllSelected: boolean;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  isActiveModal: boolean;
  updatePermission: (updates: Partial<FeaturePermission>) => void;
  toggleGradeLevel: (level: GradeLevel) => void;
  toggleAllGradeLevels: () => void;
  savePermission: () => void;
  onEditConfig: () => void;
  showMessage: (type: 'success' | 'error', text: string) => void;
  /** Switches this widget owns (global features), shown when expanded. */
  subFeatures?: React.ReactNode;
  subFeatureCount?: number;
}

/** One collapsed line per Dock item; expands for grades, tier, testers and owned switches (plan D8). */
export const WidgetPermissionCardBody: React.FC<
  WidgetPermissionCardBodyProps
> = ({
  tool,
  permission,
  currentLevels,
  isAllSelected,
  isSaving,
  hasUnsavedChanges,
  isActiveModal,
  updatePermission,
  toggleGradeLevel,
  toggleAllGradeLevels,
  savePermission,
  onEditConfig,
  showMessage,
  subFeatures,
  subFeatureCount = 0,
}) => {
  const [expanded, setExpanded] = useState(false);
  const name = permission.displayName?.trim()
    ? permission.displayName
    : tool.label;
  const panelId = `widget-row-${tool.type}`;
  const gradeChip = isAllSelected
    ? 'All grades'
    : currentLevels.map((l) => l.toUpperCase()).join(', ') || 'No grades';

  return (
    <div data-testid={`widget-row-${tool.type}`} className="bg-white">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 hover:bg-slate-50 transition-colors">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={panelId}
          {...tourFieldAttr('admin.access.expand', 'admin', tool.type)}
          className="flex items-center gap-3 min-w-0 flex-1 text-left"
        >
          <span className={`${tool.color} p-2 rounded-lg text-white shrink-0`}>
            <tool.icon className="w-4 h-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-slate-800 text-sm">{name}</span>
              <Chip>{gradeChip}</Chip>
              {permission.minTier && (
                <Chip>{TIER_CHIP[permission.minTier]}</Chip>
              )}
              {permission.accessLevel === 'beta' && (
                <Chip>
                  {permission.betaUsers.length} tester
                  {permission.betaUsers.length === 1 ? '' : 's'}
                </Chip>
              )}
              {subFeatureCount > 0 && (
                <Chip>
                  {subFeatureCount} switch{subFeatureCount === 1 ? '' : 'es'}
                </Chip>
              )}
            </span>
            <span className="block text-xxs text-slate-500 truncate">
              {tool.type}
            </span>
          </span>
          <ChevronDown
            className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
        <div className="flex items-center gap-3 ml-auto">
          <Toggle
            checked={permission.enabled}
            onChange={(checked) => updatePermission({ enabled: checked })}
            size="sm"
            label={`${tool.label} enabled`}
            anchor={tourFieldAttr('admin.access.enabled', 'admin', tool.type)}
          />
          <AccessLevelPicker
            value={permission.accessLevel}
            onChange={(accessLevel) => updatePermission({ accessLevel })}
            label={tool.label}
            anchorKey={tool.type}
          />
          <button
            type="button"
            onClick={onEditConfig}
            aria-label={`Configure ${tool.label}`}
            {...tourFieldAttr('admin.widgets.configure', 'admin', tool.type)}
            title="Edit widget configuration"
            className={`p-2 rounded-lg transition-colors ${
              isActiveModal
                ? 'bg-brand-blue-primary text-white'
                : 'text-slate-400 hover:bg-slate-100'
            }`}
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={savePermission}
            disabled={isSaving || !hasUnsavedChanges}
            aria-label={`Save ${tool.label}`}
            {...tourFieldAttr('admin.access.save', 'admin', tool.type)}
            title={hasUnsavedChanges ? 'Save changes' : 'No changes to save'}
            className={`p-2 rounded-lg transition-colors disabled:cursor-not-allowed ${
              hasUnsavedChanges
                ? 'bg-orange-600 hover:bg-orange-700 text-white'
                : 'text-slate-300'
            }`}
          >
            <Save className="w-4 h-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div
          id={panelId}
          className="border-t border-slate-100 bg-slate-50 p-4 space-y-4"
        >
          <label className="block max-w-xs">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">
              Display name
            </span>
            <input
              type="text"
              value={permission.displayName ?? ''}
              onChange={(e) =>
                updatePermission({ displayName: e.target.value || undefined })
              }
              placeholder={tool.label}
              {...tourFieldAttr(
                'admin.widgets.display-name',
                'admin',
                tool.type
              )}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue-primary"
            />
          </label>
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">
              Grade levels
            </span>
            <div className="flex flex-wrap gap-1">
              {ALL_GRADE_LEVELS.map((level) => {
                const isSelected = currentLevels.includes(level);
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => toggleGradeLevel(level)}
                    aria-pressed={isSelected}
                    {...tourFieldAttr(
                      'admin.widgets.grade-level',
                      'admin',
                      level
                    )}
                    className={`px-2 py-1 rounded-md text-xxs font-bold border transition-all ${
                      isSelected
                        ? 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {level.toUpperCase()}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={toggleAllGradeLevels}
                aria-pressed={isAllSelected}
                {...tourFieldAttr('admin.widgets.grade-level', 'admin', 'all')}
                className={`px-2 py-1 rounded-md text-xxs font-bold border transition-all ${
                  isAllSelected
                    ? 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                ALL
              </button>
            </div>
          </div>
          <MinTierSelect
            value={permission.minTier}
            onChange={(minTier) => updatePermission({ minTier })}
          />
          {permission.accessLevel === 'beta' && (
            <BetaUsersPanel
              betaUsers={permission.betaUsers}
              onChange={(betaUsers) => updatePermission({ betaUsers })}
              showMessage={showMessage}
              variant="expanded"
            />
          )}
          {subFeatures && (
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest block mb-2">
                Switches
              </span>
              <div className="divide-y divide-slate-200 border-y border-slate-200">
                {subFeatures}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
