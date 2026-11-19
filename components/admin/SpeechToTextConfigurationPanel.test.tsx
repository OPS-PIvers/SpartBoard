// Defaults, the saved shape, minutes to seconds, and this month's usage.
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { monthlySpeechToTextUsageDocId } from '@/config/speechToText';

const setDocMock = vi.fn((_ref: { path: string }, _data: unknown) =>
  Promise.resolve()
);
let snapshotData: Record<string, Record<string, unknown> | undefined> = {};

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, collection: string, id: string) => ({
    path: `${collection}/${id}`,
    id,
  }),
  onSnapshot: (
    ref: { id: string },
    next: (snap: { data: () => unknown }) => void
  ) => {
    next({ data: () => snapshotData[ref.id] });
    return () => undefined;
  },
  setDoc: (ref: { path: string }, data: unknown) => setDocMock(ref, data),
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { email: 'admin@example.com' } }),
}));

import { SpeechToTextConfigurationPanel } from './SpeechToTextConfigurationPanel';

const minutesField = () =>
  screen.getByLabelText('Monthly limit: minutes of speech');
const tidyField = () => screen.getByLabelText('Monthly limit: tidy-ups');
const saveButton = () => screen.getByRole('button', { name: /save/i });

describe('SpeechToTextConfigurationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    snapshotData = {};
  });

  it('shows everything off when the settings doc is absent', () => {
    const onDirtyChange = vi.fn();
    render(<SpeechToTextConfigurationPanel onDirtyChange={onDirtyChange} />);
    expect(screen.getByLabelText(/Browser \(free\)/)).toBeChecked();
    expect(
      screen.getByLabelText(/AI transcription \(paid\)/)
    ).not.toBeChecked();
    expect(
      screen.getByRole('switch', { name: 'Tidy up button' })
    ).toHaveAttribute('aria-checked', 'false');
    expect(minutesField()).toHaveValue(1000);
    expect(tidyField()).toHaveValue(5000);
    expect(screen.getByText('0 of 1,000 minutes')).toBeInTheDocument();
    expect(screen.getByText('0 of 5,000 tidy-ups')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('saves the normalised shape with minutes stored as seconds', async () => {
    const onDirtyChange = vi.fn();
    render(<SpeechToTextConfigurationPanel onDirtyChange={onDirtyChange} />);
    fireEvent.click(screen.getByLabelText(/AI transcription \(paid\)/));
    fireEvent.click(screen.getByRole('switch', { name: 'Tidy up button' }));
    fireEvent.change(minutesField(), { target: { value: '250' } });
    fireEvent.change(tidyField(), { target: { value: '40' } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(saveButton());

    await waitFor(() => expect(setDocMock).toHaveBeenCalledTimes(1));
    const [ref, data] = setDocMock.mock.calls[0];
    expect(ref.path).toBe('admin_settings/speech_to_text');
    expect(data).toEqual({
      engine: 'hybrid',
      transcribeMode: 'verbatim',
      tidyUp: true,
      monthlyCapSeconds: 15000,
      monthlyCapTidyCalls: 40,
      updatedAt: expect.any(Number) as number,
      updatedBy: 'admin@example.com',
    });
    expect((data as { updatedAt: number }).updatedAt).toBeGreaterThan(0);
  });

  it('reads a saved doc and shows this month against its limits', () => {
    snapshotData = {
      speech_to_text: {
        engine: 'hybrid',
        transcribeMode: 'verbatim',
        tidyUp: true,
        monthlyCapSeconds: 6000,
        monthlyCapTidyCalls: 10,
      },
      [monthlySpeechToTextUsageDocId()]: {
        seconds: 720,
        clips: 31,
        tidyCalls: 3,
      },
    };
    render(<SpeechToTextConfigurationPanel />);
    expect(screen.getByLabelText(/AI transcription \(paid\)/)).toBeChecked();
    expect(minutesField()).toHaveValue(100);
    expect(screen.getByText('12 of 100 minutes')).toBeInTheDocument();
    expect(screen.getByText('3 of 10 tidy-ups')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Speech' })).toHaveAttribute(
      'aria-valuenow',
      '12'
    );
    expect(
      screen.getByRole('progressbar', { name: 'Tidy-ups' })
    ).toHaveAttribute('aria-valuenow', '30');
  });
});
