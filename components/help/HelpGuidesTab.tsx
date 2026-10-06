import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Fuse from 'fuse.js';
import {
  FileText,
  Footprints,
  GraduationCap,
  Link2,
  Loader2,
  Play,
  Presentation,
  X,
} from 'lucide-react';
import { TOOLS } from '@/config/tools';
import type { WidgetType } from '@/types';
import type { HelpResourceItem } from '@/types/helpCenter';
import { useAuth } from '@/context/useAuth';
import {
  incrementHelpOpenCount,
  useHelpResources,
} from '@/hooks/useHelpResources';
import { useOrganization } from '@/hooks/useOrganization';
import { useLiveTourSetIds } from '@/hooks/useGuidedLearning';
import { HelpResourceViewer } from './HelpResourceViewer';
import { HelpCopyLinkButton } from './HelpCopyLinkButton';
import { tourAttr, tourFieldAttr } from '@/config/tourAnchors';
import { requestStartTour } from '@/components/tours/tourState';
import { useRunnableTourIds } from '@/components/tours/useTourOffers';
import { useCanRunLiveTour } from '@/components/tours/useCanRunLiveTour';
import { isTourRunnable } from '@/components/tours/publishedTours';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Sparty } from '@/components/sparty/Sparty';
import { useShowSparty } from '@/components/sparty/useShowSparty';

interface HelpGuidesTabProps {
  query: string;
  widgetType?: WidgetType;
  itemId?: string;
}

type HelpKindFilter = 'docs' | 'slides' | 'videos' | 'activities' | 'other';
type HelpChip = HelpKindFilter | 'tours';

const KIND_FILTERS: {
  id: HelpChip;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'docs', icon: FileText },
  { id: 'slides', icon: Presentation },
  { id: 'videos', icon: Play },
  { id: 'activities', icon: GraduationCap },
  { id: 'other', icon: Link2 },
  { id: 'tours', icon: Footprints },
];

const kindOf = (item: HelpResourceItem): HelpKindFilter => {
  if (item.kind === 'guided-learning') return 'activities';
  if (item.embedType === 'youtube') return 'videos';
  if (item.embedType === 'doc') return 'docs';
  if (item.embedType === 'slides') return 'slides';
  return 'other';
};

const KIND_ICONS: Record<
  HelpKindFilter,
  React.ComponentType<{ className?: string }>
> = {
  docs: FileText,
  slides: Presentation,
  videos: Play,
  activities: GraduationCap,
  other: Link2,
};

const widgetLabel = (type: WidgetType): string =>
  TOOLS.find((tool) => tool.type === type)?.label ?? type;

export const HelpGuidesTab: React.FC<HelpGuidesTabProps> = ({
  query,
  widgetType,
  itemId,
}) => {
  const { t } = useTranslation();
  const showSparty = useShowSparty();
  const { orgId, isAdmin, canAccessFeature } = useAuth();
  const liveTours = canAccessFeature('gl-live-tours');
  const tourSetIds = useLiveTourSetIds(liveTours);
  const canRunLive = useCanRunLiveTour();
  const isMobile = useIsMobile();
  const { organization } = useOrganization(orgId);
  const { items, categories, loading } = useHelpResources({
    includeHidden: false,
  });
  // A shared link names one resource; open it once the list has loaded.
  const [pendingItemId, setPendingItemId] = useState(itemId);
  const [trackedItemId, setTrackedItemId] = useState(itemId);
  if (trackedItemId !== itemId) {
    setTrackedItemId(itemId);
    setPendingItemId(itemId);
  }
  const linked =
    pendingItemId && !loading
      ? items.find((item) => item.id === pendingItemId)
      : undefined;
  const linkedSetId =
    linked?.kind === 'guided-learning' ? (linked.setId ?? null) : null;
  // Badge only tours whose published snapshot runs, so the badge never promises a draft.
  const runnableTourIds = useRunnableTourIds(
    items.flatMap((item) =>
      item.kind === 'guided-learning' &&
      item.setId &&
      (tourSetIds.has(item.setId) || item.setId === linkedSetId)
        ? [item.setId]
        : []
    ),
    liveTours
  );
  const isTour = (item: HelpResourceItem): boolean =>
    item.kind === 'guided-learning' &&
    !!item.setId &&
    runnableTourIds.has(item.setId);
  const [categoryId, setCategoryId] = useState('all');
  const [kinds, setKinds] = useState<HelpChip[]>([]);
  const [openItem, setOpenItem] = useState<HelpResourceItem | null>(null);
  const returnFocusId = useRef<string | null>(null);
  const [widgetFilter, setWidgetFilter] = useState<WidgetType | undefined>(
    widgetType
  );
  // Adjusting state while rendering: a new deep link must re-apply its widget filter.
  const [trackedWidgetType, setTrackedWidgetType] = useState(widgetType);
  if (trackedWidgetType !== widgetType) {
    setTrackedWidgetType(widgetType);
    setWidgetFilter(widgetType);
    setOpenItem(null);
  }
  // A linked live tour waits for its published state and the board, then runs instead of opening.
  const linkedRunnable =
    liveTours && linkedSetId ? isTourRunnable(linkedSetId) : false;
  const linkedTourId =
    linkedRunnable === true && canRunLive ? linkedSetId : null;
  const linkedWaiting =
    linkedRunnable === undefined ||
    (linkedRunnable && !canRunLive && !isMobile);
  const [linkStart, setLinkStart] = useState<{
    itemId: string;
    setId: string;
  } | null>(null);
  if (pendingItemId && linkedTourId) {
    setPendingItemId(undefined);
    setLinkStart({ itemId: pendingItemId, setId: linkedTourId });
  } else if (pendingItemId && !loading && !linkedWaiting) {
    setPendingItemId(undefined);
    if (linked) setOpenItem(linked);
  }
  // Dispatching starts the runner and closes Help, so it waits for commit.
  useEffect(() => {
    if (!linkStart) return;
    void incrementHelpOpenCount(linkStart.itemId);
    requestStartTour({ setId: linkStart.setId });
  }, [linkStart]);

  const categoryName = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c.name]));
    return (id: string) => byId.get(id) ?? id;
  }, [categories]);

  const scopedItems = useMemo(
    () =>
      widgetFilter
        ? items.filter((item) => item.widgetTypes.includes(widgetFilter))
        : items,
    [items, widgetFilter]
  );

  const visibleCategories = useMemo(
    () =>
      categories.filter((category) =>
        scopedItems.some((item) => item.categoryId === category.id)
      ),
    [categories, scopedItems]
  );

  const fuse = useMemo(
    () =>
      new Fuse(
        scopedItems.map((item) => ({
          item,
          title: item.title,
          description: item.description,
          category: categoryName(item.categoryId),
        })),
        {
          keys: ['title', 'description', 'category'],
          threshold: 0.35,
          ignoreLocation: true,
        }
      ),
    [scopedItems, categoryName]
  );

  const trimmedQuery = query.trim();
  const searched = useMemo(
    () =>
      trimmedQuery
        ? fuse.search(trimmedQuery).map((result) => result.item.item)
        : scopedItems,
    [fuse, trimmedQuery, scopedItems]
  );

  // A category that loses all its items (snapshot change, kind chips, widget filter) falls back to All.
  const effectiveCategoryId =
    categoryId !== 'all' &&
    !visibleCategories.some((category) => category.id === categoryId)
      ? 'all'
      : categoryId;

  const filtered = searched.filter((item) => {
    if (
      effectiveCategoryId !== 'all' &&
      item.categoryId !== effectiveCategoryId
    )
      return false;
    if (
      kinds.length > 0 &&
      !kinds.includes(kindOf(item)) &&
      !(kinds.includes('tours') && isTour(item))
    )
      return false;
    return true;
  });

  const openCard = (item: HelpResourceItem) => {
    if (canRunLive && isTour(item) && item.setId) {
      void incrementHelpOpenCount(item.id);
      requestStartTour({ setId: item.setId });
      return;
    }
    returnFocusId.current = item.id;
    setOpenItem(item);
  };

  const closeItem = () => setOpenItem(null);

  // DOM focus restore: return focus to the card that opened the viewer.
  useEffect(() => {
    if (openItem || !returnFocusId.current) return;
    const id = returnFocusId.current;
    returnFocusId.current = null;
    document
      .querySelector<HTMLButtonElement>(
        `[data-help-item-id="${CSS.escape(id)}"]`
      )
      ?.focus();
  }, [openItem]);

  const toggleKind = (kind: HelpChip) =>
    setKinds((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]
    );

  if (openItem) {
    return <HelpResourceViewer item={openItem} onBack={closeItem} />;
  }

  // The tours chip shows only while some guide in view is a tour.
  const hasTours = scopedItems.some(isTour);
  const chips = KIND_FILTERS.filter(
    ({ id }) => id !== 'tours' || hasTours || kinds.includes('tours')
  );

  const categoryOptions = [
    { id: 'all', name: t('helpCenter.guides.allCategories') },
    ...visibleCategories.map((c) => ({ id: c.id, name: c.name })),
  ];

  return (
    <div className="flex flex-col md:flex-row gap-5 min-h-0 min-w-0">
      <nav
        aria-label={t('helpCenter.guides.categories')}
        className="hidden md:flex md:w-48 shrink-0 flex-col gap-1"
      >
        {categoryOptions.map((category) => (
          <button
            key={category.id}
            type="button"
            aria-pressed={effectiveCategoryId === category.id}
            onClick={() => setCategoryId(category.id)}
            className={`px-3 py-2 rounded-lg text-sm font-semibold text-left transition-colors ${
              effectiveCategoryId === category.id
                ? 'bg-brand-blue-primary/10 text-brand-blue-primary'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            {...tourFieldAttr(
              'help-center.guides.category',
              'help',
              category.id
            )}
          >
            {category.name}
          </button>
        ))}
      </nav>

      <div className="md:hidden">
        <label className="sr-only" htmlFor="help-guides-category">
          {t('helpCenter.guides.categories')}
        </label>
        <select
          id="help-guides-category"
          value={effectiveCategoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-800"
          {...tourAttr('help-center.guides.category-select')}
        >
          {categoryOptions.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {chips.map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={kinds.includes(id)}
              onClick={() => toggleKind(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                kinds.includes(id)
                  ? 'border-brand-blue-primary bg-brand-blue-primary/10 text-brand-blue-primary'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
              {...tourFieldAttr('help-center.guides.kind-filter', 'help', id)}
            >
              <Icon className="w-3.5 h-3.5" />
              {t(`helpCenter.guides.kinds.${id}`)}
            </button>
          ))}
          {widgetFilter && (
            <button
              type="button"
              onClick={() => setWidgetFilter(undefined)}
              aria-label={t('helpCenter.guides.clearWidgetFilter')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-brand-blue-primary bg-brand-blue-primary/10 text-xs font-semibold text-brand-blue-primary"
              {...tourAttr('help-center.guides.clear-widget-filter')}
            >
              {widgetLabel(widgetFilter)}
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            {showSparty ? (
              <Sparty pose="think" size={64} decorative />
            ) : (
              <Loader2 className="w-5 h-5 animate-spin" />
            )}
          </div>
        ) : items.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">
            {t('helpCenter.guides.empty')}
          </p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16">
            {showSparty && <Sparty pose="oops" size={64} decorative />}
            <p className="text-center text-sm text-slate-500">
              {t('helpCenter.guides.noMatches')}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((item, index) => {
              const Icon = KIND_ICONS[kindOf(item)];
              return (
                <li key={item.id} className="relative">
                  <button
                    type="button"
                    onClick={() => openCard(item)}
                    data-help-item-id={item.id}
                    className={`w-full flex items-start gap-3 text-left rounded-lg border border-slate-200 bg-white px-3 py-3 hover:border-brand-blue-light hover:bg-slate-50 transition-colors ${
                      isAdmin ? 'pr-12' : ''
                    }`}
                    {...tourFieldAttr(
                      'help-center.guides.item',
                      'help',
                      `row-${index + 1}`
                    )}
                  >
                    <Icon className="w-4 h-4 mt-0.5 shrink-0 text-slate-500" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-slate-900">
                        {item.title}
                      </span>
                      {item.description && (
                        <span className="block text-xs text-slate-500 mt-0.5">
                          {item.description}
                        </span>
                      )}
                      {item.widgetTypes.length > 0 && (
                        <span className="mt-1.5 flex flex-wrap gap-1">
                          {item.widgetTypes.map((type) => (
                            <span
                              key={type}
                              className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px]"
                            >
                              {widgetLabel(type)}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                    {isTour(item) && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-slate-200 text-slate-700 text-[11px] font-semibold shrink-0">
                        <Footprints className="w-3 h-3" aria-hidden="true" />
                        {t('helpCenter.guides.liveTourBadge')}
                      </span>
                    )}
                    {item.orgId && (
                      <span className="px-2 py-0.5 rounded-full bg-brand-blue-primary/10 text-brand-blue-primary text-[11px] shrink-0">
                        {organization?.shortName ??
                          organization?.name ??
                          t('helpCenter.guides.orgBadge')}
                      </span>
                    )}
                  </button>
                  <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
                    <HelpCopyLinkButton item={item} variant="icon" />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
