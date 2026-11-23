import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { GuidedLearningSet } from '@/types';
import { STEPS_LABELS_EN } from '@/components/tours/steps/stepsModel';
import { FreshserviceSendDialog } from './FreshserviceSendDialog';
import { issueLines } from './stepsHtmlExport';
import { termsOf, type FreshserviceCatalog } from './freshservice';

const api = vi.hoisted(() => ({
  loadFreshserviceCatalog: vi.fn(),
  createFreshserviceCategory: vi.fn(),
  createFreshserviceFolder: vi.fn(),
  sendTourToFreshservice: vi.fn(),
}));
vi.mock('./freshservice', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./freshservice')>()),
  ...api,
}));

const catalog: FreshserviceCatalog = {
  ready: true,
  defaultFolderId: '10',
  saved: { folderId: '21', tags: ['Schoology'], keywords: ['embed'] },
  categories: [
    {
      id: '1',
      name: 'Default Category',
      folders: [{ id: '10', name: 'Drafts', visibility: 3 }],
    },
    {
      id: '2',
      name: 'Knowledge Base',
      folders: [
        { id: '20', name: 'General', visibility: 2 },
        { id: '21', name: 'Google', visibility: 1 },
      ],
    },
  ],
};

const set = { id: 'tour1', title: 'Embed a video' } as GuidedLearningSet;

function open(onDone = vi.fn()) {
  render(
    <FreshserviceSendDialog
      set={set}
      labels={STEPS_LABELS_EN}
      onClose={vi.fn()}
      onDone={onDone}
    />
  );
  return onDone;
}

describe('FreshserviceSendDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.loadFreshserviceCatalog.mockResolvedValue(catalog);
    api.sendTourToFreshservice.mockResolvedValue({ kind: 'sent', missing: 0 });
  });

  it("starts on the tour's last folder and sends the choices", async () => {
    const onDone = open();
    const folder = await screen.findByLabelText<HTMLSelectElement>('Folder');
    expect(screen.getByLabelText<HTMLSelectElement>('Category').value).toBe(
      '2'
    );
    expect(folder.value).toBe('21');
    expect(
      screen.getByTestId('freshservice-folder-visibility').textContent
    ).toBe('Seen by: Everyone');
    fireEvent.change(screen.getByLabelText('Tags'), {
      target: { value: 'Schoology,  video ,' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send draft' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(api.sendTourToFreshservice).toHaveBeenCalledWith(
      'tour1',
      STEPS_LABELS_EN,
      set,
      { folderId: '21', tags: ['Schoology', 'video'], keywords: ['embed'] }
    );
    expect(onDone).toHaveBeenCalledWith({
      tone: 'success',
      text: 'Sent to FreshService as a draft.',
    });
  });

  it('makes a new folder once, even when the send has to be retried', async () => {
    api.createFreshserviceFolder.mockResolvedValue({ id: '99' });
    api.sendTourToFreshservice.mockRejectedValueOnce(new Error('offline'));
    const onDone = open();
    fireEvent.change(await screen.findByLabelText('Folder'), {
      target: { value: 'new' },
    });
    const sendButton = screen.getByRole('button', { name: 'Send draft' });
    expect(sendButton).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('Folder name'), {
      target: { value: ' Schoology ' },
    });
    fireEvent.change(screen.getByLabelText('Who can see the folder'), {
      target: { value: '3' },
    });
    fireEvent.click(sendButton);
    expect((await screen.findByRole('alert')).textContent).toContain(
      "couldn't be sent"
    );
    expect(api.createFreshserviceFolder).toHaveBeenCalledWith(
      '2',
      'Schoology',
      3
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send draft' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(api.createFreshserviceFolder).toHaveBeenCalledTimes(1);
    expect(api.sendTourToFreshservice.mock.calls[1][3]).toMatchObject({
      folderId: '99',
    });
  });

  it('makes a new category with its first folder', async () => {
    api.createFreshserviceCategory.mockResolvedValue({ id: '7' });
    api.createFreshserviceFolder.mockResolvedValue({ id: '70' });
    const onDone = open();
    fireEvent.change(await screen.findByLabelText('Category'), {
      target: { value: 'new' },
    });
    expect(screen.queryByLabelText('Folder')).toBeNull();
    fireEvent.change(screen.getByLabelText('Category name'), {
      target: { value: 'Teacher guides' },
    });
    fireEvent.change(screen.getByLabelText('Folder name'), {
      target: { value: 'Schoology' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send draft' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(api.createFreshserviceCategory).toHaveBeenCalledWith(
      'Teacher guides'
    );
    expect(api.createFreshserviceFolder).toHaveBeenCalledWith(
      '7',
      'Schoology',
      2
    );
    expect(api.sendTourToFreshservice.mock.calls[0][3]).toMatchObject({
      folderId: '70',
    });
  });

  it('says so when FreshService is not set up', async () => {
    api.loadFreshserviceCatalog.mockResolvedValue({
      ready: false,
      categories: [],
      defaultFolderId: '',
      saved: null,
    });
    open();
    expect(await screen.findByText('Set up FreshService first.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Send draft' })).toHaveProperty(
      'disabled',
      true
    );
  });
});

describe('issueLines and termsOf', () => {
  it('names the steps to look at', () => {
    expect(
      issueLines({ untitled: [2], noText: [1, 3, 4], noPicture: [], blank: 2 })
    ).toEqual([
      'Step 2 has no title.',
      'Steps 1, 3 and 4 have no words.',
      '2 empty steps are left out.',
    ]);
    expect(
      issueLines({ untitled: [], noText: [], noPicture: [], blank: 0 })
    ).toEqual([]);
  });

  it('splits on commas and drops blanks', () => {
    expect(termsOf(' a ,, b  c ,')).toEqual(['a', 'b c']);
  });
});
