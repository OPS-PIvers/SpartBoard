// The connector's live tour check: hard errors refuse a save, warnings ride along (LIVE_TOUR_ONE_SHOT.md D6).
import { TOUR_ANCHOR_LIST } from './tourAnchorList';
import { WIDGET_TYPE_LIST } from './widgetTypeList';
import { SETTINGS_FIELD_LIST } from './settingsFieldList';

type AnchorEntry = (typeof TOUR_ANCHOR_LIST)[number];

const ANCHORS = new Map<string, AnchorEntry>(
  TOUR_ANCHOR_LIST.map((a) => [a.id, a])
);
// The runner sets these up itself before it looks for the anchor.
const AUTO_OPENED = new Set([
  'dock-expanded',
  'widget-selected',
  'widget-restored',
  'in-view',
  'settings-open',
]);
const WIDGET_TYPES = new Set(WIDGET_TYPE_LIST);
// A row in a teacher's own list; menu item positions and Help Center rows are the same for everyone.
const POSITIONAL = /(^|[#-])row-\d+/;
const SHARED_LISTS = new Set(['help-center']);
// Settings field kinds that hold no list of options, with the action that does work on them.
const NOT_CHOICE: Record<string, string> = {
  text: 'type',
  textarea: 'type',
  number: 'type',
  slider: 'click',
  list: 'click',
  imageUpload: 'click',
};
const MIN_STEPS = 3;
const MAX_GOOD_STEPS = 15;

export interface TourBindingLike {
  anchor: string;
  action: string;
  value?: unknown;
  slot?: number;
  spawns?: { slot: number; type: string };
}

export interface DryRunStep {
  id: string;
  label?: string;
  text?: string;
  tour?: TourBindingLike;
}

export interface DryRunSetup {
  widgets: readonly string[];
  layouts?: readonly { slot: number; type: string }[];
  materials?: readonly unknown[];
  useTeacherBoard?: boolean;
}

export interface TourProblem {
  step?: number;
  step_id?: string;
  message: string;
}

export interface DryRunReport {
  errors: TourProblem[];
  warnings: TourProblem[];
}

interface Ref {
  id: string;
  type?: string;
  key?: string;
}

export const parseRef = (ref: string): Ref => {
  const [head, key] = ref.split('#');
  const [id, type] = head.split(':');
  return { id, type: type || undefined, key: key || undefined };
};

/** Whether `clicked` is the control `wanted` names: same id, and the same type and key where `wanted` gives them. */
const sameControl = (wanted: Ref, clicked: Ref): boolean =>
  wanted.id === clicked.id &&
  (!wanted.type || wanted.type === clicked.type) &&
  (!wanted.key || wanted.key === clicked.key);

const stepName = (step: DryRunStep, i: number) =>
  `steps[${i}]${step.label ? ` ("${step.label}")` : ''}`;

/** Checks a tour's steps and setup the way playback will meet them. */
export function dryRunTour(
  steps: readonly DryRunStep[],
  setup: DryRunSetup
): DryRunReport {
  const errors: TourProblem[] = [];
  const warnings: TourProblem[] = [];
  const sandboxed = (setup.materials?.length ?? 0) > 0;
  const onStage = new Set<string>([
    ...setup.widgets,
    ...(setup.layouts ?? []).map((l) => l.type),
  ]);
  const slots = new Set<number>((setup.layouts ?? []).map((l) => l.slot));
  const unbound = new Set<number>();
  const clicked: Ref[] = [];
  // Surfaces an earlier step pointed into, so they were open by then.
  const visited = new Set<string>();

  steps.forEach((step, i) => {
    const at = { step: i, step_id: step.id };
    const name = stepName(step, i);
    const fail = (message: string) =>
      errors.push({ ...at, message: `${name}: ${message}` });
    const warn = (message: string) =>
      warnings.push({ ...at, message: `${name}: ${message}` });
    const b = step.tour;
    if (!step.text?.trim())
      warn('has no text; every step should tell the teacher what to do.');
    if (!b) return;

    if (
      (b.action === 'type' || b.action === 'select') &&
      (b.value === undefined || b.value === '')
    )
      warn(
        'has no value, so Autopilot hands it to the teacher; give one unless the choice is theirs (their class, an ID or link).'
      );

    if (b.anchor === 'editor.save:quiz')
      warn(
        "points at the quiz editor's Save, which only the PLC editor shows; the quiz editor saves as you go, so end with editor.close:quiz."
      );

    if (b.slot !== undefined && !slots.has(b.slot) && !unbound.has(b.slot)) {
      unbound.add(b.slot);
      warn(
        `slot ${b.slot} is not a widget in layouts or spawned by an earlier step, so its steps use the first widget of their type.`
      );
    }

    if (b.anchor === '') {
      warn(
        'has no anchor, so it is found by its English role and name only, and it is queued for a developer to tag.'
      );
    } else {
      const ref = parseRef(b.anchor);
      const entry = ANCHORS.get(ref.id);
      if (!entry) {
        fail(`"${ref.id}" is not a registered anchor (list_tour_anchors).`);
      } else {
        checkAnchor(b, ref, entry, {
          fail,
          warn,
          sandboxed,
          onStage,
          clicked,
          visited,
          teacherBoard: !!setup.useTeacherBoard,
        });
        for (const r of routesOf(entry)) visited.add(r.surface);
      }
      if (b.action !== 'observe') clicked.push(ref);
      // A click on a dock tile adds that widget.
      if (ref.id === 'dock.item' && ref.type && b.action !== 'observe')
        onStage.add(ref.type);
    }
    if (b.spawns) {
      slots.add(b.spawns.slot);
      onStage.add(b.spawns.type);
    }
  });

  if (steps.length < MIN_STEPS)
    warnings.push({
      message: `The tour has ${steps.length} step${steps.length === 1 ? '' : 's'}; a useful tour usually has at least ${MIN_STEPS}.`,
    });
  if (steps.length > MAX_GOOD_STEPS)
    warnings.push({
      message: `The tour has ${steps.length} steps; past ${MAX_GOOD_STEPS}, split it into shorter tours.`,
    });
  return { errors, warnings };
}

function checkAnchor(
  b: TourBindingLike,
  ref: Ref,
  entry: AnchorEntry,
  ctx: {
    fail: (m: string) => void;
    warn: (m: string) => void;
    sandboxed: boolean;
    onStage: ReadonlySet<string>;
    clicked: readonly Ref[];
    visited: ReadonlySet<string>;
    teacherBoard: boolean;
  }
) {
  const { fail, warn } = ctx;
  if (entry.scope === 'widget type' && !ref.type)
    return fail(
      `"${ref.id}" is one control per widget type; write "${ref.id}:<type>".`
    );
  if (entry.scope === 'field' && (!ref.type || !ref.key))
    return fail(
      `"${ref.id}" is one control per field; write "${ref.id}:<type>#<key>".`
    );
  const keys = 'keys' in entry ? entry.keys : undefined;
  if (keys && (entry.scope === 'widget type' || entry.scope === 'field')) {
    const suffix =
      entry.scope === 'field' ? `${ref.type}#${ref.key}` : `${ref.type}`;
    if (!keys.includes(suffix)) {
      const shown = keys.slice(0, 12).join(', ');
      return fail(
        `"${suffix}" is not a ${entry.scope === 'field' ? 'field' : 'type'} of "${ref.id}". Valid: ${shown}${keys.length > 12 ? ', …' : ''}.`
      );
    }
  } else if (entry.key_pattern) {
    const suffix =
      entry.scope === 'field' ? `${ref.type}#${ref.key}` : `${ref.type}`;
    if (!new RegExp(`^(?:${entry.key_pattern})$`).test(suffix))
      return fail(
        `"${suffix}" is not a key of "${ref.id}". Keys look like ${entry.key_hint ?? entry.key_pattern}.`
      );
  }
  if (b.action === 'select') {
    const wrong = notAChoice(b.anchor, ref, entry);
    if (wrong) return fail(wrong);
  }

  if (
    POSITIONAL.test(`${ref.key ?? ''}`) &&
    !SHARED_LISTS.has(ref.id.split('.')[0]) &&
    !ctx.sandboxed &&
    !openedEmpty(ref, ctx.clicked)
  )
    warn(
      `"${b.anchor}" points at a position in a list, which differs on each teacher's board; use a tour material so the tour controls what is there.`
    );
  if (entry.persists && b.action !== 'observe') {
    const absorbed = ctx.sandboxed && 'sandboxed' in entry && !!entry.sandboxed;
    if (!absorbed)
      warn(
        `"${ref.id}" changes the teacher's real account, so Autopilot leaves this click to the teacher.`
      );
  }

  const routes = routesOf(entry);
  const needsWidget =
    routes.length > 0 &&
    routes.every((r) => r.needs?.includes('widget-on-stage'));
  const widget =
    routes.find((r) => r.widget_type)?.widget_type ??
    (ref.type && WIDGET_TYPES.has(ref.type) ? ref.type : undefined);
  if (needsWidget && widget && !ctx.teacherBoard && !ctx.onStage.has(widget))
    fail(
      `"${b.anchor}" is on the ${widget} widget, which is not on the board yet. Add "${widget}" to tour_widgets, or click "dock.item:${widget}" in an earlier step.`
    );

  if (entry.requires && AUTO_OPENED.has(entry.requires)) return;
  if (routes.length === 0 || routes.some((r) => r.kind === 'shared')) return;
  const mapped = routes.filter((r) => r.path !== undefined);
  if (mapped.length === 0) return;
  const open = mapped.some((r) => {
    const path = r.path ?? [];
    const last = path[path.length - 1];
    return (
      !last ||
      (ctx.visited.has(r.surface) && !('reveal' in r && r.reveal)) ||
      ctx.clicked.some((c) => sameControl(parseRef(last), c)) ||
      ('opened_by' in r &&
        (r.opened_by ?? []).some((o) =>
          ctx.clicked.some((c) => sameControl(parseRef(o), c))
        ))
    );
  });
  if (!open) {
    const best = mapped.reduce((a, r) =>
      (r.path?.length ?? 0) < (a.path?.length ?? 0) ? r : a
    );
    const path = best.path ?? [];
    fail(
      `"${b.anchor}" only shows once "${path[path.length - 1]}" is clicked, and no earlier step clicks it. The clicks from the board are: ${path.join(' → ')}.`
    );
  }
}

/** Whether an earlier click opened this anchor's list empty, so its rows are ones the tour added. */
const openedEmpty = (ref: Ref, clicked: readonly Ref[]): boolean =>
  clicked.some((c) => {
    const entry = ANCHORS.get(c.id);
    return (
      !!entry &&
      'opens_empty' in entry &&
      entry.opens_empty === ref.id.split('.')[0]
    );
  });

/** Why `select` can't work on this control, or null when it may be a choice. */
function notAChoice(
  anchor: string,
  ref: Ref,
  entry: AnchorEntry
): string | null {
  if (entry.cycles)
    return `"${ref.id}" is a button that moves to the next option on each click, so "select" can't pick one. Point the step at "${entry.cycles}" and select the value there.`;
  if (ref.id === 'settings.toggle')
    return `"${anchor}" is an on/off switch; use "toggle" with value true or false.`;
  if (ref.id !== 'settings.field' || !ref.type) return null;
  const fields = Object.prototype.hasOwnProperty.call(
    SETTINGS_FIELD_LIST,
    ref.type
  )
    ? SETTINGS_FIELD_LIST[ref.type]
    : [];
  const kind = fields.find((f) => f.anchor === anchor)?.kind;
  const action = kind ? NOT_CHOICE[kind] : undefined;
  return action
    ? `"${anchor}" is a ${kind} field, not a choice, so "select" can't set it; use "${action}".`
    : null;
}

const routesOf = (entry: AnchorEntry) =>
  'routes' in entry ? (entry.routes ?? []) : [];
