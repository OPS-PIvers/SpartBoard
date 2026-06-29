import type { WidgetType } from '@/types';
import { TOOLS } from '@/config/tools';

const baseLabels: Record<string, string> = TOOLS.reduce(
  (acc, tool) => {
    acc[tool.type] = tool.label;
    return acc;
  },
  {} as Record<string, string>
);

// Partial<Record<WidgetType, string>>: key typos are compile errors (vs Record<string, string>).
// NOTE: RemoteWidgetCard.tsx has a parallel label map with shorter remote-friendly names — keep in sync.
const PROGRAMMATIC_WIDGET_LABELS: Partial<Record<WidgetType, string>> = {
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

// Record<string, string> not Record<WidgetType, string>: Firestore may include unknown future types.
export const WIDGET_LABELS: Record<string, string> = {
  ...baseLabels,
  ...PROGRAMMATIC_WIDGET_LABELS,
};
