export type WidgetType =
  | 'clock'
  | 'traffic'
  | 'text'
  | 'checklist'
  | 'random'
  | 'dice'
  | 'sound'
  | 'drawing'
  | 'qr'
  | 'embed'
  | 'poll'
  | 'webcam'
  | 'scoreboard'
  | 'expectations'
  | 'weather'
  | 'schedule'
  | 'calendar'
  | 'lunchCount'
  | 'classes'
  | 'instructionalRoutines'
  | 'time-tool'
  | 'miniApp'
  | 'materials'
  | 'stickers'
  | 'sticker'
  | 'seating-chart'
  | 'catalyst'
  | 'catalyst-instruction'
  | 'catalyst-visual'
  | 'smartNotebook'
  | 'recessGear'
  | 'pdf'
  | 'quiz'
  | 'talking-tool'
  | 'breathing'
  | 'mathTools'
  | 'mathTool'
  | 'nextUp'
  | 'onboarding'
  | 'countdown'
  | 'car-rider-pro'
  | 'music'
  | 'specialist-schedule'
  | 'graphic-organizer'
  | 'concept-web'
  | 'reveal-grid'
  | 'numberLine'
  | 'syntax-framer'
  | 'hotspot-image'
  | 'starter-pack'
  | 'video-activity'
  | 'guided-learning'
  | 'custom-widget'
  | 'soundboard'
  | 'url'
  | 'activity-wall';

// --- ROSTER SYSTEM TYPES ---

export interface ClassLinkClass {
  sourcedId: string;
  title: string;
  classCode?: string;
  subject?: string;
}

export interface ClassLinkStudent {
  sourcedId: string;
  givenName: string;
  familyName: string;
  email: string;
}

export interface ClassLinkData {
  classes: ClassLinkClass[];
  studentsByClass: Record<string, ClassLinkStudent[]>;
}

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  /** Teacher-distributed join code used for live sessions and quizzes (zero-padded, e.g. "01") */
  pin: string;
}

/**
 * Shape of the Firestore roster document — contains NO student PII.
 * Student names/PII live exclusively in a Google Drive file (driveFileId).
 */
export interface ClassRosterMeta {
  id: string;
  name: string;
  /** Drive file ID for the JSON file containing Student[] */
  driveFileId: string | null;
  /** Denormalised count for UI display without loading Drive */
  studentCount: number;
  createdAt: number;
}

/**
 * In-memory roster shape (used by hooks and components).
 * Extends the Firestore metadata with the students array loaded from Drive.
 */
export interface ClassRoster extends ClassRosterMeta {
  students: Student[];
}

// --- LIVE SESSION TYPES ---

export interface LiveSession {
  id: string; // Usually the Teacher's User ID
  isActive: boolean;
  activeWidgetId: string | null;
  activeWidgetType: WidgetType | null;
  activeWidgetConfig?: WidgetConfig; // Config for the active widget
  background?: string; // Teacher's current dashboard background
  code: string; // A short 4-6 digit join code
  frozen: boolean; // Global freeze state
  createdAt: number;
}

export interface LiveStudent {
  id: string; // Unique ID for this session
  /** Student's roster PIN — replaces name to keep PII out of Firestore */
  pin: string;
  status: 'active' | 'frozen' | 'disconnected';
  joinedAt: number;
  lastActive: number;
}

// Supporting types for widget configs
export interface Point {
  x: number;
  y: number;
}

/**
 * Represents a position and span on a 12x12 spatial grid.
 */
export interface GridPosition {
  /** 0-11 (X-axis starting point) */
  col: number;
  /** 0-11 (Y-axis starting point) */
  row: number;
  /** 1-12 (Width in columns) */
  colSpan: number;
  /** 1-12 (Height in rows) */
  rowSpan: number;
}

export interface Path {
  points: Point[];
  color: string;
  width: number;
}

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface PollOption {
  id: string;
  label: string;
  votes: number;
}

export interface ScheduleItem {
  id?: string;
  /** @deprecated Use startTime instead. Falls back to startTime if not provided. */
  time?: string;
  task: string;
  done?: boolean;
  startTime?: string;
  endTime?: string;
  mode?: 'clock' | 'timer';
  linkedWidgets?: WidgetType[];
  spawnedWidgetIds?: string[];
  oneOffDate?: string; // YYYY-MM-DD: if set, item only shows on this specific date
}

export interface DailySchedule {
  id: string;
  name: string;
  items: ScheduleItem[];
  /** Days of the week this schedule is active (0 = Sunday, 1 = Monday, etc.) */
  days: number[];
}

export interface CalendarEvent {
  date: string;
  time?: string;
  title: string;
}

export type RoutineStructure = 'linear' | 'cycle' | 'visual-cue' | 'components';
export type RoutineAudience = 'student' | 'teacher';

export interface RoutineStep {
  id: string;
  text: string;
  icon?: string;
  stickerUrl?: string;
  imageUrl?: string;
  color?: string;
  attachedWidget?: {
    type: WidgetType;
    label: string;
    config: WidgetConfig;
  };
  label?: string;
}

// Widget-specific config types

export interface BuildingUrlDefaults {
  buildingId: string;
  urls?: {
    id: string;
    url: string;
    title?: string;
    color?: string;
  }[];
}

export interface UrlGlobalConfig {
  buildingDefaults?: Record<string, BuildingUrlDefaults>;
  dockDefaults?: Record<string, boolean>;
}

export interface UrlWidgetConfig {
  urls: {
    id: string;
    url: string;
    title?: string;
    color?: string;
  }[];
}

export interface ClockConfig {
  format24: boolean;
  showSeconds: boolean;
  themeColor?: string;
  fontFamily?: string;
  clockStyle?: string;
  glow?: boolean;
}

export interface TrafficConfig {
  active?: string;
}

export interface TextConfig {
  content: string;
  bgColor: string;
  fontSize: number;
  fontFamily?: string;
  fontColor?: string;
  verticalAlign?: 'top' | 'center' | 'bottom';
}

export interface ChecklistConfig {
  items: ChecklistItem[];
  scaleMultiplier?: number;
  mode: 'manual' | 'roster';
  rosterMode?: 'class' | 'custom';
  firstNames?: string;
  lastNames?: string;
  completedNames?: string[]; // Tracks IDs or Names checked in roster mode
  fontFamily?: string;
  cardColor?: string;
  cardOpacity?: number;
  fontColor?: string;
}

export interface RandomGroup {
  id?: string;
  names: string[];
}

export interface RandomConfig {
  firstNames: string;
  lastNames: string;
  mode: string;
  groupSize?: number;
  lastResult?: string | string[] | RandomGroup[] | null;
  soundEnabled?: boolean;
  remainingStudents?: string[];
  rosterMode?: 'class' | 'custom';
  autoStartTimer?: boolean;
  visualStyle?: 'flash' | 'slots' | 'wheel';
  externalTrigger?: number;
}

export interface DiceConfig {
  count: number;
  /** Last roll result persisted so remote rolls are reflected on the board. */
  lastRoll?: number[];
}

export interface SoundboardSound {
  id: string;
  label: string;
  url: string; // The sound URL (may be empty for synthesized sounds)
  color?: string; // Optional custom color for the button
  synthesized?: boolean; // If true, use Web Audio API synthesis instead of URL
}

export interface SoundboardConfig {
  selectedSoundIds: string[]; // IDs of sounds available in the pool (from settings)
  activeSoundIds?: string[]; // IDs currently shown as big buttons; defaults to selectedSoundIds
}

export interface SoundboardBuildingConfig {
  availableSounds: SoundboardSound[]; // Sounds configured by admin for this building
  enabledLibrarySoundIds?: string[]; // IDs from the standard library
}

export interface SoundboardGlobalConfig {
  buildingDefaults?: Record<string, SoundboardBuildingConfig>;
}

export interface SoundConfig {
  sensitivity: number;
  visual: 'thermometer' | 'speedometer' | 'line' | 'balls';
  autoTrafficLight?: boolean;
  trafficLightThreshold?: number;
  syncExpectations?: boolean;
}

export interface DrawingConfig {
  mode: 'window' | 'overlay';
  paths: Path[];
  color?: string;
  width?: number;
  customColors?: string[];
}

export interface QRConfig {
  url?: string;
  showUrl?: boolean;
  syncWithTextWidget?: boolean;
  qrColor?: string;
  qrBgColor?: string;
}

export interface EmbedConfig {
  url: string;
  mode?: string;
  html?: string;
  refreshInterval?: number;
  isEmbeddable?: boolean;
  blockedReason?: string;
  zoom?: number;
}

export interface BuildingPollDefaults {
  buildingId: string;
  question?: string;
  options?: PollOption[];
}

export interface PollGlobalConfig {
  buildingDefaults: Record<string, BuildingPollDefaults>;
}

export interface PollConfig {
  question: string;
  options: PollOption[];
}

export type ActivityWallMode = 'text' | 'photo';
export type ActivityWallIdentificationMode =
  | 'anonymous'
  | 'name'
  | 'pin'
  | 'name-pin';

export type ActivityWallArchiveStatus =
  | 'firebase'
  | 'syncing'
  | 'archived'
  | 'failed';

export interface ActivityWallSubmission {
  id: string;
  content: string;
  submittedAt: number;
  status: 'approved' | 'pending';
  participantLabel?: string;
  storagePath?: string;
  archiveStatus?: ActivityWallArchiveStatus;
  archiveStartedAt?: number;
  driveFileId?: string;
  archiveError?: string;
  archivedAt?: number;
}

export interface ActivityWallActivity {
  id: string;
  title: string;
  prompt: string;
  mode: ActivityWallMode;
  moderationEnabled: boolean;
  identificationMode: ActivityWallIdentificationMode;
  submissions: ActivityWallSubmission[];
  startedAt: number | null;
}

export interface ActivityWallBuildingConfig {
  defaultMode?: ActivityWallMode;
  defaultIdentificationMode?: ActivityWallIdentificationMode;
  defaultModerationEnabled?: boolean;
}

export interface ActivityWallGlobalConfig {
  buildingDefaults?: Record<string, ActivityWallBuildingConfig>;
  dockDefaults?: Record<string, boolean>;
}

export interface ActivityWallConfig {
  activities?: ActivityWallActivity[];
  activeActivityId?: string | null;
  draftActivity?: ActivityWallActivity;
}

export interface WebcamConfig {
  deviceId?: string;
  zoomLevel?: number;
  isMirrored?: boolean;
  autoSendToNotes?: boolean;
  isRemoteMode?: boolean;
  remoteCaptureDataUrl?: string;
  remoteCaptureTimestamp?: number;
}

export interface ScoreboardTeam {
  id: string;
  name: string;
  score: number;
  color?: string;
  linkedGroupId?: string;
}

export interface ScoreboardConfig {
  /** @deprecated use teams array instead */
  scoreA?: number;
  /** @deprecated use teams array instead */
  scoreB?: number;
  /** @deprecated use teams array instead */
  teamA?: string;
  /** @deprecated use teams array instead */
  teamB?: string;
  teams?: ScoreboardTeam[];
}

export interface ExpectationsConfig {
  voiceLevel: number | null; // 0, 1, 2, 3, or 4
  workMode: 'individual' | 'partner' | 'group' | null;
  interactionMode:
    | 'none'
    | 'respectful'
    | 'listening'
    | 'productive'
    | 'discussion'
    | null;
  instructionalRoutine?: string; // Legacy/K-8
  activeRoutines?: string[]; // New: 9-12 Multi-select
  layout?: 'secondary' | 'elementary';
  syncSoundWidget?: boolean;
}

export interface ExpectationsOptionOverride {
  enabled: boolean;
  customLabel?: string;
  customSub?: string;
}

export interface ExpectationsBuildingConfig {
  volumeOverrides?: Record<number, ExpectationsOptionOverride>;
  groupOverrides?: Record<string, ExpectationsOptionOverride>;
  interactionOverrides?: Record<string, ExpectationsOptionOverride>;
  showVolume?: boolean;
  showGroup?: boolean;
  showInteraction?: boolean;
}

export interface ExpectationsGlobalConfig {
  buildings: Record<string, ExpectationsBuildingConfig>;
}

export interface TalkingToolStem {
  id: string;
  text: string;
}

export interface TalkingToolCategory {
  id: string;
  label: string;
  color: string;
  icon: string;
  stems: TalkingToolStem[];
}

export interface TalkingToolGlobalConfig {
  categories?: TalkingToolCategory[];
}

export interface WeatherConfig {
  temp: number;
  condition: string;
  isAuto?: boolean;
  locationName?: string;
  lastSync?: number | null;
  city?: string;
  source?: 'openweather' | 'earth_networks';
  feelsLike?: number;
  showFeelsLike?: boolean;
  hideClothing?: boolean;
  syncBackground?: boolean;
  fontFamily?: string;
  fontColor?: string;
}

export interface WeatherTemperatureRange {
  id: string;
  min: number;
  max: number;
  type?: 'range' | 'above' | 'below';
  message: string;
  imageUrl?: string;
}

export interface WeatherGlobalConfig {
  fetchingStrategy: 'client' | 'admin_proxy';
  updateFrequencyMinutes: number;
  temperatureRanges: WeatherTemperatureRange[];
  source?: 'openweather' | 'earth_networks';
  city?: string;
  showFeelsLike?: boolean;
}

export interface RecessGearTemperatureRange {
  id: string;
  min: number;
  max: number;
  type?: 'range' | 'above' | 'below';
  label: string;
  icon?: string;
  imageUrl?: string;
  category: 'clothing' | 'footwear' | 'accessory';
}

export interface RecessGearGlobalConfig {
  fetchingStrategy: 'client' | 'admin_proxy';
  updateFrequencyMinutes: number;
  temperatureRanges: RecessGearTemperatureRange[];
  source?: 'openweather' | 'earth_networks';
  city?: string;
  useFeelsLike?: boolean;
}

export interface GlobalWeatherData {
  temp: number;
  feelsLike?: number;
  condition: string;
  locationName: string;
  updatedAt: number;
  source?: string;
}

export interface WebcamGlobalConfig {
  ocrMode?: 'standard' | 'gemini';
}

export interface BuildingScheduleDefaults {
  buildingId: string;
  items: ScheduleItem[];
  schedules?: DailySchedule[];
}

export interface ScheduleGlobalConfig {
  buildingDefaults: Record<string, BuildingScheduleDefaults>;
}

// --- Embed Global Config ---
export interface BuildingEmbedDefaults {
  buildingId: string;
  hideUrlField?: boolean;
  whitelistUrls?: string[];
}

export interface EmbedGlobalConfig {
  buildingDefaults: Record<string, BuildingEmbedDefaults>;
}

// --- Reveal Grid Global Config ---
export interface BuildingRevealGridDefaults {
  buildingId: string;
  columns?: 2 | 3 | 4 | 5;
  revealMode?: 'flip' | 'fade';
  fontFamily?: GlobalFontFamily;
  defaultCardColor?: string;
  defaultCardBackColor?: string;
}

export interface RevealGridGlobalConfig {
  buildingDefaults: Record<string, BuildingRevealGridDefaults>;
}

// --- Breathing Global Config ---
export interface BuildingBreathingDefaults {
  buildingId: string;
  pattern?: '4-4-4-4' | '4-7-8' | '5-5';
  visual?: 'circle' | 'lotus' | 'wave';
  color?: string;
}

export interface BreathingGlobalConfig {
  buildingDefaults: Record<string, BuildingBreathingDefaults>;
}

// --- Clock Global Config ---
export interface BuildingClockDefaults {
  buildingId: string;
  format24?: boolean;
  fontFamily?: string;
  themeColor?: string;
}

export interface ClockGlobalConfig {
  buildingDefaults: Record<string, BuildingClockDefaults>;
}

// --- TimeTool (Timer/Stopwatch) Global Config ---
export interface BuildingTimeToolDefaults {
  buildingId: string;
  duration?: number; // in seconds
  timerEndTrafficColor?: 'red' | 'yellow' | 'green' | null;
  timerEndTriggerRandom?: boolean;
  timerEndTriggerNextUp?: boolean;
}

export interface TimeToolGlobalConfig {
  buildingDefaults: Record<string, BuildingTimeToolDefaults>;
}

// --- Checklist Global Config ---
export interface ChecklistDefaultItem {
  id: string;
  text: string;
}

export interface BuildingChecklistDefaults {
  buildingId: string;
  items?: ChecklistDefaultItem[]; // Default item labels pre-populated on widget creation
  scaleMultiplier?: number;
}

export interface ChecklistGlobalConfig {
  buildingDefaults: Record<string, BuildingChecklistDefaults>;
}

// --- Sound Global Config ---
export interface BuildingSoundDefaults {
  buildingId: string;
  visual?: 'thermometer' | 'speedometer' | 'line' | 'balls';
  sensitivity?: number;
}

export interface SoundGlobalConfig {
  buildingDefaults: Record<string, BuildingSoundDefaults>;
}

// --- Note (text) Global Config ---
export interface BuildingNoteDefaults {
  buildingId: string;
  fontSize?: number;
  bgColor?: string;
}

export interface NoteGlobalConfig {
  buildingDefaults: Record<string, BuildingNoteDefaults>;
}

// --- Traffic Light Global Config ---
export interface BuildingTrafficLightDefaults {
  buildingId: string;
  active?: 'red' | 'yellow' | 'green' | null;
}

export interface TrafficLightGlobalConfig {
  buildingDefaults: Record<string, BuildingTrafficLightDefaults>;
}

// --- Random Global Config ---
export interface BuildingRandomDefaults {
  buildingId: string;
  visualStyle?: 'flash' | 'slots' | 'wheel';
  soundEnabled?: boolean;
}

export interface RandomGlobalConfig {
  buildingDefaults: Record<string, BuildingRandomDefaults>;
}

// --- Dice Global Config ---
export interface BuildingDiceDefaults {
  buildingId: string;
  count?: number; // Default number of dice (1-6)
}

export interface DiceGlobalConfig {
  buildingDefaults: Record<string, BuildingDiceDefaults>;
}

// --- Scoreboard Global Config ---
export interface ScoreboardDefaultTeam {
  id: string;
  name: string;
  color?: string;
}

export interface BuildingScoreboardDefaults {
  buildingId: string;
  teams?: ScoreboardDefaultTeam[];
}

export interface ScoreboardGlobalConfig {
  buildingDefaults: Record<string, BuildingScoreboardDefaults>;
}

// --- Drawing Global Config ---
export interface BuildingDrawingDefaults {
  buildingId: string;
  mode?: 'window' | 'overlay';
  width?: number;
  customColors?: string[];
}

export interface DrawingGlobalConfig {
  buildingDefaults: Record<string, BuildingDrawingDefaults>;
}

// --- QR Global Config ---
export interface BuildingQRDefaults {
  buildingId: string;
  defaultUrl?: string;
  qrColor?: string;
  qrBgColor?: string;
}

export interface QRGlobalConfig {
  buildingDefaults: Record<string, BuildingQRDefaults>;
}

// --- Materials Global Config ---
export interface BuildingMaterialsDefaults {
  buildingId: string;
  selectedItems?: string[]; // IDs of materials selected by default
}

export interface MaterialDefinition {
  id: string;
  label: string;
  icon: string;
  color: string;
  textColor?: string;
}

export interface MaterialsGlobalConfig {
  customMaterials?: MaterialDefinition[];
  buildingDefaults: Record<string, BuildingMaterialsDefaults>;
}

export interface CalendarGlobalEvent {
  id: string;
  date: string; // ISO Date string (YYYY-MM-DD)
  title: string;
}

export interface BuildingCalendarDefaults {
  buildingId: string;
  events: CalendarEvent[];
  googleCalendarIds?: string[];
  /** Latest events fetched from Google Calendar by an admin proxy */
  cachedEvents?: CalendarEvent[];
  /** Timestamp of the last successful proxy sync for this building */
  lastProxySync?: number;
}

export interface CalendarGlobalConfig {
  blockedDates: string[]; // Array of ISO Date strings (YYYY-MM-DD)
  buildingDefaults: Record<string, BuildingCalendarDefaults>;
  /** How often the admin proxy should refresh data (in hours) */
  updateFrequencyHours?: number;
  dockDefaults?: Record<string, boolean>;
}

export interface ScheduleConfig {
  /** @deprecated Use schedules instead. */
  items: ScheduleItem[];
  schedules?: DailySchedule[];
  localEvents?: CalendarEvent[];
  isBuildingSyncEnabled?: boolean;
  lastSyncedBuildingId?: string;
  fontFamily?: string;
  autoProgress?: boolean;
  /**
   * When true, the widget automatically scrolls to keep the active time slot
   * centered in the viewport, showing 1 completed + 1 active + 2 upcoming items.
   * Resets to the top each day as items re-activate based on the current time.
   */
  autoScroll?: boolean;
  /** Card background color as a hex string, e.g. '#ffffff'. Default: '#ffffff'. */
  cardColor?: string;
  /** Card background opacity, 0 (fully transparent) to 1 (fully opaque). Default: 1. */
  cardOpacity?: number;
}

export interface CalendarConfig {
  events: CalendarEvent[];
  isBuildingSyncEnabled?: boolean;
  lastSyncedBuildingId?: string;
  daysVisible?: number;
  /** Individual Google Calendar IDs added by the user */
  personalCalendarIds?: string[];
  fontFamily?: string;
  /** Card background color as a hex string, e.g. '#ffffff'. Default: '#ffffff'. */
  cardColor?: string;
  /** Card background opacity, 0 (fully transparent) to 1 (fully opaque). Default: 1. */
  cardOpacity?: number;
}

export interface LunchMenuDay {
  hotLunch: string;
  bentoBox: string;
  date: string; // ISO String
}

export interface LunchCountConfig {
  schoolSite:
    | 'schumann-elementary'
    | 'orono-intermediate-school'
    | 'orono-middle-school'
    | 'orono-high-school';
  cachedMenu?: LunchMenuDay | null;
  lastSyncDate?: string | null;
  isManualMode: boolean;
  manualHotLunch: string;
  manualBentoBox: string;
  roster: string[]; // List of student names
  assignments: Record<string, 'hot' | 'bento' | 'home' | null>;
  recipient?: string;
  syncError?: string | null; // To display E-SYNC-404 etc.
  rosterMode?: 'class' | 'custom';
  /** Hour portion of the lunch time (e.g. "11") */
  lunchTimeHour?: string;
  /** Minute portion of the lunch time (e.g. "30") */
  lunchTimeMinute?: string;
  /** Selected grade level (K, 1, 2, MAC for Schumann; 3, 4, 5 for Intermediate) */
  gradeLevel?: string;
}

export interface BuildingClassesDefaults {
  buildingId: string;
  classLinkEnabled?: boolean;
}

export interface ClassesGlobalConfig {
  buildingDefaults: Record<string, BuildingClassesDefaults>;
}

export interface ClassesConfig {
  classLinkEnabled?: boolean;
}

export interface InstructionalRoutinesConfig {
  selectedRoutineId: string | null;
  customSteps: RoutineStep[];
  favorites: string[];
  scaleMultiplier: number;
  structure?: RoutineStructure;
  audience?: RoutineAudience;
}

export interface TimeToolConfig {
  mode: 'timer' | 'stopwatch';
  visualType: 'digital' | 'visual';
  duration: number; // in seconds
  elapsedTime: number; // in seconds
  isRunning: boolean;
  startTime?: number | null; // timestamp when last started (Date.now())
  selectedSound: 'Chime' | 'Blip' | 'Gong' | 'Alert';
  timerEndVoiceLevel?: number | null; // 0-4 voice level to set when timer ends
  timerEndTrafficColor?: 'red' | 'yellow' | 'green' | null;
  timerEndTriggerRandom?: boolean; // Whether to trigger random picker when timer ends
  timerEndTriggerNextUp?: boolean; // Whether to advance NextUp queue when timer ends
  themeColor?: string;
  glow?: boolean;
  fontFamily?: string;
  clockStyle?: string;
}

// 1. Define the Data Model for a Mini App
export interface MiniAppItem {
  id: string;
  title: string;
  html: string;
  createdAt: number;
  order?: number;
}

/**
 * A MiniAppItem published to the global library by an admin.
 * Lives in the `/global_mini_apps/{id}` Firestore collection.
 * `buildings` is a list of building IDs this app is targeted to;
 * an empty array means it is available to all buildings.
 * This field is always persisted (never omitted) so Firestore queries on it are reliable.
 */
export interface GlobalMiniAppItem extends MiniAppItem {
  buildings: string[];
  gradeLevels?: GradeLevel[];
}

// 2. Define the Widget Configuration
export interface MiniAppConfig {
  activeApp: MiniAppItem | null;
  /** True when activeApp was created via smart-paste and has not yet been saved to the library */
  activeAppUnsaved?: boolean;
  collectResults?: boolean; // Toggle switch state
  googleSheetId?: string; // Extracted Sheet ID
  googleSheetUrl?: string; // Original pasted URL for UI
}

// Add new Global Config type
export interface MiniAppGlobalConfig {
  submissionUrl: string;
  botEmail: string;
}

export interface PdfItem {
  id: string;
  name: string;
  storageUrl: string;
  storagePath: string;
  size: number;
  uploadedAt: number;
  order?: number;
}

export interface GlobalPdfItem extends PdfItem {
  buildings?: string[];
  createdAt?: number;
}

export interface PdfGlobalConfig {
  dockDefaults?: Record<string, boolean>;
}

export interface BreathingConfig {
  pattern: '4-4-4-4' | '4-7-8' | '5-5';
  visual: 'circle' | 'lotus' | 'wave';
  color: string;
}

// --- MATH TOOLS TYPES ---

/** All individual math manipulative types available in the Math Tools suite */
export type MathToolType =
  | 'ruler-in' // 12-inch ruler (standard)
  | 'ruler-cm' // 30 cm metric ruler
  | 'protractor' // 180° semicircular protractor
  | 'number-line' // Interactive number line
  | 'base-10' // Base-10 blocks (units, rods, flats)
  | 'fraction-tiles' // Fraction bar tiles
  | 'geoboard' // Virtual geoboard with pegs
  | 'pattern-blocks' // Pattern blocks (hexagons, trapezoids, etc.)
  | 'algebra-tiles' // Algebra tiles (x², x, 1 tiles)
  | 'coordinate-plane' // Cartesian coordinate plane
  | 'calculator'; // Basic four-function calculator

/** Default grade levels for each individual math tool */
export type MathToolGradeLevels = Record<MathToolType, GradeLevel[]>;

/** Global admin config for the mathTools widget – stored in feature_permissions */
export interface MathToolsGlobalConfig {
  /** Per-tool grade level overrides (which building levels can see each tool) */
  toolGradeLevels?: Partial<MathToolGradeLevels>;
  /**
   * DPI calibration factor per building (pixels per CSS inch).
   * Defaults to 96 (the CSS spec reference pixel).
   * Admins can calibrate this for their specific IFP hardware.
   */
  dpiCalibration?: number;
}

/** Config for the mathTools PALETTE widget (the toolbox that launches tools) */
export interface MathToolsConfig {
  /** DPI calibration override stored locally; admin may override at building level */
  dpiCalibration?: number;
}

/** Number line display mode */
export type NumberLineMode = 'integers' | 'decimals' | 'fractions';

export interface PlaceValueBlock {
  id: string;
  type: '1' | '10' | '100' | '1000';
  x: number;
  y: number;
}

/** Config for an individual mathTool widget instance */
export interface MathToolConfig {
  /** Which math tool this instance displays */
  toolType: MathToolType;
  /**
   * Pixels per physical inch used for true-scale rendering.
   * Defaults to 96 (CSS reference pixel = 1in exactly per CSS spec).
   * Can be calibrated per-device in widget settings.
   */
  pixelsPerInch?: number;
  /** Ruler measurement system ('in' | 'cm' | 'both') — for ruler tools */
  rulerUnits?: 'in' | 'cm' | 'both';
  /** Number line mode — for number-line tool */
  numberLineMode?: NumberLineMode;
  /** Number line range minimum — for number-line tool */
  numberLineMin?: number;
  /** Number line range maximum — for number-line tool */
  numberLineMax?: number;
  /** Rotation angle in degrees (0–360) — for measurement tools */
  rotation?: number;
  /** Fraction denominator — for fraction-tiles tool */
  fractionDenominator?: number;
  /** Calculator display string */
  calcDisplay?: string;
  /** Calculator expression accumulator */
  calcExpression?: string;
  /** If true, render as a bare sticker without widget header chrome */
  stickerMode?: boolean;
  /** For manipulative piece stickers – identifies the specific piece (e.g. 'unit', 'rod', '1-2', 'hexagon') */
  stickerPiece?: string;
  placeValueBlocks?: PlaceValueBlock[];
  placeValueColumns?: string[];
}

export interface PdfConfig {
  activePdfId: string | null;
  activePdfUrl: string | null;
  activePdfName: string | null;
}

export interface MaterialsConfig {
  selectedItems: string[];
  activeItems: string[];
  title?: string;
  titleFont?: string;
  titleColor?: string;
}

export interface CatalystRoutine {
  id: string;
  title: string;
  icon?: string;
  buttonColor?: string;
  iconColor?: string;
  imageUrl?: string;
  description?: string;
  widgets: Omit<WidgetData, 'id'>[];
  createdAt: number;
}

export interface CatalystSet {
  id: string;
  title: string;
  imageUrl?: string;
  description?: string;
  routines: CatalystRoutine[];
  createdAt: number;
}

export type CatalystConfig = {
  initialSetId?: string;
};

export interface CatalystGlobalConfig {
  dockDefaults?: Record<string, boolean>;
}

export interface CatalystInstructionConfig {
  routineId: string;
  stepIndex: number;
  title?: string;
  instructions?: string;
}

export interface CatalystVisualConfig {
  routineId: string;
  stepIndex: number;
  title?: string;
  icon?: string;
  category?: string;
}

export interface StickerConfig {
  url?: string;
  icon?: string;
  color?: string;
  label?: string;
  rotation?: number;
  size?: number;
}

export interface StickerBookConfig {
  uploadedUrls?: string[];
  favorites?: string[];
  stickerOrder?: string[];
}

export interface GlobalSticker {
  url: string;
  gradeLevels?: GradeLevel[];
}

export interface StickerGlobalConfig {
  globalStickers?: (string | GlobalSticker)[];
}

export interface FurnitureItem {
  id: string;
  type: 'desk' | 'table-rect' | 'table-round' | 'rug' | 'teacher-desk';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  label?: string;
}

export type SeatingChartTemplate = 'freeform' | 'rows' | 'horseshoe' | 'pods';

export interface BuildingSeatingChartDefaults {
  buildingId: string;
  rosterMode?: 'class' | 'custom';
}

export interface SeatingChartGlobalConfig {
  buildingDefaults?: Record<string, BuildingSeatingChartDefaults>;
}

export interface SeatingChartConfig {
  furniture: FurnitureItem[];
  assignments: Record<string, string>; // studentId -> furnitureId
  gridSize: number;
  rosterMode?: 'class' | 'custom';
  names?: string; // Line separated names for custom roster
  template?: SeatingChartTemplate;
  templateColumns?: number; // Number of columns for 'rows' template
}

export interface NotebookItem {
  id: string;
  title: string;
  pageUrls: string[];
  pagePaths: string[];
  assetUrls?: string[];
  createdAt: number;
}

export interface SmartNotebookConfig {
  activeNotebookId: string | null;
  storageLimitMb?: number;
}

export interface BuildingSmartNotebookDefaults {
  buildingId: string;
  storageLimitMb?: number; // Admin-only: MB limit for notebook file uploads
}

export interface SmartNotebookGlobalConfig {
  buildingDefaults?: Record<string, BuildingSmartNotebookDefaults>;
}

export interface RecessGearConfig {
  linkedWeatherWidgetId?: string | null;
  useFeelsLike?: boolean;
}

// --- QUIZ TYPES ---

/**
 * Question types supported in the quiz widget.
 * MC = Multiple Choice, FIB = Fill in the Blank,
 * Matching = Match left to right, Ordering = Place items in correct sequence.
 */
export type QuizQuestionType = 'MC' | 'FIB' | 'Matching' | 'Ordering';

export interface QuizQuestion {
  id: string;
  /** Time limit in seconds. 0 = no time limit. */
  timeLimit: number;
  text: string;
  type: QuizQuestionType;
  /**
   * MC/FIB: the correct answer text.
   * Matching: pipe-separated pairs "term1:def1|term2:def2"
   * Ordering: pipe-separated items in correct order "item1|item2|item3"
   */
  correctAnswer: string;
  /** MC only: up to 4 incorrect answer choices */
  incorrectAnswers: string[];
}

/** Full quiz data stored in Google Drive as JSON */
export interface QuizData {
  id: string;
  title: string;
  questions: QuizQuestion[];
  createdAt: number;
  updatedAt: number;
}

/** Lightweight metadata stored in Firestore (avoids Drive API on every list) */
export interface QuizMetadata {
  id: string;
  title: string;
  driveFileId: string;
  questionCount: number;
  createdAt: number;
  updatedAt: number;
}

export type QuizSessionStatus = 'waiting' | 'active' | 'ended';
export type QuizSessionMode = 'teacher' | 'auto' | 'student';

/**
 * Student-safe question stored in the session document.
 * Never contains correctAnswer so students cannot cheat by inspecting
 * Firestore/network traffic. Answer choices are pre-shuffled server-side.
 */
export interface QuizPublicQuestion {
  id: string;
  type: QuizQuestion['type'];
  text: string;
  timeLimit: number;
  /** MC only: all answer choices pre-shuffled (correct identity unknown) */
  choices?: string[];
  /** Matching only: left-side terms (prompt side) */
  matchingLeft?: string[];
  /** Matching only: right-side definitions, pre-shuffled */
  matchingRight?: string[];
  /** Ordering only: items to sequence, pre-shuffled */
  orderingItems?: string[];
}

/** Live quiz session document in Firestore (/quiz_sessions/{teacherUid}) */
export interface QuizSession {
  id: string; // teacher's UID
  quizId: string;
  quizTitle: string;
  teacherUid: string;
  status: QuizSessionStatus;
  sessionMode: QuizSessionMode;
  /** -1 = lobby/waiting room, 0+ = currently displayed question index */
  currentQuestionIndex: number;
  startedAt: number | null;
  endedAt: number | null;
  /** Timestamp when the session will automatically advance (auto-progress mode) */
  autoProgressAt?: number | null;
  /** Short alphanumeric code students use to join */
  code: string;
  totalQuestions: number;
  /**
   * Student-safe questions (no correctAnswer) so the session document can be
   * read by students without leaking the answer key. Teachers grade using the
   * full QuizData loaded from Drive, not from this field.
   */
  publicQuestions: QuizPublicQuestion[];
}

export interface QuizResponseAnswer {
  questionId: string;
  /** MC/FIB: string. Matching: "term1:def1|term2:def2". Ordering: "item1|item2|item3" */
  answer: string;
  answeredAt: number;
  /**
   * Not written by the student (to prevent client-side forgery).
   * Always recomputed from the question + answer using gradeAnswer() on the
   * teacher / results side. Optional so existing Firestore documents with a
   * stored value are still valid.
   */
  isCorrect?: boolean;
}

export type QuizResponseStatus = 'joined' | 'in-progress' | 'completed';

/** Per-student response document in Firestore (/quiz_sessions/{sessionId}/responses/{anonymousUid}) */
export interface QuizResponse {
  /**
   * Firebase anonymous auth UID — used as the Firestore document key.
   * Not PII: ephemeral, not linked to any identity without the Drive roster.
   */
  studentUid: string;
  /**
   * Student's roster PIN. Teacher cross-references this with the Drive roster
   * to identify the student. No name or email is stored in Firestore.
   */
  pin: string;
  joinedAt: number;
  status: QuizResponseStatus;
  answers: QuizResponseAnswer[];
  /**
   * Percentage score 0–100 if computed and persisted, or null if not yet graded.
   * Not currently written by either the student or the teacher app — scoring is
   * computed on the fly in the results view using gradeAnswer() against the
   * full quiz data loaded from Drive.
   */
  score: number | null;
  submittedAt: number | null;
  /**
   * Tracks how many times the student left the quiz tab or minimized the window.
   * Used for maintaining quiz integrity.
   */
  tabSwitchWarnings?: number;
}

/** Global admin configuration for the Quiz widget */
export interface QuizGlobalConfig {
  dockDefaults?: Record<string, boolean>;
}

/** Widget configuration for the quiz widget (teacher side) */
export interface QuizConfig {
  view: 'manager' | 'import' | 'editor' | 'preview' | 'results' | 'monitor';
  selectedQuizId: string | null;
  selectedQuizTitle: string | null;
  /** Session code when a live quiz is running */
  activeLiveSessionCode: string | null;
  /** Quiz session ID for viewing historical results */
  resultsSessionId: string | null;
}

// --- VIDEO ACTIVITY TYPES ---

/**
 * A quiz question that is tied to a specific timestamp in a YouTube video.
 * Only MC question type is supported in V1.
 */
export interface VideoActivityQuestion extends QuizQuestion {
  /** Seconds into the video when this question should trigger. */
  timestamp: number;
}

/** Full video activity data stored in Google Drive as JSON. */
export interface VideoActivityData {
  id: string;
  title: string;
  youtubeUrl: string;
  /** Total video duration in seconds, populated after the first player load. */
  videoDuration?: number;
  questions: VideoActivityQuestion[];
  createdAt: number;
  updatedAt: number;
}

/** Lightweight metadata stored in Firestore (avoids Drive API on every list). */
export interface VideoActivityMetadata {
  id: string;
  title: string;
  youtubeUrl: string;
  driveFileId: string;
  questionCount: number;
  createdAt: number;
  updatedAt: number;
}

export type VideoActivityView = 'manager' | 'create' | 'editor' | 'results';

/** Widget configuration for the video activity widget (teacher side). */
export interface VideoActivityConfig {
  view: VideoActivityView;
  selectedActivityId: string | null;
  selectedActivityTitle: string | null;
  /** Session ID for the currently viewed results session. */
  resultsSessionId: string | null;
  /** Default settings for sessions created via this widget */
  autoPlay?: boolean;
  requireCorrectAnswer?: boolean;
  allowSkipping?: boolean;
}

export interface VideoActivitySessionSettings {
  autoPlay: boolean;
  requireCorrectAnswer: boolean;
  allowSkipping: boolean;
}

export interface GlobalVideoActivity extends VideoActivityMetadata {
  /** Building IDs this activity is assigned to; empty array = all buildings */
  buildings?: string[];
}

export interface VideoActivityGlobalConfig {
  dockDefaults?: Record<string, boolean>;
  aiEnabled?: boolean;
}

/**
 * A Firestore session document giving students access to an activity.
 * Stored at /video_activity_sessions/{sessionId}
 */
export interface VideoActivitySession {
  id: string;
  activityId: string;
  activityTitle: string;
  assignmentName: string;
  teacherUid: string;
  youtubeUrl: string;
  /** Full questions including correctAnswer — used server-side for grading. */
  questions: VideoActivityQuestion[];
  /** Session-level behavior controls configured at assignment time. */
  settings?: VideoActivitySessionSettings;
  status: 'active' | 'ended';
  /**
   * Roster PINs allowed to join. Teacher sets this when assigning to a class.
   * Empty array means any PIN is accepted.
   */
  allowedPins: string[];
  createdAt: number;
  endedAt?: number;
  /** Optional Unix timestamp when the session link expires. */
  expiresAt?: number;
}

/** A single answer submitted by a student for a video activity question. */
export interface VideoActivityAnswer {
  questionId: string;
  answer: string;
  /** Whether the answer was correct. Not written by the student client; derived from
   *  authoritative question data (correctAnswer) when displaying teacher results. */
  isCorrect?: boolean;
  answeredAt: number;
}

/**
 * Per-student response document in Firestore.
 * Stored at /video_activity_sessions/{sessionId}/responses/{studentUid}
 * The document ID is the student's Firebase auth UID (prevents PIN-claiming attacks).
 */
export interface VideoActivityResponse {
  pin: string;
  name: string;
  /** Firebase auth UID of the student who created this response. Used for Firestore ownership rules. */
  studentUid: string;
  joinedAt: number;
  answers: VideoActivityAnswer[];
  completedAt: number | null;
  score: number | null;
}

export type TalkingToolConfig = Record<string, never>;

export interface NextUpQueueItem {
  id: string;
  name: string;
  status: 'waiting' | 'active' | 'done';
  joinedAt: number;
}

export interface NextUpConfig {
  activeDriveFileId: string | null;
  sessionName: string | null;
  isActive: boolean;
  createdAt: number; // Used for midnight auto-expiry
  lastUpdated: number;
  displayCount: number;
  autoStartTimer?: boolean; // Nexus connection
  externalTrigger?: number; // Nexus connection
  styling: {
    fontFamily: string;
    themeColor: string;
    animation: 'slide' | 'fade' | 'none';
  };
}

export interface NextUpGlobalConfig {
  buildingDefaults: Record<
    string,
    {
      displayCount: number;
      fontFamily: string;
      themeColor: string;
    }
  >;
}

export interface StarterPack {
  id: string;
  name: string;
  description?: string;
  icon: string; // Lucide icon key
  color: string; // Tailwind color class
  gradeLevels: string[]; // e.g., ["K", "1", "2"]
  isLocked: boolean; // Teachers cannot edit/delete
  widgets: Omit<WidgetData, 'id'>[]; // The snapshot of widget states
}

export type BuildingStarterPack = StarterPack;
export type UserStarterPack = StarterPack;

export interface StarterPackGlobalConfig {
  dockDefaults?: Record<string, boolean>;
}

export type StarterPackConfig = Record<string, never>;

export interface CountdownConfig {
  title: string;
  startDate: string; // ISO date string
  eventDate: string; // ISO date string
  includeWeekends: boolean;
  countToday: boolean;
  viewMode: 'number' | 'grid';
}

export interface OnboardingConfig {
  completedTasks: string[];
}

// --- SPECIALIST SCHEDULE TYPES ---

export interface SpecialistScheduleItem {
  id: string;
  startTime: string; // HH:mm
  endTime?: string; // HH:mm
  task: string;
  linkedWidgets?: WidgetType[];
}

export interface SpecialistScheduleRecurringItem extends SpecialistScheduleItem {
  type: 'daily' | 'weekly';
  dayOfWeek?: number; // 0-6 (Sunday-Saturday), only for 'weekly'
}

export interface SpecialistScheduleCycleDay {
  dayNumber: number; // 1 to cycleLength
  items: SpecialistScheduleItem[];
}

export interface NumberLineMarker {
  id: string;
  value: number;
  label?: string;
  color: string;
}

export interface NumberLineJump {
  id: string;
  startValue: number;
  endValue: number;
  label?: string; // e.g., "+5"
}

export interface NumberLineConfig {
  min: number;
  max: number;
  step: number; // e.g., 1, 0.5, 10
  displayMode: NumberLineMode;
  markers: NumberLineMarker[];
  jumps: NumberLineJump[];
  showArrows: boolean;
}

export type BuildingNumberLineDefaults = Pick<
  NumberLineConfig,
  'min' | 'max' | 'step' | 'displayMode' | 'showArrows'
>;

export interface NumberLineGlobalConfig {
  buildingDefaults?: Record<string, BuildingNumberLineDefaults>;
}

export interface SpecialistScheduleBuildingConfig {
  cycleLength: 6 | 10;
  startDate: string; // YYYY-MM-DD
  /** List of dates (YYYY-MM-DD) that are school days and should count in the rotation. */
  schoolDays: string[];
  /** Custom label for "Day" (e.g., "Day" for Schumann, "Block" for Intermediate) */
  dayLabel?: string;
  /** Custom names for each day in the cycle (e.g., { 1: "Day 1", 2: "Music Day" }) */
  customDayNames?: Record<number, string>;
  /** Explicit date blocks for 10-block rotation (Intermediate School) */
  blocks?: { dayNumber: number; startDate: string; endDate: string }[];
  /** Predefined specialist options for this building (e.g., ["🎵 Music", "👟 PE"]) */
  specialistOptions?: string[];
}

export interface SpecialistScheduleGlobalConfig {
  /** Building ID -> Config */
  buildingDefaults: Record<string, SpecialistScheduleBuildingConfig>;
  dockDefaults?: Record<string, boolean>;
}

export interface SpecialistScheduleConfig {
  /** The specific specialist class name for this teacher (e.g., "3A", "Mrs. Smith's Class") */
  specialistClass?: string;
  /** Mapping of Day Number (1-based) to its schedule items. */
  cycleDays: SpecialistScheduleCycleDay[];
  /** Items that repeat every day or on specific days of the week */
  recurringItems?: SpecialistScheduleRecurringItem[];
  fontFamily?: string;
  cardColor?: string;
  cardOpacity?: number;
}

export interface NextUpSession {
  id: string; // widgetId
  teacherUid: string;
  sessionName: string;
  activeDriveFileId: string;
  isActive: boolean;
  createdAt: number;
  lastUpdated: number;
  buildingId?: string; // For default settings
}

// Music widget types
export type MusicLayout = 'default' | 'minimal' | 'small';

export const MUSIC_GENRES = [
  'Lo-fi / Chill',
  'Classical / Instrumental',
  'Nature / Ambient',
  'Pop / Top 40',
  'Jazz',
  'Rock',
  'Focus / Study',
  'Holiday',
  'Other',
] as const;

export type MusicGenre = (typeof MUSIC_GENRES)[number];

export interface MusicStation {
  id: string;
  title: string;
  channel: string;
  url: string;
  thumbnail: string;
  color: string;
  isActive: boolean;
  order: number;
  /** Predefined genre tag for the station */
  genre?: MusicGenre;
  /**
   * Building IDs this station is visible to.
   * Empty array or undefined means visible to all buildings.
   */
  buildingIds?: string[];
}

export interface MusicConfig {
  stationId: string;
  syncWithTimeTool?: boolean;
  bgColor?: string;
  textColor?: string;
  /** Widget display layout */
  layout?: MusicLayout;
}

export interface OrganizerNode {
  id: string;
  text: string;
}

export type GraphicOrganizerLayoutType =
  | 'frayer'
  | 't-chart'
  | 'venn'
  | 'kwl'
  | 'cause-effect';

export interface GraphicOrganizerTemplate {
  id: string;
  name: string;
  layout: GraphicOrganizerLayoutType;
  defaultNodes: Record<string, string>; // Map of node keys to default text
  fontFamily?: GlobalFontFamily;
}

export interface GraphicOrganizerBuildingConfig {
  templates: GraphicOrganizerTemplate[];
}

export interface GraphicOrganizerGlobalConfig {
  buildings: Record<string, GraphicOrganizerBuildingConfig>;
  dockDefaults?: Record<string, boolean>;
}

export type GraphicOrganizerTemplateId = `template-${string}`;

export interface GraphicOrganizerConfig {
  templateType: GraphicOrganizerLayoutType | GraphicOrganizerTemplateId;
  nodes: Record<string, OrganizerNode>;
  fontFamily?: GlobalFontFamily;
}
export interface CarRiderProConfig {
  iframeUrl?: string;
  cardColor?: string;
  cardOpacity?: number;
}

export interface RevealCard {
  id: string;
  frontContent: string;
  backContent: string;
  isRevealed: boolean; // Synced to Firebase: Triggers the 3D flip on all screens
  bgColor?: string;
}

export interface MemoryCard {
  id: string;
  originalId: string;
  content: string;
  type: 'term' | 'definition';
  isRevealed: boolean;
  isMatched: boolean;
  bgColor?: string;
}

export interface RevealGridConfig {
  columns: 2 | 3 | 4 | 5;
  cards: RevealCard[];
  revealMode: 'flip' | 'fade';
  isMemoryMode?: boolean;
  memoryCards?: MemoryCard[];
  fontFamily?: GlobalFontFamily;
  defaultCardColor?: string;
  defaultCardBackColor?: string;
  activeDriveFileId?: string | null;
  setName?: string;
}

export interface ConceptNode {
  id: string;
  text: string;
  x: number; // X position as a percentage of container
  y: number; // Y position as a percentage of container
  width?: number; // Width as a percentage of container
  height?: number; // Height as a percentage of container
  bgColor?: string;
}

export interface ConceptEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  label?: string; // e.g., "causes", "eats"
  lineStyle: 'solid' | 'dashed';
}

export interface ConceptWebConfig {
  nodes: ConceptNode[];
  edges: ConceptEdge[];
  fontFamily?: GlobalFontFamily;
  defaultNodeWidth?: number; // Width as a percentage of container
  defaultNodeHeight?: number; // Height as a percentage of container
}

export interface BuildingConceptWebDefaults {
  buildingId: string;
  defaultNodeWidth?: number;
  defaultNodeHeight?: number;
  fontFamily?: GlobalFontFamily;
}

export interface ConceptWebGlobalConfig {
  buildingDefaults: Record<string, BuildingConceptWebDefaults>;
}

export interface SyntaxToken {
  id: string;
  value: string; // the word, punctuation, or math operator
  color?: string;
  isMasked: boolean; // Renders as a blank underscore if true
}

export interface SyntaxFramerConfig {
  mode: 'text' | 'math'; // Math mode adds an equation-style font
  tokens: SyntaxToken[];
  alignment: 'left' | 'center';
}

export interface BuildingSyntaxFramerDefaults {
  buildingId: string;
  mode?: 'text' | 'math';
  alignment?: 'left' | 'center';
}

export interface SyntaxFramerGlobalConfig {
  buildingDefaults: Record<string, BuildingSyntaxFramerDefaults>;
}

export interface ImageHotspot {
  id: string;
  xPct: number; // Use percentages so pins stay anchored if the widget scales
  yPct: number;
  title: string;
  detailText: string;
  icon: 'search' | 'info' | 'question' | 'star';
  isViewed: boolean; // Syncs state so teachers know which ones they've covered
}

export interface HotspotSavedItem {
  id: string;
  name: string;
  baseImageUrl: string;
  hotspots: ImageHotspot[];
  popoverTheme?: 'light' | 'dark' | 'glass';
  createdAt: number;
}

export interface BuildingHotspotImageDefaults {
  buildingId: string;
  popoverTheme?: 'light' | 'dark' | 'glass';
}

export interface HotspotImageGlobalConfig {
  buildingDefaults: Record<string, BuildingHotspotImageDefaults>;
}

export interface HotspotImageConfig {
  baseImageUrl: string;
  hotspots: ImageHotspot[];
  popoverTheme?: 'light' | 'dark' | 'glass';
  savedLibrary?: HotspotSavedItem[];
}

// --- GUIDED LEARNING WIDGET TYPES ---

export type GuidedLearningMode = 'structured' | 'guided' | 'explore';
export type GuidedLearningInteractionType =
  | 'text-popover'
  | 'tooltip'
  | 'audio'
  | 'video'
  | 'pan-zoom'
  | 'pan-zoom-spotlight'
  | 'spotlight'
  | 'question';
export type GuidedLearningOverlayType =
  | 'none'
  | 'popover'
  | 'tooltip'
  | 'banner';
export type GuidedLearningQuestionType =
  | 'multiple-choice'
  | 'matching'
  | 'sorting';

export interface GuidedLearningQuestion {
  type: GuidedLearningQuestionType;
  text: string;
  /** MC options (includes the correct answer) */
  choices?: string[];
  /** MC correct answer — never sent to students */
  correctAnswer?: string;
  /** Matching pairs — correct pairings */
  matchingPairs?: { left: string; right: string }[];
  /** Sorting items in the correct order */
  sortingItems?: string[];
}

export interface GuidedLearningStep {
  id: string;
  /** % position on image (0–100) */
  xPct: number;
  yPct: number;
  /** Which image in set.imageUrls this step belongs to */
  imageIndex: number;
  label?: string;
  interactionType: GuidedLearningInteractionType;
  /** Optional hotspot style customization */
  hideStepNumber?: boolean;
  /** Overlay style for pan-zoom/spotlight interactions */
  showOverlay?: GuidedLearningOverlayType;
  /** Content for text-popover and tooltip */
  text?: string;
  /** Firebase Storage URL for audio */
  audioUrl?: string;
  audioStoragePath?: string;
  /** YouTube/external URL or Firebase Storage URL for video */
  videoUrl?: string;
  videoStoragePath?: string;
  /** Zoom scale for pan-zoom interaction (default 2.5) */
  panZoomScale?: number;
  /** Spotlight radius as % of container cqmin (default 25) */
  spotlightRadius?: number;
  question?: GuidedLearningQuestion;
  /** Seconds before auto-advance in guided mode */
  autoAdvanceDuration?: number;
}

/** Full set data stored in Google Drive as JSON */
export interface GuidedLearningSet {
  id: string;
  title: string;
  description?: string;
  /** Firebase Storage URLs for one or more activity images */
  imageUrls: string[];
  imagePaths?: string[];
  steps: GuidedLearningStep[];
  mode: GuidedLearningMode;
  createdAt: number;
  updatedAt: number;
  /** Admin-created building-level sets stored in Firestore, not Drive */
  isBuilding?: boolean;
  authorUid?: string;
}

/** Lightweight metadata stored in Firestore (avoids Drive API on every list) */
export interface GuidedLearningSetMetadata {
  id: string;
  title: string;
  description?: string;
  stepCount: number;
  mode: GuidedLearningMode;
  /** Firebase Storage URL used as thumbnail */
  imageUrl: string;
  driveFileId: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Student-safe step — no answer keys.
 * Choices/pairs/items are pre-shuffled before writing to session doc.
 */
export interface GuidedLearningPublicStep {
  id: string;
  xPct: number;
  yPct: number;
  imageIndex: number;
  label?: string;
  interactionType: GuidedLearningInteractionType;
  hideStepNumber?: boolean;
  showOverlay?: GuidedLearningOverlayType;
  text?: string;
  audioUrl?: string;
  videoUrl?: string;
  panZoomScale?: number;
  spotlightRadius?: number;
  question?: {
    type: GuidedLearningQuestionType;
    text: string;
    /** MC: all choices pre-shuffled (correct identity not marked) */
    choices?: string[];
    /** Matching: left side (prompt), pre-shuffled */
    matchingLeft?: string[];
    /** Matching: right side (definitions), pre-shuffled */
    matchingRight?: string[];
    /** Sorting: items pre-shuffled */
    sortingItems?: string[];
  };
  autoAdvanceDuration?: number;
}

/** Firestore session document granting student access to an experience */
export interface GuidedLearningSession {
  id: string;
  title: string;
  mode: GuidedLearningMode;
  imageUrls: string[];
  /** Student-safe steps (no answer keys) */
  publicSteps: GuidedLearningPublicStep[];
  teacherUid: string;
  createdAt: number;
  expiresAt?: number;
}

/** Per-student response in /guided_learning_sessions/{id}/responses/{studentUid} */
export interface GuidedLearningResponse {
  sessionId: string;
  studentAnonymousId: string;
  pin?: string;
  answers: {
    stepId: string;
    answer: string | string[];
    isCorrect: boolean | null; // null when correctness can't be computed client-side (student mode)
  }[];
  completedAt: number | null;
  startedAt: number;
  score: number | null;
}

export interface GuidedLearningGlobalConfig {
  dockDefaults?: Record<string, boolean>;
}

/** Widget config (teacher-side, stored in WidgetData.config) */
export interface GuidedLearningConfig {
  view: 'library' | 'editor' | 'player' | 'results';
  /** ID of the set currently loaded in player view */
  playerSetId?: string | null;
  /** Session ID when viewing results */
  resultsSessionId?: string | null;
}

// Union of all widget configs
export type WidgetConfig =
  | UrlWidgetConfig
  | ClockConfig
  | TrafficConfig
  | TextConfig
  | ChecklistConfig
  | RandomConfig
  | DiceConfig
  | SoundConfig
  | DrawingConfig
  | QRConfig
  | EmbedConfig
  | PollConfig
  | WebcamConfig
  | ScoreboardConfig
  | ExpectationsConfig
  | WeatherConfig
  | ScheduleConfig
  | CalendarConfig
  | LunchCountConfig
  | ClassesConfig
  | InstructionalRoutinesConfig
  | TimeToolConfig
  | MiniAppConfig
  | MaterialsConfig
  | StickerBookConfig
  | StickerConfig
  | SeatingChartConfig
  | CatalystConfig
  | CatalystInstructionConfig
  | CatalystVisualConfig
  | SmartNotebookConfig
  | RecessGearConfig
  | PdfConfig
  | QuizConfig
  | TalkingToolConfig
  | BreathingConfig
  | MathToolsConfig
  | MathToolConfig
  | NextUpConfig
  | OnboardingConfig
  | CountdownConfig
  | CarRiderProConfig
  | MusicConfig
  | SpecialistScheduleConfig
  | GraphicOrganizerConfig
  | RevealGridConfig
  | NumberLineConfig
  | ConceptWebConfig
  | SyntaxFramerConfig
  | HotspotImageConfig
  | StarterPackConfig
  | VideoActivityConfig
  | GuidedLearningConfig
  | CustomWidgetConfig
  | SoundboardConfig
  | ActivityWallConfig;

// Helper type to get config type for a specific widget
export type ConfigForWidget<T extends WidgetType> = T extends 'url'
  ? UrlWidgetConfig
  : T extends 'soundboard'
    ? SoundboardConfig
    : T extends 'clock'
      ? ClockConfig
      : T extends 'traffic'
        ? TrafficConfig
        : T extends 'text'
          ? TextConfig
          : T extends 'checklist'
            ? ChecklistConfig
            : T extends 'random'
              ? RandomConfig
              : T extends 'dice'
                ? DiceConfig
                : T extends 'sound'
                  ? SoundConfig
                  : T extends 'drawing'
                    ? DrawingConfig
                    : T extends 'qr'
                      ? QRConfig
                      : T extends 'embed'
                        ? EmbedConfig
                        : T extends 'poll'
                          ? PollConfig
                          : T extends 'webcam'
                            ? WebcamConfig
                            : T extends 'scoreboard'
                              ? ScoreboardConfig
                              : T extends 'expectations'
                                ? ExpectationsConfig
                                : T extends 'weather'
                                  ? WeatherConfig
                                  : T extends 'schedule'
                                    ? ScheduleConfig
                                    : T extends 'calendar'
                                      ? CalendarConfig
                                      : T extends 'lunchCount'
                                        ? LunchCountConfig
                                        : T extends 'classes'
                                          ? ClassesConfig
                                          : T extends 'instructionalRoutines'
                                            ? InstructionalRoutinesConfig
                                            : T extends 'time-tool'
                                              ? TimeToolConfig
                                              : T extends 'miniApp'
                                                ? MiniAppConfig
                                                : T extends 'materials'
                                                  ? MaterialsConfig
                                                  : T extends 'stickers'
                                                    ? StickerBookConfig
                                                    : T extends 'sticker'
                                                      ? StickerConfig
                                                      : T extends 'seating-chart'
                                                        ? SeatingChartConfig
                                                        : T extends 'catalyst'
                                                          ? CatalystConfig
                                                          : T extends 'catalyst-instruction'
                                                            ? CatalystInstructionConfig
                                                            : T extends 'catalyst-visual'
                                                              ? CatalystVisualConfig
                                                              : T extends 'smartNotebook'
                                                                ? SmartNotebookConfig
                                                                : T extends 'recessGear'
                                                                  ? RecessGearConfig
                                                                  : T extends 'pdf'
                                                                    ? PdfConfig
                                                                    : T extends 'quiz'
                                                                      ? QuizConfig
                                                                      : T extends 'talking-tool'
                                                                        ? TalkingToolConfig
                                                                        : T extends 'breathing'
                                                                          ? BreathingConfig
                                                                          : T extends 'mathTools'
                                                                            ? MathToolsConfig
                                                                            : T extends 'mathTool'
                                                                              ? MathToolConfig
                                                                              : T extends 'nextUp'
                                                                                ? NextUpConfig
                                                                                : T extends 'onboarding'
                                                                                  ? OnboardingConfig
                                                                                  : T extends 'countdown'
                                                                                    ? CountdownConfig
                                                                                    : T extends 'car-rider-pro'
                                                                                      ? CarRiderProConfig
                                                                                      : T extends 'music'
                                                                                        ? MusicConfig
                                                                                        : T extends 'specialist-schedule'
                                                                                          ? SpecialistScheduleConfig
                                                                                          : T extends 'graphic-organizer'
                                                                                            ? GraphicOrganizerConfig
                                                                                            : T extends 'concept-web'
                                                                                              ? ConceptWebConfig
                                                                                              : T extends 'reveal-grid'
                                                                                                ? RevealGridConfig
                                                                                                : T extends 'numberLine'
                                                                                                  ? NumberLineConfig
                                                                                                  : T extends 'syntax-framer'
                                                                                                    ? SyntaxFramerConfig
                                                                                                    : T extends 'hotspot-image'
                                                                                                      ? HotspotImageConfig
                                                                                                      : T extends 'starter-pack'
                                                                                                        ? StarterPackConfig
                                                                                                        : T extends 'video-activity'
                                                                                                          ? VideoActivityConfig
                                                                                                          : T extends 'guided-learning'
                                                                                                            ? GuidedLearningConfig
                                                                                                            : T extends 'custom-widget'
                                                                                                              ? CustomWidgetConfig
                                                                                                              : T extends 'activity-wall'
                                                                                                                ? ActivityWallConfig
                                                                                                                : never;

export interface WidgetComponentProps {
  widget: WidgetData;
  isStudentView?: boolean;
  scale?: number;
  studentPin?: string | null;
  isSpotlighted?: boolean;
  updateDashboardSettings?: (updates: Partial<DashboardSettings>) => void;
}

export interface WidgetLayout {
  /** Optional header content (stays fixed at top) */
  header?: React.ReactNode;

  /** Main content (grows to fill available space) */
  content: React.ReactNode;

  /** Optional footer content (stays fixed at bottom) */
  footer?: React.ReactNode;

  /** Optional: Override default flex behavior */
  contentClassName?: string;

  /** Optional: Custom padding (default: 'p-2') */
  padding?: string;
}

// Widget components can return either:
// 1. WidgetLayout object (new standardized way)
// 2. React.ReactNode (backwards compatible)
export type WidgetOutput = WidgetLayout | React.ReactNode;

export interface WidgetData {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  /** Width in grid units (dashboard) or pixels (student view) */
  w: number;
  /** Height in grid units (dashboard) or pixels (student view) */
  h: number;
  z: number;
  flipped: boolean;
  version?: number;
  minimized?: boolean;
  maximized?: boolean;
  customTitle?: string | null;
  isLive?: boolean;
  isLocked?: boolean; // When true: widget cannot be moved, resized, or deleted by end-users
  transparency?: number;
  annotation?: DrawingConfig;
  config: WidgetConfig;

  // Universal style properties
  backgroundColor?:
    | 'bg-white'
    | 'bg-slate-50'
    | 'bg-blue-50'
    | 'bg-indigo-50'
    | 'bg-purple-50'
    | 'bg-rose-50'
    | 'bg-amber-50'
    | 'bg-emerald-50';
  fontFamily?: 'sans' | 'serif' | 'mono' | 'handwritten' | 'comic';
  baseTextSize?: 'sm' | 'base' | 'lg' | 'xl' | '2xl';
}

/**
 * Looser overrides type for addWidget: allows partial config objects so callers
 * don't need `as Partial<WidgetData>` assertions when supplying only a subset
 * of a widget's config fields (e.g. { config: { layout: 'elementary' } }).
 * Uses a distributive Partial so each config union member is made optional
 * independently, preserving per-widget type information.
 */
type DistributedPartial<T> = T extends unknown ? Partial<T> : never;
export type AddWidgetOverrides = Omit<Partial<WidgetData>, 'config'> & {
  config?: DistributedPartial<WidgetConfig>;
};

export interface DockFolder {
  id: string;
  name: string;
  items: (WidgetType | InternalToolType)[];
}

export type InternalToolType = 'record' | 'magic' | 'remote';

export type DockItem =
  | { type: 'tool'; toolType: WidgetType | InternalToolType }
  | { type: 'folder'; folder: DockFolder };

export interface DashboardSettings {
  quickAccessWidgets?: (WidgetType | InternalToolType)[];
  disableCloseConfirmation?: boolean;
  /** Remote control: widget to spotlight (dim all others). Cleared on dismiss. */
  spotlightWidgetId?: string | null;
  /** Whether remote control is enabled for this dashboard. Default is usually true or false depending on the user. */
  remoteControlEnabled?: boolean;
}

export interface UserRolesConfig {
  students: string[];
  teachers: string[];
  betaTeachers: string[];
  admins: string[];
  superAdmins: string[];
}

/**
 * Per-user profile data stored in Firestore at /users/{userId}/userProfile.
 * This is separate from dashboard settings and persists across dashboards.
 */
export interface UserProfile {
  /** IDs of the buildings the user works in (matches Building.id in config/buildings.ts) */
  selectedBuildings: string[];
  /** Optional language preference */
  language?: string;
  /** Global saved widget configs for complex widgets */
  savedWidgetConfigs?: Partial<Record<WidgetType, Partial<WidgetConfig>>>;
  /** True after the user has completed the first-time setup wizard */
  setupCompleted?: boolean;
}

export interface SharedGroup {
  id: string;
  name: string;
  color?: string;
}

export interface SpartStickerDropPayload {
  icon: string;
  color: string;
  label?: string;
  url?: string;
}

export interface Dashboard {
  id: string;
  name: string;
  driveFileId?: string;
  background: string;
  thumbnailUrl?: string;
  widgets: WidgetData[];
  globalStyle?: GlobalStyle;
  sharedGroups?: SharedGroup[];
  createdAt: number;
  isDefault?: boolean;
  order?: number;
  settings?: DashboardSettings;
  libraryOrder?: (WidgetType | InternalToolType)[];
  updatedAt?: number;
  /** Viewport width (px) when the dashboard was last saved. Used for proportional layout scaling on load. */
  viewportWidth?: number;
  /** Viewport height (px) when the dashboard was last saved. Used for proportional layout scaling on load. */
  viewportHeight?: number;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning' | 'loading';
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface ToolMetadata {
  type: WidgetType | InternalToolType;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
  /** For custom-widget type: the Firestore doc ID of the specific custom widget */
  customWidgetId?: string;
  /** For custom-widget type: the emoji icon of the custom widget */
  customWidgetIcon?: string;
}

export type AccessLevel = 'admin' | 'beta' | 'public';

export type GlobalFeature =
  | 'live-session'
  | 'gemini-functions'
  | 'dashboard-sharing'
  | 'dashboard-import'
  | 'magic-layout'
  | 'smart-paste'
  | 'smart-poll'
  | 'screen-recording'
  | 'remote-control'
  | 'embed-mini-app'
  | 'video-activity-audio-transcription';

export interface GlobalFeaturePermission {
  featureId: GlobalFeature;
  accessLevel: AccessLevel;
  betaUsers: string[];
  enabled: boolean;
  config?: Record<string, unknown>;
}

export interface AppSettings {
  geminiDailyLimit: number;
  logoUrl?: string;
}

/**
 * Grade level categories for widget relevance filtering.
 * Used to help teachers discover age-appropriate widgets without restricting access.
 *
 * Granular ranges (internal values → UI labels):
 * - 'k-2'  → "K-2": Kindergarten through 2nd grade
 * - '3-5'  → "3-5": 3rd through 5th grade
 * - '6-8'  → "6-8": 6th through 8th grade (middle school)
 * - '9-12' → "9-12": 9th through 12th grade (high school)
 * - 'universal' → "Universal": Appropriate for all grades
 *
 * Together with the 'all' option in {@link GradeFilter}, this corresponds to the
 * UI/metadata filter options: "K-2, 3-5, 6-8, 9-12, Universal, All".
 */
export type GradeLevel = 'k-2' | '3-5' | '6-8' | '9-12';

/**
 * Grade filter values including the 'all' ("All") option used in the UI.
 * Combined with {@link GradeLevel}, this yields: "K-2, 3-5, 6-8, 9-12, All".
 * Used for filtering widgets in the sidebar.
 */
export type GradeFilter = GradeLevel | 'all';

/**
 * Feature permission settings for controlling widget access across different user groups.
 *
 * @remarks
 * - If no permission record exists for a widget, it defaults to public access (all authenticated users)
 * - When `enabled` is false, the widget is completely disabled for all users including admins
 * - Access levels:
 *   - 'admin': Only administrators can access (alpha testing)
 *   - 'beta': Only users in the betaUsers email list can access (beta testing)
 *   - 'public': All authenticated users can access (general availability)
 */
export interface FeaturePermission {
  /** The type of widget this permission applies to */
  widgetType: WidgetType | InternalToolType;
  /** The access level determining who can use this widget */
  accessLevel: AccessLevel;
  /** Array of email addresses for beta testing access (only used when accessLevel is 'beta') */
  betaUsers: string[];
  /** When false, disables the widget for everyone including admins */
  enabled: boolean;
  /** Optional override for grade levels. If set, this takes precedence over the static configuration. */
  gradeLevels?: GradeLevel[];
  /** Optional override for the widget's display name. */
  displayName?: string;
  /** Optional global configuration for the widget (e.g., API keys, target IDs). */
  config?: Record<string, unknown>;
}

export interface CarRiderProGlobalConfig {
  /** District portal login URL for the Car Rider Pro dismissal widget */
  url?: string;
}

export interface LunchCountGlobalConfig {
  /** Google Sheet ID for Schumann Elementary submissions */
  schumannSheetId?: string;
  /** Google Sheet ID for Intermediate School submissions */
  intermediateSheetId?: string;
  /** Apps Script web app URL used to POST submission data */
  submissionUrl?: string;
}

export interface BackgroundPreset {
  id: string;
  url: string;
  label: string;
  thumbnailUrl?: string;
  active: boolean; // Whether it shows up for users
  accessLevel: AccessLevel; // Who can see it
  betaUsers: string[]; // Specific users if beta
  createdAt: number;
  /** Admin-defined category label (e.g. "Nature", "Holidays") */
  category?: string;
  /** Building IDs this background is assigned to; empty/undefined = all buildings */
  buildingIds?: string[];
}

// --- GLOBAL STYLING TYPES ---

export type GlobalFontFamily =
  | 'sans'
  | 'serif'
  | 'mono'
  | 'handwritten'
  | 'rounded'
  | 'fun'
  | 'comic'
  | 'slab'
  | 'retro'
  | 'marker'
  | 'cursive';

export interface GlobalStyle {
  fontFamily: GlobalFontFamily;
  windowTransparency: number; // 0 to 1
  windowBorderRadius: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  dockTransparency: number; // 0 to 1
  dockBorderRadius: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full';
  dockTextColor: string; // hex color
  dockTextShadow: boolean;
  /** Custom brand colors — injected as CSS variables at the dashboard root */
  primaryColor?: string; // hex, defaults to brand-blue-primary (#2d3f89)
  accentColor?: string; // hex, defaults to brand-red-primary (#ad2122)
  windowTitleColor?: string; // hex, defaults to white (#ffffff)
}

/**
 * Configuration for the universal widget scaling system.
 * Defines how a widget should be scaled within its window.
 */
export interface ScalingConfig {
  /** The target internal width (in pixels) the widget is designed for. */
  baseWidth: number;
  /** The target internal height (in pixels) the widget is designed for. */
  baseHeight: number;
  /**
   * If true, the widget's internal layout can expand horizontally or vertically
   * beyond the base dimensions while maintaining the calculated scale.
   * Useful for widgets with flexible content like text or lists.
   */
  canSpread?: boolean;
  /**
   * If true, skips the automatic JS-based scaling.
   * Modern widgets should use CSS Container Queries instead.
   */
  skipScaling?: boolean;
  /**
   * Optional padding override (e.g. 0).
   * Used to eliminate excess space in modern layouts.
   */
  padding?: number;
}

// --- ANNOUNCEMENT SYSTEM TYPES ---

export type AnnouncementActivationType = 'manual' | 'scheduled';
export type AnnouncementDismissalType =
  | 'user'
  | 'scheduled'
  | 'duration'
  | 'admin';

/**
 * An admin-created announcement that is pushed to users' dashboards as an overlay widget.
 * Stored in Firestore under /announcements/{id}.
 * All authenticated users can read; only admins can write.
 */
export interface Announcement {
  id: string;
  /** Admin-facing label for this announcement */
  name: string;
  /** The widget type to display in the overlay */
  widgetType: WidgetType;
  /**
   * The widget's configuration. Stored as a flexible record so partial configs
   * from the admin form round-trip cleanly through Firestore.
   */
  widgetConfig: Record<string, unknown>;
  /** Pixel dimensions for the widget window */
  widgetSize: { w: number; h: number };
  /** When true, the announcement expands to fill the full viewport */
  maximized: boolean;
  /** Whether activation is triggered manually or at a scheduled time of day */
  activationType: AnnouncementActivationType;
  /** HH:MM in 24h format — used when activationType is 'scheduled' */
  scheduledActivationTime?: string;
  /** Whether the announcement is currently active (visible to targeted users) */
  isActive: boolean;
  /**
   * Timestamp (ms) when this announcement was most recently activated.
   * Used as a push epoch — if a user dismissed it before this timestamp, it shows again.
   */
  activatedAt: number | null;
  /** How the overlay can be dismissed by end users */
  dismissalType: AnnouncementDismissalType;
  /** HH:MM in 24h format — used when dismissalType is 'scheduled' */
  scheduledDismissalTime?: string;
  /** Seconds until auto-dismiss — used when dismissalType is 'duration' */
  dismissalDurationSeconds?: number;
  /**
   * Building IDs this announcement targets.
   * An empty array means ALL buildings (broadcast to everyone).
   */
  targetBuildings: string[];
  createdAt: number;
  updatedAt: number;
  /** Email of the admin who created/last modified this announcement */
  createdBy: string;
}

export const DEFAULT_GLOBAL_STYLE: GlobalStyle = {
  fontFamily: 'sans',
  windowTransparency: 0.8,
  windowBorderRadius: '2xl',
  dockTransparency: 0.4,
  dockBorderRadius: 'full',
  dockTextColor: '#334155', // Slate 700 (dark grey)
  dockTextShadow: false,
  // Brand color defaults — shared source of truth used by DashboardView (CSS vars) and StylePanel (pickers)
  primaryColor: '#2d3f89', // brand-blue-primary
  accentColor: '#ad2122', // brand-red-primary
  windowTitleColor: '#ffffff',
};

// --- DASHBOARD TEMPLATE TYPES ---

/**
 * A reusable dashboard template that admins can define and assign to users.
 * Stored in Firestore under /dashboard_templates/{id}.
 * All authenticated users can read; only admins can write.
 */
export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  /** Snapshot of widgets to pre-populate the dashboard with */
  widgets: WidgetData[];
  /** Optional global style override applied when template is deployed */
  globalStyle?: Partial<GlobalStyle>;
  /** Optional background to apply (Tailwind class, hex, gradient, or URL) */
  background?: string;
  /** Tag labels for filtering in the template browser */
  tags: string[];
  /** Grade-level targeting — empty means applicable to all grades */
  targetGradeLevels: GradeLevel[];
  /** Building IDs this template is offered to; empty = all buildings */
  targetBuildings: string[];
  /** Whether this template is available to users (replaces isPublished) */
  enabled: boolean;
  /** Who can see/use this template */
  accessLevel: 'admin' | 'beta' | 'public';
  createdAt: number;
  updatedAt: number;
  createdBy: string; // admin email
}

// --- CUSTOM WIDGET TYPES (Phase 3: No-Code Widget Builder) ---

/** Block types available in the visual block builder */
export type CustomBlockType =
  // Display blocks
  | 'text'
  | 'heading'
  | 'image'
  | 'reveal'
  | 'flip-card'
  | 'conditional-label'
  | 'badge'
  | 'traffic-light'
  | 'divider'
  | 'spacer'
  // Input & Control blocks
  | 'cb-button'
  | 'counter'
  | 'toggle'
  | 'stars'
  | 'text-input'
  | 'poll'
  // Game & Assessment blocks
  | 'multiple-choice'
  | 'match-pair'
  | 'hotspot'
  | 'sort-bin'
  // Progress & Measurement blocks
  | 'progress'
  | 'timer'
  | 'score'
  | 'checklist';

/** Events that blocks can fire */
export type BlockEvent =
  | 'on-click'
  | `on-spot-clicked-${number}`
  | 'on-correct'
  | 'on-incorrect'
  | 'on-all-matched'
  | 'on-item-sorted'
  | 'on-all-sorted'
  | 'on-timer-end'
  | 'on-timer-start'
  | 'on-timer-stop'
  | `on-counter-reach-${number}`
  | `on-score-reach-${number}`
  | `on-value-reach-${number}`
  | 'on-toggle-on'
  | 'on-toggle-off'
  | `on-vote-option-${number}`
  | `on-star-rated-${number}`
  | 'on-item-checked'
  | 'on-all-checked'
  | 'on-input-submit';

/** Actions that blocks can receive */
export type BlockAction =
  | 'show'
  | 'hide'
  | 'reveal'
  | 'flip'
  | 'flip-back'
  | 'set-text'
  | 'set-image'
  | 'increment'
  | 'decrement'
  | 'set-value'
  | 'reset'
  | 'reset-all'
  | 'start-timer'
  | 'stop-timer'
  | 'set-traffic'
  | 'play-sound'
  | 'show-toast'
  | 'check-item'
  | 'add-score'
  | 'toggle-on'
  | 'toggle-off'
  | 'select-option'
  | 'complete-pair'
  | 'sort-item'
  | 'vote-option';

/** An IFTTT-style connection between two blocks */
export interface BlockConnection {
  id: string;
  sourceBlockId: string;
  event: string; // BlockEvent (string for flexibility)
  targetBlockId: string;
  action: BlockAction;
  /** Optional string payload (e.g. text for set-text, sound name for play-sound) */
  actionPayload?: string;
  /** Optional numeric payload (e.g. value for set-value, add-score) */
  actionValue?: number;
  /** Optional guard condition */
  condition?: {
    watchBlockId: string;
    operator: 'gte' | 'lte' | 'eq' | 'neq';
    value: number | boolean;
  };
}

/** Style overrides for an individual block cell */
export interface BlockStyle {
  backgroundColor?: string;
  textColor?: string;
  borderRadius?: string;
  padding?: string;
  fontSize?: string;
}

/** Per-block config types */
export interface TextBlockConfig {
  text: string;
}
export interface HeadingBlockConfig {
  text: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}
export interface ImageBlockConfig {
  url: string;
  alt?: string;
  objectFit?: 'cover' | 'contain';
}
export interface RevealBlockConfig {
  contentType: 'text' | 'image';
  content: string;
  animation?: 'fade' | 'scale' | 'slide';
}
export interface FlipCardBlockConfig {
  frontType: 'text' | 'image';
  frontContent: string;
  backType: 'text' | 'image';
  backContent: string;
}
export interface ConditionalLabelBlockConfig {
  initialText: string;
}
export interface BadgeBlockConfig {
  icon: string; // lucide key (or legacy emoji)
  label?: string;
}
export interface TrafficLightBlockConfig {
  initialColor: 'red' | 'yellow' | 'green';
  label?: string;
}
export interface ButtonBlockConfig {
  label: string;
  icon?: string;
  style?: 'primary' | 'secondary' | 'danger';
  initialHidden?: boolean;
}
export interface CounterBlockConfig {
  label?: string;
  startValue: number;
  min?: number;
  max?: number;
  step?: number;
  eventThreshold?: number;
}
export interface ToggleBlockConfig {
  label?: string;
  initialOn?: boolean;
}
export interface StarsBlockConfig {
  maxStars?: number;
  initialValue?: number;
}
export interface TextInputBlockConfig {
  label?: string;
  placeholder?: string;
  submitLabel?: string;
}
export interface PollBlockConfig {
  question?: string;
  options: string[];
  showResults?: boolean;
}
export interface MultipleChoiceBlockConfig {
  question?: string;
  options: string[];
  correctIndex: number;
}
export interface MatchPairBlockConfig {
  leftItems: string[];
  rightItems: string[];
  correctPairs: number[]; // rightItems[i] matches leftItems[correctPairs[i]]
}
export interface HotspotBlockConfig {
  imageUrl: string;
  spots: Array<{ label: string; x: number; y: number }>;
}
export interface SortBinBlockConfig {
  bins: string[];
  items: Array<{ label: string; correctBin: number }>;
}
export interface ProgressBlockConfig {
  min?: number;
  max?: number;
  startValue?: number;
  label?: string;
}
export interface TimerBlockConfig {
  durationSeconds: number;
  autoStart?: boolean;
  showControls?: boolean;
}
export interface ScoreBlockConfig {
  label?: string;
  startValue?: number;
  eventThreshold?: number;
}
export interface ChecklistBlockConfig {
  items: string[];
}

export type BlockConfig =
  | TextBlockConfig
  | HeadingBlockConfig
  | ImageBlockConfig
  | RevealBlockConfig
  | FlipCardBlockConfig
  | ConditionalLabelBlockConfig
  | BadgeBlockConfig
  | TrafficLightBlockConfig
  | ButtonBlockConfig
  | CounterBlockConfig
  | ToggleBlockConfig
  | StarsBlockConfig
  | TextInputBlockConfig
  | PollBlockConfig
  | MultipleChoiceBlockConfig
  | MatchPairBlockConfig
  | HotspotBlockConfig
  | SortBinBlockConfig
  | ProgressBlockConfig
  | TimerBlockConfig
  | ScoreBlockConfig
  | ChecklistBlockConfig;

/** A single block placed in a grid cell */
export interface CustomBlockDefinition {
  id: string;
  type: CustomBlockType;
  config: BlockConfig;
  style: BlockStyle;
  /** Auto-generated human-readable name, e.g. "Button A1" */
  name?: string;
}

/** A cell in the custom widget grid */
export interface CustomGridCell {
  id: string;
  colStart: number;
  rowStart: number;
  colSpan: number;
  rowSpan: number;
  block: CustomBlockDefinition | null;
}

/** Grid layout for a block-mode custom widget */
export interface CustomGridDefinition {
  columns: number; // 1–4
  rows: number; // 1–8
  cells: CustomGridCell[];
  connections: BlockConnection[];
}

/** An admin-configurable setting exposed by a custom widget */
export interface CustomWidgetSettingDef {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  defaultValue: string | number | boolean;
  options?: string[]; // for type 'select'
}

/** Firestore document for a published custom widget */
export interface CustomWidgetDoc {
  id: string;
  slug: string;
  title: string;
  description?: string;
  icon: string; // lucide key (or legacy emoji)
  color: string; // Tailwind bg-* class
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  mode: 'block' | 'code';
  published: boolean;
  buildings: string[];
  gridDefinition?: CustomGridDefinition;
  codeContent?: string;
  defaultWidth: number;
  defaultHeight: number;
  settings: CustomWidgetSettingDef[];
  accessLevel: 'admin' | 'beta' | 'public';
  betaUsers: string[];
  enabled: boolean;
}

/** Config stored in WidgetData for a custom-widget instance */
export interface CustomWidgetConfig {
  /** ID of the CustomWidgetDoc in Firestore */
  customWidgetId: string;
  /** Admin-configured settings values (keyed by CustomWidgetSettingDef.key) */
  adminSettings?: Record<string, string | number | boolean>;
}

export interface RemoteGlobalConfig {
  dockDefaults?: Record<string, boolean>;
}
