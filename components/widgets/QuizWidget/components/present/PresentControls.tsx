import React, { useState } from 'react';
import { MonitorX, Pause, Play, Users } from 'lucide-react';

interface PresentControlsProps {
  showNames: boolean;
  onToggleNames: () => void;
  /** True when the live question carries audio or video stimuli. */
  hasMedia: boolean;
  onPlayMedia: () => void;
  onPauseMedia: () => void;
  paused: boolean;
  pauseMessage: string;
  onSavePauseMessage: (message: string) => void;
  onExit: () => void;
}

/**
 * Teacher-side panel for the presentation. Lives in the private monitor, never
 * in the popup — the class must not see the names control.
 */
export const PresentControls: React.FC<PresentControlsProps> = ({
  showNames,
  onToggleNames,
  hasMedia,
  onPlayMedia,
  onPauseMedia,
  paused,
  pauseMessage,
  onSavePauseMessage,
  onExit,
}) => {
  const [draft, setDraft] = useState(pauseMessage);

  return (
    <div
      className="shrink-0 border-t border-brand-gray-lightest bg-brand-blue-lighter"
      style={{
        padding: 'min(10px, 2.5cqmin) min(12px, 3cqmin)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'min(8px, 2cqmin)',
      }}
    >
      <div
        className="flex items-center flex-wrap"
        style={{ gap: 'min(8px, 2cqmin)' }}
      >
        <span
          className="font-sans font-semibold uppercase tracking-wider text-brand-blue-dark"
          style={{ fontSize: 'min(10px, 3.5cqmin)' }}
        >
          Presenting
        </span>
        <button
          onClick={onToggleNames}
          aria-pressed={showNames}
          className={`inline-flex items-center rounded-md border font-sans font-semibold transition-colors ${
            showNames
              ? 'bg-brand-blue-primary border-brand-blue-primary text-white'
              : 'bg-white border-brand-gray-lighter text-brand-gray-dark'
          }`}
          style={{
            gap: 'min(6px, 1.5cqmin)',
            padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
            fontSize: 'min(12px, 4cqmin)',
          }}
        >
          <Users
            aria-hidden
            style={{
              width: 'min(14px, 4.5cqmin)',
              height: 'min(14px, 4.5cqmin)',
            }}
          />
          {showNames ? 'Names on' : 'Names off'}
        </button>
        {hasMedia && (
          <>
            <button
              onClick={onPlayMedia}
              className="inline-flex items-center rounded-md border border-brand-gray-lighter bg-white text-brand-gray-dark font-sans font-semibold transition-colors hover:border-brand-blue-light"
              style={{
                gap: 'min(6px, 1.5cqmin)',
                padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
                fontSize: 'min(12px, 4cqmin)',
              }}
            >
              <Play
                aria-hidden
                style={{
                  width: 'min(14px, 4.5cqmin)',
                  height: 'min(14px, 4.5cqmin)',
                }}
              />
              Play media
            </button>
            <button
              onClick={onPauseMedia}
              aria-label="Pause media"
              className="rounded-md border border-brand-gray-lighter bg-white text-brand-gray-dark transition-colors hover:border-brand-blue-light"
              style={{ padding: 'min(6px, 1.5cqmin)' }}
            >
              <Pause
                style={{
                  width: 'min(14px, 4.5cqmin)',
                  height: 'min(14px, 4.5cqmin)',
                }}
              />
            </button>
          </>
        )}
        <button
          onClick={onExit}
          className="inline-flex items-center rounded-md border border-brand-gray-lighter bg-white text-brand-red-primary font-sans font-semibold transition-colors hover:border-brand-red-light ml-auto"
          style={{
            gap: 'min(6px, 1.5cqmin)',
            padding: 'min(6px, 1.5cqmin) min(10px, 2.5cqmin)',
            fontSize: 'min(12px, 4cqmin)',
          }}
        >
          <MonitorX
            aria-hidden
            style={{
              width: 'min(14px, 4.5cqmin)',
              height: 'min(14px, 4.5cqmin)',
            }}
          />
          Close
        </button>
      </div>
      {paused && (
        <label className="flex flex-col" style={{ gap: 'min(4px, 1cqmin)' }}>
          <span
            className="font-sans text-brand-gray-primary"
            style={{ fontSize: 'min(10px, 3.5cqmin)' }}
          >
            Pause message (shown on the board and on student devices)
          </span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => onSavePauseMessage(draft.trim())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSavePauseMessage(draft.trim());
            }}
            placeholder="Back in 5 minutes"
            className="bg-white border border-brand-gray-lighter rounded-md text-brand-gray-dark font-sans"
            style={{
              padding: 'min(6px, 1.5cqmin) min(8px, 2cqmin)',
              fontSize: 'min(12px, 4cqmin)',
            }}
          />
        </label>
      )}
    </div>
  );
};
