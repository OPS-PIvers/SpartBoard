import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SubmissionCard } from './SubmissionCard';
import { makeSubmission } from './fixtures';

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
