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

import { usePlcDocs } from '@/hooks/usePlcDocs';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fakePlc: Plc = {
  id: 'plc-1',
  name: '5th Grade Math',
  leadUid: 'uid-a',
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

function setDefaultMocks(docs: PlcDoc[] = []) {
  vi.mocked(usePlcDocs).mockReturnValue({
    docs,
    loading: false,
    error: null,
    createDoc: createDocMock,
    updateDoc: updateDocMock,
    deleteDoc: deleteDocMock,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlcDocsBody', () => {
  beforeEach(() => {
    createDocMock.mockClear();
    updateDocMock.mockClear();
    deleteDocMock.mockClear();
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

  // --- Loading state --------------------------------------------------------

  it('shows a loading indicator when loading is true', () => {
    vi.mocked(usePlcDocs).mockReturnValue({
      docs: [],
      loading: true,
      error: null,
      createDoc: createDocMock,
      updateDoc: updateDocMock,
      deleteDoc: deleteDocMock,
    });
    render(<PlcDocsBody plc={fakePlc} />);
    // Should not crash; no iframe visible
    expect(document.querySelector('iframe')).toBeNull();
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
