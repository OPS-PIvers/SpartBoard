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

// Lazy load helper for named exports
const lazyNamed = (
  importFactory: () => Promise<Record<string, unknown>>,
  name: string
) => {
  return lazy(() =>
    importFactory().then((module) => ({
      default: module[name] as React.ComponentType<unknown>,
    }))
  );
};

// Fallback Settings (lazy loading for consistency)
const DefaultSettings = lazyNamed(
  () => import('./FallbackSettings'),
  'DefaultSettings'
);
const MiniAppSettings = lazyNamed(
  () => import('./FallbackSettings'),
  'MiniAppSettings'
);

export const WIDGET_COMPONENTS: Partial<Record<WidgetType, WidgetComponent>> = {
  clock: lazyNamed(() => import('./ClockWidget/Widget'), 'ClockWidget'),
  'time-tool': lazyNamed(
    () => import('./TimeTool/TimeToolWidget'),
    'TimeToolWidget'
  ),
  traffic: lazyNamed(
    () => import('./TrafficLightWidget'),
    'TrafficLightWidget'
  ),
  text: lazyNamed(() => import('./TextWidget'), 'TextWidget'),
  checklist: lazyNamed(() => import('./Checklist'), 'ChecklistWidget'),
  random: lazyNamed(() => import('./random/RandomWidget'), 'RandomWidget'),
  dice: lazyNamed(() => import('./DiceWidget'), 'Widget'),
  sound: lazyNamed(() => import('./SoundWidget'), 'SoundWidget'),
  webcam: lazyNamed(() => import('./WebcamWidget'), 'WebcamWidget'),
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
  catalyst: lazyNamed(() => import('./CatalystWidget'), 'CatalystWidget'),
  'catalyst-instruction': lazyNamed(
    () => import('./CatalystInstructionWidget'),
    'CatalystInstructionWidget'
  ),
  'catalyst-visual': lazyNamed(
    () => import('./CatalystVisualWidget'),
    'CatalystVisualWidget'
  ),
  smartNotebook: lazyNamed(
    () => import('./SmartNotebookWidget'),
    'SmartNotebookWidget'
  ),
  recessGear: lazyNamed(
    () => import('./RecessGear/Widget'),
    'RecessGearWidget'
  ),
  pdf: lazyNamed(() => import('./PdfWidget'), 'PdfWidget'),
  quiz: lazyNamed(() => import('./QuizWidget'), 'QuizWidget'),
  'talking-tool': lazyNamed(() => import('./TalkingTool'), 'TalkingToolWidget'),
  breathing: lazyNamed(
    () => import('./Breathing/BreathingWidget'),
    'BreathingWidget'
  ),
  mathTools: lazyNamed(() => import('./MathToolsWidget'), 'MathToolsWidget'),
  mathTool: lazyNamed(
    () => import('./MathToolInstanceWidget'),
    'MathToolInstanceWidget'
  ),
  nextUp: lazyNamed(() => import('./NextUp/Widget'), 'NextUpWidget'),
  onboarding: lazyNamed(() => import('./OnboardingWidget'), 'OnboardingWidget'),
  music: lazyNamed(() => import('./MusicWidget/index'), 'MusicWidget'),
  'car-rider-pro': lazyNamed(
    () => import('./CarRiderPro/Widget'),
    'CarRiderProWidget'
  ),
  'specialist-schedule': lazyNamed(
    () => import('./SpecialistSchedule'),
    'SpecialistScheduleWidget'
  ),
};

export const WIDGET_SETTINGS_COMPONENTS: Partial<
  Record<WidgetType, SettingsComponent>
> = {
  clock: lazyNamed(() => import('./ClockWidget/Settings'), 'ClockSettings'),
  text: lazyNamed(() => import('./TextWidget'), 'TextSettings'),
  checklist: lazyNamed(() => import('./Checklist'), 'ChecklistSettings'),
  random: lazyNamed(() => import('./random/RandomSettings'), 'RandomSettings'),
  dice: lazyNamed(() => import('./DiceWidget'), 'Settings'),
  sound: lazyNamed(() => import('./SoundWidget'), 'SoundSettings'),
  embed: lazyNamed(() => import('./Embed'), 'EmbedSettings'),
  drawing: lazyNamed(
    () => import('./DrawingWidget/Settings'),
    'DrawingSettings'
  ),
  qr: lazyNamed(() => import('./QRWidget'), 'QRSettings'),
  scoreboard: lazyNamed(() => import('./Scoreboard'), 'ScoreboardSettings'),
  webcam: lazyNamed(() => import('./WebcamWidget'), 'WebcamSettings'),
  calendar: lazyNamed(() => import('./Calendar/Settings'), 'CalendarSettings'),
  weather: lazyNamed(() => import('./Weather/Settings'), 'WeatherSettings'),
  lunchCount: lazyNamed(() => import('./LunchCount'), 'LunchCountSettings'),
  poll: lazyNamed(() => import('./PollWidget'), 'PollSettings'),
  instructionalRoutines: lazyNamed(
    () => import('./InstructionalRoutines/Settings'),
    'InstructionalRoutinesSettings'
  ),
  materials: lazyNamed(() => import('./MaterialsWidget'), 'MaterialsSettings'),
  miniApp: MiniAppSettings,
  'time-tool': lazyNamed(
    () => import('./TimeTool/TimeToolWidget'),
    'TimeToolSettings'
  ),
  'seating-chart': lazyNamed(
    () => import('./SeatingChart/Settings'),
    'SeatingChartSettings'
  ),
  catalyst: lazyNamed(() => import('./CatalystWidget'), 'CatalystSettings'),
  'catalyst-instruction': lazyNamed(
    () => import('./CatalystInstructionWidget'),
    'CatalystInstructionSettings'
  ),
  'catalyst-visual': lazyNamed(
    () => import('./CatalystVisualWidget'),
    'CatalystVisualSettings'
  ),
  smartNotebook: DefaultSettings,
  traffic: DefaultSettings,
  expectations: lazyNamed(
    () => import('./ExpectationsWidget'),
    'ExpectationsSettings'
  ),
  schedule: lazyNamed(() => import('./Schedule'), 'ScheduleSettings'),
  classes: DefaultSettings,
  recessGear: lazyNamed(
    () => import('./RecessGear/Settings'),
    'RecessGearSettings'
  ),
  pdf: lazyNamed(() => import('./PdfWidget'), 'PdfSettings'),
  quiz: lazyNamed(() => import('./QuizWidget'), 'QuizWidgetSettings'),
  breathing: lazyNamed(
    () => import('./Breathing/BreathingSettings'),
    'BreathingSettings'
  ),
  mathTools: lazyNamed(() => import('./MathToolsWidget'), 'MathToolsSettings'),
  mathTool: lazyNamed(
    () => import('./MathToolInstanceWidget'),
    'MathToolInstanceSettings'
  ),
  nextUp: lazyNamed(() => import('./NextUp/Settings'), 'NextUpSettings'),
  // onboarding has no settings panel
  music: lazyNamed(() => import('./MusicWidget/index'), 'MusicSettings'),
  'car-rider-pro': lazyNamed(
    () => import('./CarRiderPro/Settings'),
    'CarRiderProSettings'
  ),
  'specialist-schedule': lazyNamed(
    () => import('./SpecialistSchedule'),
    'SpecialistScheduleSettings'
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
    baseWidth: 300,
    baseHeight: 250,
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
    baseWidth: 600,
    baseHeight: 500,
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
  music: {
    baseWidth: 400,
    baseHeight: 80,
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
  'specialist-schedule': {
    baseWidth: 300,
    baseHeight: 400,
    canSpread: true,
    skipScaling: true,
    padding: 0,
  },
};
