import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { TourRecordingHost } from './TourRecordingHost';

vi.mock('./RecordingSession', () => ({
  default: (p: {
    origin: string;
    handoff?: { frames: Blob[] };
    onEnd: () => void;
  }) => (
    <div data-testid="session">
      {p.origin}:{p.handoff?.frames.length ?? 'none'}
      <button type="button" onClick={p.onEnd}>
        End
      </button>
    </div>
  ),
}));

const recording = { frames: [new Blob(['a'])], redactions: [[]], steps: [] };

// A student tab two openers below this window.
const studentTab = () => {
  const posted: unknown[] = [];
  const tab = {
    opener: { opener: window },
    postMessage: (m: unknown) => posted.push(m),
  };
  return { tab, posted };
};

const send = (data: unknown, source: unknown) =>
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data,
        origin: window.location.origin,
        source: source as Window,
      })
    );
  });

describe('TourRecordingHost student handoff', () => {
  it('answers a probe and opens review for a recording from its own student tab', async () => {
    render(<TourRecordingHost acceptStudentRecordings />);
    const { tab, posted } = studentTab();
    send({ type: 'spart-student-tour-probe' }, tab);
    expect(posted).toEqual([{ type: 'spart-student-tour-ready' }]);
    send({ type: 'spart-student-tour-recording', recording }, tab);
    expect(await screen.findByTestId('session')).toHaveTextContent(
      'students:1'
    );
    expect(posted[1]).toEqual({ type: 'spart-student-tour-received' });
  });

  it('holds a second recording until the first session ends', async () => {
    render(<TourRecordingHost acceptStudentRecordings />);
    const { tab, posted } = studentTab();
    send({ type: 'spart-student-tour-recording', recording }, tab);
    send(
      {
        type: 'spart-student-tour-recording',
        recording: { ...recording, frames: [], redactions: [] },
      },
      tab
    );
    expect(posted).toHaveLength(2);
    expect(await screen.findByTestId('session')).toHaveTextContent(
      'students:1'
    );
    act(() => screen.getByRole('button', { name: 'End' }).click());
    expect(await screen.findByTestId('session')).toHaveTextContent(
      'students:0'
    );
  });

  it('drops a malformed recording without answering', () => {
    render(<TourRecordingHost acceptStudentRecordings />);
    const { tab, posted } = studentTab();
    send(
      {
        type: 'spart-student-tour-recording',
        recording: { frames: [new Blob(['a'])], steps: [] },
      },
      tab
    );
    expect(posted).toEqual([]);
    expect(screen.queryByTestId('session')).toBeNull();
  });

  it('ignores a recording from any other window', () => {
    render(<TourRecordingHost acceptStudentRecordings />);
    send(
      { type: 'spart-student-tour-recording', recording },
      { opener: { opener: {} }, postMessage: vi.fn() }
    );
    expect(screen.queryByTestId('session')).toBeNull();
  });

  it('takes nothing while student recordings are off', () => {
    render(<TourRecordingHost />);
    const { tab, posted } = studentTab();
    send({ type: 'spart-student-tour-probe' }, tab);
    send({ type: 'spart-student-tour-recording', recording }, tab);
    expect(posted).toEqual([]);
    expect(screen.queryByTestId('session')).toBeNull();
  });
});
