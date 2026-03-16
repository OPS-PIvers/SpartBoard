import React from 'react';
import * as Icons from 'lucide-react';
import { CatalystCategory, CatalystRoutine, CatalystConfig } from '@/types';
import { DEFAULT_CATALYST_CATEGORIES } from '@/config/catalystDefaults';
import { CATALYST_ROUTINES } from '@/config/catalystRoutines';

/**
 * Validates if a string is a safe icon URL (HTTPS or reasonable data URL)
 */
export const isSafeIconUrl = (value: string): boolean => {
  if (!value) return false;
  if (value.startsWith('data:')) {
    // Only allow data URLs that are clearly images and reasonably sized
    const MAX_DATA_URL_LENGTH = 100_000;
    return /^data:image\//i.test(value) && value.length <= MAX_DATA_URL_LENGTH;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * Renders an icon consistently, supporting both Lucide icon names and safe URLs.
 *
 * `size` accepts either a fixed pixel number (e.g. 24) or a CSS string for
 * container-query scaling (e.g. `'min(8cqw, 8cqh)'`).
 */
export const renderCatalystIcon = (
  iconName: string,
  size: number | string = 24,
  className: string = ''
): React.ReactElement => {
  const sizeStyle = { width: size, height: size };

  if (isSafeIconUrl(iconName)) {
    return (
      <img
        src={iconName}
        className={`object-contain ${className}`}
        alt=""
        style={sizeStyle}
        referrerPolicy="no-referrer"
        loading="lazy"
      />
    );
  }
  const IconComp =
    (Icons as unknown as Record<string, React.ElementType>)[iconName] ??
    Icons.Zap;
  return <IconComp style={sizeStyle} className={className} />;
};

/**
 * Merges default categories with custom overrides, excluding removed categories
 */
export const mergeCatalystCategories = (
  config: Partial<CatalystConfig>
): CatalystCategory[] => {
  const categoriesMap = new Map<string, CatalystCategory>();
  const removedCategoryIds = new Set(config.removedCategoryIds ?? []);

  // Start with defaults, excluding removed
  DEFAULT_CATALYST_CATEGORIES.forEach((c) => {
    if (!removedCategoryIds.has(c.id)) {
      categoriesMap.set(c.id, c);
    }
  });

  // Override/append with custom
  config.customCategories?.forEach((c) => categoriesMap.set(c.id, c));

  return Array.from(categoriesMap.values());
};

/**
 * Merges default routines with custom overrides, excluding removed routines
 */
export const mergeCatalystRoutines = (
  config: Partial<CatalystConfig>
): CatalystRoutine[] => {
  const routinesMap = new Map<string, CatalystRoutine>();
  const removedRoutineIds = new Set(config.removedRoutineIds ?? []);

  // Start with defaults, excluding removed
  CATALYST_ROUTINES.forEach((r) => {
    if (!removedRoutineIds.has(r.id)) {
      routinesMap.set(r.id, r);
    }
  });

  // Override/append with custom
  config.customRoutines?.forEach((r) => routinesMap.set(r.id, r));

  return Array.from(routinesMap.values());
};
