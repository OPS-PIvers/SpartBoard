import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ImportScreen } from '@/components/import/ImportScreen';
import { targetChoices } from '@/components/import/importTargets';
import { attributionFor } from '@/components/import/attribution';
import { sourceFromInboxItem } from '@/components/import/sourceFromInbox';
import {
  completeImportHandoff,
  offerImportHandoff,
  openImportScreen,
  resetImportHandoffsForTest,
  takeImportHandoff,
} from '@/components/import/importHandoff';
import { ImportWizard } from '@/components/common/library/importer';
import type { ImportAdapter } from '@/components/common/library/types';
import type { ImportInboxItem } from '@/utils/import/contract';

const file = (name: string, type = '') => new File(['x'], name, { type });

const sent: ImportInboxItem = {
  id: 'send-1',
  url: 'https://example.org/vocab',
  title: 'Cell vocabulary',
  platform: 'generic',
  selectionOnly: false,
  receivedAt: 1,
  images: [],
  blocks: [
    {
      type: 'table',
      rows: [
        { cells: ['nucleus', 'control centre'] },
        { cells: ['ribosome', 'makes protein'] },
        { cells: ['membrane', 'outer layer'] },
      ],
    },
  ],
};

describe('targetChoices', () => {
  it('offers Quiz and Question bank for a cartridge, guessing Quiz', () => {
    const c = targetChoices({ file: file('course.imscc') });
    expect(c.targets).toEqual(['quiz', 'questionBank']);
    expect(c.guess).toBe('quiz');
  });

  it('guesses PDF for a PDF with no text, and still offers Quiz', () => {
    const c = targetChoices({ file: file('notes.pdf', 'application/pdf') });
    expect(c.targets).toContain('quiz');
    expect(c.targets).toContain('pdf');
    expect(c.guess).toBe('pdf');
  });

  it('routes notebook, Guided Learning and Mini App files to their own target', () => {
    expect(targetChoices({ file: file('a.notebook') }).targets).toEqual([
      'notebook',
    ]);
    expect(targetChoices({ file: file('a.gl.json') }).targets).toEqual([
      'guidedLearning',
    ]);
    expect(targetChoices({ file: file('a.html') }).targets).toEqual([
      'miniApp',
    ]);
  });

  it('offers only what a route can read today for a web link', () => {
    const c = targetChoices({ url: 'https://example.org/page' });
    expect(c.targets).toEqual(['embed', 'links']);
    expect(c.guess).toBe('embed');
  });

  it('reads a Google Sheet link as a spreadsheet, not a page', () => {
    const c = targetChoices({
      url: 'https://docs.google.com/spreadsheets/d/abc/edit',
    });
    expect(c.targets).toEqual(['quiz', 'questionBank', 'flashcards']);
  });

  it('guesses Flashcards for a sent two-column table', () => {
    const c = targetChoices(sourceFromInboxItem(sent));
    expect(c.guess).toBe('flashcards');
    expect(c.targets).toContain('embed');
  });

  it('drops targets the teacher cannot use', () => {
    const c = targetChoices(
      { file: file('course.imscc') },
      (t) => t !== 'quiz'
    );
    expect(c.targets).toEqual(['questionBank']);
    expect(c.guess).toBe('questionBank');
  });

  it('does not offer Quiz for a photo, which only the quiz picture picker reads', () => {
    expect(
      targetChoices({ file: file('worksheet.jpg', 'image/jpeg') }).targets
    ).toEqual([]);
  });

  it('asks the gate per Source, so a closed import is never offered', () => {
    const c = targetChoices(
      { file: file('notes.pdf', 'application/pdf') },
      (t, s) => !(t === 'quiz' && s.file?.name.endsWith('.pdf'))
    );
    expect(c.targets).toEqual(['pdf']);
  });

  it('offers nothing for a file no route reads', () => {
    expect(
      targetChoices({ file: file('song.mp3', 'audio/mpeg') }).targets
    ).toEqual([]);
  });
});

describe('attributionFor', () => {
  it('records a sent page and skips files and Google Sheets', () => {
    expect(attributionFor(sourceFromInboxItem(sent))).toMatchObject({
      sourceUrl: 'https://example.org/vocab',
      sourceTitle: 'Cell vocabulary',
      platform: 'generic',
    });
    expect(attributionFor({ file: file('a.csv') })).toBeUndefined();
    expect(
      attributionFor({
        url: 'https://docs.google.com/spreadsheets/d/x',
        sourceUrl: 'https://docs.google.com/spreadsheets/d/x',
      })
    ).toBeUndefined();
    expect(
      attributionFor({ sourceUrl: 'javascript:alert(1)' })
    ).toBeUndefined();
  });
});

describe('ImportScreen', () => {
  const renderScreen = (
    props: Partial<React.ComponentProps<typeof ImportScreen>> = {}
  ) => {
    const onContinue = vi.fn();
    const onRemoveInboxItem = vi.fn();
    render(
      <ImportScreen
        isOpen
        onClose={vi.fn()}
        inboxItems={[]}
        onRemoveInboxItem={onRemoveInboxItem}
        allowed={() => true}
        onContinue={onContinue}
        {...props}
      />
    );
    return { onContinue, onRemoveInboxItem };
  };

  it('preselects the guess for a dropped file and continues with it', () => {
    const pdf = file('notes.pdf', 'application/pdf');
    const { onContinue } = renderScreen({ initialSource: { file: pdf } });
    expect(screen.getByRole('radio', { name: /PDF/ })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledWith({ file: pdf }, 'pdf');
  });

  it('lets a widget preset its own target', () => {
    const { onContinue } = renderScreen({
      initialSource: { file: file('notes.pdf', 'application/pdf') },
      presetTarget: 'quiz',
    });
    expect(screen.getByRole('radio', { name: /Quiz/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /PDF/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenLastCalledWith(expect.anything(), 'pdf');
  });

  it('takes a pasted link and refuses one that is not a web address', () => {
    const { onContinue } = renderScreen();
    const field = screen.getByLabelText('Paste a link');
    fireEvent.change(field, { target: { value: 'not a link' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Next' })[0]);
    expect(screen.getByRole('alert')).toHaveTextContent('https://');
    fireEvent.change(field, { target: { value: 'https://example.org/a' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Next' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue).toHaveBeenCalledWith(
      { url: 'https://example.org/a', sourceUrl: 'https://example.org/a' },
      'embed'
    );
  });

  it('lists sent pages, picks one, and removes one', () => {
    const { onContinue, onRemoveInboxItem } = renderScreen({
      inboxItems: [sent],
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Cell vocabulary' })
    );
    expect(onRemoveInboxItem).toHaveBeenCalledWith('send-1');
    fireEvent.click(screen.getByRole('button', { name: /^Cell vocabulary/ }));
    expect(screen.getByText('Sent from example.org')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onContinue.mock.calls[0][1]).toBe('flashcards');
  });

  it('says so when nothing can read the Source', () => {
    renderScreen({ initialSource: { file: file('song.mp3', 'audio/mpeg') } });
    expect(screen.getByRole('status')).toHaveTextContent(
      'SpartBoard can’t import this yet.'
    );
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });
});

describe('import handoff into a review screen', () => {
  beforeEach(() => resetImportHandoffsForTest());

  it('keeps one Source per widget until it is taken', () => {
    offerImportHandoff({
      widgetId: 'w1',
      widgetType: 'quiz',
      target: 'quiz',
      source: { text: 'a' },
    });
    offerImportHandoff({
      widgetId: 'w1',
      widgetType: 'quiz',
      target: 'questionBank',
      source: { text: 'b' },
    });
    expect(takeImportHandoff('w1')?.target).toBe('questionBank');
    expect(takeImportHandoff('w1')).toBeNull();
  });

  it('drops a handoff no widget picked up when Import opens again', () => {
    offerImportHandoff({
      widgetId: 'w3',
      widgetType: 'quiz',
      target: 'quiz',
      source: { text: 'a' },
    });
    openImportScreen();
    expect(takeImportHandoff('w3')).toBeNull();
  });

  it('runs onSaved only when the widget saves, not when it is closed', () => {
    const onSaved = vi.fn();
    const offer = () =>
      offerImportHandoff({
        widgetId: 'w2',
        widgetType: 'flashcards',
        target: 'flashcards',
        source: { text: 'a\tb' },
        onSaved,
      });
    offer();
    takeImportHandoff('w2');
    expect(onSaved).not.toHaveBeenCalled();
    offer();
    completeImportHandoff('w2');
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(takeImportHandoff('w2')).toBeNull();
  });

  it('the wizard reads the handed-over Source on open and skips to review', async () => {
    const parse = vi.fn().mockResolvedValue({ data: { n: 1 }, warnings: [] });
    const save = vi.fn().mockResolvedValue(undefined);
    const adapter: ImportAdapter<{ n: number }> = {
      widgetLabel: 'Flashcards',
      supportedSources: ['csv'],
      parse,
      validate: () => ({ ok: true, errors: [] }),
      renderPreview: () => <p>preview ready</p>,
      save,
    };
    render(
      <ImportWizard
        isOpen
        onClose={vi.fn()}
        adapter={adapter}
        initialSource={{ text: 'a\tb', title: 'Vocab' }}
      />
    );
    await waitFor(() =>
      expect(parse).toHaveBeenCalledWith({ kind: 'csv', text: 'a\tb' })
    );
    expect(await screen.findByText('preview ready')).toBeInTheDocument();
    expect(parse).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: /Save to library/ }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({ n: 1 }, 'Vocab', {
        fromInitialSource: true,
      })
    );
  });

  it('offers the widget its own import options from its Import button', () => {
    const open = vi.fn();
    render(
      <ImportScreen
        isOpen
        onClose={vi.fn()}
        inboxItems={[]}
        onRemoveInboxItem={vi.fn()}
        allowed={() => true}
        widgetOptions={{ label: 'Quiz', open }}
        onContinue={vi.fn()}
      />
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'More Quiz import options' })
    );
    expect(open).toHaveBeenCalled();
  });
});
