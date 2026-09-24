// Meeting tile: the live or next meeting, and what the last meeting decided.

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Presentation } from 'lucide-react';
import type { PlcMeeting } from '@/types';
import { usePlcMeetingsData, usePlcMembers } from '@/context/usePlcContext';
import { TileEmpty, TileFrame } from './TileFrame';
import {
  pickInProgressMeeting,
  pickLastCompletedMeeting,
} from './meetingSelectors';
import type { PlcHomeTileProps } from './tileTypes';

const HERO_LIST_LIMIT = 6;

function formatDay(ms: number, locale?: string): string {
  try {
    return new Date(ms).toLocaleDateString(locale, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

const LastMeeting: React.FC<{
  meeting: PlcMeeting;
  hero: boolean;
  nameFor: (uid: string | undefined) => string;
}> = ({ meeting, hero, nameFor }) => {
  const { t, i18n } = useTranslation();
  const when = formatDay(meeting.heldAt, i18n.language);
  if (!hero) {
    return (
      <p className="text-xs text-slate-500">
        {t('plcDashboard.home.meeting.lastSummary', {
          date: when,
          count: meeting.actionItems.length,
          defaultValue:
            meeting.actionItems.length === 1
              ? 'Last meeting {{date}}: 1 action item'
              : 'Last meeting {{date}}: {{count}} action items',
        })}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold text-slate-500">
        {t('plcDashboard.home.meeting.lastHeading', {
          date: when,
          defaultValue: 'Last meeting, {{date}}',
        })}
      </p>
      <div>
        <p className="text-xs font-semibold text-slate-700">
          {t('plcDashboard.home.meeting.decisions', {
            defaultValue: 'Decisions',
          })}
        </p>
        {meeting.decisions.length === 0 ? (
          <p className="text-sm text-slate-400">
            {t('plcDashboard.home.meeting.noDecisions', {
              defaultValue: 'None recorded',
            })}
          </p>
        ) : (
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-700">
            {meeting.decisions.slice(0, HERO_LIST_LIMIT).map((d) => (
              <li key={d.id}>{d.text}</li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-700">
          {t('plcDashboard.home.meeting.actionItems', {
            defaultValue: 'Action items',
          })}
        </p>
        {meeting.actionItems.length === 0 ? (
          <p className="text-sm text-slate-400">
            {t('plcDashboard.home.meeting.noActionItems', {
              defaultValue: 'None recorded',
            })}
          </p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-sm text-slate-700">
            {meeting.actionItems.slice(0, HERO_LIST_LIMIT).map((item) => (
              <li key={item.id} className="flex gap-2">
                <span className="min-w-0 flex-1">{item.text}</span>
                {item.assigneeUid && (
                  <span className="shrink-0 text-xs text-slate-400">
                    {nameFor(item.assigneeUid)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export const MeetingTile: React.FC<PlcHomeTileProps> = ({
  ctx,
  hero,
  controls,
}) => {
  const { t } = useTranslation();
  const { data: meetings, loading } = usePlcMeetingsData();
  const members = usePlcMembers();
  const live = useMemo(() => pickInProgressMeeting(meetings), [meetings]);
  const last = useMemo(() => pickLastCompletedMeeting(meetings), [meetings]);

  const nameFor = (uid: string | undefined): string => {
    const m = members.find((member) => member.uid === uid);
    if (!m) return '';
    const display = m.displayName?.trim() ?? '';
    return display !== '' ? display : m.email;
  };

  const openMeeting = () => ctx.onNavigate('meeting');

  return (
    <TileFrame
      icon={CalendarDays}
      title={t('plcDashboard.home.meeting.title', { defaultValue: 'Meeting' })}
      hero={hero}
      headerExtra={controls}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800">
              {live
                ? t('plcDashboard.home.meeting.inProgress', {
                    defaultValue: 'Meeting in progress',
                  })
                : t('plcDashboard.home.meeting.noneScheduled', {
                    defaultValue: 'No meeting scheduled',
                  })}
            </p>
            {hero && live?.agenda && (
              <p className="mt-1 whitespace-pre-line text-sm text-slate-600">
                {live.agenda}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={openMeeting}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-blue-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-blue-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/50 focus-visible:ring-offset-2"
          >
            <Presentation className="h-3.5 w-3.5" aria-hidden="true" />
            {live
              ? t('plcDashboard.home.commonAssessment.resumeMeeting', {
                  defaultValue: 'Resume Meeting',
                })
              : t('plcDashboard.home.commonAssessment.startMeeting', {
                  defaultValue: 'Start Meeting',
                })}
          </button>
        </div>
        {last ? (
          <LastMeeting meeting={last} hero={hero} nameFor={nameFor} />
        ) : (
          !loading &&
          hero && (
            <TileEmpty>
              {t('plcDashboard.home.meeting.noneYet', {
                defaultValue: 'No meetings held yet.',
              })}
            </TileEmpty>
          )
        )}
      </div>
    </TileFrame>
  );
};
