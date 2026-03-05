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
  | 'nextUp';

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
}

export interface ChecklistConfig {
  items: ChecklistItem[];
  scaleMultiplier?: number;
  mode: 'manual' | 'roster';
  rosterMode?: 'class' | 'custom';
  firstNames?: string;
  lastNames?: string;
  completedNames?: string[]; // Tracks IDs or Names checked in roster mode
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
}

export interface DiceConfig {
  count: number;
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
  url: string;
  syncWithTextWidget?: boolean;
}

export interface EmbedConfig {
  url: string;
  mode?: string;
  html?: string;
  refreshInterval?: number;
  isEmbeddable?: boolean;
  blockedReason?: string;
}

export interface PollConfig {
  question: string;
  options: PollOption[];
}

export interface WebcamConfig {
  deviceId?: string;
  zoomLevel?: number;
  isMirrored?: boolean;
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

// --- Materials Global Config ---
export interface BuildingMaterialsDefaults {
  buildingId: string;
  selectedItems?: string[]; // IDs of materials selected by default
}

export interface MaterialsGlobalConfig {
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
  schoolSite: 'schumann-elementary' | 'orono-intermediate-school';
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

export type ClassesConfig = Record<string, never>;

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
}

export interface PdfConfig {
  activePdfId: string | null;
  activePdfUrl: string | null;
  activePdfName: string | null;
}

export interface MaterialsConfig {
  selectedItems: string[];
  activeItems: string[];
}

export interface CatalystCategory {
  id: string;
  label: string;
  icon: string;
  color: string;
  isCustom?: boolean;
  imageUrl?: string;
}

export interface CatalystRoutine {
  id: string;
  title: string;
  category: string;
  icon: string;
  shortDesc: string;
  instructions: string;
  associatedWidgets?: {
    id: string;
    type: WidgetType;
    config?: WidgetConfig;
  }[];
}

export interface CatalystConfig {
  activeCategory: string | null;
  activeStrategyId: string | null;
  customCategories?: CatalystCategory[];
  customRoutines?: CatalystRoutine[];
  removedCategoryIds?: string[];
  removedRoutineIds?: string[];
}

export type CatalystGlobalConfig = Omit<
  CatalystConfig,
  'activeCategory' | 'activeStrategyId'
>;

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

// Union of all widget configs
export type WidgetConfig =
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
  | NextUpConfig;

// Helper type to get config type for a specific widget
export type ConfigForWidget<T extends WidgetType> = T extends 'clock'
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
                                                                            : never;

export interface WidgetComponentProps {
  widget: WidgetData;
  isStudentView?: boolean;
  scale?: number;
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
  minimized?: boolean;
  maximized?: boolean;
  customTitle?: string | null;
  isLive?: boolean;
  transparency?: number;
  annotation?: DrawingConfig;
  config: WidgetConfig;
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

export type InternalToolType = 'record' | 'magic';

export type DockItem =
  | { type: 'tool'; toolType: WidgetType | InternalToolType }
  | { type: 'folder'; folder: DockFolder };

export interface DashboardSettings {
  quickAccessWidgets?: (WidgetType | InternalToolType)[];
  disableCloseConfirmation?: boolean;
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
  | 'screen-recording';

export interface GlobalFeaturePermission {
  featureId: GlobalFeature;
  accessLevel: AccessLevel;
  betaUsers: string[];
  enabled: boolean;
  config?: Record<string, unknown>;
}

export interface AppSettings {
  geminiDailyLimit: number;
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
};
