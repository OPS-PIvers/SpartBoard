import '@testing-library/jest-dom';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubmissionCard } from './SubmissionCard';
import { makeSubmission } from './fixtures';
import { WallImageSizeContext, wallImageDimensions } from './imageSize';

const { mockGetDownloadURL } = vi.hoisted(() => ({
  mockGetDownloadURL: vi.fn(() =>
    Promise.resolve('https://storage.test/photo.png')
  ),
}));

vi.mock('@/config/firebase', () => ({ storage: {} }));
vi.mock('firebase/storage', () => ({
  getDownloadURL: mockGetDownloadURL,
  ref: (_storage: unknown, path: string) => path,
}));

describe('SubmissionCard', () => {
  beforeEach(() => {
    mockGetDownloadURL.mockClear();
    mockGetDownloadURL.mockResolvedValue('https://storage.test/photo.png');
  });

  it('renders text content', () => {
    render(
      <SubmissionCard
        submission={makeSubmission({ content: 'A great answer' })}
        mode="gallery"
        showNames={false}
      />
    );
    expect(screen.getByText('A great answer')).toBeInTheDocument();
  });

  it('hides the author name unless showNames is on', () => {
    const { rerender } = render(
      <SubmissionCard
        submission={makeSubmission()}
        mode="gallery"
        showNames={false}
      />
    );
    expect(screen.queryByText('Ada')).not.toBeInTheDocument();
    rerender(
      <SubmissionCard submission={makeSubmission()} mode="gallery" showNames />
    );
    expect(screen.getByText('Ada')).toBeInTheDocument();
  });

  it('resolves a transit photo through Storage while not archived', async () => {
    render(
      <SubmissionCard
        submission={makeSubmission({
          type: 'photo',
          content: 'activity_wall_media/s/sub-1/p.png',
          storagePath: 'activity_wall_media/s/sub-1/p.png',
          archiveStatus: 'firebase',
        })}
        mode="gallery"
        showNames={false}
      />
    );
    await waitFor(() =>
      expect(screen.getByRole('img')).toHaveAttribute(
        'src',
        'https://storage.test/photo.png'
      )
    );
    expect(mockGetDownloadURL).toHaveBeenCalled();
  });

  it('never touches Storage for text, word or link submissions', () => {
    render(
      <SubmissionCard
        submission={makeSubmission({
          type: 'text',
          content: 'activity_wall_media/s/sub-1/not-a-path',
        })}
        mode="gallery"
        showNames={false}
      />
    );
    render(
      <SubmissionCard
        submission={makeSubmission({
          id: 'sub-2',
          type: 'link',
          content: 'https://example.com/article',
        })}
        mode="gallery"
        showNames={false}
      />
    );
    expect(mockGetDownloadURL).not.toHaveBeenCalled();
  });

  it('falls back to the unavailable state when the download URL rejects', async () => {
    mockGetDownloadURL.mockRejectedValueOnce(new Error('denied'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(vi.fn());
    render(
      <SubmissionCard
        submission={makeSubmission({
          type: 'photo',
          content: 'activity_wall_media/s/sub-1/p.png',
          storagePath: 'activity_wall_media/s/sub-1/p.png',
          archiveStatus: 'firebase',
        })}
        mode="gallery"
        showNames={false}
      />
    );
    await waitFor(() =>
      expect(screen.getByText('Photo unavailable')).toBeInTheDocument()
    );
    expect(screen.queryByText('Loading photo…')).not.toBeInTheDocument();
    warn.mockRestore();
  });

  it('uses the Drive URL once archived', () => {
    render(
      <SubmissionCard
        submission={makeSubmission({
          type: 'photo',
          content: 'https://drive.google.com/thumbnail?id=abc&sz=w2000',
          archiveStatus: 'archived',
          driveFileId: 'abc',
          driveUrl: 'https://drive.google.com/thumbnail?id=abc&sz=w2000',
        })}
        mode="gallery"
        showNames={false}
      />
    );
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://drive.google.com/thumbnail?id=abc&sz=w2000'
    );
  });

  const photo = () =>
    makeSubmission({
      type: 'photo',
      archiveStatus: 'archived',
      driveFileId: 'abc',
      driveUrl: 'https://drive.google.com/thumbnail?id=abc',
    });

  it('exposes teacher edit on the widget face when onEdit is supplied', () => {
    const onEdit = vi.fn();
    render(
      <SubmissionCard
        submission={makeSubmission()}
        mode="widget"
        showNames={false}
        onEdit={onEdit}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit post' }));
    expect(onEdit).toHaveBeenCalledWith(makeSubmission().id);
  });

  it('keeps the gallery face free of edit controls', () => {
    render(
      <SubmissionCard
        submission={makeSubmission()}
        mode="gallery"
        showNames={false}
        onEdit={vi.fn()}
      />
    );
    expect(screen.queryByRole('button', { name: 'Edit post' })).toBeNull();
  });

  it('caps photo dimensions in every layout mode, not just widget', () => {
    // jsdom drops CSS min(), so the widget's cqmin caps are asserted on the helper.
    expect(wallImageDimensions('medium', true).maxHeight).toContain('cqmin');
    for (const mode of ['gallery', 'teacher'] as const) {
      const { unmount } = render(
        <SubmissionCard submission={photo()} mode={mode} showNames={false} />
      );
      expect(screen.getByRole('img')).toHaveStyle({
        maxHeight: '320px',
        maxWidth: '520px',
      });
      unmount();
    }
  });

  it('grows the photo cap with the image size from context', () => {
    const { unmount } = render(
      <WallImageSizeContext.Provider value="small">
        <SubmissionCard submission={photo()} mode="gallery" showNames={false} />
      </WallImageSizeContext.Provider>
    );
    expect(screen.getByRole('img')).toHaveStyle({ maxHeight: '160px' });
    unmount();
    render(
      <WallImageSizeContext.Provider value="large">
        <SubmissionCard submission={photo()} mode="gallery" showNames={false} />
      </WallImageSizeContext.Provider>
    );
    expect(screen.getByRole('img')).toHaveStyle({ maxHeight: '520px' });
  });

  it('opens the photo in a lightbox on click and closes on Escape', () => {
    render(
      <SubmissionCard submission={photo()} mode="gallery" showNames={false} />
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /full size/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('img')).toHaveAttribute(
      'src',
      'https://drive.google.com/thumbnail?id=abc'
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /full size/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Close image' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('explains a private Drive file instead of showing a broken image', () => {
    render(
      <SubmissionCard
        submission={makeSubmission({
          type: 'photo',
          archiveStatus: 'archived',
          driveFileId: 'abc',
          driveUrl: 'https://drive.google.com/thumbnail?id=abc',
          drivePermission: 'private',
        })}
        mode="gallery"
        showNames={false}
      />
    );
    expect(
      screen.getByText('Only the teacher can view this file')
    ).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows Processing… for a video that has not archived yet', () => {
    render(
      <SubmissionCard
        submission={makeSubmission({
          type: 'video',
          archiveStatus: 'syncing',
          content: 'activity_wall_media/s/sub-1/v.mp4',
        })}
        mode="gallery"
        showNames={false}
      />
    );
    expect(screen.getByText('Processing…')).toBeInTheDocument();
  });

  it('embeds an archived video with the Drive preview URL', () => {
    render(
      <SubmissionCard
        submission={makeSubmission({
          type: 'video',
          archiveStatus: 'archived',
          driveFileId: 'vid1',
          title: 'Field trip',
        })}
        mode="gallery"
        showNames={false}
      />
    );
    expect(screen.getByTitle('Field trip')).toHaveAttribute(
      'src',
      'https://drive.google.com/file/d/vid1/preview'
    );
  });

  it('renders a file as an icon plus an open link', () => {
    render(
      <SubmissionCard
        submission={makeSubmission({
          type: 'file',
          archiveStatus: 'archived',
          driveFileId: 'f1',
          driveUrl: 'https://drive.google.com/file/d/f1/view',
          fileName: 'report.pdf',
        })}
        mode="gallery"
        showNames={false}
      />
    );
    expect(screen.getByRole('link', { name: 'report.pdf' })).toHaveAttribute(
      'href',
      'https://drive.google.com/file/d/f1/view'
    );
  });

  it('renders a link preview card and a YouTube embed', () => {
    const { rerender } = render(
      <SubmissionCard
        submission={makeSubmission({
          type: 'link',
          content: 'https://example.com/article',
          linkPreview: { title: 'An article', domain: 'example.com' },
        })}
        mode="gallery"
        showNames={false}
      />
    );
    expect(screen.getByRole('link', { name: /An article/ })).toHaveAttribute(
      'href',
      'https://example.com/article'
    );
    rerender(
      <SubmissionCard
        submission={makeSubmission({
          type: 'link',
          content: 'https://www.youtube.com/watch?v=xyz',
          title: 'Clip',
        })}
        mode="gallery"
        showNames={false}
      />
    );
    expect(screen.getByTitle('Clip')).toHaveAttribute(
      'src',
      'https://www.youtube.com/embed/xyz'
    );
  });

  it('renders a word submission as plain text', () => {
    render(
      <SubmissionCard
        submission={makeSubmission({ type: 'word', content: 'curiosity' })}
        mode="widget"
        showNames={false}
      />
    );
    expect(screen.getByText('curiosity')).toBeInTheDocument();
  });

  describe('student mode', () => {
    const own = (overrides = {}) =>
      makeSubmission({ authorUid: 'me', status: 'pending', ...overrides });

    it('shows Awaiting approval and edit/delete on the viewer’s own pending post', () => {
      const onEdit = vi.fn();
      const onDelete = vi.fn();
      render(
        <SubmissionCard
          submission={own()}
          mode="student"
          showNames={false}
          viewerUid="me"
          onEdit={onEdit}
          onDelete={onDelete}
          onApprove={vi.fn()}
          onReject={vi.fn()}
          onPin={vi.fn()}
        />
      );
      expect(screen.getByText('Awaiting approval')).toBeInTheDocument();
      expect(screen.queryByText('Pending')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Edit post' }));
      fireEvent.click(screen.getByRole('button', { name: 'Delete post' }));
      expect(onEdit).toHaveBeenCalledWith('sub-1');
      expect(onDelete).toHaveBeenCalledWith('sub-1');
      for (const name of ['Approve post', 'Reject post', 'Pin post']) {
        expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
      }
    });

    it('gives another student’s card no chip and no actions', () => {
      render(
        <SubmissionCard
          submission={own({ authorUid: 'someone-else', status: 'approved' })}
          mode="student"
          showNames={false}
          viewerUid="me"
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      );
      expect(screen.queryByText('Awaiting approval')).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('never treats a card as own without a viewerUid', () => {
      render(
        <SubmissionCard
          submission={makeSubmission({ status: 'pending' })}
          mode="student"
          showNames={false}
          onEdit={vi.fn()}
        />
      );
      expect(screen.queryByText('Awaiting approval')).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('renders the footer in student mode as well as gallery', () => {
      const renderFooter = vi.fn(() => <span>likes</span>);
      const { rerender } = render(
        <SubmissionCard
          submission={makeSubmission()}
          mode="student"
          showNames={false}
          renderFooter={renderFooter}
        />
      );
      expect(screen.getByText('likes')).toBeInTheDocument();
      rerender(
        <SubmissionCard
          submission={makeSubmission()}
          mode="widget"
          showNames={false}
          renderFooter={renderFooter}
        />
      );
      expect(screen.queryByText('likes')).not.toBeInTheDocument();
    });
  });

  it('labels teacher posts with a Teacher chip in every mode', () => {
    for (const mode of ['widget', 'gallery', 'teacher', 'student'] as const) {
      const { unmount } = render(
        <SubmissionCard
          submission={makeSubmission({ authorRole: 'teacher' })}
          mode={mode}
          showNames={false}
        />
      );
      expect(screen.getByText('Teacher')).toBeInTheDocument();
      unmount();
    }
    render(
      <SubmissionCard submission={makeSubmission()} mode="gallery" showNames />
    );
    expect(screen.queryByText('Teacher')).not.toBeInTheDocument();
  });

  it('shows the Pending ribbon and teacher actions only in teacher mode', () => {
    const pending = makeSubmission({ status: 'pending' });
    const { rerender } = render(
      <SubmissionCard
        submission={pending}
        mode="teacher"
        showNames={false}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Approve post' })
    ).toBeInTheDocument();

    rerender(
      <SubmissionCard
        submission={pending}
        mode="gallery"
        showNames={false}
        onApprove={vi.fn()}
      />
    );
    expect(screen.queryByText('Pending')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Approve post' })
    ).not.toBeInTheDocument();
  });
});
