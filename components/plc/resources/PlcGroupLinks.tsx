import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ExternalLink,
  Link2,
  Loader2,
  Plus,
  Route,
  Trash2,
} from 'lucide-react';
import type { Plc, PlcLink } from '@/types';
import { useDashboard } from '@/context/useDashboard';
import { useDialog } from '@/context/useDialog';
import { useCanEditPlcContent } from '@/context/usePlcContext';
import { isGuidedLearningLink, usePlcLinks } from '@/hooks/usePlcLinks';
import { logError } from '@/utils/logError';

interface PlcGroupLinksProps {
  plc: Plc;
}

const inputClass =
  'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-blue-primary/50 focus:border-brand-blue-primary/50';

const linkSource = (link: PlcLink): string => {
  if (isGuidedLearningLink(link.url)) return 'Guided Learning';
  try {
    return new URL(link.url).hostname.replace(/^www\./, '');
  } catch {
    return link.url;
  }
};

export const PlcGroupLinks: React.FC<PlcGroupLinksProps> = ({ plc }) => {
  const { t } = useTranslation();
  const { addToast } = useDashboard();
  const { showConfirm } = useDialog();
  const canEdit = useCanEditPlcContent();
  const { links, loading, addLink, removeLink } = usePlcLinks(plc.id);

  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');

  const resetForm = () => {
    setAdding(false);
    setTitle('');
    setUrl('');
    setNote('');
  };

  const handleSave = async () => {
    if (title.trim().length === 0 || url.trim().length === 0) return;
    setSaving(true);
    try {
      await addLink({ title, url, note });
      resetForm();
    } catch (err) {
      logError('PlcGroupLinks.add', err, { plcId: plc.id });
      addToast(
        t('plcDashboard.links.addFailed', {
          defaultValue: 'Could not add the link.',
        }),
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (link: PlcLink) => {
    const ok = await showConfirm(
      t('plcDashboard.links.removeConfirm', {
        defaultValue: 'Remove "{{title}}" from this group?',
        title: link.title,
      }),
      {
        title: t('plcDashboard.links.removeTitle', {
          defaultValue: 'Remove link',
        }),
        variant: 'danger',
        confirmLabel: t('plcDashboard.links.remove', {
          defaultValue: 'Remove',
        }),
      }
    );
    if (!ok) return;
    try {
      await removeLink(link.id);
    } catch (err) {
      logError('PlcGroupLinks.remove', err, { plcId: plc.id });
      addToast(
        t('plcDashboard.links.removeFailed', {
          defaultValue: 'Could not remove the link.',
        }),
        'error'
      );
    }
  };

  return (
    <section
      aria-label={t('plcDashboard.links.title', { defaultValue: 'Links' })}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-slate-500" aria-hidden="true" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
            {t('plcDashboard.links.title', { defaultValue: 'Links' })}
          </h3>
        </div>
        {canEdit && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-sm font-semibold text-brand-blue-primary hover:text-brand-blue-dark px-3 py-1.5 rounded-lg hover:bg-brand-blue-primary/10 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('plcDashboard.links.add', { defaultValue: 'Add link' })}
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-3 flex flex-col gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('plcDashboard.links.titlePlaceholder', {
              defaultValue: 'Title',
            })}
            aria-label={t('plcDashboard.links.titleLabel', {
              defaultValue: 'Title',
            })}
            maxLength={200}
            className={inputClass}
            autoFocus
          />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t('plcDashboard.links.urlPlaceholder', {
              defaultValue: 'Paste a link or Guided Learning share',
            })}
            aria-label={t('plcDashboard.links.urlLabel', {
              defaultValue: 'Link',
            })}
            maxLength={2000}
            className={inputClass}
          />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('plcDashboard.links.notePlaceholder', {
              defaultValue: 'Note (optional)',
            })}
            aria-label={t('plcDashboard.links.noteLabel', {
              defaultValue: 'Note',
            })}
            maxLength={500}
            className={inputClass}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="px-3 py-1.5 text-sm font-semibold text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={
                saving || title.trim().length === 0 || url.trim().length === 0
              }
              className="px-3 py-1.5 text-sm font-semibold text-white bg-brand-blue-primary rounded-lg hover:bg-brand-blue-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t('plcDashboard.links.save', { defaultValue: 'Add' })}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center text-slate-400 py-2">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      ) : links.length === 0 ? (
        !adding && (
          <p className="text-sm text-slate-500">
            {t('plcDashboard.links.empty', { defaultValue: 'No links yet.' })}
          </p>
        )
      ) : (
        <ul className="space-y-2">
          {links.map((link) => {
            const isGl = isGuidedLearningLink(link.url);
            const Icon = isGl ? Route : Link2;
            return (
              <li
                key={link.id}
                className="group flex items-start gap-3 bg-white/70 backdrop-blur-sm border border-slate-200 rounded-xl px-4 py-3 shadow-sm"
              >
                <Icon
                  className={`w-4 h-4 mt-0.5 shrink-0 ${isGl ? 'text-amber-600' : 'text-slate-400'}`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-800 text-sm truncate">
                    {link.title}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {linkSource(link)}
                    {link.createdByName.length > 0
                      ? ` · ${link.createdByName}`
                      : ''}
                  </p>
                  {link.note && (
                    <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                      {link.note}
                    </p>
                  )}
                </div>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 flex items-center gap-1.5 text-sm font-semibold text-brand-blue-primary hover:text-brand-blue-dark px-3 py-1.5 rounded-lg hover:bg-brand-blue-primary/10 transition-colors"
                  aria-label={t('plcDashboard.links.openAria', {
                    defaultValue: 'Open {{title}}',
                    title: link.title,
                  })}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {t('plcDashboard.links.open', { defaultValue: 'Open' })}
                </a>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => void handleRemove(link)}
                    className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    aria-label={t('plcDashboard.links.removeAria', {
                      defaultValue: 'Remove {{title}}',
                      title: link.title,
                    })}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
