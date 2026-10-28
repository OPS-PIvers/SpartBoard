import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { MySong } from '@/types';
import { MySongsSection } from './MySongsSection';

const addSong = vi.fn<(song: MySong) => Promise<void>>();
const removeSong = vi.fn<(id: string) => Promise<void>>();
let songs: MySong[] = [];

vi.mock('@/hooks/useMySongs', () => ({
  useMySongs: () => ({ songs, loading: false, addSong, removeSong }),
}));

const ID = 'jfKfPfyJRdk';
const makeCtx = (updateConfig = vi.fn()) =>
  ({
    config: { stationId: '' },
    widget: { id: 'w1', type: 'music', config: {} },
    t: (key: string) => key.split('.').pop(),
    id: 'station',
    updateConfig,
  }) as unknown as CustomRenderCtx;

afterEach(() => {
  songs = [];
  addSong.mockReset();
  removeSong.mockReset();
  vi.unstubAllGlobals();
});

describe('MySongsSection', () => {
  it('rejects a link that is not a YouTube video', () => {
    render(<MySongsSection ctx={makeCtx()} />);
    fireEvent.change(screen.getByPlaceholderText('mySongsLinkPlaceholder'), {
      target: { value: 'https://example.com/song' },
    });
    fireEvent.click(screen.getByText('mySongsAdd'));
    expect(screen.getByRole('alert')).toHaveTextContent('mySongsInvalidLink');
    expect(addSong).not.toHaveBeenCalled();
  });

  it('saves a pasted link with its YouTube title and plays it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ title: 'Lo-fi beats', author_name: 'Lofi Girl' })
          )
        )
      )
    );
    const updateConfig = vi.fn();
    render(<MySongsSection ctx={makeCtx(updateConfig)} />);
    fireEvent.change(screen.getByPlaceholderText('mySongsLinkPlaceholder'), {
      target: { value: `https://youtu.be/${ID}?si=x` },
    });
    fireEvent.click(screen.getByText('mySongsAdd'));
    await waitFor(() => expect(addSong).toHaveBeenCalledTimes(1));
    const saved = addSong.mock.calls[0][0];
    expect(saved).toMatchObject({
      title: 'Lo-fi beats',
      channel: 'Lofi Girl',
      url: `https://www.youtube.com/watch?v=${ID}`,
      thumbnail: `https://img.youtube.com/vi/${ID}/hqdefault.jpg`,
    });
    await waitFor(() => expect(updateConfig).toHaveBeenCalledTimes(1));
    const { createdAt: _createdAt, ...copied } = saved;
    expect(updateConfig).toHaveBeenCalledWith({
      stationId: saved.id,
      mySong: copied,
    });
  });

  it('picks an already saved song instead of adding it twice', () => {
    songs = [
      {
        id: 's1',
        title: 'Saved',
        channel: '',
        url: `https://www.youtube.com/watch?v=${ID}`,
        thumbnail: '',
        createdAt: 1,
      },
    ];
    const updateConfig = vi.fn();
    render(<MySongsSection ctx={makeCtx(updateConfig)} />);
    fireEvent.change(screen.getByPlaceholderText('mySongsLinkPlaceholder'), {
      target: { value: `https://www.youtube.com/watch?v=${ID}` },
    });
    fireEvent.click(screen.getByText('mySongsAdd'));
    expect(addSong).not.toHaveBeenCalled();
    expect(updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({ stationId: 's1' })
    );
  });
});
