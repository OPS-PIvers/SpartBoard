// The Agenda and pinned links above a Class page's tabs (docs/plans/COURSE_AND_AGENDA.md D11, D12, D22).
import React from 'react';
import { ExternalLink } from 'lucide-react';
import type { ClassPageView } from '@/hooks/useClassPageAgendas';

const slidesId = (fileId: string) => encodeURIComponent(fileId);

/** D8: the deck opens on its first slide, today's. */
const agendaEmbedUrl = (fileId: string): string =>
  `https://docs.google.com/presentation/d/${slidesId(fileId)}/preview`;

const agendaOpenUrl = (fileId: string): string =>
  `https://docs.google.com/presentation/d/${slidesId(fileId)}/edit?usp=sharing`;

const linkHost = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

interface ClassPageAgendaProps {
  view: ClassPageView;
  /** Fixture decks on the dev harness, which can't reach Google. */
  embedUrlFor?: (fileId: string) => string;
}

/** Renders nothing when the class has no Agenda and no links. */
export const ClassPageAgenda: React.FC<ClassPageAgendaProps> = ({
  view,
  embedUrlFor = agendaEmbedUrl,
}) => {
  const { agendas, links } = view;
  if (!agendas.length && !links.length) return null;
  return (
    <div className="flex flex-col gap-4">
      {agendas.length > 0 && (
        <div
          className={`grid gap-4 ${agendas.length > 1 ? 'min-[640px]:grid-cols-2' : ''}`}
        >
          {agendas.map((agenda) => (
            <section
              key={agenda.fileId}
              aria-label={
                agenda.teacherName
                  ? `Agenda from ${agenda.teacherName}`
                  : 'Agenda'
              }
            >
              {agenda.teacherName && (
                <h2 className="mb-1.5 text-sm font-semibold text-slate-700">
                  {agenda.teacherName}
                </h2>
              )}
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <iframe
                  src={embedUrlFor(agenda.fileId)}
                  title={agenda.title}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  className="block aspect-video w-full border-0"
                />
              </div>
              <a
                href={agendaOpenUrl(agenda.fileId)}
                target="_blank"
                rel="noopener noreferrer"
                // no-tour-anchor: student page, no teacher tour walks here
                className="mt-1.5 inline-flex min-h-[32px] items-center gap-1 text-left rounded-sm text-sm text-slate-600 hover:text-brand-blue-primary hover:underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
              >
                <span>Can&apos;t see it? Open in Google Slides</span>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </section>
          ))}
        </div>
      )}
      {links.length > 0 && (
        <section aria-label="Links">
          <h2 className="mb-1.5 text-sm font-semibold text-slate-700">Links</h2>
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white px-3">
            {links.map((link) => (
              <li key={link.url}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  // no-tour-anchor: student page, no teacher tour walks here
                  className="flex min-h-[44px] items-center gap-3 py-2 text-sm focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-blue-primary"
                >
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-900">
                    {link.title}
                  </span>
                  <span className="hidden shrink truncate text-xs text-slate-500 min-[480px]:block">
                    {linkHost(link.url)}
                  </span>
                  <ExternalLink
                    className="h-4 w-4 shrink-0 text-slate-400"
                    aria-hidden="true"
                  />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};
