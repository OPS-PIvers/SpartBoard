/**
 * PlcMeetingRecordView — the READ-ONLY view of a saved `PlcMeeting`, mounted at
 * `/plc/:id/meeting/:meetingId` (PRD §6.2 — "a saved/loaded meeting record
 * renders read-only with an export button").
 *
 * It loads the record from the meetings slice (`usePlcMeetings`), renders the
 * agenda, attendees, reviewed-assessment summaries (anonymized, from the
 * aggregate rollups — never student names), decisions (with their linked data
 * card), action items (assignee / due / to-do-created), and notes — then offers
 * Sheet / PDF export via the shared `MeetingExportButtons`.
 *
 * Surface: PLC light surface. Muted text uses the light palette
 * (`text-slate-500/600`). Keyboard-navigable; the "back to live mode" control
 * carries a focus ring.
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Lightbulb,
  Link2,
  ListChecks,
  Loader2,
  UserCircle2,
  Users,
  Video,
} from 'lucide-react';

import type { Plc, PlcMeeting } from '@/types';
import {
  usePlcAggregatesData,
  usePlcAssessmentsData,
  usePlcMembers,
} from '@/context/usePlcContext';
import { usePlcMeetings } from '@/hooks/usePlcMeetings';
import { buildPlcPath, spaNavigate } from '@/utils/plcPath';
import { weakestQuestions } from '../sharedData/sharedDataSelectors';
import { MeetingExportButtons } from './PlcMeetingMode';

function scoreToneClass(percent: number): string {
  if (percent >= 80) return 'text-emerald-600';
  if (percent >= 60) return 'text-amber-600';
  return 'text-brand-red-primary';
}

interface PlcMeetingRecordViewProps {
  plc: Plc;
  meetingId: string;
}

export const PlcMeetingRecordView: React.FC<PlcMeetingRecordViewProps> = ({
  plc,
  meetingId,
}) => {
  const { t, i18n } = useTranslation();
  const { meetingsById, loading, error } = usePlcMeetings(plc.id);
  const members = usePlcMembers();
  const { data: assessments } = usePlcAssessmentsData();
  const { data: aggregates } = usePlcAggregatesData();

  const meeting: PlcMeeting | undefined = meetingsById[meetingId];

  const memberNameByUid = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of members) map[m.uid] = m.displayName;
    return map;
  }, [members]);
  const assessmentById = useMemo(() => {
    const map: Record<string, (typeof assessments)[number]> = {};
    for (const a of assessments) map[a.id] = a;
    return map;
  }, [assessments]);
  const aggregateById = useMemo(() => {
    const map: Record<string, (typeof aggregates)[number]> = {};
    for (const agg of aggregates) map[agg.assessmentId] = agg;
    return map;
  }, [aggregates]);

  const nameFor = (uid: string): string => memberNameByUid[uid] ?? uid;
  const formatDate = (ms: number): string => {
    if (!ms) return '—';
    try {
      return new Date(ms).toLocaleString(i18n.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return new Date(ms).toLocaleString();
    }
  };

  const goLive = (): void => spaNavigate(buildPlcPath(plc.id, 'meeting'));

  if (loading && !meeting) {
    return (
      <div className="flex items-center justify-center h-full min-h-[240px] text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
        <span className="sr-only">
          {t('plcDashboard.meeting.loading', {
            defaultValue: 'Loading meeting data…',
          })}
        </span>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="m-4 lg:m-6 bg-white border border-slate-200 rounded-2xl p-6 text-center">
        <AlertCircle
          className="w-8 h-8 text-slate-300 mx-auto mb-3"
          aria-hidden="true"
        />
        <p className="text-base font-bold text-slate-700">
          {t('plcDashboard.meeting.record.notFound', {
            defaultValue: 'Meeting record not found',
          })}
        </p>
        <p className="text-sm text-slate-500 mt-1">
          {t('plcDashboard.meeting.record.notFoundBody', {
            defaultValue:
              'It may have been deleted, or you opened a stale link.',
          })}
        </p>
        <button
          type="button"
          onClick={goLive}
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue-primary hover:text-brand-blue-dark px-3 py-2 rounded-lg hover:bg-brand-blue-primary/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          {t('plcDashboard.meeting.record.backToLive', {
            defaultValue: 'Back to Meeting Mode',
          })}
        </button>
      </div>
    );
  }

  const cleanDecisions = meeting.decisions.filter(
    (d) => d.text.trim().length > 0
  );

  return (
    <div className="px-4 lg:px-6 py-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <button
              type="button"
              onClick={goLive}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 mb-2 px-2 py-1 -ml-2 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              {t('plcDashboard.meeting.record.backToLive', {
                defaultValue: 'Back to Meeting Mode',
              })}
            </button>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-800 leading-tight">
              {t('plcDashboard.meeting.record.title', {
                defaultValue: 'Meeting record',
              })}
            </h1>
            <p className="text-base text-slate-600 mt-1">
              {formatDate(meeting.heldAt)} ·{' '}
              {t('plcDashboard.meeting.record.facilitatedBy', {
                defaultValue: 'Facilitated by {{name}}',
                name: nameFor(meeting.facilitatorUid),
              })}
            </p>
          </div>
          <MeetingExportButtons plc={plc} meetingId={meetingId} />
        </div>

        {/* Agenda */}
        {meeting.agenda?.trim() && (
          <RecordSection
            icon={ClipboardList}
            title={t('plcDashboard.meeting.record.agenda', {
              defaultValue: 'Agenda',
            })}
          >
            <p className="text-base text-slate-700 whitespace-pre-wrap break-words">
              {meeting.agenda.trim()}
            </p>
          </RecordSection>
        )}

        {/* Attendees */}
        <RecordSection
          icon={Users}
          title={t('plcDashboard.meeting.record.attendees', {
            defaultValue: 'Attendees ({{count}})',
            count: meeting.attendeeUids.length,
          })}
        >
          {meeting.attendeeUids.length === 0 ? (
            <p className="text-sm text-slate-500">
              {t('plcDashboard.meeting.record.noAttendees', {
                defaultValue: 'No attendees were recorded.',
              })}
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {meeting.attendeeUids.map((uid) => (
                <li
                  key={uid}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 bg-slate-100 px-3 py-1 rounded-full"
                >
                  <UserCircle2
                    className="w-4 h-4 text-slate-500"
                    aria-hidden="true"
                  />
                  {nameFor(uid)}
                </li>
              ))}
            </ul>
          )}
        </RecordSection>

        {/* Reviewed assessments */}
        <RecordSection
          icon={BookOpen}
          title={t('plcDashboard.meeting.record.reviewed', {
            defaultValue: 'Reviewed assessments ({{count}})',
            count: meeting.assessmentIds.length,
          })}
        >
          {meeting.assessmentIds.length === 0 ? (
            <p className="text-sm text-slate-500">
              {t('plcDashboard.meeting.record.noReviewed', {
                defaultValue: 'No assessments were recorded.',
              })}
            </p>
          ) : (
            <ul className="space-y-3">
              {meeting.assessmentIds.map((id) => {
                const assessment = assessmentById[id];
                const aggregate = aggregateById[id];
                const KindIcon =
                  assessment?.kind === 'video-activity' ? Video : BookOpen;
                const title =
                  assessment?.title?.trim() ||
                  t('plcDashboard.meeting.untitledAssessment', {
                    defaultValue: 'Untitled assessment',
                  });
                const weak = aggregate
                  ? weakestQuestions(aggregate.perQuestion)
                  : [];
                return (
                  <li
                    key={id}
                    className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 min-w-0">
                        <KindIcon
                          className="w-4 h-4 text-brand-blue-primary shrink-0"
                          aria-hidden="true"
                        />
                        <span className="text-base font-bold text-slate-800 truncate">
                          {title}
                        </span>
                      </span>
                      {aggregate ? (
                        <span
                          className={`text-xl font-extrabold tabular-nums shrink-0 ${scoreToneClass(
                            aggregate.teamAveragePercent
                          )}`}
                        >
                          {aggregate.teamAveragePercent}%
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500 shrink-0">
                          {t('plcDashboard.meeting.record.noData', {
                            defaultValue: 'no data',
                          })}
                        </span>
                      )}
                    </div>
                    {weak.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {weak.map((q) => (
                          <li
                            key={q.questionId}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            <span className="text-slate-600 truncate">
                              {q.text ||
                                t('plcDashboard.meeting.untitledQuestion', {
                                  defaultValue: 'Untitled question',
                                })}
                            </span>
                            <span
                              className={`font-bold tabular-nums shrink-0 ${scoreToneClass(
                                q.correctPercent
                              )}`}
                            >
                              {q.correctPercent}%
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </RecordSection>

        {/* Decisions */}
        <RecordSection
          icon={Lightbulb}
          title={t('plcDashboard.meeting.record.decisions', {
            defaultValue: 'Decisions ({{count}})',
            count: cleanDecisions.length,
          })}
        >
          {cleanDecisions.length === 0 ? (
            <p className="text-sm text-slate-500">
              {t('plcDashboard.meeting.record.noDecisions', {
                defaultValue: 'No decisions were captured.',
              })}
            </p>
          ) : (
            <ul className="space-y-2.5">
              {cleanDecisions.map((d) => {
                const linkedTitle = d.linkedDataCard
                  ? assessmentById[d.linkedDataCard.assessmentId]?.title
                  : undefined;
                return (
                  <li
                    key={d.id}
                    className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 flex items-start gap-3"
                  >
                    <Lightbulb
                      className="w-5 h-5 text-amber-500 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="text-base text-slate-800 whitespace-pre-wrap break-words">
                        {d.text}
                      </p>
                      {d.linkedDataCard && (
                        <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-blue-primary bg-brand-blue-primary/10 px-2 py-0.5 rounded-md">
                          <Link2 className="w-3 h-3" aria-hidden="true" />
                          {linkedTitle ??
                            t('plcDashboard.meeting.decide.linkedFallback', {
                              defaultValue: 'a data card',
                            })}
                          {d.linkedDataCard.questionId &&
                            t('plcDashboard.meeting.decide.linkedQuestion', {
                              defaultValue: ' · Q{{q}}',
                              q: d.linkedDataCard.questionId,
                            })}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </RecordSection>

        {/* Action items */}
        <RecordSection
          icon={ListChecks}
          title={t('plcDashboard.meeting.record.actions', {
            defaultValue: 'Action items ({{count}})',
            count: meeting.actionItems.length,
          })}
        >
          {meeting.actionItems.length === 0 ? (
            <p className="text-sm text-slate-500">
              {t('plcDashboard.meeting.record.noActions', {
                defaultValue: 'No action items were captured.',
              })}
            </p>
          ) : (
            <ul className="space-y-2.5">
              {meeting.actionItems.map((item) => (
                <li
                  key={item.id}
                  className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 flex items-start gap-3"
                >
                  <ListChecks
                    className="w-5 h-5 text-brand-blue-primary shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-base text-slate-800 break-words">
                      {item.text}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <UserCircle2
                          className="w-3.5 h-3.5"
                          aria-hidden="true"
                        />
                        {item.assigneeUid
                          ? nameFor(item.assigneeUid)
                          : t('plcDashboard.meeting.act.unassigned', {
                              defaultValue: 'Unassigned',
                            })}
                      </span>
                      {item.dueAt != null && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar
                            className="w-3.5 h-3.5"
                            aria-hidden="true"
                          />
                          {new Date(item.dueAt).toLocaleDateString()}
                        </span>
                      )}
                      {item.todoId && (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                          <CheckCircle2
                            className="w-3.5 h-3.5"
                            aria-hidden="true"
                          />
                          {t('plcDashboard.meeting.act.todoCreated', {
                            defaultValue: 'To-do created',
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </RecordSection>

        {/* Notes */}
        {meeting.notesBody?.trim() && (
          <RecordSection
            icon={ClipboardList}
            title={t('plcDashboard.meeting.record.notes', {
              defaultValue: 'Notes',
            })}
          >
            <p className="text-base text-slate-700 whitespace-pre-wrap break-words">
              {meeting.notesBody.trim()}
            </p>
          </RecordSection>
        )}
      </div>
    </div>
  );
};

const RecordSection: React.FC<{
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  title: string;
  children: React.ReactNode;
}> = ({ icon: Icon, title, children }) => (
  <section className="bg-white border border-slate-200 rounded-3xl shadow-sm px-5 lg:px-6 py-5">
    <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-brand-blue-primary" aria-hidden={true} />
      {title}
    </h2>
    {children}
  </section>
);
