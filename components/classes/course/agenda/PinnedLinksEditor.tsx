// D12: the Course's pinned links, at most six, each a title and an address.
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Plus, X } from 'lucide-react';
import { tourAttr } from '@/config/tourAnchors';
import {
  COURSE_MAX_LINK_TITLE_LENGTH,
  COURSE_MAX_LINK_URL_LENGTH,
  COURSE_MAX_PINNED_LINKS,
  cleanPinnedLinks,
  cleanPinnedLinkUrl,
  type CoursePinnedLink,
} from '@/utils/course/contract';

interface PinnedLinksEditorProps {
  links: readonly CoursePinnedLink[];
  busy: boolean;
  /** Resolves true once the new list is saved. */
  onSave: (links: CoursePinnedLink[]) => Promise<boolean>;
}

export const PinnedLinksEditor: React.FC<PinnedLinksEditorProps> = ({
  links,
  busy,
  onSave,
}) => {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [badUrl, setBadUrl] = useState(false);

  const close = () => {
    setAdding(false);
    setTitle('');
    setUrl('');
    setBadUrl(false);
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const typed = url.trim();
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(typed)
      ? typed
      : `https://${typed}`;
    if (/\s/.test(typed) || !cleanPinnedLinkUrl(withScheme)) {
      setBadUrl(true);
      return;
    }
    const next = cleanPinnedLinks([...links, { title, url: withScheme }]);
    if (await onSave(next)) close();
  };

  return (
    <div>
      <div className="text-xxs font-bold text-slate-400 uppercase tracking-widest py-1">
        {t('course.agenda.links', { defaultValue: 'Links' })}
      </div>
      {links.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {links.map((link, i) => (
            <li
              key={`${i}-${link.url}`}
              className="flex items-center gap-1 py-1"
            >
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                title={link.url}
                className="flex-1 min-w-0 flex items-center gap-1.5 text-xs text-slate-700 hover:text-brand-blue-primary"
              >
                <ExternalLink
                  className="w-3.5 h-3.5 shrink-0 text-slate-400"
                  aria-hidden="true"
                />
                <span className="truncate">{link.title}</span>
              </a>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onSave(links.filter((_, j) => j !== i))}
                aria-label={t('course.agenda.removeLink', {
                  title: link.title,
                  defaultValue: 'Remove {{title}}',
                })}
                {...tourAttr('classes.agenda-link-remove')}
                className="shrink-0 p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 touch-target-expand disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <form onSubmit={(e) => void add(e)} className="space-y-1.5 py-1">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={COURSE_MAX_LINK_TITLE_LENGTH}
            placeholder={t('course.agenda.linkTitle', {
              defaultValue: 'Title',
            })}
            aria-label={t('course.agenda.linkTitle', { defaultValue: 'Title' })}
            {...tourAttr('classes.agenda-link-title')}
            className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/30"
          />
          <input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setBadUrl(false);
            }}
            type="text"
            inputMode="url"
            required
            maxLength={COURSE_MAX_LINK_URL_LENGTH}
            placeholder="https://"
            aria-label={t('course.agenda.linkUrl', {
              defaultValue: 'Web address',
            })}
            aria-invalid={badUrl}
            {...tourAttr('classes.agenda-link-url')}
            className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue-primary/30"
          />
          {badUrl && (
            <p role="alert" className="text-xxs text-red-600">
              {t('course.agenda.badUrl', {
                defaultValue: 'Enter a web address, like https://example.com',
              })}
            </p>
          )}
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={close}
              {...tourAttr('classes.agenda-link-cancel')}
              className="px-2.5 py-1 text-xs font-semibold text-slate-600 rounded-lg hover:bg-slate-100"
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </button>
            <button
              type="submit"
              disabled={busy || !url.trim()}
              {...tourAttr('classes.agenda-link-save')}
              className="px-2.5 py-1 text-xs font-semibold text-white bg-brand-blue-primary rounded-lg hover:bg-brand-blue-dark disabled:opacity-50"
            >
              {t('course.agenda.addLinkSave', { defaultValue: 'Add' })}
            </button>
          </div>
        </form>
      ) : (
        links.length < COURSE_MAX_PINNED_LINKS && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setAdding(true)}
            {...tourAttr('classes.agenda-link-add')}
            className="flex items-center gap-1 py-1 text-xs font-semibold text-brand-blue-primary hover:underline disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            {t('course.agenda.addLink', { defaultValue: 'Add link' })}
          </button>
        )
      )}
    </div>
  );
};
