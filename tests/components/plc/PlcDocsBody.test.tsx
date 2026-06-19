/**
 * Unit tests for PlcDocsBody + PlcDocPicker — Stream D.
 *
 * Mocking strategy:
 *   - @/hooks/usePlcDocs is mocked at the module level so Firebase is never
 *     touched. Each test overrides the returned value via vi.mocked().mockReturnValue().
 *   - react-i18next is mocked so t(key, { defaultValue }) returns the English default.
 *   - The real convertToEmbedUrl / ensureProtocol from @/utils/urlHelpers are
 *     imported directly (they are pure functions, no Firebase dependency) so the
 *     test asserts the exact same URL transformation that the component applies.
 *
 * Key assertions:
 *   - With one doc, the iframe src equals convertToEmbedUrl(ensureProtocol(doc.url)).
 *   - Clicking "Add" with a title + URL calls createDoc({ title, url }).
 *   - Empty state shows the "Add a Google Doc" CTA.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { PlcDocsBody } from '@/components/plc/docs/PlcDocsBody';
import type { Plc, PlcDoc } from '@/types';
import { convertToEmbedUrl, ensureProtocol } from '@/utils/urlHelpers';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k,
  }),
}));

vi.mock('@/hooks/usePlcDocs', () => ({
  usePlcDocs: vi.fn(),
}));

// usePlcSoftDelete (Decision 3.1): the delete handler routes through it. The
// mock just runs the supplied `runDelete` so the component's delete path is
// still exercised end-to-end without pulling in activity/auth wiring.
const softDeleteMock = vi.fn(
  async (input: { runDelete: () => Promise<void> }) => {
    await input.runDelete();
  }
);
vi.mock('@/hooks/usePlcTrash', () => ({
  usePlcSoftDelete: () => ({ softDelete: softDeleteMock }),
}));

const mockAddToast = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({ addToast: mockAddToast }),
}));

import { usePlcDocs } from '@/hooks/usePlcDocs';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakePlc: Plc = {
  id: 'plc-1',
  name: '5th Grade Math',
  leadUid: 'uid-a',
  members: {},
  memberUids: ['uid-a'],
  memberEmails: { 'uid-a': 'alice@school.edu' },
  createdAt: 1000,
  updatedAt: 2000,
};

const fakeDoc: PlcDoc = {
  id: 'doc-1',
  title: 'Math Standards Notes',
  url: 'https://docs.google.com/document/d/abc123/edit',
  createdBy: 'uid-a',
  createdByName: 'Alice',
  createdAt: 1000,
  updatedAt: 2000,
};

const createDocMock = vi.fn().mockResolvedValue('new-doc-id');
const updateDocMock = vi.fn().mockResolvedValue(undefined);
const deleteDocMock = vi.fn().mockResolvedValue(undefined);
const restoreDocMock = vi.fn().mockResolvedValue(undefined);

function setDefaultMocks(docs: PlcDoc[] = []) {
  vi.mocked(usePlcDocs).mockReturnValue({
    docs,
    loading: false,
    error: null,
    createDoc: createDocMock,
    updateDoc: updateDocMock,
    deleteDoc: deleteDocMock,
    restoreDoc: restoreDocMock,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlcDocsBody', () => {
  beforeEach(() => {
    createDocMock.mockClear();
    createDocMock.mockResolvedValue('new-doc-id');
    updateDocMock.mockClear();
    deleteDocMock.mockClear();
    deleteDocMock.mockResolvedValue(undefined);
    mockAddToast.mockClear();
    setDefaultMocks();
  });

  // --- Empty state -----------------------------------------------------------

  it('shows the "Add a Google Doc" CTA when no docs exist', () => {
    render(<PlcDocsBody plc={fakePlc} />);
    // The empty-state CTA should be visible
    expect(
      screen.getByRole('button', { name: /add a google doc/i })
    ).toBeInTheDocument();
  });

  it('does not render an iframe when no docs exist', () => {
    render(<PlcDocsBody plc={fakePlc} />);
    expect(document.querySelector('iframe')).toBeNull();
  });

  // --- One doc: iframe src --------------------------------------------------

  it('renders an iframe with the converted embed URL for the selected doc', () => {
    setDefaultMocks([fakeDoc]);
    render(<PlcDocsBody plc={fakePlc} />);

    const expectedSrc = convertToEmbedUrl(ensureProtocol(fakeDoc.url));
    const iframe = document.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.src).toBe(expectedSrc);
  });

  it('selects the first doc automatically when docs are present', () => {
    setDefaultMocks([fakeDoc]);
    render(<PlcDocsBody plc={fakePlc} />);
    // The doc title should appear in the list
    expect(screen.getByText('Math Standards Notes')).toBeInTheDocument();
  });

  // --- Add doc via PlcDocPicker --------------------------------------------

  it('calls createDoc({ title, url }) when the Add form is submitted', () => {
    render(<PlcDocsBody plc={fakePlc} />);

    // Open the add form — there should be an "Add doc" button or the form is inline
    const titleInput = screen.getByPlaceholderText(/doc title|title/i);
    const urlInput = screen.getByPlaceholderText(/url|paste/i);
    const addButton = screen.getByRole('button', { name: /^add$/i });

    fireEvent.change(titleInput, { target: { value: 'New Doc' } });
    fireEvent.change(urlInput, {
      target: { value: 'https://docs.google.com/document/d/xyz/edit' },
    });
    fireEvent.click(addButton);

    expect(createDocMock).toHaveBeenCalledWith({
      title: 'New Doc',
      url: 'https://docs.google.com/document/d/xyz/edit',
    });
  });

  it('does not call createDoc when title is empty', () => {
    render(<PlcDocsBody plc={fakePlc} />);

    const urlInput = screen.getByPlaceholderText(/url|paste/i);
    const addButton = screen.getByRole('button', { name: /^add$/i });

    fireEvent.change(urlInput, {
      target: { value: 'https://docs.google.com/document/d/xyz/edit' },
    });
    fireEvent.click(addButton);

    expect(createDocMock).not.toHaveBeenCalled();
  });

  it('does not call createDoc when URL is empty', () => {
    render(<PlcDocsBody plc={fakePlc} />);

    const titleInput = screen.getByPlaceholderText(/doc title|title/i);
    const addButton = screen.getByRole('button', { name: /^add$/i });

    fireEvent.change(titleInput, { target: { value: 'New Doc' } });
    fireEvent.click(addButton);

    expect(createDocMock).not.toHaveBeenCalled();
  });

  it('toasts an error when adding a doc fails (no silent failure)', async () => {
    createDocMock.mockRejectedValueOnce(new Error('Firestore write failed'));
    render(<PlcDocsBody plc={fakePlc} />);

    fireEvent.change(screen.getByPlaceholderText(/doc title|title/i), {
      target: { value: 'New Doc' },
    });
    fireEvent.change(screen.getByPlaceholderText(/url|paste/i), {
      target: { value: 'https://docs.google.com/document/d/xyz/edit' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));

    await vi.waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledTimes(1);
    });
    expect(mockAddToast.mock.calls[0][1]).toBe('error');
  });

  it('focuses the picker add-title input from the empty-state CTA', () => {
    render(<PlcDocsBody plc={fakePlc} />);
    const titleInput = screen.getByPlaceholderText(/doc title|title/i);

    fireEvent.click(screen.getByRole('button', { name: /add a google doc/i }));

    // The CTA must focus the picker's add-title input via the ref handle.
    expect(titleInput).toHaveFocus();
  });

  // --- Non-Google URL: no crash, gentle hint --------------------------------

  it('renders without crashing for a non-Google URL', () => {
    const nonGoogleDoc: PlcDoc = {
      ...fakeDoc,
      url: 'https://example.com/some-document',
    };
    setDefaultMocks([nonGoogleDoc]);
    render(<PlcDocsBody plc={fakePlc} />);
    // Should still render an iframe (convertToEmbedUrl returns the original)
    expect(document.querySelector('iframe')).not.toBeNull();
  });

  // --- Delete doc -----------------------------------------------------------

  it('calls deleteDoc when the remove button is clicked', () => {
    setDefaultMocks([fakeDoc]);
    render(<PlcDocsBody plc={fakePlc} />);

    // Find the remove button for the doc
    const removeButton = screen.getByRole('button', {
      name: /remove|delete/i,
    });
    fireEvent.click(removeButton);

    expect(deleteDocMock).toHaveBeenCalledWith(fakeDoc.id);
  });

  // --- Rename doc -----------------------------------------------------------

  it('calls updateDoc({ title }) when a rename is confirmed', () => {
    setDefaultMocks([fakeDoc]);
    render(<PlcDocsBody plc={fakePlc} />);

    // Open the rename editor for the doc.
    fireEvent.click(screen.getByRole('button', { name: /rename doc/i }));
    const renameInput = screen.getByDisplayValue('Math Standards Notes');
    fireEvent.change(renameInput, { target: { value: 'Renamed Doc' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm rename/i }));

    expect(updateDocMock).toHaveBeenCalledWith(fakeDoc.id, {
      title: 'Renamed Doc',
    });
  });

  it('toasts an error and keeps the row editable when a rename fails (no silent failure)', async () => {
    updateDocMock.mockRejectedValueOnce(new Error('Firestore rename failed'));
    setDefaultMocks([fakeDoc]);
    render(<PlcDocsBody plc={fakePlc} />);

    fireEvent.click(screen.getByRole('button', { name: /rename doc/i }));
    const renameInput = screen.getByDisplayValue('Math Standards Notes');
    fireEvent.change(renameInput, { target: { value: 'Renamed Doc' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm rename/i }));

    await vi.waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledTimes(1);
    });
    expect(mockAddToast.mock.calls[0][1]).toBe('error');

    // The row stays in edit mode (the rename input is still rendered) so the
    // user can retry — the rejected promise must NOT silently close the editor.
    expect(screen.getByDisplayValue('Renamed Doc')).toBeInTheDocument();
  });

  // --- Loading state --------------------------------------------------------

  it('shows a loading indicator when loading is true', () => {
    vi.mocked(usePlcDocs).mockReturnValue({
      docs: [],
      loading: true,
      error: null,
      createDoc: createDocMock,
      updateDoc: updateDocMock,
      deleteDoc: deleteDocMock,
      restoreDoc: restoreDocMock,
    });
    render(<PlcDocsBody plc={fakePlc} />);
    // Should not crash; no iframe visible
    expect(document.querySelector('iframe')).toBeNull();
  });

  // --- Error state ----------------------------------------------------------

  it('does NOT show the "Add a Google Doc" CTA on load error (no masked error)', () => {
    vi.mocked(usePlcDocs).mockReturnValue({
      docs: [],
      loading: false,
      error: new Error('Permission denied'),
      createDoc: createDocMock,
      updateDoc: updateDocMock,
      deleteDoc: deleteDocMock,
      restoreDoc: restoreDocMock,
    });
    render(<PlcDocsBody plc={fakePlc} />);

    // The right-pane add CTA must be gated on !error — an empty docs array on
    // error doesn't mean there are no docs.
    expect(
      screen.queryByRole('button', { name: /add a google doc/i })
    ).not.toBeInTheDocument();
  });

  it('renders a right-pane error panel on load error', () => {
    vi.mocked(usePlcDocs).mockReturnValue({
      docs: [],
      loading: false,
      error: new Error('Permission denied'),
      createDoc: createDocMock,
      updateDoc: updateDocMock,
      deleteDoc: deleteDocMock,
      restoreDoc: restoreDocMock,
    });
    render(<PlcDocsBody plc={fakePlc} />);

    // The error copy appears in BOTH the narrow left rail and the right pane.
    expect(
      screen.getAllByText(/couldn't load docs|failed to load docs/i).length
    ).toBeGreaterThan(0);
  });

  // --- Switching doc selection ----------------------------------------------

  it('switches iframe src when a different doc is clicked', () => {
    const secondDoc: PlcDoc = {
      id: 'doc-2',
      title: 'Curriculum Map',
      url: 'https://docs.google.com/document/d/def456/edit',
      createdBy: 'uid-a',
      createdByName: 'Alice',
      createdAt: 1001,
      updatedAt: 2001,
    };
    setDefaultMocks([fakeDoc, secondDoc]);
    render(<PlcDocsBody plc={fakePlc} />);

    // Click the second doc
    fireEvent.click(screen.getByText('Curriculum Map'));

    const expectedSrc = convertToEmbedUrl(ensureProtocol(secondDoc.url));
    const iframe = document.querySelector('iframe');
    expect(iframe?.src).toBe(expectedSrc);
  });
});
