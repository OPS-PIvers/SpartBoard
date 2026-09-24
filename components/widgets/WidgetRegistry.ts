/**
 * Widget Registry
 *
 * This file serves as the central directory for all widgets in the application.
 * It maps widget types (enums) to their respective React components for both
 * the main widget view and the settings panel.
 */

import React, { lazy } from 'react';
import {
  WidgetData,
  WidgetType,
  ScalingConfig,
  WidgetComponentProps,
} from '@/types';
import {
  attemptChunkReload,
  isChunkLoadError,
  neverResolvingPromise,
} from '@/utils/chunkLoadError';
import type { WidgetSettingsSchema } from '@/components/settings/schema/types';

// Component type definitions to ensure type safety
type SettingsComponentProps = {
  widget: WidgetData;
};

type WidgetComponent =
  | React.ComponentType<WidgetComponentProps>
  | React.LazyExoticComponent<React.ComponentType<WidgetComponentProps>>;
type SettingsComponent =
  | React.ComponentType<SettingsComponentProps>
  | React.LazyExoticComponent<React.ComponentType<SettingsComponentProps>>;

// Lazy load helper for named exports.
//
// If the dynamic import fails because the chunk no longer exists (the classic
// stale-deploy hazard — see utils/chunkLoadError.ts), trigger a one-shot
// full-page reload to pick up the new build. If reload was already attempted
// this session, re-throw so the surrounding LazyChunkErrorBoundary can render
// a scoped fallback UI.
const lazyNamed = (
  importFactory: () => Promise<Record<string, unknown>>,
  name: string
) => {
  return lazy(() =>
    importFactory()
      .then((module) => ({
        default: module[name] as React.ComponentType<unknown>,
      }))
      .catch((error: unknown) => {
        if (isChunkLoadError(error) && attemptChunkReload()) {
          // Reload kicked off; suspend forever so React keeps showing the
          // Suspense fallback until the reload completes.
          return neverResolvingPromise();
        }
        throw error;
      })
  );
};

/**
 * Maps widget types to their lazily-loaded React components.
 *
 * Note: This map is intentionally NOT exhaustive over all `WidgetType`s.
 * Some widget types are handled outside the registry pattern:
 *
 * - `sticker`: Handled by a hard-coded branch in `WidgetRenderer.tsx`
 *   (`if (widget.type === 'sticker') return <StickerItemWidget ... />`).
 *   `StickerItemWidget` is intentionally absent from this map. Do NOT
 *   add a `sticker` entry here without also removing the special-case
 *   branch in WidgetRenderer.
 *
 * Do not assume `WIDGET_COMPONENTS[widgetType]` is defined for every
 * `WidgetType` value — always handle the `undefined` case at call sites.
 */
export const WIDGET_COMPONENTS: Partial<Record<WidgetType, WidgetComponent>> = {
  url: lazyNamed(() => import('./UrlWidget/Widget'), 'UrlWidget'),
  soundboard: lazyNamed(
    () => import('./SoundboardWidget/Widget'),
    'SoundboardWidget'
  ),
  clock: lazyNamed(() => import('./ClockWidget/Widget'), 'ClockWidget'),
  'time-tool': lazyNamed(
    () => import('./TimeTool/TimeToolWidget'),
    'TimeToolWidget'
  ),
  traffic: lazy(() => import('./TrafficLightWidget')),
  text: lazyNamed(() => import('./TextWidget'), 'TextWidget'),
  checklist: lazyNamed(() => import('./Checklist'), 'ChecklistWidget'),
  random: lazyNamed(() => import('./random/RandomWidget'), 'RandomWidget'),
  dice: lazyNamed(() => import('./DiceWidget'), 'DiceWidget'),
  sound: lazyNamed(() => import('./SoundWidget'), 'SoundWidget'),
  webcam: lazyNamed(() => import('./Webcam'), 'WebcamWidget'),
  embed: lazyNamed(() => import('./Embed'), 'EmbedWidget'),
  drawing: lazyNamed(() => import('./DrawingWidget/Widget'), 'DrawingWidget'),
  qr: lazyNamed(() => import('./QRWidget'), 'QRWidget'),
  scoreboard: lazyNamed(() => import('./Scoreboard'), 'ScoreboardWidget'),
  expectations: lazyNamed(
    () => import('./ExpectationsWidget'),
    'ExpectationsWidget'
  ),
  poll: lazyNamed(() => import('./PollWidget'), 'PollWidget'),
  weather: lazyNamed(() => import('./Weather/Widget'), 'WeatherWidget'),
  schedule: lazyNamed(() => import('./Schedule'), 'ScheduleWidget'),
  calendar: lazyNamed(() => import('./Calendar/Widget'), 'CalendarWidget'),
  lunchCount: lazyNamed(() => import('./LunchCount'), 'LunchCountWidget'),
  classes: lazy(() => import('./Classes/ClassesWidget')), // Default export
  instructionalRoutines: lazyNamed(
    () => import('./InstructionalRoutines/Widget'),
    'InstructionalRoutinesWidget'
  ),
  miniApp: lazyNamed(() => import('./MiniApp/Widget'), 'MiniAppWidget'),
  materials: lazyNamed(() => import('./MaterialsWidget'), 'MaterialsWidget'),
  stickers: lazyNamed(
    () => import('./stickers/StickerBookWidget'),
    'StickerBookWidget'
  ),
  'seating-chart': lazyNamed(
    () => import('./SeatingChart/Widget'),
    'SeatingChartWidget'
  ),
  catalyst: lazyNamed(
    () => import('@/components/widgets/Catalyst'),
    'CatalystWidget'
  ),
  'catalyst-instruction': lazyNamed(
    () => import('@/components/widgets/Catalyst'),
    'CatalystInstructionWidget'
  ),
  'catalyst-visual': lazyNamed(
    () => import('@/components/widgets/Catalyst'),
    'CatalystVisualWidget'
  ),
  smartNotebook: lazyNamed(
    () => import('./SmartNotebook'),
    'SmartNotebookWidget'
  ),
  recessGear: lazyNamed(
    () => import('./RecessGear/Widget'),
    'RecessGearWidget'
  ),
  pdf: lazyNamed(() => import('./PdfWidget'), 'PdfWidget'),
  quiz: lazyNamed(() => import('./QuizWidget'), 'QuizWidget'),
  flashcards: lazyNamed(
    () => import('./Flashcards/Widget'),
    'FlashcardsWidget'
  ),
  'talking-tool': lazyNamed(() => import('./TalkingTool'), 'TalkingToolWidget'),
  breathing: lazyNamed(
    () => import('./Breathing/BreathingWidget'),
    'BreathingWidget'
  ),
  mathTools: lazyNamed(() => import('./MathTools'), 'MathToolsWidget'),
  mathTool: lazyNamed(
    () => import('./MathToolInstance/index'),
    'MathToolInstanceWidget'
  ),
  nextUp: lazyNamed(() => import('./NextUp/Widget'), 'NextUpWidget'),
  onboarding: lazyNamed(() => import('./Onboarding'), 'OnboardingWidget'),
  countdown: lazyNamed(() => import('./Countdown/Widget'), 'CountdownWidget'),
  music: lazyNamed(() => import('./MusicWidget/index'), 'MusicWidget'),
  'car-rider-pro': lazyNamed(
    () => import('./CarRiderPro/Widget'),
    'CarRiderProWidget'
  ),
  'blending-board': lazyNamed(
    () => import('./BlendingBoard/Widget'),
    'BlendingBoardWidget'
  ),
  'first-5': lazyNamed(() => import('./First5/Widget'), 'First5Widget'),
  'specialist-schedule': lazyNamed(
    () => import('./SpecialistSchedule'),
    'SpecialistScheduleWidget'
  ),
  'graphic-organizer': lazyNamed(
    () => import('./GraphicOrganizer/Widget'),
    'GraphicOrganizerWidget'
  ),
  'reveal-grid': lazyNamed(() => import('./RevealGrid'), 'Widget'),
  numberLine: lazyNamed(
    () => import('./NumberLine/Widget'),
    'NumberLineWidget'
  ),
  'syntax-framer': lazyNamed(
    () => import('./SyntaxFramer'),
    'SyntaxFramerWidget'
  ),
  'hotspot-image': lazyNamed(
    () => import('./HotspotImage'),
    'HotspotImageWidget'
  ),
  'concept-web': lazyNamed(
    () => import('./ConceptWeb/Widget'),
    'ConceptWebWidget'
  ),
  'starter-pack': lazyNamed(
    () => import('./StarterPack/Widget'),
    'StarterPackWidget'
  ),
  'video-activity': lazyNamed(
    () => import('./VideoActivityWidget/index'),
    'VideoActivityWidget'
  ),
  'guided-learning': lazyNamed(
    () => import('./GuidedLearning/index'),
    'GuidedLearningWidget'
  ),
  'custom-widget': lazyNamed(
    () => import('./CustomWidget/Widget'),
    'CustomWidgetWidget'
  ),
  'activity-wall': lazyNamed(
    () => import('./ActivityWall/Widget'),
    'ActivityWallWidget'
  ),
  'work-symbols': lazyNamed(
    () => import('./WorkSymbols/Widget'),
    'WorkSymbolsWidget'
  ),
  'blooms-taxonomy': lazyNamed(
    () => import('./BloomsTaxonomy/Widget'),
    'BloomsTaxonomyWidget'
  ),
  'blooms-detail': lazyNamed(
    () => import('./BloomsTaxonomy/DetailWidget'),
    'BloomsDetailWidget'
  ),
  'need-do-put-then': lazyNamed(
    () => import('./NeedDoPutThen/Widget'),
    'NeedDoPutThenWidget'
  ),
  stations: lazyNamed(() => import('./Stations/Widget'), 'StationsWidget'),
  projects: lazyNamed(() => import('./Projects/Widget'), 'ProjectsWidget'),
};

/**
 * Maps widget types to their flip-panel settings components (the back-face
 * shown when the user clicks the gear icon).
 *
 * Note: This map is intentionally NOT exhaustive over all `WidgetType`s.
 * Several widget types deliberately have no flip-panel settings component:
 *
 * - Every type registered in `WIDGET_SETTINGS_SCHEMAS`: its schema owns both
 *   Settings and Style drawer content, so it must not also be registered in
 *   either legacy component map below.
 * - `stickers`: All sticker configuration lives in the appearance panel
 *   (`StickerBookAppearanceSettings`, registered in
 *   `WIDGET_APPEARANCE_COMPONENTS`). The flip button is always rendered,
 *   so when users flip the widget the "Settings" tab shows the standard
 *   fallback face ("Standard settings available.") while the "Style" tab
 *   surfaces the actual sticker appearance controls.
 * - `blooms-detail`: Read-only companion widget spawned programmatically by
 *   `blooms-taxonomy`. All editing happens on the parent widget; the detail
 *   widget has no per-instance configuration.
 * - `sticker`: Decorative overlay — see the `WIDGET_COMPONENTS` JSDoc above
 *   for the full sticker special-case explanation.
 * - `onboarding`: One-time system widget with no user-configurable state
 *   (see inline comment below).
 *
 * Do not assume `WIDGET_SETTINGS_COMPONENTS[widgetType]` is defined for every
 * `WidgetType` — always handle the `undefined` case at call sites.
 */
// Settings-drawer schemas (modules, not components); populated per migrated widget.
export const WIDGET_SETTINGS_SCHEMAS: Partial<
  Record<WidgetType, () => Promise<WidgetSettingsSchema>>
> = {
  soundboard: () =>
    import('./SoundboardWidget/settings.schema').then((m) => m.default),
  dice: () => import('./DiceWidget/settings.schema').then((m) => m.default),
  sound: () => import('./SoundWidget/settings.schema').then((m) => m.default),
  webcam: () => import('./Webcam/settings.schema').then((m) => m.default),
  drawing: () =>
    import('./DrawingWidget/settings.schema').then((m) => m.default),
  text: () => import('./TextWidget/settings.schema').then((m) => m.default),
  embed: () => import('./Embed/settings.schema').then((m) => m.default),
  lunchCount: () =>
    import('./LunchCount/settings.schema').then((m) => m.default),
  clock: () => import('./ClockWidget/settings.schema').then((m) => m.default),
  'time-tool': () =>
    import('./TimeTool/settings.schema').then((m) => m.default),
  checklist: () => import('./Checklist/settings.schema').then((m) => m.default),
  weather: () => import('./Weather/settings.schema').then((m) => m.default),
  expectations: () =>
    import('./ExpectationsWidget/settings.schema').then((m) => m.default),
  random: () => import('./random/settings.schema').then((m) => m.default),
  url: () => import('./UrlWidget/settings.schema').then((m) => m.default),
  qr: () => import('./QRWidget/settings.schema').then((m) => m.default),
  scoreboard: () =>
    import('./Scoreboard/settings.schema').then((m) => m.default),
  calendar: () => import('./Calendar/settings.schema').then((m) => m.default),
  poll: () => import('./PollWidget/settings.schema').then((m) => m.default),
  instructionalRoutines: () =>
    import('./InstructionalRoutines/settings.schema').then((m) => m.default),
  flashcards: () =>
    import('./Flashcards/settings.schema').then((m) => m.default),
  'specialist-schedule': () =>
    import('./SpecialistSchedule/settings.schema').then((m) => m.default),
  'graphic-organizer': () =>
    import('./GraphicOrganizer/settings.schema').then((m) => m.default),
  'reveal-grid': () =>
    import('./RevealGrid/settings.schema').then((m) => m.default),
  numberLine: () =>
    import('./NumberLine/settings.schema').then((m) => m.default),
  'syntax-framer': () =>
    import('./SyntaxFramer/settings.schema').then((m) => m.default),
  'hotspot-image': () =>
    import('./HotspotImage/settings.schema').then((m) => m.default),
  'concept-web': () =>
    import('./ConceptWeb/settings.schema').then((m) => m.default),
  'starter-pack': () =>
    import('./StarterPack/settings.schema').then((m) => m.default),
  'video-activity': () =>
    import('./VideoActivityWidget/settings.schema').then((m) => m.default),
  'guided-learning': () =>
    import('./GuidedLearning/settings.schema').then((m) => m.default),
  countdown: () => import('./Countdown/settings.schema').then((m) => m.default),
  'work-symbols': () =>
    import('./WorkSymbols/settings.schema').then((m) => m.default),
  'blooms-taxonomy': () =>
    import('./BloomsTaxonomy/settings.schema').then((m) => m.default),
  'need-do-put-then': () =>
    import('./NeedDoPutThen/settings.schema').then((m) => m.default),
  stations: () => import('./Stations/settings.schema').then((m) => m.default),
  materials: () =>
    import('./MaterialsWidget/settings.schema').then((m) => m.default),
  'seating-chart': () =>
    import('./SeatingChart/settings.schema').then((m) => m.default),
  schedule: () => import('./Schedule/settings.schema').then((m) => m.default),
  recessGear: () =>
    import('./RecessGear/settings.schema').then((m) => m.default),
  pdf: () => import('./PdfWidget/settings.schema').then((m) => m.default),
  quiz: () => import('./QuizWidget/settings.schema').then((m) => m.default),
  breathing: () => import('./Breathing/settings.schema').then((m) => m.default),
  mathTools: () => import('./MathTools/settings.schema').then((m) => m.default),
  mathTool: () =>
    import('./MathToolInstance/settings.schema').then((m) => m.default),
  nextUp: () => import('./NextUp/settings.schema').then((m) => m.default),
  music: () => import('./MusicWidget/settings.schema').then((m) => m.default),
  'car-rider-pro': () =>
    import('./CarRiderPro/settings.schema').then((m) => m.default),
  'blending-board': () =>
    import('./BlendingBoard/settings.schema').then((m) => m.default),
  'first-5': () => import('./First5/settings.schema').then((m) => m.default),
  'custom-widget': () =>
    import('./CustomWidget/settings.schema').then((m) => m.default),
  catalyst: () => import('./Catalyst/settings.schema').then((m) => m.default),
  'catalyst-instruction': () =>
    import('@/components/settings/schema/noSettingsSchema').then(
      (m) => m.default
    ),
  'catalyst-visual': () =>
    import('@/components/settings/schema/noSettingsSchema').then(
      (m) => m.default
    ),
  smartNotebook: () =>
    import('./SmartNotebook/settings.schema').then((m) => m.default),
  miniApp: () => import('./MiniApp/settings.schema').then((m) => m.default),
  traffic: () =>
    import('@/components/settings/schema/noSettingsSchema').then(
      (m) => m.default
    ),
  classes: () =>
    import('@/components/settings/schema/noSettingsSchema').then(
      (m) => m.default
    ),
};

export const WIDGET_SETTINGS_COMPONENTS: Partial<
  Record<WidgetType, SettingsComponent>
> = {
  // onboarding has no settings panel
  'activity-wall': lazyNamed(
    () => import('./ActivityWall/Settings'),
    'ActivityWallSettings'
  ),
  'talking-tool': lazyNamed(
    () => import('./TalkingTool'),
    'TalkingToolSettings'
  ),
  projects: lazyNamed(() => import('./Projects/Settings'), 'ProjectsSettings'),
};

export const WIDGET_APPEARANCE_COMPONENTS: Partial<
  Record<WidgetType, SettingsComponent>
> = {
  // Populated per-widget in components/widgets/*/Settings.tsx
  'activity-wall': lazyNamed(
    () => import('./ActivityWall/Settings'),
    'ActivityWallAppearanceSettings'
  ),
  'talking-tool': lazyNamed(
    () => import('./TalkingTool'),
    'TalkingToolAppearanceSettings'
  ),
  stickers: lazyNamed(
    () => import('./stickers/StickerBookSettings'),
    'StickerBookAppearanceSettings'
  ),
  projects: lazyNamed(
    () => import('./Projects/Settings'),
    'ProjectsAppearanceSettings'
  ),
};

export const DEFAULT_SCALING_CONFIG: ScalingConfig = {
  baseWidth: 300,
  baseHeight: 200,
  canSpread: true,
};

/**
 * Widget Scaling Configuration
 *
 * Controls how each widget adapts to its container size via ScalableWidget.
 *
 * Key properties:
 *  - baseWidth / baseHeight: Reference dimensions used by ScalableWidget's
 *    CSS-transform scaling. When skipScaling is true these serve only as
 *    default size hints.
 *  - canSpread: When true, the widget is allowed to fill available space
 *    (CSS transform capped at 1×). When false, the widget is always rendered
 *    at base dimensions and CSS-scaled.
 *  - skipScaling: When true, ScalableWidget is bypassed entirely. The widget
 *    receives the real container dimensions and a CSS `container-type: size`
 *    wrapper so it can use flex/grid/container-query layouts natively. This is
 *    the preferred mode for widgets with responsive CSS layouts.
 *
 * Widgets that KEEP CSS-transform scaling (skipScaling omitted / false):
 *  - drawing   – Canvas relies on fixed coordinate space; CSS-transform
 *                preserves pixel-perfect rendering.
 *  - seating-chart – Uses absolute-positioned seat nodes; CSS-transform keeps
 *                    coordinates consistent.
 *  - sticker   – Decorative overlay; fixed size, no DraggableWindow wrapper.
 */
export const WIDGET_SCALING_CONFIG: Record<WidgetType, ScalingConfig> = {
  url: {
    baseWidth: 220,
    baseHeight: 180,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  soundboard: {
    baseWidth: 320,
    baseHeight: 280,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  clock: {
    baseWidth: 280,
    baseHeight: 140,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  'time-tool': {
    baseWidth: 420,
    baseHeight: 400,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  traffic: {
    baseWidth: 120,
    baseHeight: 320,
    canSpread: false,
    skipScaling: true,
    padding: 0,
  },
  text: {
    baseWidth: 400,
    baseHeight: 300,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  checklist: {
    baseWidth: 280,
    baseHeight: 300,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  random: {
    baseWidth: 300,
    baseHeight: 320,
    canSpread: true,
    skipScaling: true,
    padding: 4,
  },
  dice: {
    baseWidth: 240,
    baseHeight: 240,
    canSpread: false,
    skipScaling: true,
    padding: 0,
  },
  sound: {
    baseWidth: 300,
    baseHeight: 300,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  webcam: {
    baseWidth: 400,
    baseHeight: 300,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  embed: {
    baseWidth: 480,
    baseHeight: 350,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  drawing: {
    baseWidth: 400,
    baseHeight: 350,
    canSpread: true,
  },
  qr: {
    baseWidth: 200,
    baseHeight: 250,
    canSpread: false,
    skipScaling: true,
    padding: 0,
  },
  scoreboard: {
    baseWidth: 320,
    baseHeight: 200,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  expectations: {
    baseWidth: 320,
    baseHeight: 350,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  poll: {
    baseWidth: 300,
    baseHeight: 250,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  'activity-wall': {
    baseWidth: 520,
    baseHeight: 420,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  weather: {
    baseWidth: 250,
    baseHeight: 280,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  schedule: {
    baseWidth: 300,
    baseHeight: 350,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  calendar: {
    baseWidth: 300,
    baseHeight: 350,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  lunchCount: {
    baseWidth: 600,
    baseHeight: 400,
    canSpread: true,
    skipScaling: true,
  },
  classes: {
    baseWidth: 280,
    baseHeight: 360,
    canSpread: true,
    skipScaling: true,
  },
  instructionalRoutines: {
    baseWidth: 400,
    baseHeight: 480,
    canSpread: true,
    skipScaling: true,
  },
  miniApp: {
    baseWidth: 500,
    baseHeight: 600,
    canSpread: true,
    skipScaling: true,
  },
  materials: {
    baseWidth: 340,
    baseHeight: 340,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  stickers: {
    baseWidth: 600,
    baseHeight: 500,
    canSpread: true,
    skipScaling: true,
  },
  sticker: { baseWidth: 200, baseHeight: 200, canSpread: false },
  'seating-chart': {
    // Intentionally below the 900x650 WIDGET_DEFAULTS spawn size: this is the minimum-content reference for shrink scaling, not the spawn size.
    baseWidth: 600,
    baseHeight: 500,
    canSpread: true,
  },
  catalyst: {
    baseWidth: 450,
    baseHeight: 600,
    canSpread: true,
    skipScaling: true,
  },
  'catalyst-instruction': {
    baseWidth: 280,
    baseHeight: 350,
    canSpread: true,
    skipScaling: true,
  },
  'catalyst-visual': {
    baseWidth: 600,
    baseHeight: 400,
    canSpread: true,
    skipScaling: true,
  },
  smartNotebook: {
    baseWidth: 600,
    baseHeight: 500,
    canSpread: true,
    skipScaling: true,
  },
  recessGear: {
    baseWidth: 250,
    baseHeight: 280,
    canSpread: true,
    skipScaling: true,
  },
  pdf: {
    baseWidth: 600,
    baseHeight: 750,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  quiz: {
    baseWidth: 620,
    baseHeight: 560,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  'talking-tool': {
    baseWidth: 500,
    baseHeight: 450,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  breathing: {
    baseWidth: 400,
    baseHeight: 400,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  // Math Tools palette: uses container queries for responsive grid layout
  mathTools: {
    baseWidth: 420,
    baseHeight: 500,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  // Individual math tool: rendered without scaling so true-scale SVGs work correctly
  mathTool: {
    baseWidth: 480,
    baseHeight: 200,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  nextUp: {
    baseWidth: 350,
    baseHeight: 500,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  onboarding: {
    baseWidth: 380,
    baseHeight: 440,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  countdown: {
    baseWidth: 300,
    baseHeight: 250,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  music: {
    baseWidth: 340,
    baseHeight: 120,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  'car-rider-pro': {
    baseWidth: 450,
    baseHeight: 600,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  'blending-board': {
    baseWidth: 450,
    baseHeight: 600,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  'first-5': {
    baseWidth: 450,
    baseHeight: 600,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  'specialist-schedule': {
    baseWidth: 300,
    baseHeight: 400,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  'graphic-organizer': {
    baseWidth: 800,
    baseHeight: 600,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  'reveal-grid': {
    baseWidth: 600,
    baseHeight: 400,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  numberLine: {
    baseWidth: 700,
    baseHeight: 200,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  'concept-web': {
    baseWidth: 800,
    baseHeight: 600,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  'syntax-framer': {
    baseWidth: 500,
    baseHeight: 150,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  'hotspot-image': {
    baseWidth: 500,
    baseHeight: 400,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  'starter-pack': {
    baseWidth: 600,
    baseHeight: 500,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  'video-activity': {
    baseWidth: 640,
    baseHeight: 560,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  'guided-learning': {
    baseWidth: 720,
    baseHeight: 520,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  flashcards: {
    baseWidth: 720,
    baseHeight: 520,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  'custom-widget': {
    baseWidth: 400,
    baseHeight: 300,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  'work-symbols': {
    baseWidth: 300,
    baseHeight: 300,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  'blooms-taxonomy': {
    baseWidth: 450,
    baseHeight: 550,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  'blooms-detail': {
    baseWidth: 450,
    baseHeight: 300,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  'need-do-put-then': {
    baseWidth: 340,
    baseHeight: 320,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  stations: {
    baseWidth: 600,
    baseHeight: 420,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
  projects: {
    baseWidth: 540,
    baseHeight: 360,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
};
