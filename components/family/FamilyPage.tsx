// `/family/{shareId}`: a Course's public family page (docs/plans/COURSE_AND_AGENDA.md D13, D15), signed out, no app providers.
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Link2, Loader2 } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  FAMILY_PAGES_COLLECTION,
  type FamilyPage as FamilyPageData,
} from '@/utils/course/contract';
import {
  deckEmbedUrl,
  deckOpenUrl,
  parseFamilyPath,
  readFamilyPage,
} from './familyPageModel';

type Load =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; page: FamilyPageData };

/** D15: keeps the page out of search engines and keeps its address out of the sites it links to. */
function useFamilyPageHead(title: string | null): void {
  useEffect(() => {
    const added: HTMLMetaElement[] = [];
    for (const [name, content] of [
      ['robots', 'noindex, nofollow'],
      ['referrer', 'no-referrer'],
    ]) {
      const meta = document.createElement('meta');
      meta.name = name;
      meta.content = content;
      document.head.appendChild(meta);
      added.push(meta);
    }
    return () => added.forEach((m) => m.remove());
  }, []);
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);
}

export const FamilyPageUnavailable: React.FC = () => {
  const { t } = useTranslation();
  return (
    <main
      data-testid="family-page-unavailable"
      className="h-screen h-dvh overflow-y-auto bg-slate-100 px-4 py-16 pb-16"
    >
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-semibold text-slate-900">
          {t('course.family.page.unavailable')}
        </h1>
      </div>
    </main>
  );
};

/** The page itself, for a loaded copy; the dev harness renders it on fixtures. */
export const FamilyPageView: React.FC<{ page: FamilyPageData }> = ({
  page,
}) => {
  const { t } = useTranslation();
  const { agenda, pinnedLinks } = page;
  return (
    <main
      data-testid="family-page"
      className="h-screen h-dvh overflow-y-auto bg-slate-100 px-4 py-10 pb-16"
    >
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-semibold text-slate-900 wrap-break-word">
          {page.courseName}
        </h1>
        {page.teacherName && (
          <p className="mt-1 text-base text-slate-600 wrap-break-word">
            {page.teacherName}
          </p>
        )}
        {agenda && (
          <section className="mt-6" aria-labelledby="family-agenda-heading">
            <h2
              id="family-agenda-heading"
              className="text-sm font-semibold uppercase tracking-wide text-slate-600"
            >
              {t('course.family.page.agenda')}
            </h2>
            <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="relative aspect-video w-full">
                <iframe
                  src={deckEmbedUrl(agenda.fileId)}
                  title={agenda.title}
                  className="absolute inset-0 h-full w-full"
                  referrerPolicy="no-referrer"
                  allowFullScreen
                />
              </div>
            </div>
            <a
              href={deckOpenUrl(agenda.fileId)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-blue-primary hover:underline"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {t('course.family.page.openInSlides')}
            </a>
          </section>
        )}
        {pinnedLinks.length > 0 && (
          <section className="mt-6" aria-labelledby="family-links-heading">
            <h2
              id="family-links-heading"
              className="text-sm font-semibold uppercase tracking-wide text-slate-600"
            >
              {t('course.family.page.links')}
            </h2>
            <ul className="mt-2 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
              {pinnedLinks.map((link, i) => (
                <li key={`${i}-${link.url}`}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-11 items-center gap-2 px-4 py-3 text-base font-medium text-slate-900 hover:bg-slate-50"
                  >
                    <Link2
                      className="h-4 w-4 shrink-0 text-slate-500"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 wrap-anywhere">{link.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
};

/** Reads the one family page by its share id; a switched-off link has no document, so it reads as unavailable. */
export const FamilyPage: React.FC = () => {
  const { t } = useTranslation();
  const shareId = parseFamilyPath(window.location.pathname);
  const [load, setLoad] = useState<Load>(
    shareId ? { kind: 'loading' } : { kind: 'unavailable' }
  );

  useEffect(() => {
    if (!shareId) return;
    return onSnapshot(
      doc(db, FAMILY_PAGES_COLLECTION, shareId),
      (snap) => {
        const page = snap.exists() ? readFamilyPage(snap.data()) : null;
        setLoad(page ? { kind: 'ready', page } : { kind: 'unavailable' });
      },
      () => setLoad({ kind: 'unavailable' })
    );
  }, [shareId]);

  useFamilyPageHead(load.kind === 'ready' ? load.page.courseName : null);

  if (load.kind === 'unavailable') return <FamilyPageUnavailable />;
  if (load.kind === 'loading')
    return (
      <div className="flex h-screen h-dvh w-full items-center justify-center bg-slate-100">
        <Loader2
          role="status"
          aria-label={t('course.family.page.loading')}
          className="h-8 w-8 animate-spin text-slate-400 motion-reduce:animate-none"
        />
      </div>
    );
  return <FamilyPageView page={load.page} />;
};
