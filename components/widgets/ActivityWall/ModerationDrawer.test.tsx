import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityWallSubmission } from '@/types';

vi.mock('@/config/firebase', () => ({ storage: {} }));
vi.mock('firebase/storage', () => ({
  getDownloadURL: vi.fn(() => Promise.resolve('https://storage.test/p.png')),
  ref: (_storage: unknown, path: string) => path,
}));

import { ModerationDrawer } from './ModerationDrawer';

const makeSubmission = (
  overrides: Partial<ActivityWallSubmission>
): ActivityWallSubmission => ({
  id: 's1',
  content: 'A written idea',
  submittedAt: 1,
  status: 'approved',
  ...overrides,
});

const renderDrawer = (
  submissions: ActivityWallSubmission[],
  onEdit = vi.fn()
) =>
  render(
    <ModerationDrawer
      open
      onClose={vi.fn()}
      submissions={submissions}
      onApprove={vi.fn()}
      onReject={vi.fn()}
      onDelete={vi.fn()}
      onPin={vi.fn()}
      onEdit={onEdit}
    />
  );

describe('ModerationDrawer previews', () => {
  it('shows a link title and domain instead of the raw URL', () => {
    renderDrawer([
      makeSubmission({
        type: 'link',
        content: 'https://en.wikipedia.org/wiki/Photosynthesis',
        linkPreview: {
          title: 'Photosynthesis - Wikipedia',
          domain: 'en.wikipedia.org',
        },
      }),
    ]);
    expect(screen.getByText('Photosynthesis - Wikipedia')).toBeInTheDocument();
    expect(screen.getByText('en.wikipedia.org')).toBeInTheDocument();
    expect(
      screen.queryByText('https://en.wikipedia.org/wiki/Photosynthesis')
    ).not.toBeInTheDocument();
  });

  it('shows a file chip instead of the storage path', () => {
    renderDrawer([
      makeSubmission({
        type: 'file',
        content: 'walls/teacher-1/abc.pdf',
        fileName: 'lab-report.pdf',
      }),
    ]);
    expect(screen.getByText('lab-report.pdf')).toBeInTheDocument();
    expect(
      screen.queryByText('walls/teacher-1/abc.pdf')
    ).not.toBeInTheDocument();
  });

  it('labels actions by participant and excerpt, not by submission id', () => {
    renderDrawer([
      makeSubmission({
        status: 'pending',
        participantLabel: 'Ada',
        content: 'Plants use sunlight',
      }),
    ]);
    expect(
      screen.getByRole('button', {
        name: "Approve Ada's post: Plants use sunlight",
      })
    ).toBeInTheDocument();
  });

  it('offers a text field only for text posts and always a title field', async () => {
    const onEdit = vi.fn();
    const { rerender } = renderDrawer([
      makeSubmission({ participantLabel: 'Ada' }),
    ]);
    await userEvent.click(
      screen.getByRole('button', { name: /Edit Ada's post/ })
    );
    expect(
      screen.getByRole('textbox', { name: /Text of Ada's post/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: /Title for Ada's post/ })
    ).toBeInTheDocument();

    rerender(
      <ModerationDrawer
        open
        onClose={vi.fn()}
        submissions={[
          makeSubmission({
            id: 's2',
            type: 'link',
            participantLabel: 'Cleo',
            content: 'https://example.com/a',
          }),
        ]}
        onApprove={vi.fn()}
        onReject={vi.fn()}
        onDelete={vi.fn()}
        onPin={vi.fn()}
        onEdit={onEdit}
      />
    );
    await userEvent.click(
      screen.getByRole('button', { name: /Edit Cleo's post/ })
    );
    expect(
      screen.getByRole('textbox', { name: /Title for Cleo's post/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: /Text of Cleo's post/ })
    ).not.toBeInTheDocument();
  });
});
