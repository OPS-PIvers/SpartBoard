import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ResponseArtifact } from '@/types';
import type { MediaTake, TakeFile } from '@/utils/mediaGrading';
import { WhiteboardAnnotatedResponseView } from './WhiteboardAnnotatedResponseView';

vi.mock('@/components/quiz/whiteboard/WhiteboardReplayView', () => ({
  WhiteboardReplayView: () => <div data-testid="replay" />,
}));

const artifact = (
  id: string,
  kind: 'whiteboard' | 'audio',
  part?: 'picture'
): ResponseArtifact => ({
  id,
  slot: 'primary',
  kind,
  ...(part ? { part } : {}),
  storagePath: id,
  uploadState: 'uploaded',
  mimeType: kind === 'audio' ? 'audio/webm' : 'image/png',
});

const archived = (a: ResponseArtifact): TakeFile => ({
  artifact: a,
  archive: { archiveStatus: 'archived', driveFileId: `drive-${a.id}` },
  playable: true,
});

const takeWith = (audio: TakeFile): MediaTake => {
  const picture = archived(artifact('pic', 'whiteboard', 'picture'));
  return {
    takeIndex: 1,
    displayIndex: 1,
    answeredAt: 1,
    artifact: picture.artifact,
    archive: picture.archive,
    playable: true,
    whiteboard: { picture, audio },
  };
};

const renderView = (take: MediaTake) =>
  render(
    <WhiteboardAnnotatedResponseView
      take={take}
      resolveTakeUrl={(id) => Promise.resolve(`blob:${id}`)}
      annotations={[]}
      onChange={vi.fn()}
      authorUid="t1"
      activeId={null}
      onActiveIdChange={vi.fn()}
    />
  );

describe('WhiteboardAnnotatedResponseView', () => {
  it('warns that the narration is still saving instead of replaying silently', async () => {
    renderView(
      takeWith({
        artifact: artifact('voice', 'audio'),
        archive: { archiveStatus: 'syncing' },
        playable: false,
      })
    );

    expect(await screen.findByTestId('replay')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Still saving to your Google Drive'
    );
  });

  it('shows no warning once the narration has archived', async () => {
    renderView(takeWith(archived(artifact('voice', 'audio'))));

    expect(await screen.findByTestId('replay')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
