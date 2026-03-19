import React from 'react';
import { useDashboard } from '@/context/useDashboard';
import { useAuth } from '@/context/useAuth';
import {
  WidgetData,
  CatalystConfig,
  WidgetType,
  WidgetConfig,
  CatalystRoutine,
} from '@/types';
import { Zap, BookOpen, ChevronLeft } from 'lucide-react';
import {
  renderCatalystIcon,
  isSafeIconUrl,
  mergeCatalystCategories,
  mergeCatalystRoutines,
} from './catalystHelpers';

import { WidgetLayout } from '@/components/widgets/WidgetLayout';
import { CatalystSettings } from './CatalystSettings'; // Import the new settings component

export const CatalystWidget: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { updateWidget, addWidget } = useDashboard();
  const { featurePermissions } = useAuth();
  const config = widget.config as CatalystConfig;
  const { activeCategory, activeStrategyId } = config;
  const permission = featurePermissions.find(
    (p) => p.widgetType === 'catalyst'
  );
  const globalConfig = (permission?.config ?? {}) as Partial<CatalystConfig>;

  const navigateTo = (catId: string | null, stratId: string | null) => {
    updateWidget(widget.id, {
      config: {
        ...config,
        activeCategory: catId,
        activeStrategyId: stratId,
      },
    });
  };

  // Use shared helpers to merge categories and routines
  const categories = mergeCatalystCategories(globalConfig);
  const allRoutines = mergeCatalystRoutines(globalConfig);

  const activeRoutine = activeStrategyId
    ? allRoutines.find((r) => r.id === activeStrategyId)
    : null;

  const filteredRoutines = activeCategory
    ? allRoutines.filter((r) => r.category === activeCategory)
    : [];

  const handleGoMode = (routine: CatalystRoutine) => {
    // 1. Spawn Visual Anchor
    addWidget('catalyst-visual' as WidgetType, {
      x: 100,
      y: 100,
      w: 600,
      h: 400,
      config: {
        routineId: routine.id,
        title: routine.title,
        icon: routine.icon,
        category: routine.category,
        stepIndex: 0,
      },
    });

    // 2. Spawn Associated Tools
    if (routine.associatedWidgets) {
      routine.associatedWidgets.forEach((tool, index) => {
        addWidget(tool.type, {
          x: widget.x + (index + 1) * 40,
          y: widget.y + (index + 1) * 40,
          config: tool.config as WidgetConfig,
        });
      });
    }
  };

  const handleGuideMode = (routine: CatalystRoutine) => {
    addWidget('catalyst-instruction' as WidgetType, {
      x: widget.x + widget.w + 20,
      y: widget.y,
      config: {
        routineId: routine.id,
        title: routine.title,
        instructions: routine.instructions,
        stepIndex: 0,
      },
    });
  };

  const renderCategories = () => (
    <div
      className="grid grid-cols-2 h-full w-full"
      style={{ gap: 'min(16px, 3cqmin)', padding: 'min(16px, 3cqmin)' }}
    >
      {categories.map((cat) => {
        return (
          <button
            key={cat.id}
            onClick={() => navigateTo(cat.id, null)}
            className={`${cat.imageUrl ? '' : cat.color} rounded-3xl flex flex-col items-center justify-center text-white shadow-lg hover:scale-105 transition-transform overflow-hidden relative`}
            style={{
              gap: 'min(12px, 2.5cqmin)',
              padding: 'min(16px, 3cqmin)',
            }}
          >
            {cat.imageUrl && isSafeIconUrl(cat.imageUrl) ? (
              <>
                <img
                  src={cat.imageUrl}
                  alt={cat.label}
                  className="absolute inset-0 w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-black/35" />
                <span
                  className="relative z-10 font-black uppercase tracking-widest drop-shadow"
                  style={{ fontSize: 'min(12px, 3.5cqmin)' }}
                >
                  {cat.label}
                </span>
              </>
            ) : (
              <>
                {renderCatalystIcon(cat.icon, 'min(32px, 10cqmin)')}
                <span
                  className="font-black uppercase tracking-widest"
                  style={{ fontSize: 'min(12px, 3.5cqmin)' }}
                >
                  {cat.label}
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );

  const renderRoutineList = () => (
    <div
      className="flex flex-col h-full w-full overflow-y-auto custom-scrollbar"
      style={{ gap: 'min(12px, 2.5cqmin)', padding: 'min(16px, 3cqmin)' }}
    >
      <div
        className="flex items-center"
        style={{
          gap: 'min(8px, 1.5cqmin)',
          marginBottom: 'min(8px, 1.5cqmin)',
        }}
      >
        <button
          onClick={() => navigateTo(null, null)}
          className="hover:bg-slate-100 rounded-full transition-colors"
          style={{ padding: 'min(8px, 1.5cqmin)' }}
        >
          <ChevronLeft
            style={{ width: 'min(20px, 5cqmin)', height: 'min(20px, 5cqmin)' }}
          />
        </button>
        <h2
          className="font-black uppercase tracking-widest text-slate-700"
          style={{ fontSize: 'min(14px, 4cqmin)' }}
        >
          {categories.find((c) => c.id === activeCategory)?.label ??
            activeCategory}
        </h2>
      </div>
      {filteredRoutines.map((routine) => {
        return (
          <button
            key={routine.id}
            onClick={() => navigateTo(activeCategory, routine.id)}
            className="bg-white border border-slate-200 rounded-2xl flex items-center hover:border-indigo-300 hover:bg-indigo-50 transition-all text-left shadow-sm"
            style={{ padding: 'min(16px, 3cqmin)', gap: 'min(16px, 3cqmin)' }}
          >
            <div
              className="rounded-xl bg-indigo-100 text-indigo-600 shrink-0 flex items-center justify-center"
              style={{ padding: 'min(12px, 2.5cqmin)' }}
            >
              {renderCatalystIcon(routine.icon, 'min(24px, 6cqmin)')}
            </div>
            <div>
              <div
                className="font-black uppercase text-slate-700"
                style={{ fontSize: 'min(14px, 3.5cqmin)' }}
              >
                {routine.title}
              </div>
              <div
                className="font-bold text-slate-400 uppercase tracking-widest"
                style={{ fontSize: 'min(10px, 2.5cqmin)' }}
              >
                {routine.shortDesc}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );

  const renderRoutineDetail = () => {
    if (!activeRoutine) return null;

    return (
      <div
        className="flex flex-col h-full w-full"
        style={{ padding: 'min(16px, 3cqmin)' }}
      >
        <div
          className="flex items-center shrink-0"
          style={{
            gap: 'min(8px, 1.5cqmin)',
            marginBottom: 'min(24px, 4cqmin)',
          }}
        >
          <button
            onClick={() => navigateTo(activeCategory, null)}
            className="hover:bg-slate-100 rounded-full transition-colors"
            style={{ padding: 'min(8px, 1.5cqmin)' }}
          >
            <ChevronLeft
              style={{
                width: 'min(20px, 5cqmin)',
                height: 'min(20px, 5cqmin)',
              }}
            />
          </button>
          <div
            className="flex items-center"
            style={{ gap: 'min(12px, 2.5cqmin)' }}
          >
            <div
              className="rounded-xl bg-indigo-100 text-indigo-600 shrink-0 flex items-center justify-center"
              style={{ padding: 'min(8px, 1.5cqmin)' }}
            >
              {renderCatalystIcon(activeRoutine.icon, 'min(20px, 5cqmin)')}
            </div>
            <h2
              className="font-black uppercase tracking-widest text-indigo-900"
              style={{ fontSize: 'min(14px, 3.5cqmin)' }}
            >
              {activeRoutine.title}
            </h2>
          </div>
        </div>

        <div
          className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-y-auto custom-scrollbar"
          style={{ padding: 'min(24px, 4cqmin)' }}
        >
          <h3
            className="font-black uppercase text-slate-400 tracking-[0.2em]"
            style={{
              fontSize: 'min(10px, 2.5cqmin)',
              marginBottom: 'min(16px, 3cqmin)',
            }}
          >
            Teacher Guide
          </h3>
          <div
            className="flex flex-col"
            style={{
              gap: 'min(16px, 3cqmin)',
            }}
          >
            {activeRoutine.instructions.split('\n').map((line, i) => (
              <p
                key={i}
                className="font-medium text-slate-600 leading-relaxed"
                style={{ fontSize: 'min(14px, 3.5cqmin)' }}
              >
                {line}
              </p>
            ))}
          </div>
        </div>

        <div
          className="grid grid-cols-2 shrink-0"
          style={{ gap: 'min(16px, 3cqmin)', marginTop: 'min(24px, 4cqmin)' }}
        >
          <button
            onClick={() => handleGuideMode(activeRoutine)}
            className="bg-white border-2 border-slate-200 text-slate-600 rounded-2xl font-black uppercase flex items-center justify-center hover:bg-slate-50 transition-all shadow-sm"
            style={{
              fontSize: 'min(12px, 3cqmin)',
              padding: 'min(16px, 3cqmin)',
              gap: 'min(8px, 1.5cqmin)',
            }}
          >
            <BookOpen
              style={{
                width: 'min(18px, 4.5cqmin)',
                height: 'min(18px, 4.5cqmin)',
              }}
            />
            Guide
          </button>
          <button
            onClick={() => handleGoMode(activeRoutine)}
            className="bg-indigo-600 text-white rounded-2xl font-black uppercase flex items-center justify-center hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
            style={{
              fontSize: 'min(12px, 3cqmin)',
              padding: 'min(16px, 3cqmin)',
              gap: 'min(8px, 1.5cqmin)',
            }}
          >
            <Zap
              style={{
                width: 'min(18px, 4.5cqmin)',
                height: 'min(18px, 4.5cqmin)',
              }}
            />
            Go Mode
          </button>
        </div>
      </div>
    );
  };

  const getContent = () => {
    if (activeStrategyId) return renderRoutineDetail();
    if (activeCategory) return renderRoutineList();
    return renderCategories();
  };

  return (
    <WidgetLayout
      padding="p-0"
      content={
        <div className="w-full h-full bg-slate-50 overflow-y-auto custom-scrollbar">
          {getContent()}
        </div>
      }
    />
  );
};

// Re-export CatalystSettings so WidgetRegistry can load it via lazyNamed(() => import('./CatalystWidget'), 'CatalystSettings')
export { CatalystSettings };
