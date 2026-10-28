import type { WidgetType } from '@/types';
import { SNAP_ZONE_LAYOUTS, type SnapZone } from '@/config/snapZones';

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
