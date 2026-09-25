import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import {
  TestAndKeyUploader,
  type TestAndKeySelection,
} from '@/components/common/library/importer/TestAndKeyUploader';
import {
  HEIC_UNREADABLE,
  looksLikeKeyName,
} from '@/utils/quizDocumentImport/uploadIntake';

const pdf = (name: string) =>
  new File([new Uint8Array([1])], name, { type: 'application/pdf' });
const jpg = (name: string) =>
  new File([new Uint8Array([2])], name, { type: 'image/jpeg' });

function setup(
  over: Partial<React.ComponentProps<typeof TestAndKeyUploader>> = {}
) {
  const onSubmit = vi.fn<(selection: TestAndKeySelection) => void>();
  render(
    <TestAndKeyUploader
      submitLabel="Read the test"
      onSubmit={onSubmit}
      looksLikeKey={(_file, name) => Promise.resolve(looksLikeKeyName(name))}
      decode={(file) => Promise.resolve(file)}
      {...over}
    />
  );
  return { onSubmit };
}

const drop = (zone: 'test' | 'key', files: File[]) =>
  fireEvent.drop(screen.getByTestId(`${zone}-zone`), {
    dataTransfer: { files, types: ['Files'] },
  });

const read = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Read the test' }));

describe('TestAndKeyUploader', () => {
  it('shows two equal zones with plain labels', () => {
    setup();
    expect(screen.getByText('Test questions')).toBeInTheDocument();
    expect(screen.getByText('Answer key (optional)')).toBeInTheDocument();
    expect(screen.getAllByText('Choose file')).toHaveLength(2);
  });

  it('puts a dropped file in the zone it was dropped on', async () => {
    const { onSubmit } = setup();
    drop('key', [pdf('answers.pdf')]);
    drop('test', [pdf('unit 3.pdf')]);
    await within(screen.getByTestId('test-zone')).findByText('unit 3.pdf');
    read();
    expect(onSubmit).toHaveBeenCalledWith({
      test: expect.objectContaining({ fileName: 'unit 3.pdf' }),
      key: expect.objectContaining({ fileName: 'answers.pdf' }),
    });
  });

  it('waits for a test before it will read', () => {
    setup();
    expect(
      screen.getByRole('button', { name: 'Read the test' })
    ).toBeDisabled();
  });

  it('sorts two files dropped together into test and key, and offers Swap', async () => {
    const { onSubmit } = setup();
    drop('key', [pdf('Unit 3 Answer Key.pdf'), pdf('Unit 3.pdf')]);
    await within(screen.getByTestId('test-zone')).findByText('Unit 3.pdf');
    expect(
      within(screen.getByTestId('key-zone')).getByText('Unit 3 Answer Key.pdf')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Swap/ }));
    read();
    expect(onSubmit.mock.calls[0][0].test?.fileName).toBe(
      'Unit 3 Answer Key.pdf'
    );
    expect(onSubmit.mock.calls[0][0].key?.fileName).toBe('Unit 3.pdf');
  });

  it('points out a key dropped on the test zone, and moves it only when asked', async () => {
    setup();
    drop('test', [pdf('scoring guide.pdf')]);
    expect(
      await screen.findByText(/This looks like an answer key/)
    ).toBeInTheDocument();
    // Never moved silently.
    expect(
      within(screen.getByTestId('test-zone')).getByText('scoring guide.pdf')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Move it' }));
    expect(
      within(screen.getByTestId('key-zone')).getByText('scoring guide.pdf')
    ).toBeInTheDocument();
    expect(screen.queryByText(/This looks like an answer key/)).toBeNull();
  });

  it('drops the hint once the key zone is filled, and never overwrites it', async () => {
    setup();
    drop('test', [pdf('scoring guide.pdf')]);
    await screen.findByText(/This looks like an answer key/);
    drop('key', [pdf('real key.pdf')]);
    await within(screen.getByTestId('key-zone')).findByText('real key.pdf');
    expect(screen.queryByText(/This looks like an answer key/)).toBeNull();
  });

  it('keeps each zone busy on its own while a file is checked', async () => {
    let release: (v: boolean) => void = () => undefined;
    const { onSubmit } = setup({
      looksLikeKey: (_f, name) =>
        name === 'slow test.pdf'
          ? new Promise<boolean>((r) => {
              release = r;
            })
          : Promise.resolve(false),
    });
    drop('test', [pdf('slow test.pdf')]);
    drop('key', [pdf('key.pdf')]);
    await within(screen.getByTestId('key-zone')).findByText('key.pdf');
    // The key finishing must not free the test zone mid-check.
    drop('test', [pdf('other.pdf')]);
    release(true);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Read the test' })
      ).toBeEnabled()
    );
    expect(screen.queryByText('other.pdf')).toBeNull();
    expect(screen.queryByText(/This looks like an answer key/)).toBeNull();
    read();
    expect(onSubmit.mock.calls[0][0].test?.fileName).toBe('slow test.pdf');
  });

  it('says nothing for an ordinary test', async () => {
    setup();
    drop('test', [pdf('Unit 3.pdf')]);
    await screen.findByText('Unit 3.pdf');
    expect(screen.queryByText(/This looks like an answer key/)).toBeNull();
  });

  it('refuses a file type it cannot read', async () => {
    setup();
    drop('test', [new File(['x'], 'notes.txt', { type: 'text/plain' })]);
    expect(await screen.findByRole('alert')).toHaveTextContent(/can’t be read/);
  });

  it('takes an LMS export only as a test, and only when allowed', async () => {
    setup({ allowCartridge: true });
    drop('key', [new File(['x'], 'unit.imscc')]);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /answer key can’t be read/
    );
    expect(
      screen.getByLabelText('Upload test questions').getAttribute('accept')
    ).toContain('.imscc');
    expect(
      screen.getByLabelText('Upload answer key').getAttribute('accept')
    ).not.toContain('.imscc');
  });

  it('reads photos as pages in natural filename order', async () => {
    const { onSubmit } = setup();
    drop('test', [jpg('page 10.jpg'), jpg('page 2.jpg'), jpg('page 1.jpg')]);
    const pages = await screen.findByRole('list', {
      name: 'Test questions pages',
    });
    expect(
      within(pages)
        .getAllByRole('listitem')
        .map((li) => li.getAttribute('aria-label'))
    ).toEqual([
      expect.stringContaining('page 1.jpg'),
      expect.stringContaining('page 2.jpg'),
      expect.stringContaining('page 10.jpg'),
    ]);
    read();
    const test = onSubmit.mock.calls[0][0].test;
    expect(test?.fileName).toBe('page 1.jpg');
    expect(test?.pages?.map((f) => (f as File).name)).toEqual([
      'page 1.jpg',
      'page 2.jpg',
      'page 10.jpg',
    ]);
  });

  it('lets the teacher reorder the pages', async () => {
    const { onSubmit } = setup();
    drop('test', [jpg('a.jpg'), jpg('b.jpg')]);
    const pages = await screen.findByRole('list', {
      name: 'Test questions pages',
    });
    fireEvent.keyDown(within(pages).getAllByRole('listitem')[1], {
      key: 'ArrowLeft',
    });
    read();
    expect(
      onSubmit.mock.calls[0][0].test?.pages?.map((f) => (f as File).name)
    ).toEqual(['b.jpg', 'a.jpg']);
  });

  it('adds more photos to the same document', async () => {
    const { onSubmit } = setup();
    drop('test', [jpg('p1.jpg')]);
    await screen.findByRole('list', { name: 'Test questions pages' });
    drop('test', [jpg('p2.jpg')]);
    await waitFor(() =>
      expect(
        within(
          screen.getByRole('list', { name: 'Test questions pages' })
        ).getAllByRole('listitem')
      ).toHaveLength(2)
    );
    read();
    expect(onSubmit.mock.calls[0][0].test?.pages).toHaveLength(2);
  });

  it('will not mix a document and photos in one zone', async () => {
    setup();
    drop('test', [pdf('Unit 3.pdf'), jpg('p1.jpg')]);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /one document, or photos of its pages/
    );
  });

  it('holds a zone to the 20-page cap', async () => {
    setup();
    drop(
      'test',
      Array.from({ length: 21 }, (_, i) => jpg(`p${i + 1}.jpg`))
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /21 photos\. Use 20 or fewer/
    );
  });

  it('checks the page cap before decoding any photo', async () => {
    const decode = vi.fn((file: File) => Promise.resolve(file));
    setup({ decode });
    drop(
      'test',
      Array.from({ length: 21 }, (_, i) => jpg(`p${i + 1}.jpg`))
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /21 photos\. Use 20 or fewer/
    );
    expect(decode).not.toHaveBeenCalled();
  });

  it('does not read an oversized file to sniff for a key', async () => {
    const looksLikeKey = vi.fn(() => Promise.resolve(true));
    setup({ looksLikeKey });
    const big = pdf('Unit 3.pdf');
    Object.defineProperty(big, 'size', { value: 26 * 1024 * 1024 });
    drop('test', [big]);
    await screen.findByText('Unit 3.pdf');
    expect(looksLikeKey).not.toHaveBeenCalled();
    expect(screen.queryByText(/This looks like an answer key/)).toBeNull();
  });

  it('says so when an iPhone photo cannot be opened', async () => {
    setup({ decode: () => Promise.reject(new Error(HEIC_UNREADABLE)) });
    drop('test', [
      new File([new Uint8Array([3])], 'IMG_0001.HEIC', { type: 'image/heic' }),
    ]);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t open this iPhone photo. Export it as JPEG and try again.'
    );
  });

  it('picks either zone from Drive', async () => {
    const pickFromDrive = vi.fn(() =>
      Promise.resolve({ file: new Blob(['x']), fileName: 'Key.docx' })
    );
    setup({ pickFromDrive });
    fireEvent.click(
      within(screen.getByTestId('key-zone')).getByRole('button', {
        name: /Choose from Drive/,
      })
    );
    expect(
      await within(screen.getByTestId('key-zone')).findByText('Key.docx')
    ).toBeInTheDocument();
  });

  it('shows only the key zone when filling a saved quiz', async () => {
    const { onSubmit } = setup({
      zones: 'key',
      submitLabel: 'Read the answer key',
    });
    expect(screen.queryByTestId('test-zone')).toBeNull();
    expect(screen.getByText('Answer key')).toBeInTheDocument();
    drop('key', [pdf('key.pdf')]);
    await screen.findByText('key.pdf');
    fireEvent.click(
      screen.getByRole('button', { name: 'Read the answer key' })
    );
    expect(onSubmit).toHaveBeenCalledWith({
      test: null,
      key: expect.objectContaining({ fileName: 'key.pdf' }),
    });
  });

  it('reads a key alone where that is allowed', async () => {
    const { onSubmit } = setup({ allowKeyAlone: true });
    drop('key', [pdf('key.pdf')]);
    await screen.findByText('key.pdf');
    read();
    expect(onSubmit).toHaveBeenCalledWith({
      test: null,
      key: expect.objectContaining({ fileName: 'key.pdf' }),
    });
  });
});
