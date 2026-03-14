import React, { useState } from 'react';
import { useDashboard } from '../../../context/useDashboard';
import { useAuth } from '../../../context/useAuth';
import {
  WidgetData,
  ExpectationsConfig,
  ExpectationsGlobalConfig,
} from '../../../types';
import {
  Volume2,
  Users,
  ArrowLeft,
  MessagesSquare,
  CheckCircle2,
} from 'lucide-react';

// --- Constants & Data ---

import { WidgetLayout } from '../WidgetLayout';
import {
  VOLUME_OPTIONS,
  GROUP_OPTIONS,
  INTERACTION_OPTIONS,
} from '../../../config/expectationsData';

export const ExpectationsWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget } = useDashboard();
  const { featurePermissions, selectedBuildings } = useAuth();
  const config = widget.config as ExpectationsConfig;
  const { voiceLevel = null, workMode = null, interactionMode = null } = config;

  // Get global expectations config
  const expectationsPermission = featurePermissions.find(
    (p) => p.widgetType === 'expectations'
  );
  const globalConfig = expectationsPermission?.config as
    | ExpectationsGlobalConfig
    | undefined;

  // Get current building's config
  const primaryBuildingId = selectedBuildings?.[0];
  const buildingConfig = primaryBuildingId
    ? globalConfig?.buildings?.[primaryBuildingId]
    : undefined;

  // Compute active options based on overrides and category toggles
  const activeVolumeOptions =
    buildingConfig?.showVolume === false
      ? []
      : (VOLUME_OPTIONS.map((opt) => {
          const override = buildingConfig?.volumeOverrides?.[opt.id];
          if (override && override.enabled === false) return null;
          return {
            ...opt,
            label: override?.customLabel ?? opt.label,
            sub: override?.customSub ?? opt.sub,
          };
        }).filter(Boolean) as typeof VOLUME_OPTIONS);

  const activeGroupOptions =
    buildingConfig?.showGroup === false
      ? []
      : (GROUP_OPTIONS.map((opt) => {
          if (opt.id === null) return null;
          const override = buildingConfig?.groupOverrides?.[opt.id as string];
          if (override && override.enabled === false) return null;
          return {
            ...opt,
            label: override?.customLabel ?? opt.label,
          };
        }).filter(Boolean) as typeof GROUP_OPTIONS);

  const activeInteractionOptions =
    buildingConfig?.showInteraction === false
      ? []
      : (INTERACTION_OPTIONS.map((opt) => {
          if (opt.id === null) return null;
          const override =
            buildingConfig?.interactionOverrides?.[opt.id as string];
          if (override && override.enabled === false) return null;
          return {
            ...opt,
            label: override?.customLabel ?? opt.label,
          };
        }).filter(Boolean) as typeof INTERACTION_OPTIONS);

  const [activeCategory, setActiveCategory] = useState<
    'volume' | 'groups' | 'interaction' | null
  >(null);

  const updateConfig = (newConfig: Partial<ExpectationsConfig>) => {
    updateWidget(widget.id, {
      config: { ...config, ...newConfig },
    });
  };

  // --- Render Sub-views ---

  const renderSubViewHeader = (label: string) => (
    <div
      className="flex items-center shrink-0"
      style={{ padding: 'min(16px, 3cqmin)' }}
    >
      <button
        onClick={() => setActiveCategory(null)}
        className="hover:bg-slate-100 rounded-lg"
        style={{
          padding: 'min(6px, 1.2cqmin)',
          marginRight: 'min(12px, 2cqmin)',
        }}
      >
        <ArrowLeft
          style={{ width: 'min(24px, 6cqmin)', height: 'min(24px, 6cqmin)' }}
        />
      </button>
      <h3
        className="font-black text-slate-800 uppercase tracking-tight"
        style={{ fontSize: 'min(24px, 8cqmin)' }}
      >
        {label}
      </h3>
    </div>
  );

  const renderVolumeView = () => (
    <WidgetLayout
      padding="p-0"
      header={renderSubViewHeader('Volume Level')}
      contentClassName="flex-1 min-h-0 flex flex-col"
      content={
        <div
          className="flex-1 min-h-0 overflow-y-auto flex flex-col custom-scrollbar w-full animate-in slide-in-from-right duration-200"
          style={{ padding: 'min(16px, 3cqmin)', gap: 'min(8px, 1.5cqmin)' }}
        >
          {activeVolumeOptions.map((v) => (
            <button
              key={v.id}
              onClick={() =>
                updateConfig({ voiceLevel: voiceLevel === v.id ? null : v.id })
              }
              className={`flex-1 flex items-center rounded-2xl border-2 transition-all ${
                voiceLevel === v.id
                  ? `${v.bg} border-current ${v.color} shadow-sm`
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
              }`}
              style={{
                gap: 'min(20px, 4cqmin)',
                padding: 'min(12px, 2.5cqmin)',
              }}
            >
              <span
                className="font-black opacity-40"
                style={{
                  fontSize: 'min(36px, 9cqmin)',
                  width: 'min(36px, 9cqmin)',
                }}
              >
                {v.id}
              </span>
              <div className="text-left">
                <div
                  className="font-black uppercase leading-tight"
                  style={{ fontSize: 'min(24px, 8cqmin)' }}
                >
                  {v.label}
                </div>
                <div
                  className="font-bold opacity-60 uppercase"
                  style={{ fontSize: 'min(14px, 5cqmin)' }}
                >
                  {v.sub}
                </div>
              </div>
              {voiceLevel === v.id && (
                <CheckCircle2
                  className="ml-auto"
                  style={{
                    width: 'min(28px, 7cqmin)',
                    height: 'min(28px, 7cqmin)',
                  }}
                />
              )}
            </button>
          ))}
        </div>
      }
    />
  );

  const renderGroupsView = () => (
    <WidgetLayout
      padding="p-0"
      header={renderSubViewHeader('Group Size')}
      contentClassName="flex-1 min-h-0 flex flex-col"
      content={
        <div
          className="flex-1 min-h-0 overflow-y-auto flex flex-col custom-scrollbar w-full animate-in slide-in-from-right duration-200"
          style={{ padding: 'min(16px, 3cqmin)', gap: 'min(12px, 2.5cqmin)' }}
        >
          {activeGroupOptions.map((g) => (
            <button
              key={g.id}
              onClick={() =>
                updateConfig({ workMode: workMode === g.id ? null : g.id })
              }
              className={`flex-1 flex items-center rounded-2xl border-2 transition-all ${
                workMode === g.id
                  ? `${g.bg} border-current ${g.color} shadow-sm`
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
              }`}
              style={{
                gap: 'min(20px, 4cqmin)',
                padding: 'min(16px, 3.5cqmin)',
              }}
            >
              <g.icon
                style={{
                  width: 'min(40px, 10cqmin)',
                  height: 'min(40px, 10cqmin)',
                }}
                strokeWidth={2.5}
              />
              <span
                className="font-black uppercase tracking-wide"
                style={{ fontSize: 'min(24px, 8cqmin)' }}
              >
                {g.label}
              </span>
              {workMode === g.id && (
                <CheckCircle2
                  className="ml-auto"
                  style={{
                    width: 'min(28px, 7cqmin)',
                    height: 'min(28px, 7cqmin)',
                  }}
                />
              )}
            </button>
          ))}
        </div>
      }
    />
  );

  const renderInteractionView = () => (
    <WidgetLayout
      padding="p-0"
      header={renderSubViewHeader('Interaction')}
      contentClassName="flex-1 min-h-0 flex flex-col"
      content={
        <div
          className="flex-1 min-h-0 overflow-y-auto flex flex-col custom-scrollbar w-full animate-in slide-in-from-right duration-200"
          style={{ padding: 'min(16px, 3cqmin)', gap: 'min(12px, 2.5cqmin)' }}
        >
          {activeInteractionOptions.map((i) => (
            <button
              key={i.id}
              onClick={() =>
                updateConfig({
                  interactionMode: interactionMode === i.id ? null : i.id,
                })
              }
              className={`flex-1 flex items-center rounded-2xl border-2 transition-all ${
                interactionMode === i.id
                  ? `${i.bg} border-current ${i.color} shadow-sm`
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
              }`}
              style={{
                gap: 'min(20px, 4cqmin)',
                padding: 'min(16px, 3.5cqmin)',
              }}
            >
              <i.icon
                style={{
                  width: 'min(40px, 10cqmin)',
                  height: 'min(40px, 10cqmin)',
                }}
                strokeWidth={2.5}
              />
              <span
                className="font-black uppercase tracking-wide"
                style={{ fontSize: 'min(24px, 8cqmin)' }}
              >
                {i.label}
              </span>
              {interactionMode === i.id && (
                <CheckCircle2
                  className="ml-auto"
                  style={{
                    width: 'min(28px, 7cqmin)',
                    height: 'min(28px, 7cqmin)',
                  }}
                />
              )}
            </button>
          ))}
        </div>
      }
    />
  );

  // --- Main Category Picker ---

  if (activeCategory === 'volume') return renderVolumeView();
  if (activeCategory === 'groups') return renderGroupsView();
  if (activeCategory === 'interaction') return renderInteractionView();

  const selectedVolume = activeVolumeOptions.find((v) => v.id === voiceLevel);
  const selectedGroup = activeGroupOptions.find((g) => g.id === workMode);
  const selectedInteraction = activeInteractionOptions.find(
    (i) => i.id === interactionMode
  );

  const isElementary = config.layout === 'elementary';

  const showVolume = buildingConfig?.showVolume !== false;
  const showGroup = buildingConfig?.showGroup !== false;
  const showInteraction = buildingConfig?.showInteraction !== false;

  // If no categories are enabled, show an empty state
  if (!showVolume && !showGroup && !showInteraction) {
    return (
      <WidgetLayout
        padding="p-0"
        content={
          <div className="h-full w-full flex items-center justify-center text-slate-400 font-bold uppercase tracking-widest text-xs p-6 text-center">
            No expectation categories enabled for this building.
          </div>
        }
      />
    );
  }

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div
          className={`h-full w-full bg-transparent overflow-hidden animate-in fade-in duration-200 ${
            isElementary ? 'grid grid-cols-2' : 'flex flex-col'
          }`}
          style={{
            padding: 'min(16px, 3cqmin)',
            gap: 'min(16px, 3cqmin)',
          }}
        >
          {showVolume && (
            <button
              onClick={() => setActiveCategory('volume')}
              className={`flex-1 flex items-center rounded-2xl border-2 transition-all group ${
                selectedVolume
                  ? `${selectedVolume.bg} border-current ${selectedVolume.color} shadow-sm`
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 shadow-sm'
              } ${isElementary && showVolume && (!showGroup || !showInteraction) ? 'col-span-2' : isElementary && showVolume ? 'col-span-2' : ''}`}
              style={{
                gap: 'min(20px, 4cqmin)',
                padding: 'min(20px, 4cqmin)',
              }}
            >
              <div
                className={`rounded-xl transition-colors ${selectedVolume ? 'bg-white' : 'bg-slate-50'}`}
                style={{
                  width: '18cqmin',
                  height: '18cqmin',
                  padding: 'min(12px, 2.5cqmin)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Volume2
                  style={{ width: '100%', height: '100%' }}
                  strokeWidth={2.5}
                />
              </div>
              <div className="text-left flex-1 min-w-0">
                <div
                  className="font-black uppercase text-slate-400 leading-none mb-1 truncate"
                  style={{ fontSize: 'min(16px, 5.5cqmin)' }}
                >
                  Volume
                </div>
                <div
                  className="font-black uppercase tracking-tight truncate"
                  style={{ fontSize: 'min(32px, 10cqmin)' }}
                >
                  {selectedVolume ? selectedVolume.label : 'Not Set'}
                </div>
              </div>
            </button>
          )}

          {showGroup && (
            <button
              onClick={() => setActiveCategory('groups')}
              className={`flex-1 flex items-center rounded-2xl border-2 transition-all group ${
                selectedGroup
                  ? `${selectedGroup.bg} border-current ${selectedGroup.color} shadow-sm`
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 shadow-sm'
              } ${isElementary && !showVolume ? 'col-span-2' : ''}`}
              style={{
                gap: 'min(20px, 4cqmin)',
                padding: 'min(20px, 4cqmin)',
              }}
            >
              <div
                className={`rounded-xl transition-colors ${selectedGroup ? 'bg-white' : 'bg-slate-50'}`}
                style={{
                  width: '18cqmin',
                  height: '18cqmin',
                  padding: 'min(12px, 2.5cqmin)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Users
                  style={{ width: '100%', height: '100%' }}
                  strokeWidth={2.5}
                />
              </div>
              <div className="text-left flex-1 min-w-0">
                <div
                  className="font-black uppercase text-slate-400 leading-none mb-1 truncate"
                  style={{ fontSize: 'min(16px, 5.5cqmin)' }}
                >
                  Group Size
                </div>
                <div
                  className="font-black uppercase tracking-tight truncate"
                  style={{ fontSize: 'min(32px, 10cqmin)' }}
                >
                  {selectedGroup ? selectedGroup.label : 'Not Set'}
                </div>
              </div>
            </button>
          )}

          {showInteraction && (
            <button
              onClick={() => setActiveCategory('interaction')}
              className={`flex-1 flex items-center rounded-2xl border-2 transition-all group ${
                selectedInteraction
                  ? `${selectedInteraction.bg} border-current ${selectedInteraction.color} shadow-sm`
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 shadow-sm'
              } ${isElementary && !showVolume && !showGroup ? 'col-span-2' : isElementary && showVolume && !showGroup ? 'col-span-2' : ''}`}
              style={{
                gap: 'min(20px, 4cqmin)',
                padding: 'min(20px, 4cqmin)',
              }}
            >
              <div
                className={`rounded-xl transition-colors ${selectedInteraction ? 'bg-white' : 'bg-slate-50'}`}
                style={{
                  width: '18cqmin',
                  height: '18cqmin',
                  padding: 'min(12px, 2.5cqmin)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MessagesSquare
                  style={{ width: '100%', height: '100%' }}
                  strokeWidth={2.5}
                />
              </div>
              <div className="text-left flex-1 min-w-0">
                <div
                  className="font-black uppercase text-slate-400 leading-none mb-1 truncate"
                  style={{ fontSize: 'min(16px, 5.5cqmin)' }}
                >
                  Interaction
                </div>
                <div
                  className="font-black uppercase tracking-tight truncate"
                  style={{ fontSize: 'min(32px, 10cqmin)' }}
                >
                  {selectedInteraction ? selectedInteraction.label : 'Not Set'}
                </div>
              </div>
            </button>
          )}
        </div>
      }
    />
  );
};
