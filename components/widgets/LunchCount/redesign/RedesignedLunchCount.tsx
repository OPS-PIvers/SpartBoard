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
import { resolveBaseTextScale } from '@/config/widgetAppearance';
import { WidgetLayout } from '../../WidgetLayout';
import { SubmitReportModal } from '../SubmitReportModal';
import { MissingInfoModal } from '../MissingInfoModal';
import { useLunchCountModel } from './useLunchCountModel';
import { isMiddleHighSite, menuLine } from './lunchCountFormat';
import {
  CHIP_GAP,
  CHIP_TEXT,
  ChipList,
  LunchZone,
  ZONE_TEXT,
} from './LunchZone';
import { PhotoPeek } from './PhotoPeek';
import { useBoardFit } from './useBoardFit';
import { MiddleHighLunchCount } from '../MiddleHighLunchCount';

const PAD = 'clamp(6px, 2.4cqmin, 20px)';

// Paul's layout: three zones across the top, the Unassigned tray below; useBoardFit keeps every chip on screen.
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

  const baseScale = resolveBaseTextScale(widget.baseTextSize);
  const boardRef = useRef<HTMLDivElement>(null);
  useBoardFit(
    boardRef,
    `${baseScale}|${schoolSite}|${allRosterStudents.length}|${hiddenRemaining}|${stats.hotLunch},${stats.bentoBox},${stats.homeLunch}|${cachedMenu?.hotLunch?.name ?? ''}|${cachedMenu?.bentoBox?.name ?? ''}|${isSyncing}|${groupedStudents.unassigned.map((s) => s.name).join()}`
  );

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

  if (isMiddleHighSite(schoolSite)) {
    return <MiddleHighLunchCount widget={widget} />;
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
    width: 'clamp(16px, 4.4cqmin, 30px)',
    height: 'clamp(16px, 4.4cqmin, 30px)',
  };

  return (
    <>
      <WidgetLayout
        padding="p-0"
        header={
          <div
            className="flex flex-wrap items-center"
            style={
              {
                '--lc-base': baseScale,
                backgroundColor: hexToRgba(cardColor, cardOpacity),
                padding: `${PAD} ${PAD} 0`,
                columnGap: 'clamp(8px, 2.4cqmin, 20px)',
                rowGap: 'clamp(4px, 1.2cqmin, 10px)',
              } as React.CSSProperties
            }
          >
            <div
              className="flex flex-[1_0_auto] items-center max-w-full"
              style={{ gap: 'clamp(8px, 2cqmin, 16px)' }}
            >
              <div className="flex flex-col min-w-0 whitespace-nowrap [@container(max-width:599px)]:sr-only [@container(max-height:259px)]:sr-only">
                <h3
                  className="font-semibold text-slate-800 leading-tight"
                  style={{ fontSize: ZONE_TEXT }}
                >
                  Daily Lunch Count
                </h3>
                <p
                  className="text-slate-600 leading-tight"
                  style={{ fontSize: `calc(${ZONE_TEXT} * 0.8)` }}
                >
                  {new Date().toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
              </div>
              {rosterMode === 'class' && (
                <div className="min-w-0 max-w-full">
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
            </div>
            {!isEmpty && (
              <Button
                {...tourAttr('lunch-count.open-report', widget.id, widget.type)}
                onClick={model.handleOpenReport}
                disabled={!ready}
                variant={ready ? 'primary' : 'secondary'}
                className="relative touch-target-expand flex-[1_1_240px] min-w-0 rounded-lg uppercase font-semibold tracking-[0.1em] leading-tight text-center active:brightness-95"
                style={{
                  opacity: 1,
                  padding: '0.6em 1.4em',
                  fontSize: `calc(clamp(11px, 2.6cqmin, 22px) * var(--lc-base, 1))`,
                  maxWidth: 'min(460px, 100%)',
                }}
              >
                {ready ? (
                  <span
                    className="flex items-center justify-center"
                    style={{ gap: '0.5em' }}
                  >
                    <CheckCircle2 aria-hidden="true" style={iconStyle} />
                    Submit Report
                  </span>
                ) : (
                  <>
                    <span className="[@container(max-width:299px)]:hidden">
                      {hiddenRemaining > 0
                        ? t('widgets.lunchCount.assignMoreOutsideGroup', {
                            count: reportStats.remaining,
                            hidden: hiddenRemaining,
                          })
                        : `Assign ${reportStats.remaining} More Students`}
                    </span>
                    <span className="hidden [@container(max-width:299px)]:inline">
                      {t('widgets.lunchCount.left', {
                        count: reportStats.remaining,
                      })}
                    </span>
                  </>
                )}
              </Button>
            )}
            <div
              className="flex flex-[1_0_auto] justify-end"
              style={{ gap: 'clamp(4px, 1.6cqmin, 14px)' }}
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
                variant="ghost"
                shape="square"
                className="touch-target-expand text-slate-700 active:bg-slate-800/15"
                style={{ padding: 'clamp(4px, 1.4cqmin, 12px)' }}
                icon={
                  <RefreshCw
                    aria-hidden="true"
                    className={
                      isSyncing ? 'animate-spin motion-reduce:animate-none' : ''
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
                variant="ghost"
                shape="square"
                className="touch-target-expand text-slate-700 active:bg-slate-800/15"
                style={{ padding: 'clamp(4px, 1.4cqmin, 12px)' }}
                icon={<Undo2 aria-hidden="true" style={iconStyle} />}
              />
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
                padding: PAD,
              }}
            >
              <div
                ref={boardRef}
                data-lunch-count-board
                className="flex flex-1 min-w-0 min-h-0 flex-col overflow-y-auto custom-scrollbar"
                style={
                  {
                    '--lc-base': baseScale,
                    gap: 'clamp(6px, 2cqmin, 18px)',
                  } as React.CSSProperties
                }
              >
                <div
                  className="grid grid-cols-3 flex-[1_0_auto]"
                  style={{ gap: 'clamp(6px, 2cqmin, 18px)' }}
                >
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
                  className={`flex flex-wrap items-center content-start shrink-0 rounded-2xl transition-colors ${
                    overZones.has('unassigned')
                      ? 'bg-slate-200 ring-4 ring-inset ring-slate-500'
                      : 'bg-slate-100'
                  }`}
                  style={{ gap: CHIP_GAP, padding: PAD }}
                >
                  <div
                    className="font-semibold text-slate-600 leading-tight wrap-anywhere"
                    style={{ fontSize: CHIP_TEXT, marginRight: '0.3em' }}
                  >
                    Unassigned ({stats.remaining})
                    {hiddenRemaining > 0 &&
                      ` · ${hiddenRemaining} outside this group`}
                  </div>
                  <ChipList
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
        data={{ ...model.reportData, schoolSite }}
        isSubmitting={model.isSubmitting}
        alreadySubmitted={model.alreadySubmitted}
        sentDetails={model.sentDetails}
        sentDetailsLoading={model.sentDetailsLoading}
      />
      <PhotoPeek widget={widget} item={peekedItem} onClose={closePeek} />
      {drags.length > 0 &&
        createPortal(
          drags.map((drag) => (
            <div
              key={drag.pointerId}
              data-no-drag="true"
              className="fixed z-10000 rounded-lg border-2 border-brand-blue-primary bg-white font-semibold text-slate-800 shadow-xl cursor-grabbing pointer-events-none whitespace-nowrap"
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
