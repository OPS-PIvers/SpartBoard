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

const auth = vi.hoisted(() => ({
  ensureGoogleScope: vi.fn(() => Promise.resolve<string | null>('tok')),
  formsOn: true,
}));
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'u1' },
    canAccessWidget: () => true,
    canAccessFeature: (f: string) =>
      f === 'import-google-forms' ? auth.formsOn : true,
    ensureGoogleScope: auth.ensureGoogleScope,
  }),
}));
const forms = vi.hoisted(() => ({ fetchGoogleForm: vi.fn() }));
vi.mock('@/utils/import/googleForms', async (original) => ({
  ...(await original<typeof import('@/utils/import/googleForms')>()),
  fetchGoogleForm: forms.fetchGoogleForm,
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
const inboxRemove = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('@/hooks/useImportInbox', () => ({
  useImportInbox: () => ({ items: inboxItems, remove: inboxRemove }),
}));
const readDroppedPage = vi.hoisted(() => vi.fn());
vi.mock('@/components/import/fetchImportPage', () => ({ readDroppedPage }));
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

  it('shows a corner notice for waiting pages that opens Import, and discards them', () => {
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
    inboxRemove.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByText('1 page sent from your browser')).toBeNull();
    expect(inboxRemove).toHaveBeenCalledWith('s1');
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

  it('shows a discarded page again when the same page is sent again', () => {
    const page: ImportInboxItem = {
      id: 's1',
      url: 'https://example.org/a',
      title: 'Cells',
      platform: 'generic',
      selectionOnly: false,
      receivedAt: 1,
      images: [],
      blocks: [],
    };
    inboxItems.push(page);
    const host = () => (
      <ImportScreenHost
        placeAt={() => ({ x: 0, y: 0 })}
        placePdf={vi.fn()}
        placeNotebook={vi.fn()}
      />
    );
    const { rerender } = render(host());
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    inboxItems.length = 0;
    rerender(host());
    inboxItems.push(page);
    rerender(host());
    expect(
      screen.getByText('1 page sent from your browser')
    ).toBeInTheDocument();
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

  const sentForm = (formId?: string): ImportInboxItem => ({
    id: 'gf',
    url: 'https://docs.google.com/forms/d/e/1FAIpQLSabc/viewform',
    title: 'Cells',
    platform: 'google-forms',
    selectionOnly: false,
    blocks: [{ type: 'paragraph', text: '1. Which part makes energy?' }],
    images: [],
    receivedAt: 1,
    form: {
      ...(formId ? { formId } : {}),
      items: [
        {
          kind: 'choice',
          text: 'Which part makes energy?',
          options: [{ text: 'Nucleus' }, { text: 'Mitochondria' }],
        },
        { kind: 'short', text: 'Your name' },
      ],
    },
  });

  it('puts a sent Google Form on the board as a poll and removes the Send', async () => {
    inboxItems.push(sentForm());
    renderHost();
    act(() => openImportScreen());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Poll' }));
      await Promise.resolve();
    });
    expect(auth.ensureGoogleScope).not.toHaveBeenCalled();
    expect(dashboard.addWidget).toHaveBeenCalledWith(
      'poll',
      expect.objectContaining({
        config: expect.objectContaining({
          questions: [
            expect.objectContaining({
              question: 'Which part makes energy?',
              kind: 'choice',
            }),
            expect.objectContaining({ question: 'Your name', kind: 'words' }),
          ],
        }) as unknown,
      })
    );
    expect(inboxRemove).toHaveBeenCalledWith('gf');
  });

  it('reads a form sent from its editor through the Forms API before the quiz review', async () => {
    const formId = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
    inboxItems.push(sentForm(formId));
    forms.fetchGoogleForm.mockResolvedValue({
      title: 'Cells (API)',
      form: {
        formId,
        items: [
          {
            kind: 'choice',
            text: 'Which part makes energy?',
            options: [{ text: 'Nucleus' }, { text: 'Mitochondria' }],
            correct: ['Mitochondria'],
          },
        ],
      },
    });
    renderHost();
    act(() => openImportScreen());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Quiz' }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(auth.ensureGoogleScope).toHaveBeenCalledWith(
      'https://www.googleapis.com/auth/forms.body.readonly',
      { interactive: true }
    );
    expect(forms.fetchGoogleForm).toHaveBeenCalledWith(formId, 'tok');
    expect(dashboard.addWidget).toHaveBeenCalledWith(
      'quiz',
      expect.objectContaining({ id: expect.any(String) as unknown })
    );
  });

  it('offers no Poll for a form without the Google Forms flag', () => {
    auth.formsOn = false;
    inboxItems.push(sentForm());
    renderHost();
    act(() => openImportScreen());
    expect(screen.queryByRole('button', { name: 'Poll' })).toBeNull();
    auth.formsOn = true;
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

  it('reads a dropped link on the server and never removes a Send for it', async () => {
    readDroppedPage.mockResolvedValue({
      status: 'read',
      item: {
        id: 'page:https://example.org/v',
        url: 'https://example.org/v',
        title: 'Vocab',
        platform: 'generic',
        selectionOnly: false,
        receivedAt: 1,
        images: [],
        blocks: [{ type: 'paragraph', text: 'cell, unit of life' }],
      },
    });
    renderHost();
    act(() => openImportScreen({ source: { url: 'https://example.org/v' } }));
    expect(readDroppedPage).toHaveBeenCalledWith('https://example.org/v');
    expect(await screen.findByText('Vocab')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Link' }));
    expect(dashboard.addWidget).toHaveBeenCalledWith('url', expect.anything());
    expect(inboxRemove).not.toHaveBeenCalled();
  });
});
