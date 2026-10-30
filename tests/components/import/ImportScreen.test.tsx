import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ImportScreen } from '@/components/import/ImportScreen';
import {
  conversionInputFor,
  targetChoices,
  usesAi,
} from '@/components/import/importTargets';
import { attributionFor } from '@/components/import/attribution';
import { sourceFromInboxItem } from '@/components/import/sourceFromInbox';
import {
  completeImportHandoff,
  offerImportHandoff,
  resetImportHandoffsForTest,
  takeImportHandoff,
} from '@/components/import/importHandoff';
import { ImportWizard } from '@/components/common/library/importer';
import type { ImportAdapter } from '@/components/common/library/types';
import type { ImportInboxItem } from '@/utils/import/contract';

vi.mock('@/components/import/reference/ReferenceEmbedStep', () => ({
  ReferenceEmbedStep: ({
    url,
    onConvert,
  }: {
    url: string;
    onConvert?: () => void;
  }) => (
    <button type="button" onClick={onConvert} data-convert={!!onConvert}>
      Checking {url}
    </button>
  ),
}));

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

  it('offers a Google Sheet link only as a page; the Picker grants sheet reads', () => {
    const c = targetChoices({
      url: 'https://docs.google.com/spreadsheets/d/abc/edit',
    });
    expect(c.targets).toEqual(['embed', 'links']);
  });

  it('reads a PDF by its type when the name has no extension', () => {
    expect(
      targetChoices({ file: file('scan', 'application/pdf') }).targets
    ).toContain('pdf');
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
    ).not.toContain('quiz');
  });

  it('asks the gate per Source, so a closed import is never offered', () => {
    const c = targetChoices(
      { file: file('notes.pdf', 'application/pdf') },
      (t, s) => !(t === 'quiz' && s.file?.name.endsWith('.pdf'))
    );
    expect(c.targets).not.toContain('quiz');
    expect(c.targets).toContain('pdf');
  });

  it('offers Notebook and Guided Learning for slides, and a Sticker for a photo', () => {
    expect(targetChoices({ file: file('deck.pptx') }).targets).toEqual(
      expect.arrayContaining(['notebook', 'guidedLearning'])
    );
    expect(
      targetChoices({ file: file('board.jpg', 'image/jpeg') }).targets
    ).toEqual(['sticker']);
  });

  it('keeps Guided Learning to named decks and Sticker to photos a board can show', () => {
    expect(
      targetChoices({ file: file('scan', 'application/pdf') }).targets
    ).not.toContain('guidedLearning');
    expect(
      targetChoices({ file: file('scan.tiff', 'image/tiff') }).targets
    ).toEqual([]);
    expect(
      targetChoices({ file: file('IMG_1.HEIC', 'image/heic') }).targets
    ).toEqual(['sticker']);
  });

  it('adds the AI Conversions for page text only when AI is on', () => {
    const prose = {
      ...sent,
      blocks: [
        { type: 'paragraph' as const, text: 'Cells are the unit of life.' },
      ],
    };
    const source = sourceFromInboxItem(prose);
    expect(targetChoices(source).targets).not.toContain('board');
    const on = targetChoices(source, () => true, true).targets;
    expect(on).toEqual(
      expect.arrayContaining(['flashcards', 'activityWall', 'board'])
    );
    expect(usesAi('flashcards', source, true)).toBe(true);
    expect(usesAi('flashcards', source, false)).toBe(false);
    expect(conversionInputFor(source)).toMatchObject({
      title: 'Cell vocabulary',
      text: 'Cells are the unit of life.',
    });
  });

  it('reads a two-column page as rows, not with AI', () => {
    expect(usesAi('flashcards', sourceFromInboxItem(sent), true)).toBe(false);
    const pasted = 'cell, unit of life\natom, smallest unit\nion, charged atom';
    expect(usesAi('flashcards', { text: pasted }, true)).toBe(false);
  });

  it('never offers AI for a bare link or an unread file', () => {
    const c = targetChoices(
      { url: 'https://example.org/page' },
      () => true,
      true
    );
    expect(c.targets).not.toContain('board');
    expect(
      targetChoices({ file: file('a.html') }, () => true, true).targets
    ).toEqual(['miniApp']);
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
        onPlaceReference={vi.fn()}
        {...props}
      />
    );
    return { onContinue, onRemoveInboxItem };
  };

  it('offers one-tap choices for a dropped file', () => {
    const pdf = file('notes.pdf', 'application/pdf');
    const { onContinue } = renderScreen({ initialSource: { file: pdf } });
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    expect(onContinue).toHaveBeenCalledWith({ file: pdf }, 'pdf');
  });

  it('lists sent pages with their choices, and removes one', () => {
    const { onContinue, onRemoveInboxItem } = renderScreen({
      inboxItems: [sent],
    });
    expect(screen.getByText('Cell vocabulary')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Paste/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Flashcards' }));
    expect(onContinue.mock.calls[0][1]).toBe('flashcards');
    expect(onContinue).toHaveBeenCalledWith(
      expect.objectContaining({ inboxItem: sent }),
      'flashcards'
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Cell vocabulary' })
    );
    expect(onRemoveInboxItem).toHaveBeenCalledWith('send-1');
  });

  it('marks AI choices and says they count toward the AI limit', () => {
    const { onContinue } = renderScreen({
      aiOn: true,
      initialSource: { text: 'Photosynthesis turns light into sugar.' },
    });
    expect(
      screen.getByText('Converting with AI counts toward your daily AI limit.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /New board/ }));
    expect(onContinue.mock.calls[0][1]).toBe('board');
  });

  it('checks a page before embedding it, and drops Embed when it refuses', () => {
    const { onContinue } = renderScreen({ inboxItems: [sent] });
    fireEvent.click(screen.getByRole('button', { name: 'Embed' }));
    expect(onContinue).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: `Checking ${sent.url}` })
    );
    expect(screen.queryByRole('button', { name: 'Embed' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Flashcards' })
    ).toBeInTheDocument();
  });

  it('offers no Convert for a page that can only be embedded or linked', () => {
    renderScreen({ inboxItems: [{ ...sent, blocks: [] }] });
    fireEvent.click(screen.getByRole('button', { name: 'Embed' }));
    expect(
      screen.getByRole('button', { name: `Checking ${sent.url}` })
    ).toHaveAttribute('data-convert', 'false');
  });

  it('says so when nothing can read the Source', () => {
    renderScreen({ initialSource: { file: file('song.mp3', 'audio/mpeg') } });
    expect(screen.getByRole('status')).toHaveTextContent(
      'SpartBoard can’t import this yet.'
    );
  });

  it('says so when nothing is waiting', () => {
    renderScreen();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Nothing is waiting to be added.'
    );
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
});
