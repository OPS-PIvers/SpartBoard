import React, { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Undo2, CheckCircle2, Users } from 'lucide-react';
import type { LunchMenuItem, WidgetData } from '@/types';
import { Button } from '@/components/common/Button';
import { IconButton } from '@/components/common/IconButton';
import { ActiveClassChip } from '@/components/common/ActiveClassChip';
import { ScaledEmptyState } from '@/components/common/ScaledEmptyState';
import { tourAttr } from '@/config/tourAnchors';
import { hexToRgba } from '@/utils/styles';
import { WidgetLayout } from '../../WidgetLayout';
import { SubmitReportModal } from '../SubmitReportModal';
import { MissingInfoModal } from '../MissingInfoModal';
import { useLunchCountModel } from './useLunchCountModel';
import type { LunchZoneId } from './useLunchCountModel';
import { COUNT_COLOR, menuLine } from './lunchCountFormat';
import { ChipGrid, LunchZone } from './LunchZone';
import { PhotoPeek } from './PhotoPeek';
import { MiddleHighFace } from './MiddleHighFace';

// Bands are container queries on the widget body: compact (count board), wide (tray left), tall (zones stacked).
export const LunchCountRedesign: React.FC<{ widget: WidgetData }> = ({
  widget,
}) => {
  const { t } = useTranslation();
  const model = useLunchCountModel(widget);
  const {
    config,
    cachedMenu,
    rosterMode,
    rosters,
    schoolSite,
    isSyncing,
    fetchNutrislice,
    allRosterStudents,
    groupedStudents,
    stats,
    reportStats,
    hiddenRemaining,
    rosterGroupsEnabled,
    rosterPoolGroupId,
    handleSelectPoolGroup,
    drags,
    dragHandlers,
  } = model;

  const [peekedItem, setPeekedItem] = useState<LunchMenuItem | null>(null);
  const peekTriggerRef = useRef<HTMLElement | null>(null);
  const peekItem = useCallback((item: LunchMenuItem) => {
    if (!item.imageUrl) return;
    const active = document.activeElement;
    peekTriggerRef.current = active instanceof HTMLElement ? active : null;
    setPeekedItem(item);
  }, []);
  const closePeek = useCallback(() => {
    setPeekedItem(null);
    const trigger = peekTriggerRef.current;
    peekTriggerRef.current = null;
    if (trigger) window.requestAnimationFrame(() => trigger.focus());
  }, []);

  if (
    schoolSite === 'orono-middle-school' ||
    schoolSite === 'orono-high-school'
  ) {
    return <MiddleHighFace widget={widget} model={model} />;
  }

  const overZones = new Set(drags.map((d) => d.over));
  const draggingIds = new Set(drags.map((d) => d.id));
  const cardColor = config.cardColor ?? '#f8fafc';
  const cardOpacity = config.cardOpacity ?? 0.5;
  const ready = reportStats.remaining === 0 && reportStats.total > 0;
  const isEmpty = allRosterStudents.length === 0;

  const menuState = {
    hasCache: !!cachedMenu,
    isSyncing,
    syncError: config.syncError,
    isManualMode: config.isManualMode,
  };
  const hotMenu = menuLine(cachedMenu?.hotLunch?.name, {
    ...menuState,
    noItemText: t('widgets.lunchCount.noHotLunch'),
  });
  const bentoMenu = menuLine(cachedMenu?.bentoBox?.name, {
    ...menuState,
    noItemText: t('widgets.lunchCount.noBentoBox'),
  });

  const empty =
    rosterMode === 'custom'
      ? {
          title: t('widgets.lunchCount.emptyCustomTitle'),
          subtitle: t('widgets.lunchCount.emptyCustomBody'),
        }
      : rosters.length === 0
        ? {
            title: t('widgets.lunchCount.noClassTitle'),
            subtitle: t('widgets.lunchCount.noClassesBody'),
          }
        : { title: t('widgets.lunchCount.emptyClassTitle') };

  const zoneCommon = {
    loadingText: t('common.loading'),
    unavailableText: t('widgets.lunchCount.menuUnavailable'),
    onPeekItem: peekItem,
    draggingIds,
    handlers: dragHandlers,
  };

  const iconStyle = {
    width: 'clamp(16px, 5cqmin, 28px)',
    height: 'clamp(16px, 5cqmin, 28px)',
  };

  const compactLabels: { zone: LunchZoneId; label: string; count: number }[] = [
    {
      zone: 'hot',
      label: t('widgets.lunchCount.shortHot'),
      count: stats.hotLunch,
    },
    {
      zone: 'bento',
      label: t('widgets.lunchCount.shortBento'),
      count: stats.bentoBox,
    },
    {
      zone: 'home',
      label: t('widgets.lunchCount.shortHome'),
      count: stats.homeLunch,
    },
  ];

  return (
    <>
      <WidgetLayout
        padding="p-0"
        header={
          <div
            className="flex flex-wrap items-center border-b border-slate-200 [@container_(min-width:520px)_and_(max-width:1199px)]:flex-nowrap"
            style={{
              backgroundColor: hexToRgba(cardColor, cardOpacity),
              padding:
                'min(10px, 2cqmin, max(4px, 2.5cqmin - 6px)) clamp(6px, 4cqmin, 20px)',
              columnGap: 'min(14px, 3cqmin, 1.67cqmin + 1.33px)',
              rowGap: 'min(8px, 1.5cqmin)',
            }}
          >
            <div className="flex flex-col min-w-0 [@container_(max-width:219px)_or_(max-height:179px)]:hidden">
              <h3
                className="font-bold text-slate-800 leading-tight"
                style={{ fontSize: 'clamp(13px, 3.3cqmin, 24px)' }}
              >
                Daily Lunch Count
              </h3>
              <p
                className="text-slate-600 leading-tight"
                style={{ fontSize: 'clamp(12px, 3cqmin, 18px)' }}
              >
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
            </div>
            {rosterMode === 'class' && (
              <div className="max-w-full [@container_(min-width:520px)_and_(max-width:1199px)]:max-w-[40%] [@container_(min-width:520px)_and_(max-width:1199px)]:min-w-0 [@container_(max-width:219px)_or_(max-height:179px)]:hidden">
                <ActiveClassChip
                  compact
                  className="max-w-full"
                  anchor={tourAttr(
                    'lunch-count.class-chip',
                    widget.id,
                    widget.type
                  )}
                  {...(rosterGroupsEnabled
                    ? {
                        groupSelection: {
                          selectedGroupId: rosterPoolGroupId,
                          onSelectGroup: handleSelectPoolGroup,
                        },
                      }
                    : {})}
                />
              </div>
            )}

            <div
              className="flex items-center justify-end flex-[1_1_min(100%,280px)] min-w-[min(100%,280px)] [@container_(min-width:520px)_and_(max-width:1199px)]:flex-[1_1_0%] [@container_(min-width:520px)_and_(max-width:1199px)]:min-w-0"
              style={{ gap: 'clamp(8px, 2cqmin, 16px)' }}
            >
              {!isEmpty && (
                <Button
                  {...tourAttr(
                    'lunch-count.open-report',
                    widget.id,
                    widget.type
                  )}
                  onClick={model.handleOpenReport}
                  disabled={!ready}
                  variant={ready ? 'primary' : 'secondary'}
                  className="flex-1 min-w-0 rounded-lg leading-tight text-center active:brightness-95 [@container_(min-width:520px)_and_(max-width:1199px)]:normal-case [@container_(min-width:520px)_and_(max-width:1199px)]:tracking-normal"
                  style={{
                    opacity: 1,
                    padding:
                      'min(8px, 1.5cqmin, 0.9cqmin + 0.6px) min(14px, 3cqmin, 1.67cqmin + 1.33px)',
                    fontSize: 'clamp(11px, 2.8cqmin, 18px)',
                    minHeight: 'max(32px, min(48px, 9cqmin))',
                    maxWidth: 'min(420px, 100%)',
                  }}
                >
                  {ready ? (
                    <span
                      className="flex items-center justify-center"
                      style={{ gap: 'min(8px, 1.5cqmin)' }}
                    >
                      <CheckCircle2 aria-hidden="true" style={iconStyle} />
                      Submit Report
                    </span>
                  ) : (
                    <>
                      <span className="flex items-center justify-center [@container_(max-width:219px)_or_(max-height:179px)]:hidden">
                        {hiddenRemaining > 0
                          ? t('widgets.lunchCount.assignMoreOutsideGroup', {
                              count: reportStats.remaining,
                              hidden: hiddenRemaining,
                            })
                          : `Assign ${reportStats.remaining} More Students`}
                      </span>
                      <span className="hidden [@container_(max-width:219px)_or_(max-height:179px)]:inline">
                        {t('widgets.lunchCount.left', {
                          count: reportStats.remaining,
                        })}
                      </span>
                    </>
                  )}
                </Button>
              )}
              <div
                className="flex shrink-0 [@container_(max-width:219px)_or_(max-height:179px)]:hidden"
                style={{ gap: 'clamp(8px, 2cqmin, 16px)' }}
              >
                <IconButton
                  {...tourAttr(
                    'lunch-count.refresh-menu',
                    widget.id,
                    widget.type
                  )}
                  onClick={() => void fetchNutrislice()}
                  disabled={isSyncing}
                  label={t('widgets.lunchCount.refreshMenu')}
                  variant="glass"
                  shape="square"
                  className="active:bg-slate-800/15"
                  style={{ padding: 'clamp(6px, 2cqmin, 14px)' }}
                  icon={
                    <RefreshCw
                      aria-hidden="true"
                      className={
                        isSyncing
                          ? 'animate-spin motion-reduce:animate-none'
                          : ''
                      }
                      style={iconStyle}
                    />
                  }
                />
                <IconButton
                  {...tourAttr(
                    'lunch-count.reset-assignments',
                    widget.id,
                    widget.type
                  )}
                  onClick={model.handleReset}
                  label={t('widgets.lunchCount.clearAll')}
                  variant="glass"
                  shape="square"
                  className="active:bg-slate-800/15"
                  style={{ padding: 'clamp(6px, 2cqmin, 14px)' }}
                  icon={<Undo2 aria-hidden="true" style={iconStyle} />}
                />
              </div>
            </div>
          </div>
        }
        contentClassName="flex-1 min-h-0 flex"
        content={
          isEmpty ? (
            <div
              className="flex-1 min-w-0"
              style={{ backgroundColor: hexToRgba(cardColor, cardOpacity) }}
            >
              <ScaledEmptyState
                icon={Users}
                title={empty.title}
                subtitle={empty.subtitle}
                iconClassName="text-slate-500"
                titleClassName="text-slate-800"
                subtitleClassName="text-slate-700"
              />
            </div>
          ) : (
            <div
              className="flex-1 min-w-0 flex"
              style={{
                backgroundColor: hexToRgba(cardColor, cardOpacity),
                padding: '0 clamp(4px, 4cqmin, 20px) clamp(4px, 4cqmin, 20px)',
              }}
            >
              <div
                data-lunch-count-board="compact"
                className="hidden flex-1 grid-cols-3 divide-x divide-slate-200 [@container_(max-width:219px)_or_(max-height:179px)]:grid"
              >
                {compactLabels.map(({ zone, label, count }) => (
                  <div
                    key={zone}
                    className="flex flex-col items-center justify-center min-w-0 text-center"
                    style={{ gap: '1cqmin', padding: '2cqmin 1cqmin' }}
                  >
                    <span
                      className="font-bold text-slate-800 leading-tight"
                      style={{ fontSize: 'clamp(10px, 9cqmin, 16px)' }}
                    >
                      {label}
                    </span>
                    <span
                      className={`font-black tabular-nums leading-none ${COUNT_COLOR[zone]}`}
                      style={{ fontSize: 'clamp(18px, 28cqmin, 64px)' }}
                    >
                      {count}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex flex-1 min-w-0 flex-col [@container(min-aspect-ratio:2.2)]:flex-row [@container_(max-width:219px)_or_(max-height:179px)]:hidden">
                <div className="flex flex-1 min-h-0 min-w-0 flex-row divide-x divide-slate-200 [@container(max-aspect-ratio:0.7)]:flex-col [@container(max-aspect-ratio:0.7)]:divide-x-0 [@container(max-aspect-ratio:0.7)]:divide-y">
                  <LunchZone
                    {...zoneCommon}
                    zone="hot"
                    testId="hot-zone"
                    label="Hot Lunch"
                    count={stats.hotLunch}
                    isOver={overZones.has('hot')}
                    menu={hotMenu}
                    menuItem={cachedMenu?.hotLunch}
                    sides={cachedMenu?.hotLunchSides ?? []}
                    students={groupedStudents.hot}
                  />
                  <LunchZone
                    {...zoneCommon}
                    zone="bento"
                    testId="bento-zone"
                    label="Bento Box"
                    count={stats.bentoBox}
                    isOver={overZones.has('bento')}
                    menu={bentoMenu}
                    menuItem={cachedMenu?.bentoBox}
                    students={groupedStudents.bento}
                  />
                  <LunchZone
                    {...zoneCommon}
                    zone="home"
                    testId="home-zone"
                    label="Home / Other"
                    count={stats.homeLunch}
                    isOver={overZones.has('home')}
                    menu={{ kind: 'none' }}
                    subLabel="Field Trips / Absent"
                    students={groupedStudents.home}
                  />
                </div>

                <section
                  data-drop-zone="unassigned"
                  data-testid="unassigned-zone"
                  aria-label="Unassigned"
                  className={`flex flex-col min-h-0 shrink-0 overflow-y-auto custom-scrollbar border-t border-slate-200 max-h-[40%] [@container_(max-height:699px)_and_(max-aspect-ratio:2.19)]:max-h-[43%] [@container_(max-width:1199px)_or_(max-height:699px)]:flex-row [@container_(max-width:1199px)_or_(max-height:699px)]:flex-wrap [@container_(max-width:1199px)_or_(max-height:699px)]:items-center [@container_(max-width:1199px)_or_(max-height:699px)]:content-start [@container(min-aspect-ratio:2.2)]:order-first [@container(min-aspect-ratio:2.2)]:max-h-none [@container(min-aspect-ratio:2.2)]:w-[26%] [@container(min-aspect-ratio:2.2)]:border-t-0 [@container(min-aspect-ratio:2.2)]:border-r ${
                    overZones.has('unassigned')
                      ? 'outline outline-2 -outline-offset-2 outline-brand-blue-primary bg-brand-blue-lighter/30'
                      : ''
                  }`}
                  style={{
                    gap: 'min(10px, 1.5cqmin)',
                    padding: 'min(12px, 1.8cqmin)',
                  }}
                >
                  <div
                    className="font-bold text-slate-800 leading-tight [overflow-wrap:anywhere]"
                    style={{ fontSize: 'clamp(13px, 3.6cqmin, 26px)' }}
                  >
                    Unassigned ({stats.remaining})
                    {hiddenRemaining > 0 &&
                      ` · ${hiddenRemaining} outside this group`}
                  </div>
                  <ChipGrid
                    flowIntoParent
                    students={groupedStudents.unassigned}
                    draggingIds={draggingIds}
                    handlers={dragHandlers}
                  />
                </section>
              </div>
            </div>
          )
        }
      />

      <MissingInfoModal
        isOpen={model.isMissingInfoOpen}
        needsTime={model.needsTime}
        needsGrade={model.needsGrade}
        askSchool={model.askSchool}
        current={{
          hour: model.lunchTimeHour,
          minute: model.lunchTimeMinute,
          grade: model.gradeLevel,
          schoolSite,
        }}
        onClose={() => model.setIsMissingInfoOpen(false)}
        onSave={model.handleSaveMissingInfo}
      />
      <SubmitReportModal
        isOpen={model.isModalOpen}
        onClose={() => model.setIsModalOpen(false)}
        onSubmit={model.handleSubmitReport}
        data={model.reportData}
        isSubmitting={model.isSubmitting}
      />
      <PhotoPeek widget={widget} item={peekedItem} onClose={closePeek} />
      {drags.length > 0 &&
        createPortal(
          drags.map((drag) => (
            <div
              key={drag.pointerId}
              data-no-drag="true"
              className="fixed z-[10000] rounded-lg border-2 border-brand-blue-primary bg-white font-semibold text-slate-800 shadow-xl cursor-grabbing pointer-events-none whitespace-nowrap"
              style={{
                left: drag.x,
                top: drag.y,
                transform: 'translate(-50%, -50%)',
                padding: '8px 16px',
                fontSize: '16px',
              }}
            >
              {drag.name}
            </div>
          )),
          document.body
        )}
    </>
  );
};
