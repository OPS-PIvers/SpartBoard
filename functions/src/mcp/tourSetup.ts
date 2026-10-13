// Connector v2 for live tours: the tour-only step schema and the tour's setup (LIVE_TOUR_ONE_SHOT.md D5, D8).
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ToolError, type ToolContext } from './activity';
import { driveTokenFor, readDriveJson } from './drive';
import { stepInput, type Step, type StepInput } from './glTools';
import { WIDGET_TYPE_LIST } from './widgetTypeList';

const WIDGET_TYPES = new Set(WIDGET_TYPE_LIST);
const binding = stepInput.shape.tour.unwrap();

export const tourBinding = binding.extend({
  anchor: binding.shape.anchor.describe(
    'An anchor ref from list_tour_anchors: the id, plus ":<type>" for a widget type anchor and ":<type>#<key>" for a field anchor, using one of its keys. "" only for a control with no anchor yet, with fallback.'
  ),
  action: binding.shape.action.describe(
    'click: the teacher clicks the control (Autopilot clicks it for them). observe: point at it and wait for Next. toggle, select, type: set the control to value.'
  ),
  value: binding.shape.value.describe(
    'toggle: the state to reach (true or false). select: the option value. type: the text Autopilot types. Leave out on click and observe.'
  ),
  fallback: binding.shape.fallback.describe(
    'Only with anchor "": the control\'s ARIA role and English accessible name. Works in English only.'
  ),
  teacherMustClick: binding.shape.teacherMustClick.describe(
    "true: Autopilot shows the click but leaves it to the teacher. false: Autopilot clicks even a destructive control. Leave out to use the anchor's default."
  ),
  slot: binding.shape.slot.describe(
    "Which tour widget a widget control belongs to: a layouts[].slot or an earlier step's spawns.slot. Only when the board holds two of a type."
  ),
  spawns: binding.shape.spawns.describe(
    "This step's click opens a widget; place it here (xProp, yProp, wProp, hProp are fractions of the board) under a new slot."
  ),
  layoutKeyframes: binding.shape.layoutKeyframes.describe(
    'Move tour widgets, by slot, to these places when this step starts.'
  ),
  unmapped: binding.shape.unmapped.describe(
    'Read only. A recorded click whose control has no anchor yet.'
  ),
});

// A live tour step is a binding plus words: no slides, overlays, questions or media.
export const liveTourStep = stepInput
  .pick({
    id: true,
    label: true,
    text: true,
    hideStepNumber: true,
    autoAdvanceDuration: true,
    cursor: true,
    missing_anchor: true,
    has_narration: true,
  })
  .extend({
    id: stepInput.shape.id.describe(
      'Stable step id, e.g. "open-settings". update_live_tour matches steps by id.'
    ),
    label: stepInput.shape.label.describe(
      'Short title on the step card, e.g. "Open the settings".'
    ),
    text: stepInput.shape.text.describe(
      'What the teacher reads and hears: one or two sentences in the Help Center voice. **bold** marks a control name.'
    ),
    hideStepNumber: stepInput.shape.hideStepNumber.describe(
      'Hide "Step N of M" on this step.'
    ),
    autoAdvanceDuration: stepInput.shape.autoAdvanceDuration.describe(
      'Seconds an observe step stays up under Autopilot; leave out for reading pace.'
    ),
    cursor: stepInput.shape.cursor.describe(
      'hide: true keeps the animated cursor off this step.'
    ),
    tour: tourBinding,
  })
  .strict();
export type LiveTourStep = z.infer<typeof liveTourStep>;

/** A connector step as the shared step validator takes it; tour steps keep the stored interaction type or "tooltip". */
export function toStepInput(
  step: Omit<LiveTourStep, 'has_narration'>,
  prior?: Step
): StepInput {
  const kept = prior?.interactionType;
  return {
    ...step,
    interactionType:
      typeof kept === 'string'
        ? (kept as StepInput['interactionType'])
        : 'tooltip',
  } as unknown as StepInput;
}

export const tourLayout = binding.shape.spawns
  .unwrap()
  .describe(
    "A tour widget's place: slot (its stable index), type (widget type), and xProp, yProp, wProp, hProp as fractions of the board."
  );

export const TOUR_MATERIAL_KINDS = [
  'quiz',
  'video-activity',
  'guided-learning',
  'mini-app',
  'activity-wall',
] as const;
type MaterialKind = (typeof TOUR_MATERIAL_KINDS)[number];

export const tourMaterialInput = z
  .object({
    id: z
      .string()
      .min(1)
      .max(100)
      .optional()
      .describe(
        'Keep the id get_live_tour returned to keep a material; leave out for a new one.'
      ),
    kind: z.enum(TOUR_MATERIAL_KINDS),
    source: z
      .enum(['created', 'sample', 'teacher'])
      .describe(
        'created: the tour makes it (a quiz built from scratch). sample: a copy of one of your items that every teacher works on. teacher: the teacher picks one of theirs at the start, with your copy as the fallback.'
      ),
    label: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .describe(
        'What it is for, shown when the teacher picks it, e.g. "A quiz to assign".'
      ),
    from_id: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe(
        'sample and teacher: the id of one of your own items of this kind (list_quizzes, list_video_activities, list_guided_learning, list_mini_apps, list_activity_walls), copied into the tour.'
      ),
  })
  .strict();
export type TourMaterialInput = z.infer<typeof tourMaterialInput>;

// Mirrors MATERIAL_COLLECTIONS in components/tours/tourMaterialSeed.ts.
const COLLECTIONS: Record<MaterialKind, string> = {
  quiz: 'quizzes',
  'video-activity': 'video_activities',
  'guided-learning': 'guided_learning',
  'mini-app': 'miniapps',
  'activity-wall': 'activity_wall_activities',
};
const DRIVE_KINDS = new Set<MaterialKind>([
  'quiz',
  'video-activity',
  'guided-learning',
]);
// Mirrors authorFreeSnapshot: the author's Drive, account and sync ids stay out of a sample all staff can read.
const AUTHOR_KEYS = ['driveFileId', 'driveFileIds', 'authorUid', 'sync'];
const authorFree = (value: object): Record<string, unknown> => {
  const copy = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  for (const key of AUTHOR_KEYS) delete copy[key];
  return copy;
};

export interface StoredMaterial {
  id: string;
  kind: MaterialKind;
  source: 'created' | 'sample' | 'teacher';
  label: string;
  sample?: {
    meta: Record<string, unknown>;
    data: Record<string, unknown>;
    fromId: string;
    title: string;
  };
}

/** The tour's materials, copying each sample from the author's library; a material kept by id keeps its stored copy. */
export async function buildMaterials(
  ctx: ToolContext,
  input: readonly TourMaterialInput[],
  existing: readonly StoredMaterial[] = []
): Promise<StoredMaterial[]> {
  const byId = new Map(existing.map((m) => [m.id, m]));
  let token: string | null = null;
  return Promise.all(
    input.map(async (m, i): Promise<StoredMaterial> => {
      const at = `materials[${i}]`;
      const prior = m.id ? byId.get(m.id) : undefined;
      const base = {
        id: m.id ?? randomUUID(),
        kind: m.kind,
        source: m.source,
        label: m.label,
      };
      if (m.source === 'created') {
        if (m.from_id)
          throw new ToolError(
            `${at}.from_id: a created material starts empty.`
          );
        return base;
      }
      if (!m.from_id) {
        if (m.source === 'sample')
          throw new ToolError(
            `${at}.from_id: a sample needs one of your items to copy.`
          );
        return prior?.sample && prior.kind === m.kind
          ? { ...base, sample: prior.sample }
          : base;
      }
      if (prior?.sample?.fromId === m.from_id && prior.kind === m.kind)
        return { ...base, sample: prior.sample };
      const snap = await ctx.db
        .doc(`users/${ctx.uid}/${COLLECTIONS[m.kind]}/${m.from_id}`)
        .get();
      if (!snap.exists)
        throw new ToolError(
          `${at}.from_id: you have no ${m.kind} with id "${m.from_id}".`
        );
      const meta: Record<string, unknown> = {
        ...(snap.data() as Record<string, unknown>),
        id: snap.id,
      };
      let data: Record<string, unknown> = meta;
      if (DRIVE_KINDS.has(m.kind)) {
        const fileId = meta.driveFileId;
        if (typeof fileId !== 'string' || !fileId)
          throw new ToolError(`${at}.from_id: that item has no saved file.`);
        token ??= await driveTokenFor(ctx.uid);
        data = (await readDriveJson(token, fileId)) as Record<string, unknown>;
      }
      return {
        ...base,
        sample: {
          meta: authorFree(meta),
          data: authorFree(data),
          fromId: m.from_id,
          title: typeof meta.title === 'string' ? meta.title : '',
        },
      };
    })
  );
}

export interface TourSetupInput {
  tour_widgets?: string[];
  layouts?: z.infer<typeof tourLayout>[];
  use_teacher_board?: boolean;
  autopilot?: boolean;
}

export interface StoredTourSetup {
  widgets: string[];
  layouts?: z.infer<typeof tourLayout>[];
  useTeacherBoard?: true;
  autopilot?: true;
  materials?: StoredMaterial[];
}

/** The stored tourSetup: passed fields replace, the rest stay as stored. */
export function buildTourSetup(
  input: TourSetupInput,
  materials: StoredMaterial[] | undefined,
  prior: Partial<StoredTourSetup> = {}
): StoredTourSetup {
  const layouts = input.layouts ?? prior.layouts;
  if (layouts) {
    const slots = new Set<number>();
    layouts.forEach((l, i) => {
      if (!WIDGET_TYPES.has(l.type))
        throw new ToolError(
          `layouts[${i}].type "${l.type}" is not a widget type.`
        );
      if (slots.has(l.slot))
        throw new ToolError(`layouts[${i}].slot ${l.slot} is used twice.`);
      slots.add(l.slot);
    });
  }
  const widgets = [
    ...new Set([
      ...(input.tour_widgets ?? prior.widgets ?? []),
      ...(input.layouts ? input.layouts.map((l) => l.type) : []),
    ]),
  ];
  const teacherBoard =
    input.use_teacher_board ?? prior.useTeacherBoard === true;
  const autopilot = input.autopilot ?? prior.autopilot === true;
  const kept = materials ?? prior.materials;
  return {
    widgets,
    ...(layouts?.length ? { layouts } : {}),
    ...(teacherBoard ? { useTeacherBoard: true as const } : {}),
    ...(autopilot ? { autopilot: true as const } : {}),
    ...(kept?.length ? { materials: kept } : {}),
  };
}

/** A material as get_live_tour shows it: no copied content. */
export const publicMaterial = (m: StoredMaterial) => ({
  id: m.id,
  kind: m.kind,
  source: m.source,
  label: m.label,
  ...(m.sample ? { from_id: m.sample.fromId, from_title: m.sample.title } : {}),
});
