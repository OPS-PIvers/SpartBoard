import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { Modal } from '@/components/common/Modal';
import {
  ChangelogBullet,
  ChangelogEntry,
  ChangelogHighlight,
  ChangelogHighlightType,
  ChangelogThemedSection,
  useChangelog,
  writeLastSeenVersion,
} from '@/hooks/useChangelog';

interface WhatsNewModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'preview' | 'browse';
  currentVersion: string;
  updateAvailable?: boolean;
  onUpdate?: () => void;
}

const GROUP_ORDER: ChangelogHighlightType[] = ['feature', 'improvement', 'fix'];

const groupHighlights = (
  highlights: ChangelogHighlight[]
): Record<ChangelogHighlightType, ChangelogHighlight[]> => {
  const groups: Record<ChangelogHighlightType, ChangelogHighlight[]> = {
    feature: [],
    improvement: [],
    fix: [],
  };
  for (const h of highlights) {
    if (groups[h.type]) groups[h.type].push(h);
  }
  return groups;
};

const groupOverviewByType = (
  sections: ChangelogThemedSection[]
): Record<ChangelogHighlightType, ChangelogThemedSection[]> => {
  const groups: Record<ChangelogHighlightType, ChangelogThemedSection[]> = {
    feature: [],
    improvement: [],
    fix: [],
  };
  for (const section of sections) {
    if (groups[section.type]) groups[section.type].push(section);
  }
  return groups;
};

const OverviewBulletList: React.FC<{
  items: ChangelogBullet[];
  nested?: boolean;
}> = ({ items, nested = false }) => (
  <ul
    className={
      nested ? 'flex flex-col gap-1 pl-4 mt-1.5' : 'flex flex-col gap-1.5'
    }
  >
    {items.map((bullet, idx) => (
      <li
        key={idx}
        className={
          nested
            ? 'text-[13px] text-slate-700 leading-relaxed pl-3 border-l-2 border-slate-100'
            : 'text-[13px] text-slate-700 leading-relaxed pl-3 border-l-2 border-slate-200'
        }
      >
        {bullet.text}
        {bullet.items && bullet.items.length > 0 && (
          <OverviewBulletList items={bullet.items} nested />
        )}
      </li>
    ))}
  </ul>
);

const OverviewSection: React.FC<{ section: ChangelogThemedSection }> = ({
  section,
}) => (
  <div>
    {section.subtitle && (
      <p className="text-sm font-bold text-slate-800 mb-1.5">
        {section.subtitle}
      </p>
    )}
    <OverviewBulletList items={section.items} />
  </div>
);

// _PillIcon and _Pill are preserved here for Task 10 removal; they are no
// longer rendered after Task 7 removed the pill strip from both entry paths.
const _PillIcon: React.FC<{ type: ChangelogHighlightType }> = ({ type }) => {
  if (type === 'feature') {
    return <Sparkles className="w-3 h-3" />;
  }
  if (type === 'improvement') {
    return <ArrowUpRight className="w-3 h-3" />;
  }
  return <Wrench className="w-3 h-3" />;
};

const _Pill: React.FC<{
  type: ChangelogHighlightType;
  label: string;
  count: number;
}> = ({ type, label, count }) => {
  const styles =
    type === 'feature'
      ? 'bg-emerald-50 text-emerald-700'
      : type === 'improvement'
        ? 'bg-blue-50 text-blue-700'
        : 'bg-amber-50 text-amber-700';
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xxs font-bold uppercase tracking-wide ${styles}`}
    >
      <_PillIcon type={type} />
      {label}
      <span className="opacity-60">·</span>
      <span>{count}</span>
    </div>
  );
};

const formatEntryDate = (iso: string, language: string): string => {
  // Parse "YYYY-MM-DD" explicitly so the Date isn't shifted by the host
  // timezone (a bare `new Date('2026-05-19')` is interpreted as UTC midnight
  // and can render as the previous day in negative-offset zones).
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  return new Intl.DateTimeFormat(language, {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(date);
};

const Entry: React.FC<{ entry: ChangelogEntry }> = ({ entry }) => {
  const { t, i18n } = useTranslation();
  const groups = useMemo(() => groupHighlights(entry.details), [entry]);
  const overviewByType = useMemo(
    () => (entry.overview ? groupOverviewByType(entry.overview) : null),
    [entry.overview]
  );
  const hasOverview =
    overviewByType !== null &&
    GROUP_ORDER.some((type) => overviewByType[type].length > 0);

  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();

  const labels: Record<ChangelogHighlightType, string> = {
    feature: t('whatsNew.groups.feature', { defaultValue: 'New' }),
    improvement: t('whatsNew.groups.improvement', {
      defaultValue: 'Improvements',
    }),
    fix: t('whatsNew.groups.fix', { defaultValue: 'Fixes' }),
  };

  // Details list: rendered inline when there's no overview, OR inside the
  // expanded disclosure. Extracted so we only have one source of truth for
  // the by-type render.
  const detailsList = (
    <div className="flex flex-col gap-3">
      {GROUP_ORDER.map((type) =>
        groups[type].length > 0 ? (
          <div key={type}>
            <h5 className="text-xxs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              {labels[type]}
            </h5>
            <ul className="flex flex-col gap-1.5">
              {groups[type].map((h, idx) => (
                <li
                  key={idx}
                  className="text-[13px] text-slate-700 leading-relaxed pl-3 border-l-2 border-slate-200"
                >
                  {h.text}
                </li>
              ))}
            </ul>
          </div>
        ) : null
      )}
    </div>
  );

  return (
    <section className="pt-5 first:pt-0 pb-5 border-b border-slate-100 last:border-b-0">
      <header className="mb-3">
        <h4 className="font-black text-base text-slate-900">{entry.title}</h4>
        <p className="mt-0.5 text-xxs text-slate-400">
          {formatEntryDate(entry.date, i18n.language)}
        </p>
      </header>

      {hasOverview && overviewByType ? (
        <>
          <div className="flex flex-col gap-3">
            {GROUP_ORDER.map((type) =>
              overviewByType[type].length > 0 ? (
                <div key={type}>
                  <h5 className="text-xxs font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                    {labels[type]}
                  </h5>
                  <div className="flex flex-col gap-3">
                    {overviewByType[type].map((section, idx) => (
                      <OverviewSection key={idx} section={section} />
                    ))}
                  </div>
                </div>
              ) : null
            )}
          </div>

          <div className="flex justify-end mt-3">
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              aria-expanded={expanded}
              aria-controls={detailsId}
              className="text-xs font-semibold text-brand-blue-primary hover:text-brand-blue-dark inline-flex items-center gap-1"
            >
              {expanded
                ? t('whatsNew.showLess', { defaultValue: 'Show less' })
                : t('whatsNew.readFullUpdate', {
                    defaultValue: 'Read full update',
                  })}
              {expanded ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>
          </div>

          {expanded && (
            <div
              id={detailsId}
              className="border-t border-slate-100 pt-4 mt-3 animate-disclosure-expand"
            >
              {detailsList}
            </div>
          )}
        </>
      ) : (
        detailsList
      )}
    </section>
  );
};

export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({
  isOpen,
  onClose,
  mode,
  currentVersion,
  updateAvailable = false,
  onUpdate,
}) => {
  const { t } = useTranslation();
  const { entries, loading, error, latestVersion, entriesSinceCurrent } =
    useChangelog();
  const contentRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Mark this version as seen when the modal opens (semantically: opening
  // the modal *is* the act of seeing the changelog, regardless of which
  // button the user clicks next). The dispatched event syncs sibling
  // consumers (the sidebar unread badge) without prop drilling.
  useEffect(() => {
    if (isOpen && latestVersion) {
      writeLastSeenVersion(latestVersion);
    }
  }, [isOpen, latestVersion]);

  // Focus management: when the modal opens, move focus into the content area
  // (the underlying Modal primitive doesn't trap or restore focus). Restore
  // the previously-focused element on close so keyboard users land back
  // where they were.
  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const id = window.requestAnimationFrame(() => {
      contentRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(id);
      const previous = previousFocusRef.current;
      if (previous && typeof previous.focus === 'function') {
        previous.focus();
      }
    };
  }, [isOpen]);

  const visibleEntries = useMemo(() => {
    if (mode === 'preview') return entriesSinceCurrent(currentVersion);
    return entries;
  }, [mode, entries, currentVersion, entriesSinceCurrent]);

  const showUpdateButton = mode === 'preview' || updateAvailable;

  const footer = (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
      >
        {showUpdateButton
          ? t('whatsNew.later', { defaultValue: 'Later' })
          : t('whatsNew.close', { defaultValue: 'Close' })}
      </button>
      {showUpdateButton && onUpdate && (
        <button
          type="button"
          onClick={onUpdate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white bg-brand-blue-primary hover:bg-brand-blue-dark transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          {t('whatsNew.updateNow', { defaultValue: 'Update Now' })}
        </button>
      )}
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('whatsNew.title', { defaultValue: "What's New" })}
      maxWidth="max-w-xl"
      footer={footer}
      ariaLabel="What's New release notes"
    >
      <div
        ref={contentRef}
        tabIndex={-1}
        className="pb-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-light/40 rounded-md"
      >
        {loading && (
          <p className="text-sm text-slate-500 py-6 text-center">
            {t('whatsNew.loading', { defaultValue: 'Loading release notes…' })}
          </p>
        )}
        {error && !loading && (
          <p className="text-sm text-amber-600 py-6 text-center">
            {t('whatsNew.error', {
              defaultValue: "Couldn't load the changelog right now.",
            })}
          </p>
        )}
        {!loading && !error && visibleEntries.length === 0 && (
          <div className="py-8 text-center">
            <Sparkles className="w-10 h-10 text-brand-blue-primary mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700">
              {mode === 'preview'
                ? t('whatsNew.previewEmpty', {
                    defaultValue:
                      'A fresh build is ready. Refresh to get the latest.',
                  })
                : t('whatsNew.browseEmpty', {
                    defaultValue: "You're all caught up.",
                  })}
            </p>
          </div>
        )}
        {!loading &&
          !error &&
          visibleEntries.map((entry) => (
            <Entry key={entry.version} entry={entry} />
          ))}
      </div>
    </Modal>
  );
};
