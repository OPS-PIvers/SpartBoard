import React, { useState } from 'react';
import { Loader2, Music, X } from 'lucide-react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { MusicConfig, MySong } from '@/types';
import { useMySongs } from '@/hooks/useMySongs';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import {
  MY_SONGS_LIMIT,
  canonicalYouTubeUrl,
  fetchYouTubeDetails,
  parseYouTubeVideoId,
  toConfigSong,
  youTubeThumbnail,
} from './mySongs';

/** The teacher's own YouTube songs under the curated station list. */
export const MySongsSection: React.FC<{ ctx: CustomRenderCtx }> = ({ ctx }) => {
  const config = ctx.config as unknown as MusicConfig;
  const t = (leaf: string) => ctx.t(`widgetSettings.music.${leaf}`);
  const { songs, addSong, removeSong } = useMySongs(true);
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectSong = (song: MySong) =>
    ctx.updateConfig({ stationId: song.id, mySong: toConfigSong(song) });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const videoId = parseYouTubeVideoId(link);
    if (!videoId) {
      setError(t('mySongsInvalidLink'));
      return;
    }
    if (songs.length >= MY_SONGS_LIMIT) {
      setError(t('mySongsLimit'));
      return;
    }
    const existing = songs.find(
      (song) => song.url === canonicalYouTubeUrl(videoId)
    );
    if (existing) {
      selectSong(existing);
      setLink('');
      setError(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const details = await fetchYouTubeDetails(videoId);
      const song: MySong = {
        id: crypto.randomUUID(),
        title: details?.title ?? t('mySongsUntitled'),
        channel: details?.channel ?? '',
        url: canonicalYouTubeUrl(videoId),
        thumbnail: youTubeThumbnail(videoId),
        createdAt: Date.now(),
      };
      await addSong(song);
      selectSong(song);
      setLink('');
    } catch (err) {
      console.error('[MySongsSection] Save failed', err);
      setError(t('mySongsSaveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <p className="mb-2 text-xs font-bold text-slate-700">{t('mySongs')}</p>
      {songs.length > 0 && (
        <div
          role="radiogroup"
          aria-label={t('mySongs')}
          className="mb-2 grid max-h-48 grid-cols-2 gap-2 overflow-y-auto pr-1 pb-1"
        >
          {songs.map((song, songIndex) => {
            const active = config.stationId === song.id;
            return (
              <div key={song.id} className="relative">
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => selectSong(song)}
                  {...tourFieldAttr(
                    'widget-settings.music.my-song',
                    ctx.widget.type,
                    `row-${songIndex + 1}`
                  )}
                  data-tour-widget={ctx.widget.id}
                  className={`flex w-full flex-col items-center gap-1.5 rounded-xl border-2 p-3 text-center transition-all ${
                    active
                      ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                      : 'border-slate-100 bg-white hover:border-slate-300'
                  }`}
                >
                  {song.thumbnail ? (
                    <div
                      className="h-10 w-10 rounded-full bg-cover bg-center shadow-sm"
                      style={{ backgroundImage: `url(${song.thumbnail})` }}
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                      <Music className="h-4 w-4 text-slate-400" />
                    </div>
                  )}
                  <span
                    className="block w-full truncate text-xxs font-bold text-slate-800"
                    title={song.title}
                  >
                    {song.title}
                  </span>
                  {song.channel && (
                    <span className="block w-full truncate text-xxs font-normal text-slate-500">
                      {song.channel}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  aria-label={`${t('mySongsRemove')}: ${song.title}`}
                  title={t('mySongsRemove')}
                  onClick={() => void removeSong(song.id)}
                  {...tourFieldAttr(
                    'widget-settings.music.my-song-remove',
                    ctx.widget.type,
                    `row-${songIndex + 1}`
                  )}
                  data-tour-widget={ctx.widget.id}
                  className="absolute right-1 top-1 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <form onSubmit={(e) => void handleAdd(e)} className="flex gap-2">
        <input
          type="url"
          inputMode="url"
          value={link}
          onChange={(e) => {
            setLink(e.target.value);
            if (error) setError(null);
          }}
          placeholder={t('mySongsLinkPlaceholder')}
          aria-label={t('mySongsLinkPlaceholder')}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${ctx.id}-my-songs-error` : undefined}
          maxLength={500}
          {...tourAttr(
            'widget-settings.music.my-song-link',
            ctx.widget.id,
            ctx.widget.type
          )}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={saving || link.trim() === ''}
          {...tourAttr(
            'widget-settings.music.my-song-add',
            ctx.widget.id,
            ctx.widget.type
          )}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-40"
        >
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          {t('mySongsAdd')}
        </button>
      </form>
      {error && (
        <p
          id={`${ctx.id}-my-songs-error`}
          role="alert"
          className="mt-1.5 text-xxs text-red-600"
        >
          {error}
        </p>
      )}
    </div>
  );
};
