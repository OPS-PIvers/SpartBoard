import { HttpsError } from 'firebase-functions/v2/https';
import { BOARD_TEMPLATES } from './mcp/boardEngine.gen';
import { WIDGET_TYPE_LIST } from './mcp/widgetTypeList';

// Magic Board's template mode (docs/plans/shipped/AI_BOARDS.md D12): the AI picks a template and fills its zones.

export interface TemplateLayoutSlot {
  zoneId: string;
  widgetType: string;
  config: Record<string, unknown>;
}

export interface TemplateLayout {
  templateId: string;
  slots: TemplateLayoutSlot[];
}

const PROMPT_WIDGETS: ReadonlyArray<readonly [string, string]> = [
  ['clock', 'Digital/analog clock'],
  ['time-tool', 'Timer/Stopwatch'],
  ['countdown', 'Countdown to a date or event'],
  ['traffic', 'Traffic light for behavior/status'],
  ['text', 'Simple sticky note/text area'],
  ['checklist', 'To-do list'],
  ['random', 'Student/item picker'],
  ['dice', 'Random dice roller'],
  ['sound', 'Noise level meter'],
  ['drawing', 'Sketchpad'],
  ['qr', 'QR code generator'],
  ['embed', 'Website embedder'],
  ['poll', 'Multiple choice poll'],
  ['quiz', 'Interactive classroom quizzes'],
  ['webcam', 'Live camera feed with OCR capabilities'],
  ['scoreboard', 'Point tracker'],
  ['expectations', 'Classroom expectations icons'],
  ['weather', 'Local weather display'],
  ['schedule', 'Daily class schedule'],
  ['calendar', 'Monthly events'],
  ['lunchCount', 'Student meal tracker'],
  ['classes', 'Class/Period selector'],
  [
    'instructionalRoutines',
    'Library of teaching strategies (e.g. Think-Pair-Share)',
  ],
  ['materials', 'Visual list of required student supplies'],
  ['stickers', 'Reward/decorative stickers'],
  ['seating-chart', 'Classroom layout manager'],
  ['catalyst', 'Instructional warm-ups/activities'],
];

const describeTemplates = (allowed: ReadonlySet<string> | null): string =>
  BOARD_TEMPLATES.map((template) => {
    const zones = template.slots
      .map((slot) => {
        const suggested = slot.suggestedWidgets.filter(
          (type) => !allowed || allowed.has(type)
        );
        const hint =
          suggested.length > 0 ? ` (suggested: ${suggested.join(', ')})` : '';
        return `    - zoneId "${slot.zoneId}": ${slot.role}${hint}`;
      })
      .join('\n');
    return `  - templateId "${template.id}" (${template.name}): ${template.whenToUse}\n${zones}`;
  }).join('\n');

const describeWidgets = (allowed: ReadonlySet<string> | null): string =>
  PROMPT_WIDGETS.filter(([type]) => !allowed || allowed.has(type))
    .map(([type, description]) => `          - ${type}: ${description}`)
    .join('\n');

/** `allowed` limits the widgets offered to the ones the teacher can use; null offers them all. */
export const templateLayoutSystemPrompt = (
  allowed: ReadonlySet<string> | null = null
): string => `
          You are an expert instructional designer and classroom space planner. Based on the user's lesson description provided within <lesson_description> tags, choose ONE board template and fill its zones with interactive widgets.

          Board templates (each zone already has a fixed place on the screen):
${describeTemplates(allowed)}

          Available Widgets (use EXACT type strings):
${describeWidgets(allowed)}
          Any widget named in a zone's suggestions may also be used. Never use a widget that is not listed here or in a suggestion.

          Rules:
          1. Pick the template whose description best fits the lesson.
          2. Use only that template's zone ids, and put at most one widget in each zone.
          3. Prefer each zone's suggested widgets. Leave a zone out rather than filling it with a widget the lesson does not need.
          4. 'config' should be an empty object {} unless you are setting a specific property known to that widget (like 'question' for 'poll').

          Return JSON: { "templateId": "...", "slots": [{ "zoneId": "...", "widgetType": "...", "config": {} }] }

          Example Payload for a 'Review Game' (shows the format only; use only the widgets listed above):
          {
            "templateId": "review-game",
            "slots": [
              { "zoneId": "side", "widgetType": "scoreboard", "config": {} },
              { "zoneId": "main", "widgetType": "poll", "config": { "question": "Who won the war of 1812?" } }
            ]
          }
        `;

const KNOWN_WIDGETS = new Set(WIDGET_TYPE_LIST);

// Every widget the prompt can name, in its list or in a zone's suggestions.
const OFFERED_WIDGETS = new Set<string>([
  ...PROMPT_WIDGETS.map(([type]) => type),
  ...BOARD_TEMPLATES.flatMap((t) => t.slots.flatMap((s) => s.suggestedWidgets)),
]);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Most widget types a request may list; more than every known type means a bad caller. */
const MAX_ALLOWED_WIDGETS = 200;

/** Reads the teacher's allowed widget types; null when not sent. Unknown types are dropped. */
export const readAllowedWidgets = (raw: unknown): Set<string> | null => {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw) || raw.length > MAX_ALLOWED_WIDGETS) {
    throw new HttpsError('invalid-argument', 'Invalid allowed widget list.');
  }
  const allowed = new Set<string>();
  for (const type of raw as unknown[]) {
    if (typeof type === 'string' && KNOWN_WIDGETS.has(type)) allowed.add(type);
  }
  if (![...allowed].some((type) => OFFERED_WIDGETS.has(type))) {
    throw new HttpsError(
      'failed-precondition',
      'No widgets are available to build a board with.'
    );
  }
  return allowed;
};

/** Keeps the AI's answer to a known template, its zones (once each) and known, allowed widget types; null when unusable. */
export const normalizeTemplateLayout = (
  parsed: Record<string, unknown>,
  allowed: ReadonlySet<string> | null = null
): TemplateLayout | null => {
  const templateId = parsed.templateId;
  if (typeof templateId !== 'string') return null;
  const template = BOARD_TEMPLATES.find((t) => t.id === templateId);
  if (!template || !Array.isArray(parsed.slots)) return null;
  const zoneIds = new Set(template.zones.map((zone) => zone.id));
  const used = new Set<string>();
  const slots: TemplateLayoutSlot[] = [];
  for (const raw of parsed.slots as unknown[]) {
    if (!isPlainObject(raw)) continue;
    const { zoneId, widgetType, config } = raw;
    if (typeof zoneId !== 'string' || typeof widgetType !== 'string') continue;
    if (!zoneIds.has(zoneId) || used.has(zoneId)) continue;
    if (!KNOWN_WIDGETS.has(widgetType)) continue;
    if (allowed && !allowed.has(widgetType)) continue;
    used.add(zoneId);
    slots.push({
      zoneId,
      widgetType,
      config: isPlainObject(config) ? config : {},
    });
  }
  return slots.length > 0 ? { templateId, slots } : null;
};
