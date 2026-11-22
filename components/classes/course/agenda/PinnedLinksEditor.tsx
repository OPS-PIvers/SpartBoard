// D12: the Course's pinned links, at most six, each a title and an address.
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import {
  chromeMuted,
  iconBtn,
  inputLight,
  primaryBtn,
  secondaryBtn,
} from '@/components/common/lightChrome';
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
    <div className="mt-1">
      {links.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {links.map((link, i) => (
            <li
              key={`${i}-${link.url}`}
              className="flex items-center gap-2 py-1.5"
            >
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 hover:text-brand-blue-primary"
              >
                <span className="block truncate font-semibold text-slate-900">
                  {link.title}
                </span>
                <span className={`block truncate text-xs ${chromeMuted}`}>
                  {hostOf(link.url)}
                </span>
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
                className={`${iconBtn} shrink-0 disabled:opacity-50`}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <form onSubmit={(e) => void add(e)} className="mt-2 space-y-2">
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
            className={`${inputLight} w-full rounded-lg px-3 py-1.5 text-sm`}
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
            className={`${inputLight} w-full rounded-lg px-3 py-1.5 text-sm`}
          />
          {badUrl && (
            <p role="alert" className="text-xs text-brand-red-primary">
              {t('course.agenda.badUrl', {
                defaultValue: 'Enter a web address, like https://example.com',
              })}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={close}
              {...tourAttr('classes.agenda-link-cancel')}
              className={secondaryBtn}
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </button>
            <button
              type="submit"
              disabled={busy || !url.trim()}
              {...tourAttr('classes.agenda-link-save')}
              className={`${primaryBtn} disabled:opacity-50`}
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
            className={`${secondaryBtn} -ml-3 mt-1 inline-flex items-center gap-1.5 disabled:opacity-50`}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('course.agenda.addLink', { defaultValue: 'Add link' })}
          </button>
        )
      )}
    </div>
  );
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
