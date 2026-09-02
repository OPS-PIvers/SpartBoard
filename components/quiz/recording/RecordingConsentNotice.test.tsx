import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@/i18n';
import { RecordingConsentNotice } from './RecordingConsentNotice';
import { AudioResponseCapture } from './AudioResponseCapture';
import type { RecordingConfig } from '@/types';
import type { AudioRecordingDeps } from '@/hooks/useAudioRecording';

const config: RecordingConfig = {
  prepSeconds: 30,
  limitSeconds: 60,
  prepExpiry: 'armed',
  takeLimit: null,
};

const deps: AudioRecordingDeps = {
  getStream: vi.fn(),
  createRecorder: vi.fn(),
  isTypeSupported: () => true,
  now: () => 0,
};

describe('RecordingConsentNotice', () => {
  it('renders all four Tennessen elements including both refusal sentences', () => {
    render(<RecordingConsentNotice onAcknowledge={() => undefined} />);
    expect(screen.getByText(/Why we ask for a recording/i)).toBeTruthy();
    expect(screen.getByText(/Can you refuse\?/i)).toBeTruthy();
    expect(screen.getByText(/What happens if you refuse/i)).toBeTruthy();
    expect(screen.getByText(/Who receives your recording/i)).toBeTruthy();
    expect(screen.getByText(/stop a recording and discard it/i)).toBeTruthy();
    expect(screen.getByText(/question stays unanswered/i)).toBeTruthy();
  });

  it('promises no hard submit block in the refusal consequence', () => {
    const { container } = render(
      <RecordingConsentNotice onAcknowledge={() => undefined} />
    );
    expect(container.textContent).not.toMatch(/cannot be submitted/i);
  });

  it('renders a dark card when light is false', () => {
    const { container } = render(
      <RecordingConsentNotice light={false} onAcknowledge={() => undefined} />
    );
    const section = container.querySelector('section');
    expect(section?.className).toContain('bg-slate-800/60');
    expect(section?.className).not.toContain('bg-white/90');
  });

  it('does not mention AI or transcription', () => {
    const { container } = render(
      <RecordingConsentNotice onAcknowledge={() => undefined} />
    );
    expect(container.textContent).not.toMatch(/gemini|transcri/i);
  });
});

describe('AudioResponseCapture notice gate', () => {
  it('shows the notice and never probes the mic until acknowledged', () => {
    render(
      <AudioResponseCapture
        config={config}
        takesCommitted={0}
        noticeAckedAt={null}
        onAcknowledgeNotice={() => undefined}
        onCommit={() => Promise.resolve()}
        recorderDeps={deps}
      />
    );
    expect(screen.getByText(/Before you record/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Record$/i })).toBeNull();
    expect(deps.getStream).not.toHaveBeenCalled();
  });

  it('acknowledging once reveals the recorder and does not re-show the notice', () => {
    const onAcknowledgeNotice = vi.fn();
    const { rerender } = render(
      <AudioResponseCapture
        config={config}
        takesCommitted={0}
        noticeAckedAt={null}
        onAcknowledgeNotice={onAcknowledgeNotice}
        onCommit={() => Promise.resolve()}
        recorderDeps={deps}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /I have read this/i }));
    expect(onAcknowledgeNotice).toHaveBeenCalledTimes(1);

    rerender(
      <AudioResponseCapture
        config={config}
        takesCommitted={0}
        noticeAckedAt={1700000000000}
        onAcknowledgeNotice={onAcknowledgeNotice}
        onCommit={() => Promise.resolve()}
        recorderDeps={deps}
      />
    );
    expect(screen.queryByText(/Before you record/i)).toBeNull();
    expect(screen.getByText(/Thinking time/i)).toBeTruthy();

    // A second recording question in the same assignment stays acknowledged.
    rerender(
      <AudioResponseCapture
        config={config}
        takesCommitted={0}
        noticeAckedAt={1700000000000}
        onAcknowledgeNotice={onAcknowledgeNotice}
        onCommit={() => Promise.resolve()}
        recorderDeps={deps}
      />
    );
    expect(onAcknowledgeNotice).toHaveBeenCalledTimes(1);
  });

  it('hides the record affordance once the take budget is used up', () => {
    render(
      <AudioResponseCapture
        config={{ ...config, takeLimit: 2, prepSeconds: 0 }}
        takesCommitted={2}
        noticeAckedAt={1700000000000}
        onAcknowledgeNotice={() => undefined}
        onCommit={() => Promise.resolve()}
        recorderDeps={deps}
      />
    );
    expect(screen.getByText(/No takes left/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Record/i })).toBeNull();
  });
});
