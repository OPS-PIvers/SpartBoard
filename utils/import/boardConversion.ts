// Board from an imported page (docs/plans/IMPORT.md D11): AI picks a board template, the shared layout engine places it.
import type { WidgetType } from '@/types';
import {
  allowedWidgetTypes,
  placeTemplateLayout,
  type GeneratedWidget,
  type TemplateLayoutOptions,
} from '@/utils/ai';
import {
  convertWithAi,
  type BoardConversionResult,
  type ConversionInput,
} from './aiConversion';

export interface BoardPlan {
  title: string;
  widgets: GeneratedWidget[];
  truncated: boolean;
}

/** Runs the Board Conversion and places it for the teacher's screen; throws when nothing usable came back. */
export async function planBoardFromImport(
  input: ConversionInput,
  options: {
    screen: TemplateLayoutOptions['screen'];
    canUseWidget: (type: WidgetType) => boolean;
  },
  convert: (
    target: 'board',
    input: ConversionInput,
    opts: { allowedWidgets?: string[] }
  ) => Promise<BoardConversionResult> = convertWithAi
): Promise<BoardPlan> {
  const result = await convert('board', input, {
    allowedWidgets: allowedWidgetTypes(options.canUseWidget),
  });
  const widgets = placeTemplateLayout(result, options);
  if (widgets.length === 0) {
    throw new Error('No board could be planned from this.');
  }
  return { title: result.title, widgets, truncated: result.truncated };
}
