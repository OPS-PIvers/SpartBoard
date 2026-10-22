import React, { useMemo } from 'react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { useDashboardActions } from '@/context/dashboardCanvasStore';
import { useAuth } from '@/context/useAuth';
import type { ArtsLettersAgendaVersion } from '@/types';
import {
  AGENDA_CHROME_PX,
  AGENDA_MAX_AUTO_HEIGHT_PX,
  AGENDA_ROW_PX,
} from './constants';
import { listsDiffer, partsForVersion, resolveAgendaPartLists } from './utils';

export const AgendaVersionField: React.FC<{ ctx: CustomRenderCtx }> = ({
  ctx,
}) => {
  const { updateWidget } = useDashboardActions();
  const { featurePermissions, selectedBuildings } = useAuth();
  const adminConfig = featurePermissions.find(
    (p) => p.widgetType === ctx.widget.type
  )?.config;
  const buildingId =
    (ctx.config.buildingId as string | undefined) ?? selectedBuildings[0];
  const lists = useMemo(
    () => resolveAgendaPartLists(adminConfig, buildingId),
    [adminConfig, buildingId]
  );
  const version = (ctx.config.version as ArtsLettersAgendaVersion) ?? 'simple';

  const change = (next: ArtsLettersAgendaVersion) => {
    const needed = Math.min(
      AGENDA_MAX_AUTO_HEIGHT_PX,
      AGENDA_CHROME_PX + partsForVersion(lists, next).length * AGENDA_ROW_PX
    );
    updateWidget(ctx.widget.id, {
      config: {
        ...ctx.widget.config,
        version: next,
        ...(buildingId ? { buildingId } : {}),
      },
      ...(ctx.widget.h < needed ? { h: needed } : {}),
    });
  };

  return (
    <div
      id={ctx.id}
      aria-labelledby={ctx.labelId}
      title={
        listsDiffer(lists.simple, lists.detailed)
          ? undefined
          : ctx.t('widgetSettings.arts-letters-agenda.sameLists')
      }
    >
      <SegmentedControl
        value={version}
        onChange={change}
        ariaLabel={ctx.t('widgetSettings.arts-letters-agenda.version')}
        role="radiogroup"
        options={[
          {
            value: 'simple',
            label: ctx.t('widgetSettings.arts-letters-agenda.simple'),
          },
          {
            value: 'detailed',
            label: ctx.t('widgetSettings.arts-letters-agenda.detailed'),
          },
        ]}
      />
    </div>
  );
};
