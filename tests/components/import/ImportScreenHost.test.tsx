import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { ImportScreenHost } from '@/components/import/ImportScreenHost';
import { resetImportHandoffsForTest } from '@/components/import/importHandoff';
import { IMPORT_INBOX_EVENT } from '@/utils/import/contract';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'u1' },
    canAccessWidget: () => true,
    canAccessFeature: () => true,
  }),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    activeDashboard: { widgets: [] },
    addWidget: vi.fn(),
    updateWidget: vi.fn(),
    addToast: vi.fn(),
    isActiveBoardReadOnly: false,
  }),
}));
vi.mock('@/hooks/useImportInbox', () => ({
  useImportInbox: () => ({ items: [], remove: vi.fn() }),
}));
vi.mock('@/hooks/useQuizDocumentImportGate', () => ({
  useQuizDocumentImportGate: () => true,
}));

describe('ImportScreenHost', () => {
  afterEach(() => act(() => resetImportHandoffsForTest()));

  it('opens Import when the extension fires the inbox event, and cancels it', () => {
    render(
      <ImportScreenHost
        placeAt={() => ({ x: 0, y: 0 })}
        placePdf={vi.fn()}
        placeNotebook={vi.fn()}
      />
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    const event = new CustomEvent(IMPORT_INBOX_EVENT, { cancelable: true });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
