import React from 'react';

export interface SegmentedTab<K extends string = string> {
  key: K;
  label: string;
  icon?: React.ComponentType<{
    style?: React.CSSProperties;
    className?: string;
  }>;
  count?: number;
}

interface SegmentedTabsProps<K extends string = string> {
  tabs: SegmentedTab<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Collapse labels to icon-only (the caller measures width). */
  labelsHidden?: boolean;
  ariaLabel?: string;
}

/**
 * Segmented-pill tab control extracted from LibraryShell so the library and the
 * Quiz/VA results views share one tab component. Fully container-query scaled.
 */
export function SegmentedTabs<K extends string = string>({
  tabs,
  value,
  onChange,
  labelsHidden = false,
  ariaLabel,
}: SegmentedTabsProps<K>): React.ReactElement {
  return (
    <nav
      role="tablist"
      aria-label={ariaLabel}
      className="flex items-center rounded-xl bg-slate-200/50 min-w-0"
      style={{ padding: 'min(3px, 0.8cqmin)', gap: 'min(2px, 0.5cqmin)' }}
    >
      {tabs.map(({ key, label, icon: Icon, count }) => {
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-label={label}
            title={labelsHidden ? label : undefined}
            onClick={() => onChange(key)}
            className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-lg font-bold transition-colors ${
              selected
                ? 'bg-white text-brand-blue-dark shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
            style={{
              gap: 'min(6px, 1.5cqmin)',
              paddingInline: 'min(12px, 2.8cqmin)',
              paddingBlock: 'min(6px, 1.5cqmin)',
              fontSize: 'min(13px, 3.8cqmin)',
            }}
          >
            {Icon && (
              <Icon
                style={{
                  width: 'min(14px, 4cqmin)',
                  height: 'min(14px, 4cqmin)',
                }}
                className="shrink-0"
              />
            )}
            {!labelsHidden && <span>{label}</span>}
            {count != null && count > 0 && (
              <span
                className={`inline-flex items-center justify-center rounded-full font-bold leading-none ${
                  selected
                    ? 'bg-brand-blue-primary text-white'
                    : 'bg-slate-200/70 text-slate-600'
                }`}
                style={{
                  paddingInline: 'min(7px, 1.8cqmin)',
                  paddingBlock: 'min(2px, 0.5cqmin)',
                  fontSize: 'min(10px, 3cqmin)',
                }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
