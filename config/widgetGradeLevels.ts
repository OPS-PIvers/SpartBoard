import {
  WidgetType,
  GradeLevel,
  GradeFilter,
  InternalToolType,
  FeaturePermission,
} from '../types';

export const ALL_GRADE_LEVELS: GradeLevel[] = ['k-2', '3-5', '6-8', '9-12'];

/**
 * WIDGET GRADE LEVEL CONFIGURATION
 *
 * This file defines which grade levels each widget is intended for.
 * Teachers will be able to filter widgets by grade level in the sidebar.
 *
 * Grade Levels:
 * - 'k-2': Kindergarten through 2nd grade
 * - '3-5': 3rd through 5th grade
 * - '6-8': 6th through 8th grade (middle school)
 * - '9-12': 9th through 12th grade (high school)
 *
 * Instructions:
 * - To change a widget's grade levels, simply edit the array for that widget
 * - A widget can have multiple grade levels: ['k-2', '3-5'] means it shows in both filters
 * - Each grade level will be displayed as a separate chip in the UI
 * - Use ALL_GRADE_LEVELS for widgets appropriate for all grades
 */
export const WIDGET_GRADE_LEVELS: Record<
  WidgetType | InternalToolType,
  GradeLevel[]
> = {
  url: ALL_GRADE_LEVELS,
  soundboard: ALL_GRADE_LEVELS,
  // Clock & Time Tools
  clock: ALL_GRADE_LEVELS,
  'time-tool': ALL_GRADE_LEVELS,

  // Classroom Management
  traffic: ['k-2', '3-5'],
  expectations: ALL_GRADE_LEVELS,
  sound: ALL_GRADE_LEVELS,

  // Content & Communication
  text: ALL_GRADE_LEVELS,
  checklist: ALL_GRADE_LEVELS,
  qr: ['6-8', '9-12'],

  // Random & Fun
  random: ALL_GRADE_LEVELS,
  dice: ['k-2', '3-5'],

  // Creative Tools
  drawing: ['k-2', '3-5'],
  webcam: ALL_GRADE_LEVELS,

  // Academic Tools
  poll: ['6-8', '9-12'],
  'activity-wall': ALL_GRADE_LEVELS,
  scoreboard: ALL_GRADE_LEVELS,
  embed: ['6-8', '9-12'],

  // Planning & Organization
  schedule: ALL_GRADE_LEVELS,
  calendar: ALL_GRADE_LEVELS,
  weather: ALL_GRADE_LEVELS,
  lunchCount: ['k-2', '3-5'],
  classes: ALL_GRADE_LEVELS,
  instructionalRoutines: ALL_GRADE_LEVELS,
  miniApp: ALL_GRADE_LEVELS,
  materials: ALL_GRADE_LEVELS,
  stickers: ALL_GRADE_LEVELS,
  sticker: [],
  'seating-chart': ALL_GRADE_LEVELS,
  catalyst: ALL_GRADE_LEVELS,
  'catalyst-instruction': [],
  'catalyst-visual': [],
  smartNotebook: ALL_GRADE_LEVELS,
  recessGear: ['k-2', '3-5'],
  pdf: ALL_GRADE_LEVELS,
  quiz: ALL_GRADE_LEVELS,
  'talking-tool': ALL_GRADE_LEVELS,
  breathing: ALL_GRADE_LEVELS,
  record: ALL_GRADE_LEVELS,
  magic: ALL_GRADE_LEVELS,
  remote: ALL_GRADE_LEVELS,
  mathTools: ALL_GRADE_LEVELS,
  mathTool: [],
  nextUp: ALL_GRADE_LEVELS,
  onboarding: ALL_GRADE_LEVELS,
  countdown: ALL_GRADE_LEVELS,
  music: ALL_GRADE_LEVELS,
  'car-rider-pro': ALL_GRADE_LEVELS,
  'first-5': ALL_GRADE_LEVELS,
  'specialist-schedule': ['k-2', '3-5', '6-8'],
  'graphic-organizer': ['k-2', '3-5', '6-8'],
  'concept-web': ['k-2', '3-5', '6-8', '9-12'],
  'reveal-grid': ALL_GRADE_LEVELS,
  numberLine: ALL_GRADE_LEVELS,
  'syntax-framer': ALL_GRADE_LEVELS,
  'hotspot-image': ALL_GRADE_LEVELS,
  'starter-pack': ALL_GRADE_LEVELS,
  'video-activity': ALL_GRADE_LEVELS,
  'guided-learning': ALL_GRADE_LEVELS,
  'custom-widget': ALL_GRADE_LEVELS,
  'work-symbols': ALL_GRADE_LEVELS,
  'blooms-taxonomy': ALL_GRADE_LEVELS,
  'blooms-detail': ALL_GRADE_LEVELS,
  'need-do-put-then': ALL_GRADE_LEVELS,
  stations: ALL_GRADE_LEVELS,
};

/**
 * Helper function to get grade levels for a specific widget type
 */
export function getWidgetGradeLevels(
  widgetType: WidgetType | InternalToolType
): GradeLevel[] {
  const levels = WIDGET_GRADE_LEVELS[widgetType];

  // Development-mode warning for missing widget configuration
  if (!levels && process.env.NODE_ENV === 'development') {
    console.warn(
      `Widget "${widgetType}" is missing from WIDGET_GRADE_LEVELS configuration. Defaulting to ALL_GRADE_LEVELS.`
    );
  }

  // Gracefully handle migration by filtering out any "universal" strings if they persist in data/cache
  const safeLevels = (levels || ALL_GRADE_LEVELS).filter(
    (l) => l !== ('universal' as string)
  );

  // If filtered result is empty (was only universal) or was missing, default to all
  if (safeLevels.length === 0) return ALL_GRADE_LEVELS;

  return safeLevels;
}

/**
 * Returns true when a widget should be visible to a user whose buildings
 * resolve to `userGradeLevels`. Empty `userGradeLevels` means "no building
 * filter" — all widgets match.
 *
 * The admin override in `featurePermissions[].gradeLevels` only narrows
 * visibility when it is non-empty. An empty array is treated as "no override"
 * so an accidental deselect-all in Feature Permissions cannot hide a widget
 * from every user with a non-empty grade set.
 */
export function matchesUserBuilding(
  type: WidgetType | InternalToolType,
  userGradeLevels: GradeLevel[],
  featurePermissions: FeaturePermission[]
): boolean {
  if (userGradeLevels.length === 0) return true;
  const permission = featurePermissions.find((p) => p.widgetType === type);
  const permLevels = permission?.gradeLevels;
  const levels =
    permLevels && permLevels.length > 0
      ? permLevels
      : getWidgetGradeLevels(type);
  return levels.some((l) => userGradeLevels.includes(l));
}

/**
 * Helper function to check if a widget matches a grade level filter
 *
 * Filter behavior:
 * - 'all': Shows all widgets
 * - 'k-2': Shows widgets tagged with 'k-2'
 * - '3-5': Shows widgets tagged with '3-5'
 * - '6-8': Shows widgets tagged with '6-8'
 * - '9-12': Shows widgets tagged with '9-12'
 */
export function widgetMatchesGradeFilter(
  widgetType: WidgetType | InternalToolType,
  filter: GradeFilter
): boolean {
  if (filter === 'all') return true;

  const levels = getWidgetGradeLevels(widgetType);

  // Direct match check (since universal is gone, we just check inclusion)
  return levels.includes(filter);
}
