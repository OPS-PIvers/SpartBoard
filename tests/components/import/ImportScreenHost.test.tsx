import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ImportScreenHost } from '@/components/import/ImportScreenHost';
import {
  closeImportScreen,
  openImportScreen,
  resetImportHandoffsForTest,
} from '@/components/import/importHandoff';
import {
  IMPORT_INBOX_EVENT,
  type ImportInboxItem,
} from '@/utils/import/contract';

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'u1' },
    canAccessWidget: () => true,
    canAccessFeature: () => true,
  }),
}));
const dashboard = vi.hoisted(() => ({
  widgets: [] as { id: string; type: string; config: object }[],
  addWidget: vi.fn(),
}));
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    activeDashboard: { widgets: dashboard.widgets },
    addWidget: dashboard.addWidget,
    updateWidget: vi.fn(),
    addToast: vi.fn(),
    isActiveBoardReadOnly: false,
  }),
}));
const inboxItems: ImportInboxItem[] = [];
vi.mock('@/hooks/useImportInbox', () => ({
  useImportInbox: () => ({ items: inboxItems, remove: vi.fn() }),
}));
vi.mock('@/hooks/useQuizDocumentImportGate', () => ({
  useQuizDocumentImportGate: () => true,
}));
vi.mock('@/hooks/useImportConversionSettings', () => ({
  useImportConversionSettings: () => ({ enabled: false }),
}));
vi.mock('@/hooks/useViewAsOutward', () => ({
  useViewAsOutward: () => ({ active: false, locked: false }),
}));

describe('ImportScreenHost', () => {
  afterEach(() => {
    inboxItems.length = 0;
    dashboard.widgets.length = 0;
    dashboard.addWidget.mockClear();
    act(() => resetImportHandoffsForTest());
  });

  const renderHost = () =>
    render(
      <ImportScreenHost
        placeAt={() => ({ x: 0, y: 0 })}
        placePdf={vi.fn()}
        placeNotebook={vi.fn()}
      />
    );

  it('shows a corner notice for waiting pages that opens Import, and hides it', () => {
    inboxItems.push({
      id: 's1',
      url: 'https://example.org/a',
      title: 'Cells',
      platform: 'generic',
      selectionOnly: false,
      receivedAt: 1,
      images: [],
      blocks: [],
    });
    const { unmount } = renderHost();
    expect(
      screen.getByText('1 page sent from your browser')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.queryByText('1 page sent from your browser')).toBeNull();
    act(() => openImportScreen());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    act(() => closeImportScreen());
    expect(screen.queryByText('1 page sent from your browser')).toBeNull();
    unmount();
    renderHost();
    fireEvent.click(screen.getByRole('button', { name: 'Add to board' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByText('1 page sent from your browser')).toBeNull();
  });

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

  it('sends slides to a new Notebook when the one on the board has a notebook open', () => {
    dashboard.widgets.push({
      id: 'nb1',
      type: 'smartNotebook',
      config: { activeNotebookId: 'open-one' },
    });
    renderHost();
    act(() =>
      openImportScreen({
        source: { file: new File(['x'], 'deck.pptx') },
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Notebook' }));
    expect(dashboard.addWidget).toHaveBeenCalledWith(
      'smartNotebook',
      expect.objectContaining({ id: expect.any(String) as unknown })
    );
  });
});
