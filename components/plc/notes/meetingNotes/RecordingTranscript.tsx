// Read-only, speaker-numbered transcript of one recording, loaded when first opened (MR-D17).
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import type { PlcTranscriptSegment } from '@/types';
import { formatTranscriptTime } from '@/utils/plcMeetingNotes';
import { logError } from '@/utils/logError';
import { tourAttr } from '@/config/tourAnchors';

interface RecordingTranscriptProps {
  recordingId: string;
  loadTranscript: (recordingId: string) => Promise<{
    segments: PlcTranscriptSegment[];
  }>;
}

export const RecordingTranscript: React.FC<RecordingTranscriptProps> = ({
  recordingId,
  loadTranscript,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [segments, setSegments] = useState<PlcTranscriptSegment[] | null>(null);
  const [failed, setFailed] = useState(false);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (!next || segments) return;
    setFailed(false);
    loadTranscript(recordingId)
      .then((tr) => setSegments(tr.segments))
      .catch((err: unknown) => {
        logError('RecordingTranscript.load', err, { recordingId });
        setFailed(true);
      });
  };

  return (
    <div className="mt-2">
      <button
        {...tourAttr('plc-notes.transcript-toggle')}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xxs font-bold text-slate-500 hover:text-brand-blue-primary transition-colors"
      >
        {open ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        {t('plcDashboard.notes.meetingNotes.transcript', {
          defaultValue: 'Transcript',
        })}
      </button>
      {open && (
        <div className="mt-1.5 max-h-72 overflow-y-auto custom-scrollbar rounded-lg border border-slate-200 px-3 pt-2 pb-3">
          {failed ? (
            <p className="text-xs text-brand-red-primary">
              {t('plcDashboard.notes.meetingNotes.transcriptFailed', {
                defaultValue: "Couldn't load the transcript.",
              })}
            </p>
          ) : !segments ? (
            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
          ) : (
            segments.map((s, i) => (
              <p
                key={i}
                className="py-0.5 text-xs leading-relaxed text-slate-700"
              >
                <span className="mr-1.5 tabular-nums text-xxs text-slate-400">
                  {formatTranscriptTime(s.startMs)}
                </span>
                <span className="mr-1.5 font-bold text-slate-800">
                  {t('plcDashboard.notes.meetingNotes.speaker', {
                    defaultValue: 'Speaker {{n}}',
                    n: s.speaker,
                  })}
                </span>
                {s.text}
              </p>
            ))
          )}
        </div>
      )}
    </div>
  );
};
