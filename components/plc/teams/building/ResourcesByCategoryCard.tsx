// `resourcesByCategory` landing card (T26): the team's documents and admin-shared resources, grouped.

import React from 'react';
import {
  META,
  SectionHead,
  TextLink,
} from '@/components/plc/redesignMockup/ui';
import type { TeamCardProps } from '@/components/plc/teams/types';
import {
  PER_CATEGORY,
  useResourceCategories,
  type ResourceCategory,
} from './resourceCategories';

export const ResourcesByCategoryView: React.FC<{
  categories: ResourceCategory[];
  onAll?: () => void;
}> = ({ categories, onAll }) => (
  <>
    <SectionHead title="Resources">
      <TextLink onClick={onAll}>All resources</TextLink>
    </SectionHead>
    {categories.length === 0 ? (
      <p className={`${META} py-2`}>No Resources Yet</p>
    ) : (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        {categories.map((cat) => (
          <div key={cat.label} className="min-w-0">
            <p className="mb-1 text-xs font-semibold text-slate-600">
              {cat.label}
            </p>
            <ul className="divide-y divide-slate-100">
              {cat.items.slice(0, PER_CATEGORY).map((item) => (
                <li key={item.id} className="py-2">
                  <TextLink
                    className="max-w-full text-left text-sm"
                    onClick={() =>
                      item.url
                        ? window.open(item.url, '_blank', 'noopener,noreferrer')
                        : onAll?.()
                    }
                  >
                    {item.title}
                  </TextLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    )}
  </>
);

export default function ResourcesByCategoryCard({
  plc,
  onNavigate,
}: TeamCardProps) {
  const categories = useResourceCategories(plc.id);
  return (
    <ResourcesByCategoryView
      categories={categories}
      onAll={() => onNavigate?.('resources')}
    />
  );
}
