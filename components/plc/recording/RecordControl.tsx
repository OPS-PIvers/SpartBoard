import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Mic, Pause, Square } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
import { formatRecordingClock, recordingTimeLeftMs } from './recordingTime';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';

export interface RecordControlLive {
  paused: boolean;
  elapsedMs: number;
  /** Shown to teammates; omitted on the recorder's own badge. */
  recorderName?: string;
}

interface RecordControlProps {
  /** The signed-in user's own recording on this note. */
  self?: RecordControlLive;
  /** A teammate's recording on this note, which blocks starting another. */
  other?: RecordControlLive;
  supported: boolean;
  busy?: boolean;
  /** A short problem line, such as a blocked microphone. */
  notice?: string | null;
  /** Badge only, for members who can't record. */
  hideRecord?: boolean;
  devices: { deviceId: string; label: string }[];
  deviceId: string | null;
  onSelectDevice: (deviceId: string) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

const BUTTON =
  'inline-flex items-center gap-1 px-1.5 py-1 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-colors';

const LiveBadge: React.FC<{ live: RecordControlLive }> = ({ live }) => {
  const { t } = useTranslation();
  const left = recordingTimeLeftMs(live.elapsedMs);
  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 px-1.5 text-xs whitespace-nowrap"
    >
      {live.paused ? (
        <>
          <Pause className="w-3 h-3 text-slate-500" aria-hidden />
          <span className="font-bold text-slate-700">
            {t('plcDashboard.notes.recording.paused', {
              defaultValue: 'Paused',
            })}
          </span>
        </>
      ) : (
        <>
          <span aria-hidden className="w-2.5 h-2.5 rounded-full bg-red-600" />
          <span className="font-bold text-red-700">
            {t('plcDashboard.notes.recording.live', {
              defaultValue: 'Recording',
            })}
          </span>
        </>
      )}
      {live.recorderName && (
        <>
          <span className="text-slate-400">·</span>
          <span className="text-slate-600 truncate max-w-[10rem]">
            {live.recorderName}
          </span>
        </>
      )}
      <span className="text-slate-400">·</span>
      <span className="tabular-nums font-semibold text-slate-700">
        {formatRecordingClock(live.elapsedMs)}
      </span>
      {left !== null && (
        <>
          <span className="text-slate-400">·</span>
          <span className="tabular-nums font-semibold text-amber-700">
            {t('plcDashboard.notes.recording.timeLeft', {
              defaultValue: '{{time}} left',
              time: formatRecordingClock(left),
            })}
          </span>
        </>
      )}
    </span>
  );
};

/** Record button and live badge for the note editor toolbar. */
export const RecordControl: React.FC<RecordControlProps> = ({
  self,
  other,
  supported,
  busy = false,
  notice,
  hideRecord = false,
  devices,
  deviceId,
  onSelectDevice,
  onStart,
  onPause,
  onResume,
  onStop,
}) => {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, () => setMenuOpen(false));

  if (self) {
    return (
      <div className="flex items-center gap-1 shrink-0">
        {notice && (
          <span role="alert" className="text-xxs font-semibold text-red-700">
            {notice}
          </span>
        )}
        <LiveBadge live={self} />
        {self.paused ? (
          <button
            {...tourAttr('plc-recording.resume')}
            type="button"
            className={BUTTON}
            disabled={busy}
            onClick={onResume}
          >
            <Mic className="w-3.5 h-3.5" />
            {t('plcDashboard.notes.recording.resume', {
              defaultValue: 'Resume',
            })}
          </button>
        ) : (
          <button
            {...tourAttr('plc-recording.pause')}
            type="button"
            className={BUTTON}
            disabled={busy}
            onClick={onPause}
          >
            <Pause className="w-3.5 h-3.5" />
            {t('plcDashboard.notes.recording.pause', {
              defaultValue: 'Pause',
            })}
          </button>
        )}
        <button
          {...tourAttr('plc-recording.stop')}
          type="button"
          className={BUTTON}
          disabled={busy}
          onClick={onStop}
        >
          <Square className="w-3.5 h-3.5" />
          {t('plcDashboard.notes.recording.stop', { defaultValue: 'Stop' })}
        </button>
      </div>
    );
  }

  const recordLabel = t('plcDashboard.notes.recording.record', {
    defaultValue: 'Record',
  });
  const unsupportedLabel = t('plcDashboard.notes.recording.chromeOnly', {
    defaultValue: 'Recording works in Chrome',
  });

  return (
    <div className="flex items-center gap-1 shrink-0">
      {notice && (
        <span role="alert" className="text-xxs font-semibold text-red-700">
          {notice}
        </span>
      )}
      {other && <LiveBadge live={other} />}
      {hideRecord ? null : (
        <>
          {other && <span aria-hidden className="w-px h-4 bg-slate-200 mx-1" />}
          <div ref={menuRef} className="relative flex items-center">
            <button
              {...tourAttr('plc-recording.start')}
              type="button"
              className={`${BUTTON} pl-2`}
              disabled={!supported || !!other || busy}
              onClick={onStart}
              title={supported ? recordLabel : unsupportedLabel}
            >
              <span
                aria-hidden
                className="w-2.5 h-2.5 rounded-full bg-red-600"
              />
              {recordLabel}
            </button>
            {supported && !other && devices.length > 1 && (
              <button
                {...tourAttr('plc-recording.mic-menu')}
                type="button"
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label={t('plcDashboard.notes.recording.microphone', {
                  defaultValue: 'Microphone',
                })}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            )}
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-1 z-20 w-56 bg-white border border-slate-200 rounded-lg shadow-lg py-1 text-xs"
              >
                <div className="px-3 py-1 text-xxs font-bold uppercase tracking-widest text-slate-400">
                  {t('plcDashboard.notes.recording.microphone', {
                    defaultValue: 'Microphone',
                  })}
                </div>
                {devices.map((device) => {
                  const selected = device.deviceId === deviceId;
                  return (
                    <button
                      {...tourFieldAttr(
                        'plc-recording.mic-device',
                        'plc',
                        device.deviceId
                      )}
                      key={device.deviceId}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      onClick={() => {
                        onSelectDevice(device.deviceId);
                        setMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-slate-50 ${
                        selected
                          ? 'font-semibold text-slate-800'
                          : 'text-slate-700'
                      }`}
                    >
                      <span className="truncate">{device.label}</span>
                      {selected && (
                        <Check className="w-3.5 h-3.5 shrink-0 text-brand-blue-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
