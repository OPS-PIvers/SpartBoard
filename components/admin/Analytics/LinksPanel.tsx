import React, { useMemo } from 'react';
import {
  Link2,
  MousePointerClick,
  Sparkles,
  AlertCircle,
  ExternalLink,
  Loader2,
} from 'lucide-react';

import { useShortLinks } from '@/hooks/useShortLinks';
import { buildShortUrl } from '@/utils/shortLinkValidation';
import { ShortLink } from '@/types';

// LinksPanel surfaces the click data the link shortener (phase 1) already
// collects on each `short_links/{code}` doc. It is read-only analytics — no
// edit/delete here; admins manage links from the dedicated Link Shortener tab.
//
// Deliberately NO time-series chart: a clicks-over-time view needs the
// per-click event log (phase 2 PR2), which isn't shipped. All we have today
// is a lifetime `clicks` counter, so bucketing by date would be misleading.

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const NUMBER_FORMATTER = new Intl.NumberFormat();
const formatNumber = (value: number) => NUMBER_FORMATTER.format(value);

const formatDate = (epoch: number | null | undefined): string => {
  if (!epoch) return '—';
  return new Date(epoch).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatRelative = (epoch: number | null | undefined): string => {
  if (!epoch) return 'Never';
  const diff = Date.now() - epoch;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'Just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return formatDate(epoch);
};

// Local KPI card mirroring AnalyticsManager's `KpiCard` visual language so the
// Links panel matches every other analytics panel. Kept local (the wrapper in
// AnalyticsManager isn't exported) — a tiny presentational duplication that
// keeps panels independent.
const KpiCard: React.FC<{
  title: string;
  value: string | number;
  subtitle?: string;
  accentColor: string;
  accentBg: string;
  icon: React.ReactNode;
}> = ({ title, value, subtitle, accentColor, accentBg, icon }) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm relative overflow-hidden">
    <div
      className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
      style={{ background: accentColor }}
    />
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </p>
        <p className="text-3xl font-black text-slate-900 mt-1">{value}</p>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      <div className="p-3 rounded-xl" style={{ background: accentBg }}>
        {icon}
      </div>
    </div>
  </div>
);

const PanelCard: React.FC<React.PropsWithChildren<{ title: string }>> = ({
  title,
  children,
}) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">
      {title}
    </h3>
    {children}
  </div>
);

interface LinksKpis {
  totalLinks: number;
  totalClicks: number;
  createdLast7Days: number;
  zeroClickLinks: number;
}

/**
 * Pure KPI math, exported so unit tests can exercise it directly without
 * mounting the component or the Firestore-backed hook.
 */
export const computeLinksKpis = (
  links: ShortLink[],
  now: number = Date.now()
): LinksKpis => {
  const cutoff = now - SEVEN_DAYS_MS;
  let totalClicks = 0;
  let createdLast7Days = 0;
  let zeroClickLinks = 0;
  for (const link of links) {
    totalClicks += link.clicks ?? 0;
    if (typeof link.createdAt === 'number' && link.createdAt >= cutoff) {
      createdLast7Days += 1;
    }
    if (!link.clicks) {
      zeroClickLinks += 1;
    }
  }
  return {
    totalLinks: links.length,
    totalClicks,
    createdLast7Days,
    zeroClickLinks,
  };
};

const LinkCell: React.FC<{ link: ShortLink }> = ({ link }) => (
  <td className="px-4 py-3 align-top">
    <a
      href={buildShortUrl(link.code)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono text-sm text-slate-800 hover:text-brand-blue-primary"
    >
      /r/{link.code}
      <ExternalLink className="w-3 h-3 shrink-0 text-slate-400" />
    </a>
    {link.label && (
      <div className="text-xs text-slate-500 mt-0.5">{link.label}</div>
    )}
  </td>
);

export const LinksPanel: React.FC = () => {
  const { links, loading, error } = useShortLinks();

  const kpis = useMemo(() => computeLinksKpis(links), [links]);

  const topLinks = useMemo(
    () =>
      [...links].sort((a, b) => (b.clicks ?? 0) - (a.clicks ?? 0)).slice(0, 10),
    [links]
  );

  const recentLinks = useMemo(
    () =>
      [...links]
        .filter((link) => link.lastClickedAt != null)
        .sort((a, b) => (b.lastClickedAt ?? 0) - (a.lastClickedAt ?? 0))
        .slice(0, 10),
    [links]
  );

  if (loading) {
    return (
      <div className="px-5 py-12 flex items-center justify-center text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" aria-hidden="true" />{' '}
        Loading link analytics…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-800 p-6 rounded-2xl flex items-start gap-3">
        <AlertCircle className="w-6 h-6 shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <h3 className="font-bold mb-1">Failed to Load Link Analytics</h3>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (links.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
        <div className="inline-flex p-3 rounded-2xl bg-slate-100 text-slate-400 mb-3">
          <Link2 className="w-6 h-6" />
        </div>
        <h3 className="font-bold text-slate-800 mb-1">No short links yet</h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Create short links from the Link Shortener tab. Once teachers start
          clicking them, usage analytics will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Links"
          value={formatNumber(kpis.totalLinks)}
          accentColor="#2d3f89"
          accentBg="#e0e7ff"
          icon={<Link2 className="w-5 h-5 text-brand-blue-primary" />}
        />
        <KpiCard
          title="Total Clicks"
          value={formatNumber(kpis.totalClicks)}
          accentColor="#10b981"
          accentBg="#d1fae5"
          icon={<MousePointerClick className="w-5 h-5 text-emerald-600" />}
        />
        <KpiCard
          title="Created (7 days)"
          value={formatNumber(kpis.createdLast7Days)}
          subtitle="New links this week"
          accentColor="#3b82f6"
          accentBg="#dbeafe"
          icon={<Sparkles className="w-5 h-5 text-blue-600" />}
        />
        <KpiCard
          title="Zero Clicks"
          value={formatNumber(kpis.zeroClickLinks)}
          subtitle="Cleanup candidates"
          accentColor="#f59e0b"
          accentBg="#fef3c7"
          icon={<AlertCircle className="w-5 h-5 text-amber-600" />}
        />
      </div>

      <PanelCard title="Top Links by Clicks">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Short URL</th>
                <th className="text-left px-4 py-2 font-semibold">
                  Destination
                </th>
                <th className="text-right px-4 py-2 font-semibold">Clicks</th>
                <th className="text-left px-4 py-2 font-semibold">
                  Last clicked
                </th>
              </tr>
            </thead>
            <tbody>
              {topLinks.map((link) => (
                <tr
                  key={link.code}
                  className="border-t border-slate-100 hover:bg-slate-50/50"
                >
                  <LinkCell link={link} />
                  <td className="px-4 py-3 align-top max-w-md">
                    <a
                      href={link.destination}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-slate-700 hover:text-brand-blue-primary"
                      title={link.destination}
                    >
                      {link.destination}
                    </a>
                  </td>
                  <td className="px-4 py-3 align-top text-right font-semibold text-slate-800">
                    {formatNumber(link.clicks ?? 0)}
                  </td>
                  <td className="px-4 py-3 align-top text-slate-500">
                    {formatRelative(link.lastClickedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PanelCard>

      <PanelCard title="Recent Activity">
        {recentLinks.length === 0 ? (
          <p className="text-sm text-slate-500 px-1 py-4">
            No clicks recorded yet. Activity appears here once a short link is
            visited.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">
                    Short URL
                  </th>
                  <th className="text-left px-4 py-2 font-semibold">
                    Destination
                  </th>
                  <th className="text-left px-4 py-2 font-semibold">
                    Last clicked
                  </th>
                  <th className="text-right px-4 py-2 font-semibold">Clicks</th>
                </tr>
              </thead>
              <tbody>
                {recentLinks.map((link) => (
                  <tr
                    key={link.code}
                    className="border-t border-slate-100 hover:bg-slate-50/50"
                  >
                    <LinkCell link={link} />
                    <td className="px-4 py-3 align-top max-w-md">
                      <a
                        href={link.destination}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-slate-700 hover:text-brand-blue-primary"
                        title={link.destination}
                      >
                        {link.destination}
                      </a>
                    </td>
                    <td className="px-4 py-3 align-top text-slate-500">
                      {formatRelative(link.lastClickedAt)}
                    </td>
                    <td className="px-4 py-3 align-top text-right font-semibold text-slate-800">
                      {formatNumber(link.clicks ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PanelCard>
    </div>
  );
};
