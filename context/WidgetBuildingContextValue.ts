import { createContext } from 'react';

/**
 * The building whose defaults a board's widgets should read, when that is not
 * the viewer's own. Only the `/subs` portal sets it: a sub is not a member of
 * the teacher's buildings, so their own `selectedBuildings` cannot decide
 * which schedule, soundboard or specialist rotation a shared widget belongs to.
 */
export const WidgetBuildingOverrideContext = createContext<string | null>(null);
