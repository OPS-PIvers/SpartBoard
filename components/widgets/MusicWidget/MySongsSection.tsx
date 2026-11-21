import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { CustomRenderCtx } from '@/components/settings/schema/types';
import type { MySong } from '@/types';
import { tourAttr } from '@/config/tourAnchors';
import {
  MY_SONGS_LIMIT,
  canonicalYouTubeUrl,
  fetchYouTubeDetails,
  parseYouTubeVideoId,
  youTubeThumbnail,
} from './mySongs';

/** Paste-a-link footer pinned under the station list; saved songs join that list. */
export const MySongsFooter: React.FC<{
  ctx: CustomRenderCtx;
  songs: readonly MySong[];
  addSong: (song: MySong) => Promise<void>;
  selectSong: (song: MySong) => void;
  error: string | null;
  setError: (error: string | null) => void;
}> = ({ ctx, songs, addSong, selectSong, error, setError }) => {
  const t = (leaf: string) => ctx.t(`widgetSettings.music.${leaf}`);
  const [link, setLink] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const videoId = parseYouTubeVideoId(link);
    if (!videoId) {
      setError(t('mySongsInvalidLink'));
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
    if (songs.length >= MY_SONGS_LIMIT) {
      setError(t('mySongsLimit'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const details = await fetchYouTubeDetails(videoId);
      if (details === 'unavailable') {
        setError(t('mySongsUnavailable'));
        return;
      }
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
      console.error('[MySongsFooter] Save failed', err);
      setError(t('mySongsSaveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sticky -bottom-4 z-10 -mx-4 -mb-4 mt-1 border-t border-slate-200 bg-white px-4 pt-3 pb-4">
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
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand-blue-primary focus:outline-hidden"
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
