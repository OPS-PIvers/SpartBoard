import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import { ImportWizard } from '@/components/common/library/importer';
import type {
  ImportAdapter,
  ImportSourcePayload,
} from '@/components/common/library/types';

type FakeData = { rows: string[] };

interface MakeAdapterOptions {
  parseImpl?: (source: ImportSourcePayload) => Promise<{
    data: FakeData;
    warnings: string[];
  }>;
  validateImpl?: (data: FakeData) => { ok: boolean; errors: string[] };
  saveImpl?: (data: FakeData, title: string) => Promise<void>;
  aiAssist?: ImportAdapter<FakeData>['aiAssist'];
  templateHelper?: ImportAdapter<FakeData>['templateHelper'];
  supportedSources?: ImportAdapter<FakeData>['supportedSources'];
  suggestTitle?: (data: FakeData) => string | undefined;
}

function makeAdapter(opts: MakeAdapterOptions = {}): {
  adapter: ImportAdapter<FakeData>;
  parseSpy: ReturnType<typeof vi.fn>;
  validateSpy: ReturnType<typeof vi.fn>;
  saveSpy: ReturnType<typeof vi.fn>;
  aiGenerateSpy: ReturnType<typeof vi.fn> | null;
} {
  const parseSpy = vi.fn(
    opts.parseImpl ??
      ((_source: ImportSourcePayload) =>
        Promise.resolve({
          data: { rows: ['row-a', 'row-b'] },
          warnings: [],
        }))
  );
  const validateSpy = vi.fn(
    opts.validateImpl ??
      ((_data: FakeData) => ({ ok: true, errors: [] as string[] }))
  );
  const saveSpy = vi.fn(
    opts.saveImpl ??
      ((_data: FakeData, _title: string) => Promise.resolve(undefined))
  );

  let aiGenerateSpy: ReturnType<typeof vi.fn> | null = null;
  const aiAssist = opts.aiAssist;
  if (aiAssist) {
    aiGenerateSpy = vi.fn(aiAssist.generate);
    aiAssist.generate = aiGenerateSpy as typeof aiAssist.generate;
  }

  const adapter: ImportAdapter<FakeData> = {
    widgetLabel: 'Quiz',
    supportedSources: opts.supportedSources ?? ['sheet', 'csv', 'json'],
    templateHelper: opts.templateHelper,
    parse: parseSpy as unknown as ImportAdapter<FakeData>['parse'],
    validate: validateSpy as unknown as ImportAdapter<FakeData>['validate'],
    renderPreview: (data) => (
      <div data-testid="preview">rows: {data.rows.join(', ')}</div>
    ),
    save: saveSpy as unknown as ImportAdapter<FakeData>['save'],
    aiAssist,
    suggestTitle: opts.suggestTitle,
  };
  return { adapter, parseSpy, validateSpy, saveSpy, aiGenerateSpy };
}

function renderWizard(
  adapter: ImportAdapter<FakeData>,
  extra: {
    onClose?: () => void;
    onSaved?: (title: string) => void;
    defaultTitle?: string;
  } = {}
) {
  const onClose = extra.onClose ?? vi.fn();
  const onSaved = extra.onSaved ?? vi.fn();
  const utils = render(
    <ImportWizard<FakeData>
      isOpen={true}
      onClose={onClose}
      adapter={adapter}
      defaultTitle={extra.defaultTitle}
      onSaved={onSaved}
    />
  );
  return { ...utils, onClose, onSaved };
}

function makeFile(name: string, content: string, type = 'text/plain'): File {
  const file = new File([content], name, { type });
  // jsdom's File does not implement `text()` — polyfill to the provided
  // content so the wizard's `await file.text()` resolves deterministically.
  if (typeof file.text !== 'function') {
    Object.defineProperty(file, 'text', {
      value: () => Promise.resolve(content),
    });
  }
  return file;
}

describe('ImportWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    const { adapter } = makeAdapter();
    const { container } = render(
      <ImportWizard<FakeData>
        isOpen={false}
        onClose={vi.fn()}
        adapter={adapter}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the Source step by default with the step indicator', () => {
    const { adapter } = makeAdapter();
    renderWizard(adapter);
    expect(screen.getByText('Import Quiz')).toBeInTheDocument();
    // Step indicator pills
    const steps = screen.getByTestId('import-wizard-steps');
    expect(steps).toHaveTextContent('Source');
    expect(steps).toHaveTextContent('Preview');
    expect(steps).toHaveTextContent('Confirm');
    // Source-specific UI visible
    expect(screen.getByLabelText('Google Sheet URL')).toBeInTheDocument();
  });

  it('routes Sheet URL submission through adapter.parse with kind:sheet', async () => {
    const { adapter, parseSpy } = makeAdapter();
    renderWizard(adapter);

    const input = screen.getByLabelText('Google Sheet URL');
    fireEvent.change(input, {
      target: {
        value: 'https://docs.google.com/spreadsheets/d/abc/edit',
      },
    });
    const submit = input.parentElement?.querySelector('button');
    expect(submit).not.toBeNull();
    fireEvent.click(submit as HTMLButtonElement);

    await waitFor(() => {
      expect(parseSpy).toHaveBeenCalledTimes(1);
    });
    expect(parseSpy).toHaveBeenCalledWith({
      kind: 'sheet',
      url: 'https://docs.google.com/spreadsheets/d/abc/edit',
    });
    // Moved to Preview step
    await waitFor(() => {
      expect(screen.getByTestId('preview')).toBeInTheDocument();
    });
  });

  it('routes CSV upload through adapter.parse with kind:csv', async () => {
    const { adapter, parseSpy } = makeAdapter();
    renderWizard(adapter);

    const fileInput = screen.getByLabelText('Upload import file');
    const file = makeFile('questions.csv', 'col1,col2\nfoo,bar', 'text/csv');

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
      // Allow the async file.text() read + runParse promise chain to flush.
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(parseSpy).toHaveBeenCalledTimes(1);
    });
    const call = parseSpy.mock.calls[0]?.[0] as ImportSourcePayload;
    expect(call.kind).toBe('csv');
    if (call.kind === 'csv') {
      expect(call.text).toContain('foo,bar');
      expect(call.fileName).toBe('questions.csv');
    }
  });

  it('routes JSON upload through adapter.parse with kind:json', async () => {
    const { adapter, parseSpy } = makeAdapter({
      supportedSources: ['sheet', 'json'],
    });
    renderWizard(adapter);

    const fileInput = screen.getByLabelText('Upload import file');
    const file = makeFile(
      'data.json',
      JSON.stringify({ hello: 'world' }),
      'application/json'
    );

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(parseSpy).toHaveBeenCalledTimes(1);
    });
    const call = parseSpy.mock.calls[0]?.[0] as ImportSourcePayload;
    expect(call.kind).toBe('json');
    if (call.kind === 'json') {
      expect(call.text).toContain('"hello":"world"');
      expect(call.fileName).toBe('data.json');
    }
  });

  it('surfaces parse errors inline and stays on Source step', async () => {
    const { adapter } = makeAdapter({
      parseImpl: () => Promise.reject(new Error('Bad sheet format')),
    });
    renderWizard(adapter);

    const input = screen.getByLabelText('Google Sheet URL');
    fireEvent.change(input, {
      target: { value: 'https://docs.google.com/spreadsheets/d/bad' },
    });
    const submit = input.parentElement?.querySelector('button');
    fireEvent.click(submit as HTMLButtonElement);

    await waitFor(() => {
      expect(screen.getByText('Bad sheet format')).toBeInTheDocument();
    });
    // Still on Source step (no preview rendered)
    expect(screen.queryByTestId('preview')).not.toBeInTheDocument();
  });

  it('blocks save when validation fails and displays validation errors', async () => {
    const { adapter, saveSpy } = makeAdapter({
      validateImpl: () => ({
        ok: false,
        errors: ['Missing required column', 'Row 3 is empty'],
      }),
    });
    const { onSaved, onClose } = renderWizard(adapter, {
      defaultTitle: 'My Import',
    });

    // Parse a sheet → go to Preview
    const urlField = screen.getByLabelText('Google Sheet URL');
    fireEvent.change(urlField, {
      target: { value: 'https://docs.google.com/spreadsheets/d/abc' },
    });
    fireEvent.click(
      urlField.parentElement?.querySelector('button') as HTMLButtonElement
    );

    await waitFor(() => {
      expect(screen.getByTestId('preview')).toBeInTheDocument();
    });

    // Preview → Confirm
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    // Confirm → try to save
    const saveBtn = await screen.findByRole('button', {
      name: /save to library/i,
    });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText('Missing required column')).toBeInTheDocument();
    });
    expect(screen.getByText('Row 3 is empty')).toBeInTheDocument();
    expect(saveSpy).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('on successful save calls onSaved with title then onClose', async () => {
    const { adapter, saveSpy } = makeAdapter();
    const { onSaved, onClose } = renderWizard(adapter);

    // Parse a sheet
    fireEvent.change(screen.getByLabelText('Google Sheet URL'), {
      target: { value: 'https://docs.google.com/spreadsheets/d/abc' },
    });
    // Click the small icon button adjacent to the URL input (the sheet submit)
    const urlField = screen.getByLabelText('Google Sheet URL');
    const submitBtn = urlField.parentElement?.querySelector('button');
    fireEvent.click(submitBtn as HTMLButtonElement);

    await waitFor(() => {
      expect(screen.getByTestId('preview')).toBeInTheDocument();
    });

    // Preview → Confirm
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    // Enter a title
    const titleInput = await screen.findByLabelText('Title');
    fireEvent.change(titleInput, { target: { value: 'Unit 4 Review' } });

    // Save
    fireEvent.click(screen.getByRole('button', { name: /save to library/i }));

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledTimes(1);
    });
    expect(saveSpy).toHaveBeenCalledWith(
      { rows: ['row-a', 'row-b'] },
      'Unit 4 Review'
    );
    expect(onSaved).toHaveBeenCalledWith('Unit 4 Review');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('surfaces save errors inline without closing', async () => {
    const { adapter } = makeAdapter({
      saveImpl: () => Promise.reject(new Error('Network down')),
    });
    const { onClose, onSaved } = renderWizard(adapter, {
      defaultTitle: 'Prefilled',
    });

    // Source → Preview
    fireEvent.change(screen.getByLabelText('Google Sheet URL'), {
      target: { value: 'https://docs.google.com/spreadsheets/d/abc' },
    });
    const urlField = screen.getByLabelText('Google Sheet URL');
    fireEvent.click(
      urlField.parentElement?.querySelector('button') as HTMLButtonElement
    );
    await waitFor(() => {
      expect(screen.getByTestId('preview')).toBeInTheDocument();
    });
    // Preview → Confirm
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    // Save
    fireEvent.click(
      await screen.findByRole('button', { name: /save to library/i })
    );

    await waitFor(() => {
      expect(screen.getByText('Network down')).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('AI-assist path bypasses Source and jumps to Preview with generated data', async () => {
    const generated: FakeData = { rows: ['ai-row-1', 'ai-row-2'] };
    const aiAssist: ImportAdapter<FakeData>['aiAssist'] = {
      promptPlaceholder: 'Describe your quiz…',
      generate: () => Promise.resolve(generated),
    };
    const { adapter, aiGenerateSpy, parseSpy } = makeAdapter({ aiAssist });
    renderWizard(adapter);

    // Open AI-assist overlay
    fireEvent.click(
      screen.getByRole('button', { name: /ai-assist import for quiz/i })
    );
    // Prompt + generate
    const textarea = screen.getByLabelText('AI-assist prompt for Quiz');
    fireEvent.change(textarea, {
      target: { value: '5 questions on the solar system' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^generate$/i }));

    await waitFor(() => {
      expect(aiGenerateSpy).toHaveBeenCalledTimes(1);
    });
    expect(aiGenerateSpy).toHaveBeenCalledWith({
      prompt: '5 questions on the solar system',
    });
    // Should NOT have called parse — AI bypasses parsing
    expect(parseSpy).not.toHaveBeenCalled();
    // Now on Preview showing generated rows
    await waitFor(() => {
      expect(screen.getByTestId('preview')).toHaveTextContent(
        'rows: ai-row-1, ai-row-2'
      );
    });
  });

  it('shows a hint when Sheet URL does not look like a Google Sheets URL', () => {
    const { adapter } = makeAdapter();
    renderWizard(adapter);

    fireEvent.change(screen.getByLabelText('Google Sheet URL'), {
      target: { value: 'https://example.com/some-other-sheet' },
    });
    expect(
      screen.getByText(/doesn.t look like a Google Sheets URL/i)
    ).toBeInTheDocument();
  });

  it('renders warnings from parse result on the Preview step', async () => {
    const { adapter } = makeAdapter({
      parseImpl: () =>
        Promise.resolve({
          data: { rows: ['x'] },
          warnings: ['Row 2 had a blank cell', 'Ambiguous timestamp on row 5'],
        }),
    });
    renderWizard(adapter);

    fireEvent.change(screen.getByLabelText('Google Sheet URL'), {
      target: { value: 'https://docs.google.com/spreadsheets/d/abc' },
    });
    const urlField = screen.getByLabelText('Google Sheet URL');
    fireEvent.click(
      urlField.parentElement?.querySelector('button') as HTMLButtonElement
    );

    await waitFor(() => {
      expect(screen.getByTestId('preview')).toBeInTheDocument();
    });
    expect(screen.getByText('Row 2 had a blank cell')).toBeInTheDocument();
    expect(
      screen.getByText('Ambiguous timestamp on row 5')
    ).toBeInTheDocument();
  });

  it('prefills the title from adapter.suggestTitle after a successful parse when the input is empty', async () => {
    const { adapter } = makeAdapter({
      suggestTitle: (data) => `Derived ${data.rows.length}`,
    });
    renderWizard(adapter);

    // Parse a sheet URL — suggestTitle should fire because title state is empty.
    const urlField = screen.getByLabelText('Google Sheet URL');
    fireEvent.change(urlField, {
      target: { value: 'https://docs.google.com/spreadsheets/d/abc' },
    });
    fireEvent.click(
      urlField.parentElement?.querySelector('button') as HTMLButtonElement
    );

    await waitFor(() => {
      expect(screen.getByTestId('preview')).toBeInTheDocument();
    });

    // Advance to the Confirm step where the Title input lives.
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    const titleInput = await screen.findByLabelText('Title');
    expect((titleInput as HTMLInputElement).value).toBe('Derived 2');
  });

  it('does not overwrite an already-typed title on subsequent parses', async () => {
    const suggestTitleSpy = vi.fn(
      (data: FakeData) => `Derived ${data.rows[0]}`
    );
    const { adapter } = makeAdapter({
      suggestTitle: suggestTitleSpy,
    });
    // defaultTitle simulates a title the user (or caller) has already supplied.
    renderWizard(adapter, { defaultTitle: 'User Typed Title' });

    // First parse — adapter has a suggestion, but the input is non-empty, so
    // the user-provided title must stand.
    const urlField = screen.getByLabelText('Google Sheet URL');
    fireEvent.change(urlField, {
      target: { value: 'https://docs.google.com/spreadsheets/d/abc' },
    });
    fireEvent.click(
      urlField.parentElement?.querySelector('button') as HTMLButtonElement
    );
    await waitFor(() => {
      expect(screen.getByTestId('preview')).toBeInTheDocument();
    });

    // Advance to Confirm and verify the user's title is still there.
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    const titleInput = await screen.findByLabelText('Title');
    expect((titleInput as HTMLInputElement).value).toBe('User Typed Title');
  });

  it('shows the template helper when adapter exposes templateHelper', () => {
    const { adapter } = makeAdapter({
      templateHelper: {
        createTemplate: () =>
          Promise.resolve({ url: 'https://example.com/tpl' }),
        instructions: <p>Template instructions here.</p>,
      },
    });
    renderWizard(adapter);

    fireEvent.click(
      screen.getByRole('button', { name: /template .* format help/i })
    );
    expect(screen.getByText('Template instructions here.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /create template/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /copy template url/i })
    ).toBeInTheDocument();
  });
});
