// Generated from config/snapZones.ts, config/boardTemplates.ts and utils/boardLayout/ by tests/mcpBoardEngineCopy.test.ts; rerun it with UPDATE_BOARD_ENGINE_COPY=1.
type WidgetType = string;
// Pure snap zone data, shared with the board layout engine and its functions/ copy.
export interface SnapZone {
  id: string;
  x: number; // 0.0 to 1.0 (Percentage of safe width)
  y: number; // 0.0 to 1.0 (Percentage of safe height)
  w: number; // 0.0 to 1.0 (Percentage of safe width)
  h: number; // 0.0 to 1.0 (Percentage of safe height)
}

export interface SnapZoneLayout {
  id: string;
  nameKey: string;
  zones: SnapZone[];
}

export const SNAP_ZONE_LAYOUTS: readonly SnapZoneLayout[] = [
  {
    id: 'split-half',
    nameKey: 'splitScreen',
    zones: [
      { id: 'left-half', x: 0, y: 0, w: 0.5, h: 1 },
      { id: 'right-half', x: 0.5, y: 0, w: 0.5, h: 1 },
    ],
  },
  {
    id: 'grid-2x2',
    nameKey: 'fourGrid',
    zones: [
      { id: 'top-left', x: 0, y: 0, w: 0.5, h: 0.5 },
      { id: 'top-right', x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { id: 'bottom-left', x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { id: 'bottom-right', x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
  },
  {
    id: 'grid-3x3',
    nameKey: 'nineGrid',
    zones: [
      { id: 'r1-c1', x: 0, y: 0, w: 0.33, h: 0.33 },
      { id: 'r1-c2', x: 0.33, y: 0, w: 0.34, h: 0.33 },
      { id: 'r1-c3', x: 0.67, y: 0, w: 0.33, h: 0.33 },
      { id: 'r2-c1', x: 0, y: 0.33, w: 0.33, h: 0.34 },
      { id: 'r2-c2', x: 0.33, y: 0.33, w: 0.34, h: 0.34 },
      { id: 'r2-c3', x: 0.67, y: 0.33, w: 0.33, h: 0.34 },
      { id: 'r3-c1', x: 0, y: 0.67, w: 0.33, h: 0.33 },
      { id: 'r3-c2', x: 0.33, y: 0.67, w: 0.34, h: 0.33 },
      { id: 'r3-c3', x: 0.67, y: 0.67, w: 0.33, h: 0.33 },
    ],
  },
  {
    id: 'top-half-bottom-3',
    nameKey: 'topPriority3',
    zones: [
      { id: 'top-half', x: 0, y: 0, w: 1, h: 0.5 },
      { id: 'bottom-1', x: 0, y: 0.5, w: 0.33, h: 0.5 },
      { id: 'bottom-2', x: 0.33, y: 0.5, w: 0.34, h: 0.5 },
      { id: 'bottom-3', x: 0.67, y: 0.5, w: 0.33, h: 0.5 },
    ],
  },
  {
    id: 'bottom-half-top-3',
    nameKey: 'bottomPriority3',
    zones: [
      { id: 'top-1', x: 0, y: 0, w: 0.33, h: 0.5 },
      { id: 'top-2', x: 0.33, y: 0, w: 0.34, h: 0.5 },
      { id: 'top-3', x: 0.67, y: 0, w: 0.33, h: 0.5 },
      { id: 'bottom-half', x: 0, y: 0.5, w: 1, h: 0.5 },
    ],
  },
  {
    id: 'sandwich-3',
    nameKey: 'middlePriority3',
    zones: [
      { id: 'top-1', x: 0, y: 0, w: 0.33, h: 0.33 },
      { id: 'top-2', x: 0.33, y: 0, w: 0.34, h: 0.33 },
      { id: 'top-3', x: 0.67, y: 0, w: 0.33, h: 0.33 },
      { id: 'middle-wide', x: 0, y: 0.33, w: 1, h: 0.34 },
      { id: 'bottom-1', x: 0, y: 0.67, w: 0.33, h: 0.33 },
      { id: 'bottom-2', x: 0.33, y: 0.67, w: 0.34, h: 0.33 },
      { id: 'bottom-3', x: 0.67, y: 0.67, w: 0.33, h: 0.33 },
    ],
  },
  {
    id: 'sidebar-left',
    nameKey: 'sidebarLeft',
    zones: [
      { id: 'side', x: 0, y: 0, w: 0.34, h: 1 },
      { id: 'main', x: 0.34, y: 0, w: 0.66, h: 1 },
    ],
  },
  {
    id: 'sidebar-right',
    nameKey: 'sidebarRight',
    zones: [
      { id: 'main', x: 0, y: 0, w: 0.66, h: 1 },
      { id: 'side', x: 0.66, y: 0, w: 0.34, h: 1 },
    ],
  },
  {
    id: 'three-columns',
    nameKey: 'threeColumns',
    zones: [
      { id: 'left', x: 0, y: 0, w: 0.33, h: 1 },
      { id: 'center', x: 0.33, y: 0, w: 0.34, h: 1 },
      { id: 'right', x: 0.67, y: 0, w: 0.33, h: 1 },
    ],
  },
  {
    id: 'split-vertical',
    nameKey: 'topBottom',
    zones: [
      { id: 'top', x: 0, y: 0, w: 1, h: 0.5 },
      { id: 'bottom', x: 0, y: 0.5, w: 1, h: 0.5 },
    ],
  },
  {
    id: 'priority-left',
    nameKey: 'priorityLeft',
    zones: [
      { id: 'main', x: 0, y: 0, w: 0.5, h: 1 },
      { id: 'top-side', x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { id: 'bottom-side', x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
  },
  {
    id: 'priority-right',
    nameKey: 'priorityRight',
    zones: [
      { id: 'top-side', x: 0, y: 0, w: 0.5, h: 0.5 },
      { id: 'bottom-side', x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { id: 'main', x: 0.5, y: 0, w: 0.5, h: 1 },
    ],
  },
];

// Activity templates for AI boards (docs/plans/shipped/AI_BOARDS.md D9); every zone is a snap zone.
export interface BoardTemplateSlot {
  zoneId: string;
  role: string;
  suggestedWidgets: WidgetType[];
}

export interface BoardTemplate {
  id: string;
  name: string;
  whenToUse: string;
  layoutId: string;
  zones: SnapZone[];
  slots: BoardTemplateSlot[];
}

type TemplateSpec = Omit<BoardTemplate, 'zones'>;

const zonesOf = (layoutId: string): SnapZone[] => {
  const layout = SNAP_ZONE_LAYOUTS.find((l) => l.id === layoutId);
  if (!layout) throw new Error(`Unknown snap layout ${layoutId}`);
  return layout.zones.map((zone) => ({ ...zone }));
};

const TEMPLATE_SPECS: readonly TemplateSpec[] = [
  {
    id: 'launch',
    name: 'Launch / Do Now',
    whenToUse:
      'Start of class: a warm-up prompt students begin on arrival, a short timer and the agenda.',
    layoutId: 'priority-left',
    slots: [
      {
        zoneId: 'main',
        role: 'Do Now prompt',
        suggestedWidgets: ['text', 'poll', 'activity-wall'],
      },
      {
        zoneId: 'top-side',
        role: 'Timer',
        suggestedWidgets: ['time-tool', 'countdown'],
      },
      {
        zoneId: 'bottom-side',
        role: "Today's agenda",
        suggestedWidgets: ['schedule', 'checklist', 'text'],
      },
    ],
  },
  {
    id: 'direct-instruction',
    name: 'Direct instruction',
    whenToUse:
      'Teacher-led lesson: slides or a whiteboard as the focus, with the learning target and a timer beside it.',
    layoutId: 'priority-right',
    slots: [
      {
        zoneId: 'top-side',
        role: 'Learning target',
        suggestedWidgets: ['text'],
      },
      {
        zoneId: 'bottom-side',
        role: 'Timer or noise level',
        suggestedWidgets: ['time-tool', 'expectations', 'sound'],
      },
      {
        zoneId: 'main',
        role: 'Lesson content',
        suggestedWidgets: ['embed', 'drawing', 'pdf', 'smartNotebook'],
      },
    ],
  },
  {
    id: 'work-time',
    name: 'Work time',
    whenToUse:
      'Independent or partner work: expectations, a work timer and the task list side by side.',
    layoutId: 'three-columns',
    slots: [
      {
        zoneId: 'left',
        role: 'Expectations',
        suggestedWidgets: ['expectations', 'work-symbols', 'sound'],
      },
      {
        zoneId: 'center',
        role: 'Work timer',
        suggestedWidgets: ['time-tool', 'countdown'],
      },
      {
        zoneId: 'right',
        role: 'Task list',
        suggestedWidgets: ['checklist', 'text'],
      },
    ],
  },
  {
    id: 'stations',
    name: 'Stations',
    whenToUse:
      'Rotations: the station groups take the big space, with a rotation timer and expectations.',
    layoutId: 'priority-left',
    slots: [
      {
        zoneId: 'main',
        role: 'Station groups',
        suggestedWidgets: ['stations'],
      },
      {
        zoneId: 'top-side',
        role: 'Rotation timer',
        suggestedWidgets: ['time-tool', 'countdown'],
      },
      {
        zoneId: 'bottom-side',
        role: 'Expectations',
        suggestedWidgets: ['expectations', 'text'],
      },
    ],
  },
  {
    id: 'discussion',
    name: 'Discussion',
    whenToUse:
      'Whole-class or small-group talk: the question, a timer and a name picker on top, student responses below.',
    layoutId: 'bottom-half-top-3',
    slots: [
      {
        zoneId: 'top-1',
        role: 'Discussion question',
        suggestedWidgets: ['text'],
      },
      {
        zoneId: 'top-2',
        role: 'Sentence stems or timer',
        suggestedWidgets: ['talking-tool', 'time-tool'],
      },
      {
        zoneId: 'top-3',
        role: 'Name picker',
        suggestedWidgets: ['random'],
      },
      {
        zoneId: 'bottom-half',
        role: 'Student responses',
        suggestedWidgets: ['activity-wall', 'poll'],
      },
    ],
  },
  {
    id: 'exit-ticket',
    name: 'Exit ticket',
    whenToUse:
      'End of class: a short check for understanding, a join code students scan and a timer.',
    layoutId: 'priority-left',
    slots: [
      {
        zoneId: 'main',
        role: 'Check for understanding',
        suggestedWidgets: ['quiz', 'poll', 'activity-wall'],
      },
      {
        zoneId: 'top-side',
        role: 'Join code',
        suggestedWidgets: ['qr'],
      },
      {
        zoneId: 'bottom-side',
        role: 'Timer',
        suggestedWidgets: ['time-tool', 'countdown'],
      },
    ],
  },
  {
    id: 'presentation',
    name: 'Presentation and notes',
    whenToUse:
      'Showing slides, a document or a video with key points or vocabulary in a side panel.',
    layoutId: 'sidebar-right',
    slots: [
      {
        zoneId: 'main',
        role: 'Presentation',
        suggestedWidgets: ['embed', 'pdf', 'url'],
      },
      {
        zoneId: 'side',
        role: 'Key points',
        suggestedWidgets: ['text', 'checklist'],
      },
    ],
  },
  {
    id: 'centers',
    name: 'Centers',
    whenToUse:
      'Up to eight centers around the room, with the directions for every center in the middle.',
    layoutId: 'grid-3x3',
    slots: [
      { zoneId: 'r1-c1', role: 'Center 1', suggestedWidgets: ['text'] },
      { zoneId: 'r1-c2', role: 'Center 2', suggestedWidgets: ['text'] },
      { zoneId: 'r1-c3', role: 'Center 3', suggestedWidgets: ['text'] },
      { zoneId: 'r2-c1', role: 'Center 4', suggestedWidgets: ['text'] },
      {
        zoneId: 'r2-c2',
        role: 'Directions',
        suggestedWidgets: ['need-do-put-then', 'time-tool'],
      },
      { zoneId: 'r2-c3', role: 'Center 5', suggestedWidgets: ['text'] },
      { zoneId: 'r3-c1', role: 'Center 6', suggestedWidgets: ['text'] },
      { zoneId: 'r3-c2', role: 'Center 7', suggestedWidgets: ['text'] },
      { zoneId: 'r3-c3', role: 'Center 8', suggestedWidgets: ['text'] },
    ],
  },
  {
    id: 'review-game',
    name: 'Review game',
    whenToUse:
      'Review before a test: the game or question set in the main space, team scores at the side.',
    layoutId: 'sidebar-left',
    slots: [
      {
        zoneId: 'side',
        role: 'Team scores',
        suggestedWidgets: ['scoreboard'],
      },
      {
        zoneId: 'main',
        role: 'Game',
        suggestedWidgets: ['reveal-grid', 'quiz', 'flashcards'],
      },
    ],
  },
  {
    id: 'independent-reading',
    name: 'Independent reading',
    whenToUse:
      'Reading time: a reading timer, noise level, the response prompt and reading goals.',
    layoutId: 'grid-2x2',
    slots: [
      {
        zoneId: 'top-left',
        role: 'Reading timer',
        suggestedWidgets: ['time-tool'],
      },
      {
        zoneId: 'top-right',
        role: 'Noise level',
        suggestedWidgets: ['expectations', 'sound', 'music'],
      },
      {
        zoneId: 'bottom-left',
        role: 'Response prompt',
        suggestedWidgets: ['text'],
      },
      {
        zoneId: 'bottom-right',
        role: 'Reading goals',
        suggestedWidgets: ['checklist'],
      },
    ],
  },
  {
    id: 'lab',
    name: 'Lab',
    whenToUse:
      'Labs and hands-on activities: the procedure across the top, materials, a timer and a space to record below.',
    layoutId: 'top-half-bottom-3',
    slots: [
      {
        zoneId: 'top-half',
        role: 'Procedure',
        suggestedWidgets: ['text', 'embed'],
      },
      {
        zoneId: 'bottom-1',
        role: 'Materials',
        suggestedWidgets: ['materials', 'checklist'],
      },
      {
        zoneId: 'bottom-2',
        role: 'Timer',
        suggestedWidgets: ['time-tool'],
      },
      {
        zoneId: 'bottom-3',
        role: 'Observations',
        suggestedWidgets: ['drawing', 'text'],
      },
    ],
  },
  {
    id: 'assessment',
    name: 'Assessment',
    whenToUse:
      'Quizzes and tests: the assessment in the main space, with a timer and testing expectations.',
    layoutId: 'priority-right',
    slots: [
      {
        zoneId: 'top-side',
        role: 'Timer',
        suggestedWidgets: ['time-tool', 'countdown'],
      },
      {
        zoneId: 'bottom-side',
        role: 'Expectations',
        suggestedWidgets: ['expectations', 'text'],
      },
      {
        zoneId: 'main',
        role: 'Assessment',
        suggestedWidgets: ['quiz', 'video-activity', 'guided-learning'],
      },
    ],
  },
];

export const BOARD_TEMPLATES: readonly BoardTemplate[] = TEMPLATE_SPECS.map(
  (spec) => ({ ...spec, zones: zonesOf(spec.layoutId) })
);

export const getBoardTemplate = (id: string): BoardTemplate | undefined =>
  BOARD_TEMPLATES.find((template) => template.id === id);

export interface ScreenShape {
  w: number;
  h: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedRect extends Rect {
  xProp: number;
  yProp: number;
  wProp: number;
  hProp: number;
  aspectRatio: number;
}

export interface LayoutWidget {
  id: string;
  type?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  xProp?: number;
  yProp?: number;
  wProp?: number;
  hProp?: number;
  aspectRatio?: number;
  minimized?: boolean;
  maximized?: boolean;
  isLocked?: boolean;
  isPinned?: boolean;
}

/** Minimized and maximized widgets are not on the canvas layout. */
export const isOffCanvas = (widget: LayoutWidget): boolean =>
  widget.minimized === true || widget.maximized === true;

/** Widgets the teacher locked or pinned in place; layout never moves them. */
export const isFixed = (widget: LayoutWidget): boolean =>
  widget.isLocked === true || widget.isPinned === true;

export type ChromeBandId =
  'app-buttons' | 'dock' | 'board-buttons-left' | 'board-buttons-right';

export interface ChromeBand extends Rect {
  id: ChromeBandId;
}

export const DEFAULT_SCREEN: ScreenShape = { w: 1920, h: 1080 };

// Mirrors utils/layoutMath.ts SNAP_LAYOUT_CONSTANTS and the fixed app chrome measured in docs/plans/shipped/AI_BOARDS.md.
export const BOARD_LAYOUT = {
  PADDING: 16,
  GAP: 12,
  APP_BUTTONS_BOTTOM: 78,
  APP_BUTTONS_RIGHT: 400,
  DOCK_FROM_BOTTOM: 80,
  BOARD_BUTTONS_FROM_BOTTOM: 56,
  BOARD_BUTTONS_WIDTH: 160,
  DRAWER_SIDE_MAX: 240,
  DRAWER_SIDE_SHARE: 0.6,
  DRAWER_BOTTOM_SHARE: 0.65,
  DRAWER_OVERLAP_MAX: 28,
  DRAWER_OVERLAP_SHARE: 0.07,
  MIN_SCREEN_W: 320,
  MIN_SCREEN_H: 240,
} as const;

const EDGE_EPSILON = 1e-6;

export const normalizeScreen = (screen?: ScreenShape): ScreenShape => {
  const w = Number.isFinite(screen?.w) ? Number(screen?.w) : DEFAULT_SCREEN.w;
  const h = Number.isFinite(screen?.h) ? Number(screen?.h) : DEFAULT_SCREEN.h;
  return {
    w: Math.max(BOARD_LAYOUT.MIN_SCREEN_W, w),
    h: Math.max(BOARD_LAYOUT.MIN_SCREEN_H, h),
  };
};

/** Board area that stays clear of the app buttons above and the dock below. */
export const contentArea = (screen?: ScreenShape): Rect => {
  const { w, h } = normalizeScreen(screen);
  const { PADDING, GAP, APP_BUTTONS_BOTTOM, DOCK_FROM_BOTTOM } = BOARD_LAYOUT;
  const top = APP_BUTTONS_BOTTOM + GAP / 2;
  const bottom = h - DOCK_FROM_BOTTOM - GAP / 2;
  return {
    x: PADDING,
    y: top,
    w: Math.max(1, w - PADDING * 2),
    h: Math.max(1, bottom - top),
  };
};

export const chromeBands = (screen?: ScreenShape): ChromeBand[] => {
  const { w, h } = normalizeScreen(screen);
  const {
    APP_BUTTONS_BOTTOM,
    APP_BUTTONS_RIGHT,
    DOCK_FROM_BOTTOM,
    BOARD_BUTTONS_FROM_BOTTOM,
    BOARD_BUTTONS_WIDTH,
  } = BOARD_LAYOUT;
  const buttonsW = Math.min(BOARD_BUTTONS_WIDTH, w / 2);
  return [
    {
      id: 'app-buttons',
      x: 0,
      y: 0,
      w: Math.min(APP_BUTTONS_RIGHT, w),
      h: APP_BUTTONS_BOTTOM,
    },
    { id: 'dock', x: 0, y: h - DOCK_FROM_BOTTOM, w, h: DOCK_FROM_BOTTOM },
    {
      id: 'board-buttons-left',
      x: 0,
      y: h - BOARD_BUTTONS_FROM_BOTTOM,
      w: buttonsW,
      h: BOARD_BUTTONS_FROM_BOTTOM,
    },
    {
      id: 'board-buttons-right',
      x: w - buttonsW,
      y: h - BOARD_BUTTONS_FROM_BOTTOM,
      w: buttonsW,
      h: BOARD_BUTTONS_FROM_BOTTOM,
    },
  ];
};

const safeSize = (screen: ScreenShape) => ({
  safeW: Math.max(1, screen.w - BOARD_LAYOUT.PADDING * 2),
  safeH: Math.max(1, screen.h - BOARD_LAYOUT.PADDING * 2),
});

/** Stored geometry for a pixel rect, with the aspect ratio that fills it exactly on this screen. */
export const toPlacedRect = (rect: Rect, screen?: ScreenShape): PlacedRect => {
  const shape = normalizeScreen(screen);
  const { safeW, safeH } = safeSize(shape);
  const { PADDING } = BOARD_LAYOUT;
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    w: Math.round(rect.w),
    h: Math.round(rect.h),
    xProp: (rect.x - PADDING) / safeW,
    yProp: (rect.y - PADDING) / safeH,
    wProp: rect.w / safeW,
    hProp: rect.h / safeH,
    aspectRatio: rect.w / Math.max(1, rect.h),
  };
};

export const zoneRect = (zone: SnapZone, screen?: ScreenShape): Rect => {
  const area = contentArea(screen);
  const half = BOARD_LAYOUT.GAP / 2;
  const left = zone.x > EDGE_EPSILON ? half : 0;
  const right = zone.x + zone.w < 1 - EDGE_EPSILON ? half : 0;
  const top = zone.y > EDGE_EPSILON ? half : 0;
  const bottom = zone.y + zone.h < 1 - EDGE_EPSILON ? half : 0;
  return {
    x: area.x + zone.x * area.w + left,
    y: area.y + zone.y * area.h + top,
    w: Math.max(1, zone.w * area.w - left - right),
    h: Math.max(1, zone.h * area.h - top - bottom),
  };
};

export const placeInZone = (zone: SnapZone, screen?: ScreenShape): PlacedRect =>
  toPlacedRect(zoneRect(zone, screen), screen);

// Keeps absurd stored or requested numbers from overflowing the layout math.
const MAX_COORD = 1e6;
const bound = (v: number, min: number) => Math.min(MAX_COORD, Math.max(min, v));
const boundRect = (r: Rect): Rect => ({
  x: bound(r.x, -MAX_COORD),
  y: bound(r.y, -MAX_COORD),
  w: bound(r.w, 0),
  h: bound(r.h, 0),
});

/** The widget's outer rect on this screen; null when it has no usable geometry. */
export const widgetRect = (
  widget: LayoutWidget,
  screen?: ScreenShape
): Rect | null => {
  const shape = normalizeScreen(screen);
  const { xProp, yProp, wProp, hProp } = widget;
  const finite = [xProp, yProp, wProp, hProp].every(
    (v) => typeof v === 'number' && Number.isFinite(v)
  );
  // Same range test as widgetNeedsProportionalMigration: out-of-range proportions are really pixels.
  if (
    finite &&
    Number(wProp) > 0 &&
    Number(wProp) <= 1.5 &&
    Number(hProp) > 0 &&
    Number(hProp) <= 1.5 &&
    Math.abs(Number(xProp)) <= 1.5 &&
    Math.abs(Number(yProp)) <= 1.5
  ) {
    const { safeW, safeH } = safeSize(shape);
    const { PADDING } = BOARD_LAYOUT;
    return boundRect({
      x: PADDING + Number(xProp) * safeW,
      y: PADDING + Number(yProp) * safeH,
      w: Number(wProp) * safeW,
      h: Number(hProp) * safeH,
    });
  }
  const { x, y, w, h } = widget;
  if ([x, y, w, h].every((v) => typeof v === 'number' && Number.isFinite(v))) {
    return boundRect({
      x: Number(x),
      y: Number(y),
      w: Number(w),
      h: Number(h),
    });
  }
  return null;
};

export const intersection = (a: Rect, b: Rect): Rect | null => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  if (right - x <= 0 || bottom - y <= 0) return null;
  return { x, y, w: right - x, h: bottom - y };
};

export interface TemplateFill {
  zoneId: string;
}

export type TemplatePlacement<F extends TemplateFill> = F & {
  role: string;
  rect: PlacedRect;
};

export interface TemplateFillIssue {
  zoneId: string;
  problem: 'unknown-zone' | 'zone-already-filled';
}

export interface AppliedTemplate<F extends TemplateFill> {
  templateId: string;
  placements: TemplatePlacement<F>[];
  emptyZones: string[];
  issues: TemplateFillIssue[];
}

/** Places each fill on its template zone; unknown and repeated zones are reported, never guessed. */
export const applyTemplate = <F extends TemplateFill>(
  template: BoardTemplate,
  fills: readonly F[],
  screen?: ScreenShape
): AppliedTemplate<F> => {
  const used = new Set<string>();
  const placements: TemplatePlacement<F>[] = [];
  const issues: TemplateFillIssue[] = [];
  for (const fill of fills) {
    const zone = template.zones.find((z) => z.id === fill.zoneId);
    if (!zone) {
      issues.push({ zoneId: fill.zoneId, problem: 'unknown-zone' });
      continue;
    }
    if (used.has(zone.id)) {
      issues.push({ zoneId: fill.zoneId, problem: 'zone-already-filled' });
      continue;
    }
    used.add(zone.id);
    const role =
      template.slots.find((slot) => slot.zoneId === zone.id)?.role ?? zone.id;
    placements.push({ ...fill, role, rect: placeInZone(zone, screen) });
  }
  return {
    templateId: template.id,
    placements,
    emptyZones: template.zones.filter((z) => !used.has(z.id)).map((z) => z.id),
    issues,
  };
};

export interface BoardGap extends Rect {
  /** Share of the board area this empty space covers, 0 to 1. */
  share: number;
}

export interface BoardOverlap {
  a: string;
  b: string;
  rect: Rect;
}

export type DrawerSide = 'left' | 'right' | 'bottom';

export type ChromeCollision =
  | { widgetId: string; kind: ChromeBandId; rect: Rect }
  | { widgetId: string; kind: 'off-screen'; rect: Rect }
  | { widgetId: string; kind: 'drawer'; side: DrawerSide; rect: Rect };

export interface BoardAnalysis {
  gaps: BoardGap[];
  overlaps: BoardOverlap[];
  chromeCollisions: ChromeCollision[];
}

// Touching edges and rounding never count as an overlap or a collision.
const MIN_OVERLAP_PX = 2;
const MIN_GAP_PX = 120;
const MIN_GAP_SHARE = 0.03;
const MAX_GAPS = 6;
const MAX_GAP_ROUNDS = 40;

const DRAWER_WIDGET_TYPE = 'need-do-put-then';

const significant = (r: Rect | null): r is Rect =>
  r !== null && r.w >= MIN_OVERLAP_PX && r.h >= MIN_OVERLAP_PX;

/** Where Need/Do/Put/Then drawers reach when opened at their default size. */
export const drawerRects = (rect: Rect): { side: DrawerSide; rect: Rect }[] => {
  const {
    DRAWER_SIDE_MAX,
    DRAWER_SIDE_SHARE,
    DRAWER_BOTTOM_SHARE,
    DRAWER_OVERLAP_MAX,
    DRAWER_OVERLAP_SHARE,
  } = BOARD_LAYOUT;
  const sideReach =
    Math.min(DRAWER_SIDE_MAX, DRAWER_SIDE_SHARE * rect.w) -
    Math.min(DRAWER_OVERLAP_MAX, DRAWER_OVERLAP_SHARE * rect.w);
  const bottomReach =
    Math.min(DRAWER_SIDE_MAX, DRAWER_BOTTOM_SHARE * rect.h) -
    Math.min(DRAWER_OVERLAP_MAX, DRAWER_OVERLAP_SHARE * rect.h);
  return [
    {
      side: 'left',
      rect: { x: rect.x - sideReach, y: rect.y, w: sideReach, h: rect.h },
    },
    {
      side: 'right',
      rect: { x: rect.x + rect.w, y: rect.y, w: sideReach, h: rect.h },
    },
    {
      side: 'bottom',
      rect: { x: rect.x, y: rect.y + rect.h, w: rect.w, h: bottomReach },
    },
  ];
};

const offScreen = (rect: Rect, screen: ScreenShape): boolean =>
  rect.x < -1 ||
  rect.y < -1 ||
  rect.x + rect.w > screen.w + 1 ||
  rect.y + rect.h > screen.h + 1;

// Largest empty rectangles in the board area, found on the grid every widget edge draws.
const findGaps = (rects: Rect[], area: Rect): BoardGap[] => {
  const clampX = (v: number) => Math.min(area.x + area.w, Math.max(area.x, v));
  const clampY = (v: number) => Math.min(area.y + area.h, Math.max(area.y, v));
  const xs = [
    ...new Set([
      area.x,
      area.x + area.w,
      ...rects.flatMap((r) => [clampX(r.x), clampX(r.x + r.w)]),
    ]),
  ].sort((a, b) => a - b);
  const ys = [
    ...new Set([
      area.y,
      area.y + area.h,
      ...rects.flatMap((r) => [clampY(r.y), clampY(r.y + r.h)]),
    ]),
  ].sort((a, b) => a - b);
  const cols = xs.length - 1;
  const rows = ys.length - 1;
  const filled: boolean[][] = [];
  for (let r = 0; r < rows; r++) {
    const cy = (ys[r] + ys[r + 1]) / 2;
    filled.push(
      Array.from({ length: cols }, (_, c) => {
        const cx = (xs[c] + xs[c + 1]) / 2;
        return rects.some(
          (rect) =>
            cx > rect.x &&
            cx < rect.x + rect.w &&
            cy > rect.y &&
            cy < rect.y + rect.h
        );
      })
    );
  }
  const areaSize = area.w * area.h;
  const gaps: BoardGap[] = [];
  for (
    let round = 0;
    gaps.length < MAX_GAPS && round < MAX_GAP_ROUNDS;
    round++
  ) {
    let best: {
      r0: number;
      r1: number;
      c0: number;
      c1: number;
      size: number;
    } | null = null;
    const runs = new Array<number>(cols).fill(0);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) runs[c] = filled[r][c] ? 0 : runs[c] + 1;
      for (let c0 = 0; c0 < cols; c0++) {
        let minRun = Infinity;
        for (let c1 = c0; c1 < cols; c1++) {
          minRun = Math.min(minRun, runs[c1]);
          if (minRun === 0) break;
          const w = xs[c1 + 1] - xs[c0];
          const h = ys[r + 1] - ys[r + 1 - minRun];
          const size = w * h;
          if (!best || size > best.size)
            best = { r0: r + 1 - minRun, r1: r, c0, c1, size };
        }
      }
    }
    if (!best) break;
    const gap = {
      x: xs[best.c0],
      y: ys[best.r0],
      w: xs[best.c1 + 1] - xs[best.c0],
      h: ys[best.r1 + 1] - ys[best.r0],
    };
    if (best.size / areaSize < MIN_GAP_SHARE) break;
    // A thin strip is not a gap, but smaller real gaps may still sit beside it.
    if (gap.w >= MIN_GAP_PX && gap.h >= MIN_GAP_PX)
      gaps.push({ ...gap, share: best.size / areaSize });
    for (let r = best.r0; r <= best.r1; r++)
      for (let c = best.c0; c <= best.c1; c++) filled[r][c] = true;
  }
  return gaps;
};

/** Empty space, overlapping widgets, and widgets under the app's buttons, dock or off the screen. */
export const analyze = (
  widgets: readonly LayoutWidget[],
  screen?: ScreenShape
): BoardAnalysis => {
  const shape = normalizeScreen(screen);
  const placed = widgets.flatMap((widget) => {
    if (isOffCanvas(widget)) return [];
    const rect = widgetRect(widget, shape);
    return rect ? [{ widget, rect }] : [];
  });

  const overlaps: BoardOverlap[] = [];
  for (let i = 0; i < placed.length; i++)
    for (let j = i + 1; j < placed.length; j++) {
      const rect = intersection(placed[i].rect, placed[j].rect);
      if (significant(rect))
        overlaps.push({ a: placed[i].widget.id, b: placed[j].widget.id, rect });
    }

  const bands = chromeBands(shape);
  const chromeCollisions: ChromeCollision[] = [];
  for (const { widget, rect } of placed) {
    if (offScreen(rect, shape))
      chromeCollisions.push({ widgetId: widget.id, kind: 'off-screen', rect });
    const underDock = bands.some(
      (band) => band.id === 'dock' && significant(intersection(rect, band))
    );
    for (const band of bands) {
      // The board buttons sit inside the dock band; report them only for widgets that miss the dock.
      if (underDock && band.id.startsWith('board-buttons')) continue;
      const hit = intersection(rect, band);
      if (significant(hit))
        chromeCollisions.push({
          widgetId: widget.id,
          kind: band.id,
          rect: hit,
        });
    }
    if (widget.type === DRAWER_WIDGET_TYPE)
      for (const drawer of drawerRects(rect)) {
        const blocked =
          offScreen(drawer.rect, shape) ||
          bands.some((band) => significant(intersection(drawer.rect, band)));
        if (blocked)
          chromeCollisions.push({
            widgetId: widget.id,
            kind: 'drawer',
            side: drawer.side,
            rect: drawer.rect,
          });
      }
  }

  return {
    gaps: findGaps(
      placed.map((p) => p.rect),
      contentArea(shape)
    ),
    overlaps,
    chromeCollisions,
  };
};

export interface TidyResult<T extends LayoutWidget> {
  /** The snap layout every widget now sits on; null when the board needed zones from several layouts. */
  layoutId: string | null;
  widgets: (T & PlacedRect)[];
  /** Zone each widget landed on, by widget id; widgets left in place are absent. */
  zones: Record<string, string>;
  /** Widgets that found no free zone and still overlap others; the teacher should remove or rearrange some. */
  unplaced: string[];
}

const FULL_LAYOUT: SnapZoneLayout = {
  id: 'full',
  nameKey: 'full',
  zones: [{ id: 'full', x: 0, y: 0, w: 1, h: 1 }],
};

const TIDY_LAYOUTS: readonly SnapZoneLayout[] = [
  FULL_LAYOUT,
  ...SNAP_ZONE_LAYOUTS,
];

// An empty zone costs a quarter of its share of the board, so boards fill out without forcing widgets far.
const EMPTY_ZONE_WEIGHT = 0.25;
const SAME_SPOT = 1e-6;

interface Candidate {
  layoutId: string;
  zoneId: string;
  rect: Rect;
}

const moveCost = (from: Rect, to: Rect, area: Rect): number =>
  (Math.abs(from.x + from.w / 2 - (to.x + to.w / 2)) +
    Math.abs(from.w - to.w)) /
    area.w +
  (Math.abs(from.y + from.h / 2 - (to.y + to.h / 2)) +
    Math.abs(from.h - to.h)) /
    area.h;

// Cheapest way to give every widget its own zone of one layout (exact, over zone subsets).
const assignToLayout = (
  rects: Rect[],
  zones: Rect[],
  area: Rect
): { move: number; cost: number; picks: number[] } => {
  const n = rects.length;
  const z = zones.length;
  const size = 1 << z;
  const cost = new Array<number>(size).fill(Infinity);
  const from = new Array<number>(size).fill(-1);
  cost[0] = 0;
  const bits = (mask: number) => {
    let count = 0;
    for (let m = mask; m; m &= m - 1) count++;
    return count;
  };
  for (let mask = 0; mask < size; mask++) {
    if (cost[mask] === Infinity) continue;
    const i = bits(mask);
    if (i >= n) continue;
    for (let k = 0; k < z; k++) {
      if (mask & (1 << k)) continue;
      const next = mask | (1 << k);
      const total = cost[mask] + moveCost(rects[i], zones[k], area);
      if (total < cost[next]) {
        cost[next] = total;
        from[next] = k;
      }
    }
  }
  let bestMask = -1;
  for (let mask = 0; mask < size; mask++) {
    if (bits(mask) !== n || cost[mask] === Infinity) continue;
    if (bestMask < 0 || cost[mask] < cost[bestMask] - SAME_SPOT)
      bestMask = mask;
  }
  const areaSize = area.w * area.h;
  let empty = 0;
  for (let k = 0; k < z; k++)
    if (!(bestMask & (1 << k))) empty += (zones[k].w * zones[k].h) / areaSize;
  const picks = new Array<number>(n).fill(-1);
  for (let mask = bestMask, i = n - 1; mask > 0; i--) {
    const k = from[mask];
    picks[i] = k;
    mask &= ~(1 << k);
  }
  return {
    move: cost[bestMask],
    cost: cost[bestMask] + EMPTY_ZONE_WEIGHT * empty,
    picks,
  };
};

const clampInto = (rect: Rect, area: Rect): Rect => {
  const w = Math.min(rect.w, area.w);
  const h = Math.min(rect.h, area.h);
  return {
    x: Math.min(area.x + area.w - w, Math.max(area.x, rect.x)),
    y: Math.min(area.y + area.h - h, Math.max(area.y, rect.y)),
    w,
    h,
  };
};

const overlapsAny = (rect: Rect, taken: Rect[]) =>
  taken.some((other) => {
    const hit = intersection(rect, other);
    return hit !== null && hit.w >= 2 && hit.h >= 2;
  });

const tidyMovable = <T extends LayoutWidget>(
  widgets: readonly T[],
  shape: ScreenShape,
  obstacles: Rect[]
): TidyResult<T> => {
  const area = contentArea(shape);
  const fallback: Rect = {
    x: area.x + area.w / 4,
    y: area.y + area.h / 4,
    w: area.w / 2,
    h: area.h / 2,
  };
  const rects = widgets.map((w) => widgetRect(w, shape) ?? fallback);
  if (widgets.length === 0)
    return { layoutId: null, widgets: [], zones: {}, unplaced: [] };

  let best: { layout: SnapZoneLayout; picks: number[]; cost: number } | null =
    null;
  for (const layout of TIDY_LAYOUTS) {
    const free = layout.zones.filter(
      (zone) => !overlapsAny(zoneRect(zone, shape), obstacles)
    );
    if (free.length < widgets.length) continue;
    const zoneRects = free.map((zone) => zoneRect(zone, shape));
    const { move, cost, picks } = assignToLayout(rects, zoneRects, area);
    const usable = { ...layout, zones: free };
    // A board already sitting exactly on one layout keeps it, so tidying twice changes nothing.
    if (move < SAME_SPOT) {
      best = { layout: usable, picks, cost };
      break;
    }
    if (!best || cost < best.cost - SAME_SPOT)
      best = { layout: usable, picks, cost };
  }

  if (best) {
    const { layout, picks } = best;
    const zones: Record<string, string> = {};
    const placed = widgets.map((widget, i) => {
      const zone = layout.zones[picks[i]];
      zones[widget.id] = zone.id;
      return { ...widget, ...toPlacedRect(zoneRect(zone, shape), shape) };
    });
    return { layoutId: layout.id, widgets: placed, zones, unplaced: [] };
  }

  // More widgets than any layout has zones: give each the nearest free zone from any layout.
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  for (const layout of SNAP_ZONE_LAYOUTS)
    for (const zone of layout.zones) {
      const rect = zoneRect(zone, shape);
      if (overlapsAny(rect, obstacles)) continue;
      const key = [rect.x, rect.y, rect.w, rect.h]
        .map((v) => v.toFixed(3))
        .join();
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ layoutId: layout.id, zoneId: zone.id, rect });
    }

  const order = widgets.map((_, i) => i);
  const onZone = (i: number) =>
    candidates.some((c) => moveCost(rects[i], c.rect, area) < SAME_SPOT);
  order.sort((a, b) => {
    const exact = Number(onZone(b)) - Number(onZone(a));
    if (exact !== 0) return exact;
    return rects[b].w * rects[b].h - rects[a].w * rects[a].h;
  });

  const taken: Rect[] = [];
  const targets = new Array<Rect>(widgets.length);
  const zones: Record<string, string> = {};
  const unplaced: string[] = [];
  for (const i of order) {
    let pick: Candidate | null = null;
    let pickCost = Infinity;
    for (const candidate of candidates) {
      if (overlapsAny(candidate.rect, taken)) continue;
      const cost = moveCost(rects[i], candidate.rect, area);
      if (cost < pickCost - SAME_SPOT) {
        pick = candidate;
        pickCost = cost;
      }
    }
    if (pick) {
      taken.push(pick.rect);
      targets[i] = pick.rect;
      zones[widgets[i].id] = `${pick.layoutId}:${pick.zoneId}`;
    } else {
      targets[i] = clampInto(rects[i], area);
      unplaced.push(widgets[i].id);
    }
  }
  return {
    layoutId: null,
    widgets: widgets.map((widget, i) => ({
      ...widget,
      ...toPlacedRect(targets[i], shape),
    })),
    zones,
    unplaced,
  };
};

/** Moves widgets onto the best-fitting snap layout, or the nearest free zones; only geometry changes. Locked, pinned, minimized and maximized widgets stay put. */
export const tidy = <T extends LayoutWidget>(
  widgets: readonly T[],
  screen?: ScreenShape
): TidyResult<T> => {
  const shape = normalizeScreen(screen);
  const stays = (w: T) => isFixed(w) || isOffCanvas(w);
  const obstacles = widgets.flatMap((w) => {
    if (!isFixed(w) || isOffCanvas(w)) return [];
    const rect = widgetRect(w, shape);
    return rect ? [rect] : [];
  });
  const movable = widgets.filter((w) => !stays(w));
  const result = tidyMovable(movable, shape, obstacles);
  if (movable.length === widgets.length) return result;
  let next = 0;
  return {
    ...result,
    widgets: widgets.map((widget) => {
      if (!stays(widget)) return result.widgets[next++];
      const rect = widgetRect(widget, shape) ?? contentArea(shape);
      return { ...toPlacedRect(rect, shape), ...widget };
    }),
  };
};
