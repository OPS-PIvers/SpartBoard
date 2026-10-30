// Sheet / PDF export buttons for a saved meeting record.

import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react';

import type { Plc, PlcAssessmentAggregate, PlcCommonAssessment } from '@/types';
import { useAuth } from '@/context/useAuth';
import { useDashboard } from '@/context/useDashboard';
import {
  usePlcAggregatesData,
  usePlcAssessmentsData,
  usePlcMembers,
} from '@/context/usePlcContext';
import { usePlcMeetings } from '@/hooks/usePlcMeetings';
import { logError } from '@/utils/logError';
import {
  exportPlcMeeting,
  type PlcMeetingExportContext,
  type PlcMeetingExportFormat,
} from '@/utils/plcMeetingExport';
import { tourFieldAttr } from '@/config/tourAnchors';

export const MeetingExportButtons: React.FC<{
  plc: Plc;
  meetingId: string;
}> = ({ plc, meetingId }) => {
  const { t } = useTranslation();
  const { user, ensureGoogleScope } = useAuth();
  const { addToast } = useDashboard();
  const members = usePlcMembers();
  const { data: assessments } = usePlcAssessmentsData();
  const { data: aggregates } = usePlcAggregatesData();
  const { meetingsById } = usePlcMeetings(plc.id);
  const [busy, setBusy] = useState<PlcMeetingExportFormat | null>(null);

  const exportContext = useMemo<PlcMeetingExportContext>(() => {
    const memberNamesByUid: Record<string, string> = {};
    for (const m of members) memberNamesByUid[m.uid] = m.displayName;
    const assessmentsById: Record<string, PlcCommonAssessment> = {};
    for (const a of assessments) assessmentsById[a.id] = a;
    const aggregatesById: Record<string, PlcAssessmentAggregate> = {};
    for (const agg of aggregates) aggregatesById[agg.assessmentId] = agg;
    return {
      plcName: plc.name,
      memberNamesByUid,
      assessmentsById,
      aggregatesById,
    };
  }, [members, assessments, aggregates, plc.name]);

  const handleExport = useCallback(
    async (format: PlcMeetingExportFormat) => {
      const meeting = meetingsById[meetingId];
      if (!meeting) {
        addToast(
          t('plcDashboard.meeting.export.notReady', {
            defaultValue: 'The meeting record isn’t loaded yet. Try again.',
          }),
          'error'
        );
        return;
      }
      // Both formats go through the Sheets API, so both need the spreadsheets scope.
      const token = await ensureGoogleScope('spreadsheets', {
        interactive: true,
      });
      if (!token) {
        addToast(
          t('plcDashboard.meeting.export.noGoogle', {
            defaultValue:
              'Connect your Google account to export the meeting record.',
          }),
          'error'
        );
        return;
      }
      setBusy(format);
      try {
        const result = await exportPlcMeeting(
          token,
          meeting,
          exportContext,
          format
        );
        if (format === 'pdf' && result.pdfBlob) {
          const url = URL.createObjectURL(result.pdfBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${result.fileName}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          addToast(
            t('plcDashboard.meeting.export.pdfDone', {
              defaultValue: 'Meeting record exported to PDF.',
            }),
            'success'
          );
        } else {
          addToast(
            t('plcDashboard.meeting.export.sheetDone', {
              defaultValue: 'Meeting record exported to Google Sheets.',
            }),
            'success',
            {
              label: t('plcDashboard.meeting.export.open', {
                defaultValue: 'Open',
              }),
              onClick: () => window.open(result.sheetUrl, '_blank', 'noopener'),
            }
          );
        }
      } catch (err) {
        logError('MeetingExportButtons.export', err, {
          plcId: plc.id,
          meetingId,
          uid: user?.uid,
        });
        addToast(
          err instanceof Error
            ? err.message
            : t('plcDashboard.meeting.export.failed', {
                defaultValue: 'Couldn’t export the meeting record.',
              }),
          'error'
        );
      } finally {
        setBusy(null);
      }
    },
    [
      meetingsById,
      meetingId,
      ensureGoogleScope,
      exportContext,
      addToast,
      plc.id,
      user?.uid,
      t,
    ]
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        {...tourFieldAttr('plc-meeting.export', 'plc', 'sheet')}
        type="button"
        onClick={() => handleExport('sheet')}
        disabled={busy !== null}
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 px-4 py-2 rounded-xl transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
      >
        {busy === 'sheet' ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : (
          <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
        )}
        {t('plcDashboard.meeting.export.toSheet', {
          defaultValue: 'Export to Sheets',
        })}
      </button>
      <button
        {...tourFieldAttr('plc-meeting.export', 'plc', 'pdf')}
        type="button"
        onClick={() => handleExport('pdf')}
        disabled={busy !== null}
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-50 px-4 py-2 rounded-xl transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary/40"
      >
        {busy === 'pdf' ? (
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="w-4 h-4" aria-hidden="true" />
        )}
        {t('plcDashboard.meeting.export.toPdf', {
          defaultValue: 'Export to PDF',
        })}
      </button>
    </div>
  );
};
