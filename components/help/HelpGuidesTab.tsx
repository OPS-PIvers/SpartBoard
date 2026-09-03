import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Fuse from 'fuse.js';
import {
  FileText,
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
import { useHelpResources } from '@/hooks/useHelpResources';
import { useOrganization } from '@/hooks/useOrganization';
import { HelpResourceViewer } from './HelpResourceViewer';

interface HelpGuidesTabProps {
  query: string;
  widgetType?: WidgetType;
}

type HelpKindFilter = 'docs' | 'slides' | 'videos' | 'activities' | 'other';

const KIND_FILTERS: {
  id: HelpKindFilter;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'docs', icon: FileText },
  { id: 'slides', icon: Presentation },
  { id: 'videos', icon: Play },
  { id: 'activities', icon: GraduationCap },
  { id: 'other', icon: Link2 },
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
}) => {
  const { t } = useTranslation();
  const { orgId } = useAuth();
  const { organization } = useOrganization(orgId);
  const { items, categories, loading } = useHelpResources({
    includeHidden: false,
  });
  const [categoryId, setCategoryId] = useState('all');
  const [kinds, setKinds] = useState<HelpKindFilter[]>([]);
  const [openItem, setOpenItem] = useState<HelpResourceItem | null>(null);
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

  const filtered = searched.filter((item) => {
    if (categoryId !== 'all' && item.categoryId !== categoryId) return false;
    if (kinds.length > 0 && !kinds.includes(kindOf(item))) return false;
    return true;
  });

  const toggleKind = (kind: HelpKindFilter) =>
    setKinds((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]
    );

  if (openItem) {
    return (
      <HelpResourceViewer item={openItem} onBack={() => setOpenItem(null)} />
    );
  }

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
            aria-pressed={categoryId === category.id}
            onClick={() => setCategoryId(category.id)}
            className={`px-3 py-2 rounded-lg text-sm font-semibold text-left transition-colors ${
              categoryId === category.id
                ? 'bg-brand-blue-primary/10 text-brand-blue-primary'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
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
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-800"
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
          {KIND_FILTERS.map(({ id, icon: Icon }) => (
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
            >
              {widgetLabel(widgetFilter)}
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">
            {t('helpCenter.guides.empty')}
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">
            {t('helpCenter.guides.noMatches')}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filtered.map((item) => {
              const Icon = KIND_ICONS[kindOf(item)];
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setOpenItem(item)}
                    className="w-full flex items-start gap-3 text-left rounded-lg border border-slate-200 bg-white px-3 py-3 hover:border-brand-blue-light hover:bg-slate-50 transition-colors"
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
                    {item.orgId && (
                      <span className="px-2 py-0.5 rounded-full bg-brand-blue-primary/10 text-brand-blue-primary text-[11px] shrink-0">
                        {organization?.shortName ||
                          organization?.name ||
                          t('helpCenter.guides.orgBadge')}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
