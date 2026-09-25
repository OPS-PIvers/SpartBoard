import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const setDocMock = vi.fn((_ref: { path: string }, _data: unknown) =>
  Promise.resolve()
);
const snapshotData: Record<string, Record<string, unknown> | undefined> = {
  plc_note_collab: { enabled: true },
  paper_answer_sheets: undefined,
  plc_delegated_printing: undefined,
  roster_groups_integration: undefined,
  projects_widget: undefined,
  quiz_document_import: undefined,
  sub_launch_as_teacher: undefined,
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
  collection: vi.fn(),
  addDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  getDocs: () =>
    Promise.resolve({
      forEach: (cb: (d: { data: () => unknown }) => void) =>
        savedPermissions.forEach((p) => cb({ data: () => p })),
    }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { email: 'admin@test.com' } }),
}));

let savedPermissions: Record<string, unknown>[] = [];

import { PreviewsPanel } from './PreviewsPanel';

const renderPanel = async () => {
  render(<PreviewsPanel />);
  await screen.findByRole('switch', {
    name: 'Projects widget district switch',
  });
};

const district = (title: string) =>
  screen.getByRole('switch', { name: `${title} district switch` });

describe('PreviewsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    savedPermissions = [];
  });

  it('pairs a district switch with its access flag on one row', async () => {
    await renderPanel();
    const row = screen.getByTestId('access-row-paper-answer-sheets');
    expect(row).toContainElement(district('Paper answer sheets'));
    expect(row).toHaveTextContent('Off everywhere');
  });

  it('marks a public retire-after-launch flag as ready to retire', async () => {
    savedPermissions = [
      {
        featureId: 'quiz-grader-v2',
        enabled: true,
        accessLevel: 'public',
        betaUsers: [],
        buildings: [],
      },
    ];
    await renderPanel();
    expect(screen.getByTestId('access-row-quiz-grader-v2')).toHaveTextContent(
      'Ready to retire'
    );
  });

  it('keeps permanent features off the Previews tab', async () => {
    await renderPanel();
    expect(screen.queryByTestId('access-row-live-session')).toBeNull();
  });

  it('shows each switch at its saved state, with a missing doc reading as off', async () => {
    await renderPanel();
    expect(district('PLC collaborative notes')).toBeChecked();
    expect(district('Paper answer sheets')).not.toBeChecked();
    expect(district('Class groups in widgets')).not.toBeChecked();
    expect(district('Projects widget')).not.toBeChecked();
  });

  it('writes to the projects-widget doc from its own row', async () => {
    await renderPanel();
    fireEvent.click(district('Projects widget'));
    await waitFor(() => expect(setDocMock).toHaveBeenCalledOnce());
    expect(setDocMock.mock.calls[0][0].path).toBe(
      'admin_settings/projects_widget'
    );
    expect(setDocMock.mock.calls[0][1]).toEqual({ enabled: true });
  });

  it('writes to the roster-groups doc from its own row', async () => {
    await renderPanel();
    fireEvent.click(district('Class groups in widgets'));
    await waitFor(() => expect(setDocMock).toHaveBeenCalledOnce());
    expect(setDocMock.mock.calls[0][0].path).toBe(
      'admin_settings/roster_groups_integration'
    );
    expect(setDocMock.mock.calls[0][1]).toEqual({ enabled: true });
  });

  it('writes to the delegated-printing doc from its own row', async () => {
    await renderPanel();
    fireEvent.click(district('Print response sheets for a PLC teammate'));
    await waitFor(() => expect(setDocMock).toHaveBeenCalledOnce());
    expect(setDocMock.mock.calls[0][0].path).toBe(
      'admin_settings/plc_delegated_printing'
    );
    expect(setDocMock.mock.calls[0][1]).toEqual({ enabled: true });
  });

  it('writes {enabled:true} to the right doc when a switch is turned on', async () => {
    await renderPanel();
    fireEvent.click(district('Paper answer sheets'));
    await waitFor(() => expect(setDocMock).toHaveBeenCalledOnce());
    expect(setDocMock.mock.calls[0][0].path).toBe(
      'admin_settings/paper_answer_sheets'
    );
    expect(setDocMock.mock.calls[0][1]).toEqual({ enabled: true });
  });

  // Launch-as-teacher is the one switch behind a Cloud Function that writes on
  // another user's behalf, so it has to read as off until an admin turns it on.
  it('offers substitute launching, off, and writes to its own doc', async () => {
    await renderPanel();
    const toggle = district('Substitutes can start an activity');
    expect(toggle).not.toBeChecked();

    fireEvent.click(toggle);

    await waitFor(() => expect(setDocMock).toHaveBeenCalledOnce());
    expect(setDocMock.mock.calls[0][0].path).toBe(
      'admin_settings/sub_launch_as_teacher'
    );
    expect(setDocMock.mock.calls[0][1]).toEqual({ enabled: true });
  });

  it('writes {enabled:false} when a switch is turned off', async () => {
    await renderPanel();
    fireEvent.click(district('PLC collaborative notes'));
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
    await renderPanel();
    fireEvent.click(district('Paper answer sheets'));
    expect(
      await screen.findByText(/insufficient permissions/)
    ).toBeInTheDocument();
  });
});
