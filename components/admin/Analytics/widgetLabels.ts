import { TOOLS } from '@/config/tools';

/**
 * Human-readable labels for every WidgetType, used in the admin Analytics
 * widget-breakdown table.
 *
 * The base set is derived from the TOOLS array (the public dock catalogue).
 * Several WidgetType members are intentionally absent from TOOLS because they
 * are spawned programmatically rather than user-selectable from the dock;
 * those are listed explicitly below so they never fall back to raw type-ID
 * strings in the admin UI.
 *
 * Keep the explicit overrides section in sync with the WidgetType union in
 * types.ts whenever a new programmatic widget type is added.
 */
const baseLabels: Record<string, string> = TOOLS.reduce(
  (acc, tool) => {
    acc[tool.type] = tool.label;
    return acc;
  },
  {} as Record<string, string>
);

/**
 * Labels for WidgetType members that are NOT in the TOOLS dock catalogue.
 * These widgets are spawned programmatically and are never user-selectable.
 */
const PROGRAMMATIC_WIDGET_LABELS: Record<string, string> = {
  // Decorative overlay spawned by the Stickers widget
  sticker: 'Sticker (overlay)',
  // Sub-widgets spawned by the Catalyst widget
  'catalyst-instruction': 'Catalyst Instruction',
  'catalyst-visual': 'Catalyst Visual',
  // Single math tool spawned individually (vs mathTools container)
  mathTool: 'Math Tool',
  // One-time onboarding widget shown on first run
  onboarding: 'Onboarding',
  // Widget built using the Widget Builder AI
  'custom-widget': 'Custom Widget',
  // Read-only companion widget spawned by Bloom's Taxonomy
  'blooms-detail': "Bloom's Detail",
};

/**
 * Typed as `Record<string, string>` (not `Record<WidgetType, string>`) because
 * the analytics table receives raw type strings from Firestore which may
 * include unknown or future widget types not yet in the union.
 */
export const WIDGET_LABELS: Record<string, string> = {
  ...baseLabels,
  ...PROGRAMMATIC_WIDGET_LABELS,
};
