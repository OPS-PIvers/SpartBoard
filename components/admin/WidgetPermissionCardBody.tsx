import React from 'react';
import {
  FeaturePermission,
  AccessLevel,
  GradeLevel,
  ToolMetadata,
} from '@/types';
import { ALL_GRADE_LEVELS } from '@/config/widgetGradeLevels';
import { Shield, Users, Globe, Save, Settings } from 'lucide-react';
import { Toggle } from '@/components/common/Toggle';
import { BetaUsersPanel } from '@/components/admin/BetaUsersPanel';
import { MinTierSelect } from '@/components/admin/MinTierSelect';

const getAccessLevelIcon = (level: AccessLevel) => {
  switch (level) {
    case 'admin':
      return <Shield className="w-4 h-4" />;
    case 'beta':
      return <Users className="w-4 h-4" />;
    case 'public':
      return <Globe className="w-4 h-4" />;
  }
};

const getAccessLevelColor = (level: AccessLevel) => {
  switch (level) {
    case 'admin':
      return 'bg-purple-100 text-purple-700 border-purple-300';
    case 'beta':
      return 'bg-blue-100 text-blue-700 border-blue-300';
    case 'public':
      return 'bg-green-100 text-green-700 border-green-300';
  }
};

interface WidgetPermissionCardBodyProps {
  variant: 'grid' | 'list';
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
}

// Shared by both the list and grid rows in FeaturePermissionsManager.
export const WidgetPermissionCardBody: React.FC<
  WidgetPermissionCardBodyProps
> = ({
  variant,
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
}) => {
  if (variant === 'list') {
    return (
      <div className="bg-white border-2 border-slate-200 rounded-xl hover:border-brand-blue-light transition-colors overflow-hidden">
        {/* Top Bar */}
        <div className="flex items-center gap-4 p-3">
          {/* Identity Section: Icon + Name Input */}
          <div className="flex items-center gap-3 w-56 xl:w-64 shrink-0">
            <div className={`${tool.color} p-2 rounded-lg text-white shrink-0`}>
              <tool.icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <input
                type="text"
                value={permission.displayName ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  updatePermission({ displayName: val || undefined });
                }}
                className="w-full font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-brand-blue-primary focus:outline-none px-0 py-0.5 transition-colors"
                placeholder={tool.label}
              />
              <p className="text-xs text-slate-500">{tool.type}</p>
            </div>
          </div>

          <div className="w-px h-8 bg-slate-100 mx-2" />

          {/* Enabled Toggle */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-xxs font-bold text-slate-400 uppercase">
              Enabled
            </span>
            <Toggle
              checked={permission.enabled}
              onChange={(checked) => updatePermission({ enabled: checked })}
              size="sm"
              label={`${tool.label} enabled`}
            />
          </div>

          {/* Access Level Controls */}
          <div className="flex items-center gap-1 ml-4">
            {(['admin', 'beta', 'public'] as AccessLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => updatePermission({ accessLevel: level })}
                className={`px-2 py-1.5 rounded-md border text-xs font-medium flex items-center gap-1 transition-all ${
                  permission.accessLevel === level
                    ? getAccessLevelColor(level)
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {getAccessLevelIcon(level)}
                <span className="capitalize">{level}</span>
              </button>
            ))}
          </div>

          {/* Grade Level Controls */}
          <div className="flex items-center gap-1 ml-4 flex-1 flex-wrap justify-end">
            {ALL_GRADE_LEVELS.map((level) => {
              const isSelected = currentLevels.includes(level);
              return (
                <button
                  key={level}
                  onClick={() => toggleGradeLevel(level)}
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
              onClick={toggleAllGradeLevels}
              className={`px-2 py-1 rounded-md text-xxs font-bold border transition-all ${
                isAllSelected
                  ? 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              ALL
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 ml-4 pl-4 border-l border-slate-100">
            <button
              onClick={onEditConfig}
              className={`p-2 rounded-lg transition-colors ${
                isActiveModal
                  ? 'bg-brand-blue-primary text-white'
                  : 'text-slate-400 hover:bg-slate-100'
              }`}
              title="Edit widget configuration"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={savePermission}
              disabled={isSaving || !hasUnsavedChanges}
              className={`p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                hasUnsavedChanges
                  ? 'bg-orange-600 hover:bg-orange-700 text-white'
                  : 'text-slate-300 hover:bg-brand-blue-primary hover:text-white'
              }`}
              title={hasUnsavedChanges ? 'Save Changes' : 'No changes to save'}
            >
              <Save className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Minimum Tier */}
        <div className="border-t border-slate-100 bg-slate-50 p-4">
          <MinTierSelect
            value={permission.minTier}
            onChange={(minTier) => updatePermission({ minTier })}
          />
        </div>

        {/* Expanded Content Wrapper */}
        {permission.accessLevel === 'beta' && (
          <div className="border-t border-slate-100 bg-slate-50">
            {/* Beta Users Panel */}
            <BetaUsersPanel
              tool={tool}
              permission={permission}
              updatePermission={(_widgetType, updates) =>
                updatePermission(updates)
              }
              showMessage={showMessage}
              variant="expanded"
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border-2 border-slate-200 rounded-xl p-4 hover:border-brand-blue-light transition-colors">
      {/* Widget Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`${tool.color} p-2 rounded-lg text-white`}>
            <tool.icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={permission.displayName ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                updatePermission({ displayName: val || undefined });
              }}
              className="w-full font-bold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-brand-blue-primary focus:outline-none px-0 py-0.5 transition-colors"
              placeholder={tool.label}
            />
            <p className="text-xs text-slate-500">{tool.type}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onEditConfig}
            className={`p-2 rounded-lg transition-colors ${
              isActiveModal
                ? 'bg-brand-blue-primary text-white'
                : 'text-slate-400 hover:bg-slate-100'
            }`}
            title="Edit widget configuration"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Enabled Toggle */}
      <div className="flex items-center justify-between mb-3 p-3 bg-slate-50 rounded-lg">
        <span className="text-sm font-medium text-slate-700">
          Feature Enabled
        </span>
        <Toggle
          checked={permission.enabled}
          onChange={(checked) => updatePermission({ enabled: checked })}
          size="md"
          label={`${tool.label} enabled`}
        />
      </div>

      {/* Access Level */}
      <div className="mb-3">
        <label className="text-sm font-medium text-slate-700 mb-2 block">
          Access Level
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(['admin', 'beta', 'public'] as AccessLevel[]).map((level) => (
            <button
              key={level}
              onClick={() => updatePermission({ accessLevel: level })}
              className={`px-3 py-2 rounded-lg border-2 text-sm font-medium flex items-center justify-center gap-1 transition-all ${
                permission.accessLevel === level
                  ? getAccessLevelColor(level)
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {getAccessLevelIcon(level)}
              <span className="capitalize">{level}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Grade Levels */}
      <div className="mb-3">
        <label className="text-sm font-medium text-slate-700 mb-2 block">
          Grade Levels
        </label>
        <div className="grid grid-cols-5 gap-1">
          {ALL_GRADE_LEVELS.map((level) => {
            const isSelected = currentLevels.includes(level);

            return (
              <button
                key={level}
                onClick={() => toggleGradeLevel(level)}
                className={`py-1.5 rounded-md text-xxs font-bold border transition-all ${
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
            onClick={toggleAllGradeLevels}
            className={`py-1.5 rounded-md text-xxs font-bold border transition-all ${
              isAllSelected
                ? 'bg-brand-blue-primary text-white border-brand-blue-primary shadow-sm'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            ALL
          </button>
        </div>
      </div>

      {/* Minimum Tier */}
      <div className="mb-3">
        <MinTierSelect
          value={permission.minTier}
          onChange={(minTier) => updatePermission({ minTier })}
        />
      </div>

      {/* Beta Users (only show if access level is beta) */}
      {permission.accessLevel === 'beta' && (
        <BetaUsersPanel
          tool={tool}
          permission={permission}
          updatePermission={(_widgetType, updates) => updatePermission(updates)}
          showMessage={showMessage}
          variant="card"
        />
      )}

      {/* Save Button */}
      <button
        onClick={savePermission}
        disabled={isSaving || !hasUnsavedChanges}
        className={`w-full px-4 py-2 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
          hasUnsavedChanges
            ? 'bg-orange-600 hover:bg-orange-700 text-white'
            : 'bg-brand-blue-primary hover:bg-brand-blue-dark text-white'
        }`}
      >
        <Save className="w-4 h-4" />
        {isSaving
          ? 'Saving...'
          : hasUnsavedChanges
            ? 'Save Changes'
            : 'Save Permissions'}
      </button>
    </div>
  );
};
