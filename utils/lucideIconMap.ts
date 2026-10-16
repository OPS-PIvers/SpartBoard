import React, { useSyncExternalStore } from 'react';

export type LucideIconMap = Readonly<Record<string, React.ElementType>>;

const EMPTY: LucideIconMap = {};
let loaded: LucideIconMap = EMPTY;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

/**
 * Fetches the full Lucide set on first use. The CJS build is a separate module graph, so the
 * thousands of icons nothing imports by name stay out of the startup bundle.
 */
export const loadLucideIconMap = (): Promise<void> => {
  pending ??= import('lucide-react/dist/cjs/lucide-react.js').then(
    (mod) => {
      // The CJS build arrives as `default` in the browser bundle and as named exports under Node.
      const ns = mod as unknown as LucideIconMap & { default?: LucideIconMap };
      loaded = ns.default && 'Rocket' in ns.default ? ns.default : ns;
      listeners.forEach((notify) => notify());
    },
    () => {
      pending = null;
    }
  );
  return pending;
};

const subscribe = (notify: () => void) => {
  listeners.add(notify);
  void loadLucideIconMap();
  return () => {
    listeners.delete(notify);
  };
};

/** Every Lucide export by name; empty until the set has loaded. */
export const useLucideIconMap = (): LucideIconMap =>
  useSyncExternalStore(
    subscribe,
    () => loaded,
    () => EMPTY
  );

export const getLoadedLucideIconMap = (): LucideIconMap => loaded;

const namedIcons = new Map<React.ElementType, Map<string, React.ElementType>>();

/** A stable icon component that shows `fallback` until the named icon has loaded. */
export const getNamedLucideIcon = (
  name: string | undefined,
  fallback: React.ElementType
): React.ElementType => {
  if (!name) return fallback;
  let byName = namedIcons.get(fallback);
  if (!byName) {
    byName = new Map();
    namedIcons.set(fallback, byName);
  }
  let icon = byName.get(name);
  if (!icon) {
    const NamedIcon = (props: Record<string, unknown>) => {
      const map = useLucideIconMap();
      return React.createElement(map[name] ?? fallback, props);
    };
    NamedIcon.displayName = `LucideIcon(${name})`;
    icon = NamedIcon;
    byName.set(name, icon);
  }
  return icon;
};

const nameCache = new WeakMap<LucideIconMap, string[]>();

/** Sorted names of every Lucide export usable as an icon. */
export const getLucideIconNames = (map: LucideIconMap): string[] => {
  let names = nameCache.get(map);
  if (!names) {
    const ignoredKeys = new Set(['createLucideIcon', 'Icon']);
    names = Object.keys(map)
      .filter((name) => /^[A-Z]/.test(name) && !ignoredKeys.has(name))
      .sort((a, b) => a.localeCompare(b));
    nameCache.set(map, names);
  }
  return names;
};

type NamedLucideIconProps = {
  name?: string;
  fallback: React.ElementType;
} & Record<string, unknown>;

/** Renders the named Lucide icon, or `fallback` while the set loads or the name is unknown. */
export const NamedLucideIcon = ({
  name,
  fallback,
  ...props
}: NamedLucideIconProps) => {
  const map = useLucideIconMap();
  return React.createElement((name ? map[name] : undefined) ?? fallback, props);
};
