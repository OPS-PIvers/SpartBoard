// Widget widths (px) below which the color row, then the tool group, fold into popovers.
export const ANNOTATE_TOOLBAR_FULL_MIN_W = 360;
export const ANNOTATE_TOOLBAR_TOOLS_MIN_W = 240;

export type AnnotateToolbarLayout = 'full' | 'colors-collapsed' | 'compact';

export const getAnnotateToolbarLayout = (
  availableWidth: number
): AnnotateToolbarLayout => {
  if (availableWidth >= ANNOTATE_TOOLBAR_FULL_MIN_W) return 'full';
  if (availableWidth >= ANNOTATE_TOOLBAR_TOOLS_MIN_W) return 'colors-collapsed';
  return 'compact';
};
