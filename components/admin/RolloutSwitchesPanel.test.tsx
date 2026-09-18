import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const setDocMock = vi.fn((_ref: { path: string }, _data: unknown) =>
  Promise.resolve()
);
const snapshotData: Record<string, Record<string, unknown> | undefined> = {
  plc_note_collab: { enabled: true },
  paper_answer_sheets: undefined,
  roster_groups_integration: undefined,
};

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

import { RolloutSwitchesPanel } from './RolloutSwitchesPanel';

describe('RolloutSwitchesPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows each switch at its saved state, with a missing doc reading as off', () => {
    render(<RolloutSwitchesPanel />);
    expect(
      screen.getByRole('switch', { name: 'PLC collaborative notes' })
    ).toBeChecked();
    expect(
      screen.getByRole('switch', { name: 'Paper answer sheets' })
    ).not.toBeChecked();
    expect(
      screen.getByRole('switch', { name: 'Class groups in widgets' })
    ).not.toBeChecked();
  });

  it('writes to the roster-groups doc from its own row', async () => {
    render(<RolloutSwitchesPanel />);
    fireEvent.click(
      screen.getByRole('switch', { name: 'Class groups in widgets' })
    );
    await waitFor(() => expect(setDocMock).toHaveBeenCalledOnce());
    expect(setDocMock.mock.calls[0][0].path).toBe(
      'admin_settings/roster_groups_integration'
    );
    expect(setDocMock.mock.calls[0][1]).toEqual({ enabled: true });
  });

  it('writes {enabled:true} to the right doc when a switch is turned on', async () => {
    render(<RolloutSwitchesPanel />);
    fireEvent.click(
      screen.getByRole('switch', { name: 'Paper answer sheets' })
    );
    await waitFor(() => expect(setDocMock).toHaveBeenCalledOnce());
    expect(setDocMock.mock.calls[0][0].path).toBe(
      'admin_settings/paper_answer_sheets'
    );
    expect(setDocMock.mock.calls[0][1]).toEqual({ enabled: true });
  });

  it('writes {enabled:false} when a switch is turned off', async () => {
    render(<RolloutSwitchesPanel />);
    fireEvent.click(
      screen.getByRole('switch', { name: 'PLC collaborative notes' })
    );
    await waitFor(() => expect(setDocMock).toHaveBeenCalledOnce());
    expect(setDocMock.mock.calls[0][0].path).toBe(
      'admin_settings/plc_note_collab'
    );
    expect(setDocMock.mock.calls[0][1]).toEqual({ enabled: false });
  });

  it('surfaces a failed write beside the switch', async () => {
    setDocMock.mockRejectedValueOnce(
      new Error('Missing or insufficient permissions.')
    );
    render(<RolloutSwitchesPanel />);
    fireEvent.click(
      screen.getByRole('switch', { name: 'Paper answer sheets' })
    );
    expect(
      await screen.findByText(/insufficient permissions/)
    ).toBeInTheDocument();
  });
});
