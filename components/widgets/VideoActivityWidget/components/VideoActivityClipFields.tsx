// Start and end times for the part of the video students watch (docs/plans/IMPORT.md D33).
import React, { useState } from 'react';
import type { VideoActivityClip } from '@/types';
import { tourAttr } from '@/config/tourAnchors';
import { useAuth } from '@/context/useAuth';
import { normalizeClip } from '@/utils/videoActivityClip';
import { mmSsToSeconds, secondsToMmSs } from './useVideoActivityEditorState';

interface VideoActivityClipFieldsProps {
  clip: VideoActivityClip | undefined;
  onChange: (next: VideoActivityClip | undefined) => void;
}

const TimeField: React.FC<{
  label: string;
  anchorProps: ReturnType<typeof tourAttr>;
  seconds: number | undefined;
  placeholder: string;
  onCommit: (seconds: number | undefined) => void;
}> = ({ label, anchorProps, seconds, placeholder, onCommit }) => {
  const shown = seconds !== undefined ? secondsToMmSs(seconds) : '';
  const [draft, setDraft] = useState(shown);
  const [prevShown, setPrevShown] = useState(shown);
  if (shown !== prevShown) {
    setPrevShown(shown);
    setDraft(shown);
  }
  const invalid = draft.trim() !== '' && isNaN(mmSsToSeconds(draft.trim()));
  const commit = () => {
    const text = draft.trim();
    if (text === '') return onCommit(undefined);
    const parsed = mmSsToSeconds(text);
    if (isNaN(parsed)) return;
    onCommit(parsed);
  };
  return (
    <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
      {label}
      <input
        {...anchorProps}
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        placeholder={placeholder}
        aria-invalid={invalid}
        className={`w-20 px-2 py-1.5 bg-white border rounded-lg text-sm font-mono text-slate-700 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-brand-blue-primary/40 ${
          invalid ? 'border-brand-red-primary' : 'border-slate-300'
        }`}
      />
    </label>
  );
};

export const VideoActivityClipFields: React.FC<
  VideoActivityClipFieldsProps
> = ({ clip, onChange }) => {
  const { canAccessFeature } = useAuth();
  if (!canAccessFeature('video-activity-stops')) return null;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <TimeField
        label="Start at"
        anchorProps={tourAttr('video-activity.editor-clip-start')}
        seconds={clip?.start}
        placeholder="00:00"
        onCommit={(start) => onChange(normalizeClip({ ...clip, start }))}
      />
      <TimeField
        label="End at"
        anchorProps={tourAttr('video-activity.editor-clip-end')}
        seconds={clip?.end}
        placeholder="End"
        onCommit={(end) => onChange(normalizeClip({ ...clip, end }))}
      />
    </div>
  );
};
