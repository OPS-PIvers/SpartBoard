/**
 * PlcRubricLibraryBody — M12 Phase 3-I.
 *
 * Covers the four library actions against mocked Firestore hooks:
 * list rendering (title / criteria count / max points / attribution),
 * share-to-PLC via the picker, import-to-personal-library (fresh id +
 * stripped attribution), and unshare gating on the non-viewer role.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import i18n from 'i18next';
import { PlcRubricLibraryBody } from '@/components/plc/bodies/PlcRubricLibraryBody';
import type { Plc, PlcRubricEntry, Rubric } from '@/types';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: {
      uid: 'teacher-1',
      email: 'T@example.com',
      displayName: 'Ms. Teacher',
    },
  }),
}));

const addToast = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast }),
}));

const showConfirm = vi.fn().mockResolvedValue(true);
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm }),
}));

let canEdit = true;
vi.mock('@/context/usePlcContext', () => ({
  useCanEditPlcContent: () => canEdit,
}));

const saveRubric = vi.fn().mockResolvedValue(undefined);
let personalRubrics: Rubric[] = [];
vi.mock('@/hooks/useRubrics', () => ({
  useRubrics: () => ({ rubrics: personalRubrics, saveRubric }),
}));

const shareRubricWithPlc = vi.fn().mockResolvedValue('created');
const unshareRubricFromPlc = vi.fn().mockResolvedValue(undefined);
let plcRubrics: PlcRubricEntry[] = [];
let plcLoading = false;
let plcError: Error | null = null;
vi.mock('@/hooks/usePlcRubrics', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/usePlcRubrics')>(
    '@/hooks/usePlcRubrics'
  );
  return {
    toPortableRubric: actual.toPortableRubric,
    usePlcRubrics: () => ({
      rubrics: plcRubrics,
      loading: plcLoading,
      error: plcError,
      shareRubricWithPlc,
      unshareRubricFromPlc,
      restoreRubricInPlc: vi.fn(),
    }),
  };
});

const plc = {
  id: 'plc-1',
  name: 'Test PLC',
  leadUid: 'teacher-1',
  memberUids: ['teacher-1'],
} as unknown as Plc;

const criteria: Rubric['criteria'] = [
  {
    id: 'c1',
    name: 'Thesis',
    levels: [
      { id: 'l1', label: 'Low', points: 1 },
      { id: 'l2', label: 'High', points: 4 },
    ],
  },
  {
    id: 'c2',
    name: 'Evidence',
    levels: [
      { id: 'l1', label: 'Low', points: 0 },
      { id: 'l2', label: 'High', points: 2 },
    ],
  },
];

const personalRubric: Rubric = {
  id: 'rubric-personal-1',
  title: 'Argument Essay',
  criteria,
  createdAt: 100,
  updatedAt: 200,
};

const plcEntry: PlcRubricEntry = {
  id: 'rubric-plc-1',
  title: 'Lab Report Rubric',
  description: 'Shared scoring guide',
  criteria,
  createdAt: 300,
  updatedAt: 400,
  sharedBy: 'teacher-2',
  sharedByEmail: 'smith@example.com',
  sharedByName: 'Mrs. Smith',
  sharedAt: 400,
};

beforeAll(() => {
  void i18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: {} } },
    interpolation: { escapeValue: false },
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  showConfirm.mockResolvedValue(true);
  shareRubricWithPlc.mockResolvedValue('created');
  canEdit = true;
  personalRubrics = [personalRubric];
  plcRubrics = [plcEntry];
  plcLoading = false;
  plcError = null;
});

const renderSubject = () =>
  render(
    <I18nextProvider i18n={i18n}>
      <PlcRubricLibraryBody plc={plc} />
    </I18nextProvider>
  );

describe('PlcRubricLibraryBody', () => {
  it('lists PLC rubrics with criteria count, max points, and attribution', () => {
    renderSubject();
    expect(screen.getByText('Lab Report Rubric')).toBeInTheDocument();
    expect(screen.getByText('2 criteria')).toBeInTheDocument();
    // rubricMaxPoints: max(1,4) + max(0,2) = 6.
    expect(screen.getByText('6 pts')).toBeInTheDocument();
    expect(screen.getByText(/shared by Mrs\. Smith/)).toBeInTheDocument();
  });

  it('renders the empty state when the PLC has no rubrics', () => {
    plcRubrics = [];
    renderSubject();
    expect(screen.getByText('No shared rubrics yet')).toBeInTheDocument();
  });

  it('shows the loading state instead of the empty state before the first snapshot', () => {
    plcRubrics = [];
    plcLoading = true;
    renderSubject();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('No shared rubrics yet')).toBeNull();
  });

  it('shows an error state instead of the empty state when the subscription fails', () => {
    plcRubrics = [];
    plcError = new Error('permission-denied');
    renderSubject();
    expect(screen.getByRole('alert')).toHaveTextContent(
      /Couldn't load shared rubrics/
    );
    expect(screen.queryByText('No shared rubrics yet')).toBeNull();
  });

  it('shares a personal rubric with attribution from the picker', async () => {
    renderSubject();
    fireEvent.click(screen.getByRole('button', { name: /Share a rubric/i }));
    fireEvent.click(
      await screen.findByRole('button', { name: /^Share$/i, hidden: true })
    );
    await waitFor(() => expect(shareRubricWithPlc).toHaveBeenCalledTimes(1));
    expect(shareRubricWithPlc).toHaveBeenCalledWith({
      rubric: personalRubric,
      sharedByName: 'Ms. Teacher',
      sharedByEmail: 't@example.com',
    });
    expect(addToast).toHaveBeenCalledWith(
      expect.stringContaining('Argument Essay'),
      'success'
    );
  });

  it('keys the already-shared badge on rubric id, not on a shared title', async () => {
    // Same title, different rubric — must still be shareable.
    personalRubrics = [{ ...personalRubric, title: plcEntry.title }];
    renderSubject();
    fireEvent.click(screen.getByRole('button', { name: /Share a rubric/i }));
    expect(
      await screen.findByRole('button', { name: /^Share$/i, hidden: true })
    ).toBeEnabled();
    expect(screen.queryByText('Already shared')).toBeNull();
  });

  it('disables the picker row for a rubric already shared under the same id', async () => {
    personalRubrics = [{ ...personalRubric, id: plcEntry.id }];
    renderSubject();
    fireEvent.click(screen.getByRole('button', { name: /Share a rubric/i }));
    expect(await screen.findByText('Already shared')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Share$/i, hidden: true })
    ).toBeDisabled();
  });

  it('reports a revived tombstone as a re-share', async () => {
    shareRubricWithPlc.mockResolvedValue('restored');
    renderSubject();
    fireEvent.click(screen.getByRole('button', { name: /Share a rubric/i }));
    fireEvent.click(
      await screen.findByRole('button', { name: /^Share$/i, hidden: true })
    );
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        expect.stringContaining('shared with this PLC again'),
        'success'
      )
    );
  });

  it('surfaces an already-shared outcome without claiming success', async () => {
    shareRubricWithPlc.mockResolvedValue('already-shared');
    renderSubject();
    fireEvent.click(screen.getByRole('button', { name: /Share a rubric/i }));
    fireEvent.click(
      await screen.findByRole('button', { name: /^Share$/i, hidden: true })
    );
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        expect.stringContaining('is already shared with this PLC'),
        'info'
      )
    );
  });

  it('imports a PLC rubric into the personal library with a fresh identity', async () => {
    renderSubject();
    fireEvent.click(screen.getByRole('button', { name: /Add to my library/i }));
    await waitFor(() => expect(saveRubric).toHaveBeenCalledTimes(1));
    const saved = saveRubric.mock.calls[0][0] as Rubric &
      Record<string, unknown>;
    expect(saved.title).toBe('Lab Report Rubric');
    expect(saved.description).toBe('Shared scoring guide');
    expect(saved.criteria).toEqual(criteria);
    expect(saved.id).not.toBe(plcEntry.id);
    expect(saved.createdAt).toBeGreaterThan(plcEntry.createdAt);
    expect(saved.updatedAt).toBe(saved.createdAt);
    // Attribution never travels into the personal copy.
    expect(saved.sharedBy).toBeUndefined();
    expect(saved.sharedByName).toBeUndefined();
    expect(saved.sharedAt).toBeUndefined();
  });

  it('unshares after confirmation', async () => {
    renderSubject();
    fireEvent.click(
      screen.getByRole('button', { name: /Unshare Lab Report Rubric/i })
    );
    await waitFor(() =>
      expect(unshareRubricFromPlc).toHaveBeenCalledWith('rubric-plc-1')
    );
  });

  it('does not unshare when the confirm is declined', async () => {
    showConfirm.mockResolvedValue(false);
    renderSubject();
    fireEvent.click(
      screen.getByRole('button', { name: /Unshare Lab Report Rubric/i })
    );
    await waitFor(() => expect(showConfirm).toHaveBeenCalled());
    expect(unshareRubricFromPlc).not.toHaveBeenCalled();
  });

  it('hides share and unshare affordances from viewers', () => {
    canEdit = false;
    renderSubject();
    expect(
      screen.queryByRole('button', { name: /Share a rubric/i })
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Unshare Lab Report Rubric/i })
    ).toBeNull();
    // Viewers can still copy a shared rubric into their own library.
    expect(
      screen.getByRole('button', { name: /Add to my library/i })
    ).toBeInTheDocument();
  });
});
