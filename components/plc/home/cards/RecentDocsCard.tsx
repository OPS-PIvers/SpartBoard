/**
 * RecentDocsCard — shows the 3 most recently added shared Google Docs for
 * this PLC and a "View all" CTA that navigates to the Docs section.
 *
 * Data source: usePlcDocs(plc.id) → { docs }  (already ordered newest-first
 * by the hook's Firestore query).
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  ChevronRight,
  ExternalLink,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import type { Plc, PlcDoc } from '@/types';
import { usePlcDocs } from '@/hooks/usePlcDocs';
import type { PlcSectionId } from '../../sections';

interface RecentDocsCardProps {
  plc: Plc;
  onNavigate: (id: PlcSectionId) => void;
}

const MAX_RECENT = 3;

function isSafeHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export const RecentDocsCard: React.FC<RecentDocsCardProps> = ({
  plc,
  onNavigate,
}) => {
  const { t } = useTranslation();
  const { docs, loading, error } = usePlcDocs(plc.id);

  const recent = docs.slice(0, MAX_RECENT);

  return (
    <div className="flex flex-col bg-white/70 backdrop-blur-sm border border-slate-200/80 rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 pt-5 pb-3">
        <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4 text-amber-600" aria-hidden="true" />
        </div>
        <h3 className="flex-1 text-xs font-bold uppercase tracking-widest text-slate-500">
          {t('plcDashboard.home.recentDocs.heading', {
            defaultValue: 'Recent Docs',
          })}
        </h3>
        {docs.length > MAX_RECENT && (
          <span className="text-xs text-slate-400">{docs.length}</span>
        )}
      </div>

      {/* Doc list */}
      <div className="flex-1 px-4 pb-2">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
          </div>
        ) : error ? (
          /* Surface load failures instead of the misleading "No shared docs"
             empty state — an empty `docs` array on error doesn't mean there
             are no docs, just that we couldn't read them. */
          <div
            className="flex flex-col items-center justify-center py-6 text-center"
            role="alert"
          >
            <AlertCircle
              className="w-8 h-8 text-brand-red-primary/70 mb-2"
              aria-hidden="true"
            />
            <p className="text-sm font-semibold text-slate-600">
              {t('plcDashboard.home.recentDocs.loadError', {
                defaultValue: "Couldn't load docs",
              })}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {t('plcDashboard.home.recentDocs.loadErrorSubtitle', {
                defaultValue: 'Check your connection and try again.',
              })}
            </p>
          </div>
        ) : recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <FileText
              className="w-8 h-8 text-slate-200 mb-2"
              aria-hidden="true"
            />
            <p className="text-sm font-semibold text-slate-500">
              {t('plcDashboard.home.recentDocs.empty', {
                defaultValue: 'No shared docs yet',
              })}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {t('plcDashboard.home.recentDocs.emptySubtitle', {
                defaultValue: 'Add a Google Doc to collaborate with your PLC.',
              })}
            </p>
          </div>
        ) : (
          <ul className="space-y-1">
            {recent.map((doc) => (
              <DocRow key={doc.id} doc={doc} />
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      <button
        type="button"
        onClick={() => onNavigate('docs')}
        className="flex items-center justify-center gap-1.5 px-5 py-3 border-t border-slate-100 text-xs font-bold uppercase tracking-wider text-brand-blue-primary hover:bg-brand-blue-lighter/40 transition-colors"
        aria-label={t('plcDashboard.home.recentDocs.viewAll', {
          defaultValue: 'View all docs',
        })}
      >
        {t('plcDashboard.home.recentDocs.viewAll', {
          defaultValue: 'View all',
        })}
        <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
};

const DocRow: React.FC<{ doc: PlcDoc }> = ({ doc }) => {
  const { t } = useTranslation();
  const safeUrl = isSafeHttpUrl(doc.url) ? doc.url : null;

  return (
    <li className="flex items-center gap-2 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors group">
      <FileText
        className="w-4 h-4 text-slate-400 shrink-0"
        aria-hidden="true"
      />
      <span className="flex-1 text-sm font-medium text-slate-800 truncate">
        {doc.title}
      </span>
      {safeUrl && (
        <a
          href={safeUrl}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 p-1.5 text-slate-400 hover:text-brand-blue-primary rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
          aria-label={t('plcDashboard.home.recentDocs.openDoc', {
            title: doc.title,
            defaultValue: `Open ${doc.title}`,
          })}
        >
          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
        </a>
      )}
    </li>
  );
};
