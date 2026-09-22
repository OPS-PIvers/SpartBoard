/**
 * The `'document'` import source and the optional editable review step
 * (docs/plans/QUIZ_DOCUMENT_IMPORT.md D9, D10). Quiz is the only adapter that
 * uses either today, so these guard the shared wizard against the two ways a
 * test document arrives and against the review pane silently dropping edits.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ImportWizard } from '@/components/common/library/importer';
import type {
  ImportAdapter,
  ImportSourceKind,
  ImportSourcePayload,
} from '@/components/common/library/types';

type FakeData = { rows: string[] };

function makeAdapter(
  opts: {
    supportedSources?: ImportSourceKind[];
    pickDocument?: ImportAdapter<FakeData>['pickDocument'];
    withReview?: boolean;
    supportsKeyFile?: boolean;
  } = {}
) {
  const parseSpy = vi.fn((_source: ImportSourcePayload) =>
    Promise.resolve({ data: { rows: ['a'] }, warnings: [] as string[] })
  );
  const saveSpy = vi.fn((_data: FakeData, _title: string) =>
    Promise.resolve(undefined)
  );
  const adapter: ImportAdapter<FakeData> = {
    widgetLabel: 'Quiz',
    supportedSources: opts.supportedSources ?? ['csv', 'document'],
    pickDocument: opts.pickDocument,
    ...(opts.supportsKeyFile ? { supportsKeyFile: true } : {}),
    parse: parseSpy as unknown as ImportAdapter<FakeData>['parse'],
    validate: () => ({ ok: true, errors: [] }),
    renderPreview: (data) => (
      <div data-testid="preview">rows: {data.rows.join(', ')}</div>
    ),
    ...(opts.withReview
      ? {
          renderReview: (data: FakeData, onChange: (n: FakeData) => void) => (
            <div>
              <div data-testid="review">rows: {data.rows.join(', ')}</div>
              <button
                type="button"
                onClick={() => onChange({ rows: [...data.rows, 'edited'] })}
              >
                Edit rows
              </button>
            </div>
          ),
        }
      : {}),
    save: saveSpy as unknown as ImportAdapter<FakeData>['save'],
  };
  return { adapter, parseSpy, saveSpy };
}

function renderWizard(adapter: ImportAdapter<FakeData>) {
  const onClose = vi.fn();
  return {
    onClose,
    ...render(
      <ImportWizard<FakeData> isOpen onClose={onClose} adapter={adapter} />
    ),
  };
}

const PDF_BYTES = new File([new Uint8Array([1, 2, 3])], 'Unit 3 Test.pdf', {
  type: 'application/pdf',
});

describe('ImportWizard — test document source', () => {
  it('hides the tile for an adapter that does not support documents', () => {
    const { adapter } = makeAdapter({ supportedSources: ['csv'] });
    renderWizard(adapter);
    expect(screen.queryByText(/Upload a test document/i)).toBeNull();
  });

  it('shows the upload tile but no Drive button when the adapter cannot pick', () => {
    const { adapter } = makeAdapter();
    renderWizard(adapter);
    expect(screen.getByText(/Upload a test document/i)).toBeTruthy();
    expect(screen.queryByText(/Choose a test from Drive/i)).toBeNull();
  });

  it('keeps test documents out of the generic upload button', () => {
    const { adapter } = makeAdapter();
    renderWizard(adapter);
    // That button is labelled "CSV" here, so offering .pdf/.docx/.rtf behind
    // it would duplicate the dedicated tile under a name that fits neither.
    expect(
      screen.getByLabelText('Upload import file').getAttribute('accept')
    ).toBe('.csv');
    expect(
      screen.getByLabelText('Upload a test document').getAttribute('accept')
    ).toBe('.pdf,.docx,.rtf,.imscc');
  });

  it('still reads a test document forced through the generic button', async () => {
    const { adapter, parseSpy } = makeAdapter();
    renderWizard(adapter);
    // `accept` is only a hint, so a teacher can still pick a PDF there. It
    // must reach the reader, never `file.text()`.
    fireEvent.change(screen.getByLabelText('Upload import file'), {
      target: { files: [PDF_BYTES] },
    });
    await waitFor(() => expect(parseSpy).toHaveBeenCalledTimes(1));
    expect(parseSpy.mock.calls[0][0]).toEqual({
      kind: 'document',
      file: PDF_BYTES,
      fileName: 'Unit 3 Test.pdf',
    });
  });

  it('parses an uploaded PDF as bytes rather than reading it as text', async () => {
    const { adapter, parseSpy } = makeAdapter();
    renderWizard(adapter);
    const input = screen.getByLabelText('Upload a test document');
    fireEvent.change(input, { target: { files: [PDF_BYTES] } });
    await waitFor(() => expect(parseSpy).toHaveBeenCalledTimes(1));
    expect(parseSpy.mock.calls[0][0]).toEqual({
      kind: 'document',
      file: PDF_BYTES,
      fileName: 'Unit 3 Test.pdf',
    });
  });

  it('parses a document chosen from Drive', async () => {
    const blob = new Blob([new Uint8Array([9])]);
    const pickDocument = vi.fn(() =>
      Promise.resolve({ file: blob, fileName: 'Quiz 1.docx' })
    );
    const { adapter, parseSpy } = makeAdapter({ pickDocument });
    renderWizard(adapter);
    fireEvent.click(screen.getByText(/Choose a test from Drive/i));
    await waitFor(() => expect(parseSpy).toHaveBeenCalledTimes(1));
    expect(parseSpy.mock.calls[0][0]).toEqual({
      kind: 'document',
      file: blob,
      fileName: 'Quiz 1.docx',
    });
  });

  it('stays on the source step with no error when the Picker is dismissed', async () => {
    const pickDocument = vi.fn(() => Promise.resolve(null));
    const { adapter, parseSpy } = makeAdapter({ pickDocument });
    renderWizard(adapter);
    fireEvent.click(screen.getByText(/Choose a test from Drive/i));
    await waitFor(() => expect(pickDocument).toHaveBeenCalled());
    expect(parseSpy).not.toHaveBeenCalled();
    expect(screen.getByText(/Upload a test document/i)).toBeTruthy();
  });

  it('surfaces a Drive failure instead of leaving the button spinning', async () => {
    const pickDocument = vi.fn(() =>
      Promise.reject(new Error('Could not download that file from Drive.'))
    );
    const { adapter } = makeAdapter({ pickDocument });
    renderWizard(adapter);
    fireEvent.click(screen.getByText(/Choose a test from Drive/i));
    await waitFor(() =>
      expect(
        screen.getByText('Could not download that file from Drive.')
      ).toBeTruthy()
    );
  });
});

describe('ImportWizard — busy state', () => {
  it('covers the whole modal while a document is read, and says so', async () => {
    const deferred: {
      release?: (v: { data: FakeData; warnings: string[] }) => void;
    } = {};
    const { adapter } = makeAdapter();
    adapter.parse = (() =>
      new Promise<{ data: FakeData; warnings: string[] }>((resolve) => {
        deferred.release = resolve;
      })) as unknown as ImportAdapter<FakeData>['parse'];
    renderWizard(adapter);

    fireEvent.change(screen.getByLabelText('Upload a test document'), {
      target: { files: [PDF_BYTES] },
    });

    // The old inline banner sat below the document tiles, off-screen until the
    // teacher scrolled; this one covers the whole panel.
    const busy = await screen.findByRole('status');
    expect(busy.textContent).toMatch(/Reading your document/i);
    expect(busy.className).toContain('absolute');
    expect(busy.className).toContain('inset-0');

    deferred.release?.({ data: { rows: ['a'] }, warnings: [] });
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
  });

  it('will not let the teacher close the wizard mid-read', async () => {
    const { adapter } = makeAdapter();
    // Never resolves: the read is still in flight when the teacher tries to
    // close.
    adapter.parse = (() =>
      new Promise(
        () => undefined
      )) as unknown as ImportAdapter<FakeData>['parse'];
    const { onClose } = renderWizard(adapter);

    fireEvent.change(screen.getByLabelText('Upload a test document'), {
      target: { files: [PDF_BYTES] },
    });
    await screen.findByRole('status');

    fireEvent.click(screen.getByLabelText('Close import wizard'));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('ImportWizard — LMS exports', () => {
  it('reads an uploaded .imscc as a document', async () => {
    const { adapter, parseSpy } = makeAdapter();
    renderWizard(adapter);
    const imscc = new File([new Uint8Array([80, 75])], 'Unit 3 Test.imscc');
    fireEvent.change(screen.getByLabelText('Upload a test document'), {
      target: { files: [imscc] },
    });
    await waitFor(() => expect(parseSpy).toHaveBeenCalledTimes(1));
    expect(parseSpy.mock.calls[0][0]).toEqual({
      kind: 'document',
      file: imscc,
      fileName: 'Unit 3 Test.imscc',
    });
  });

  it('does not offer an .imscc as a separate answer key', () => {
    const { adapter } = makeAdapter({ supportsKeyFile: true });
    renderWizard(adapter);
    // An export carries its own answers, so it is never the key file.
    expect(
      screen
        .getByLabelText('Upload a separate answer key')
        .getAttribute('accept')
    ).toBe('.pdf,.docx,.rtf');
  });
});

describe('ImportWizard — rich text documents', () => {
  const RTF = new File(['{\\rtf1}'], 'Unit 3 Test.rtf', {
    type: 'application/rtf',
  });

  it('reads an uploaded .rtf as a document rather than as text', async () => {
    const { adapter, parseSpy } = makeAdapter();
    renderWizard(adapter);
    fireEvent.change(screen.getByLabelText('Upload import file'), {
      target: { files: [RTF] },
    });
    await waitFor(() => expect(parseSpy).toHaveBeenCalledTimes(1));
    expect(parseSpy.mock.calls[0][0]).toEqual({
      kind: 'document',
      file: RTF,
      fileName: 'Unit 3 Test.rtf',
    });
  });

  it('takes a .rtf answer key too', async () => {
    const { adapter, parseSpy } = makeAdapter({ supportsKeyFile: true });
    renderWizard(adapter);
    const key = new File(['{\\rtf1}'], 'key.rtf', { type: 'application/rtf' });
    fireEvent.change(screen.getByLabelText('Upload a separate answer key'), {
      target: { files: [key] },
    });
    await screen.findByText(/Answer key: key\.rtf/);
    fireEvent.change(screen.getByLabelText('Upload a test document'), {
      target: { files: [RTF] },
    });
    await waitFor(() => expect(parseSpy).toHaveBeenCalledTimes(1));
    expect(parseSpy.mock.calls[0][0]).toMatchObject({
      kind: 'document',
      keyFile: { fileName: 'key.rtf' },
    });
  });
});

describe('ImportWizard — editable review step', () => {
  it('keeps the read-only preview for an adapter without one', async () => {
    const { adapter } = makeAdapter();
    renderWizard(adapter);
    fireEvent.change(screen.getByLabelText('Upload a test document'), {
      target: { files: [PDF_BYTES] },
    });
    await waitFor(() => expect(screen.getByTestId('preview')).toBeTruthy());
    expect(screen.queryByTestId('review')).toBeNull();
  });

  it('renders the review pane instead of the preview when the adapter has one', async () => {
    const { adapter } = makeAdapter({ withReview: true });
    renderWizard(adapter);
    fireEvent.change(screen.getByLabelText('Upload a test document'), {
      target: { files: [PDF_BYTES] },
    });
    await waitFor(() => expect(screen.getByTestId('review')).toBeTruthy());
    expect(screen.queryByTestId('preview')).toBeNull();
  });

  it('saves what the teacher corrected in the review, not what was parsed', async () => {
    const { adapter, saveSpy } = makeAdapter({ withReview: true });
    renderWizard(adapter);
    fireEvent.change(screen.getByLabelText('Upload a test document'), {
      target: { files: [PDF_BYTES] },
    });
    await waitFor(() => expect(screen.getByTestId('review')).toBeTruthy());

    fireEvent.click(screen.getByText('Edit rows'));
    await waitFor(() =>
      expect(screen.getByTestId('review').textContent).toContain('edited')
    );

    fireEvent.click(screen.getByText('Continue'));
    const titleInput = await screen.findByLabelText('Title');
    fireEvent.change(titleInput, { target: { value: 'Unit 3 Test' } });
    fireEvent.click(screen.getByText('Save to library'));

    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    expect(saveSpy.mock.calls[0][0]).toEqual({ rows: ['a', 'edited'] });
  });
});

describe('the optional answer key slot (D8)', () => {
  const upload = (label: string, name: string) => {
    const input = screen.getByLabelText(label);
    fireEvent.change(input, {
      target: { files: [new File(['x'], name, { type: 'application/pdf' })] },
    });
  };

  it('is not offered by an adapter that does not read a key', () => {
    const { adapter } = makeAdapter();
    renderWizard(adapter);
    expect(
      screen.queryByText(/Add a separate answer key/i)
    ).not.toBeInTheDocument();
  });

  it('sends an attached key along with the test document', async () => {
    const { adapter, parseSpy } = makeAdapter({ supportsKeyFile: true });
    renderWizard(adapter);

    upload('Upload a separate answer key', 'key.pdf');
    await screen.findByText(/Answer key: key\.pdf/);
    upload('Upload a test document', 'test.pdf');

    await waitFor(() => expect(parseSpy).toHaveBeenCalled());
    expect(parseSpy.mock.calls[0][0]).toMatchObject({
      kind: 'document',
      fileName: 'test.pdf',
      keyFile: { fileName: 'key.pdf' },
    });
  });

  it('forgets an attached key when the wizard is reopened', async () => {
    const { adapter, parseSpy } = makeAdapter({ supportsKeyFile: true });
    const { rerender } = render(
      <ImportWizard isOpen onClose={vi.fn()} adapter={adapter} />
    );

    upload('Upload a separate answer key', 'key.pdf');
    await screen.findByText(/Answer key: key\.pdf/);

    // Closing and reopening starts a fresh import; last week's key silently
    // marking this week's test would be invisible until a student's paper.
    rerender(
      <ImportWizard isOpen={false} onClose={vi.fn()} adapter={adapter} />
    );
    rerender(<ImportWizard isOpen onClose={vi.fn()} adapter={adapter} />);

    expect(screen.queryByText(/Answer key: key\.pdf/)).not.toBeInTheDocument();

    upload('Upload a test document', 'test.pdf');
    await waitFor(() => expect(parseSpy).toHaveBeenCalled());
    expect(parseSpy.mock.calls[0][0]).not.toHaveProperty('keyFile');
  });

  it('sends no key when the teacher removed it', async () => {
    const { adapter, parseSpy } = makeAdapter({ supportsKeyFile: true });
    renderWizard(adapter);

    upload('Upload a separate answer key', 'key.pdf');
    fireEvent.click(await screen.findByText('Remove'));
    upload('Upload a test document', 'test.pdf');

    await waitFor(() => expect(parseSpy).toHaveBeenCalled());
    expect(parseSpy.mock.calls[0][0]).not.toHaveProperty('keyFile');
  });
});
