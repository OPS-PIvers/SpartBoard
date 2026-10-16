// The connector's live tour check: hard errors refuse a save, warnings ride along (LIVE_TOUR_ONE_SHOT.md D6).
import { TOUR_ANCHOR_LIST } from './tourAnchorList';
import { WIDGET_TYPE_LIST } from './widgetTypeList';
import { SETTINGS_FIELD_LIST } from './settingsFieldList';
import { copyProblem } from './tourCopy';

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
// Surfaces a Close or Cancel with closes 'own' can shut: the innermost one a step is on.
const DIALOG_KINDS = new Set([
  'editor',
  'modal',
  'panel',
  'menu',
  'settings-drawer',
  'sidebar',
]);
const FILLER = /\b(simply|just|easily)\b/i;
const LABEL_ARTICLE = /^(a|an|the|your|this)$/i;
// Text in an anchor ref or surface id that shows a step works on a material of this kind.
const MATERIAL_TOKENS: Record<string, readonly string[]> = {
  quiz: ['quiz'],
  'video-activity': ['video-activity'],
  'guided-learning': ['guided-learning', 'guidedlearning', 'gl-'],
  'mini-app': ['mini-app', 'miniapp'],
  'activity-wall': ['activity-wall'],
};

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

export interface DryRunOptions {
  /** How a tour that doesn't open on board.whole and close on an observe is reported; unchecked when absent. */
  bookends?: 'error' | 'warn';
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

const routesOf = (entry: AnchorEntry) =>
  'routes' in entry ? (entry.routes ?? []) : [];

// Each surface's clicks from the board, without a tab or menu inside it.
const SURFACE_PATHS = new Map<string, readonly string[]>();
for (const entry of TOUR_ANCHOR_LIST)
  for (const r of routesOf(entry)) {
    if (!r.path || SURFACE_PATHS.has(r.surface)) continue;
    SURFACE_PATHS.set(r.surface, r.reveal ? r.path.slice(0, -1) : r.path);
  }

/** Problems with the opening and closing steps (LIVE_TOUR_CONSISTENT_START.md C8). */
export function bookendProblems(steps: readonly DryRunStep[]): TourProblem[] {
  if (steps.length === 0) return [];
  const out: TourProblem[] = [];
  const first = steps[0];
  if (first.tour?.anchor !== 'board.whole' || first.tour.action !== 'observe')
    out.push({
      step: 0,
      step_id: first.id,
      message: `${stepName(first, 0)}: the first step should observe "board.whole" and name the goal.`,
    });
  const at = steps.length - 1;
  const last = steps[at];
  if (last.tour?.action !== 'observe')
    out.push({
      step: at,
      step_id: last.id,
      message: `${stepName(last, at)}: the last step should be an observe step, usually on "board.whole", that says what the teacher can do now.`,
    });
  return out;
}

export const meetsBookends = (steps: readonly DryRunStep[]): boolean =>
  bookendProblems(steps).length === 0;

/** Voice rules from the guide that a step's label and text break. */
function voiceProblems(step: DryRunStep): string[] {
  const out: string[] = [];
  const text = step.text?.trim();
  if (text) {
    const problem = copyProblem(text);
    if (problem === 'em dash')
      out.push('text has an em dash; use a period or a comma.');
    else if (problem === 'Tip/Note prefix')
      out.push('text starts with "Tip:" or "Note:"; say it plainly.');
    else if (problem)
      out.push(`text is ${problem}; keep it to one or two short sentences.`);
    const filler = FILLER.exec(text);
    if (filler) out.push(`text says "${filler[1]}"; leave it out.`);
  }
  const label = step.label?.trim();
  if (label) {
    const words = label.split(/\s+/);
    if (words.length < 2 || words.length > 5)
      out.push(
        `label is ${words.length} word${words.length === 1 ? '' : 's'}; use 2 to 5, starting with a verb.`
      );
    if (LABEL_ARTICLE.test(words[0]))
      out.push(`label starts with "${words[0]}"; start with a verb.`);
  }
  return out;
}

/** Checks a tour's steps and setup the way playback will meet them. */
export function dryRunTour(
  steps: readonly DryRunStep[],
  setup: DryRunSetup,
  options: DryRunOptions = {}
): DryRunReport {
  const errors: TourProblem[] = [];
  const warnings: TourProblem[] = [];
  const sandboxed = (setup.materials?.length ?? 0) > 0;
  const staged = [
    ...new Set([...setup.widgets, ...(setup.layouts ?? []).map((l) => l.type)]),
  ];
  const onStage = new Set<string>(staged);
  const slotTypes = new Map<number, string>(
    (setup.layouts ?? []).map((l) => [l.slot, l.type])
  );
  const slots = new Set<number>(slotTypes.keys());
  const unbound = new Set<number>();
  const clicked: Ref[] = [];
  // Surfaces an earlier step pointed into, so they were open by then.
  const visited = new Set<string>();
  // The same, less what a Close or Cancel shut since, with the step that shut each.
  const live: LiveState = {
    clicked: [],
    visited: new Set(),
    dialogs: [],
    closedBy: new Map(),
  };
  const pointed = new Set<string>();
  let pointsAtAnyWidget = false;
  const touched: string[] = [];
  let lastSettings: string | null = null;

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
    for (const problem of voiceProblems(step)) warn(problem);
    if (!b) {
      lastSettings = null;
      return;
    }

    if (
      (b.action === 'type' || b.action === 'select') &&
      (b.value === undefined || b.value === '')
    )
      warn(
        'has no value, so Autopilot hands it to the teacher; give one unless the choice is theirs (their class, an ID or link).'
      );

    const autosaved = /^editor\.save:(quiz|video-activity)$/.exec(b.anchor);
    if (autosaved) {
      const kind = autosaved[1] === 'quiz' ? 'quiz' : 'video activity';
      warn(
        `points at the ${kind} editor's Save, which only the PLC editor shows; the ${kind} editor saves as you go, so end with editor.close:${autosaved[1]}.`
      );
    }

    if (b.slot !== undefined && !slots.has(b.slot) && !unbound.has(b.slot)) {
      unbound.add(b.slot);
      warn(
        `slot ${b.slot} is not a widget in layouts or spawned by an earlier step, so its steps use the first widget of their type.`
      );
    }

    let settingsOn: string | null = null;
    if (b.anchor === '') {
      warn(
        'has no anchor, so it is found by its English role and name only, and it is queued for a developer to tag.'
      );
    } else {
      const ref = parseRef(b.anchor);
      const entry = ANCHORS.get(ref.id);
      const routes = entry ? routesOf(entry) : [];
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
          live,
          teacherBoard: !!setup.useTeacherBoard,
        });
        const closes = !!entry.closes && b.action !== 'observe';
        for (const r of routes) {
          visited.add(r.surface);
          if (closes) continue;
          live.visited.add(r.surface);
          if (DIALOG_KINDS.has(r.kind)) live.dialogs.push(r.surface);
        }
      }
      if (b.action !== 'observe') {
        clicked.push(ref);
        live.clicked.push(ref);
      }
      if (entry?.closes && b.action !== 'observe')
        closeSurfaces(entry, name, live);
      // A click on a dock tile adds that widget.
      if (ref.id === 'dock.item' && ref.type && b.action !== 'observe') {
        if (setup.widgets.includes(ref.type))
          warn(
            `adds "${ref.type}" from the Dock, but tour_widgets already stages one, so the board ends up with two; take "${ref.type}" out of tour_widgets.`
          );
        onStage.add(ref.type);
      }
      const types = [
        ...(ref.type && WIDGET_TYPES.has(ref.type) ? [ref.type] : []),
        ...(b.slot !== undefined && slotTypes.has(b.slot)
          ? [slotTypes.get(b.slot) as string]
          : []),
        ...routes.flatMap((r) => (r.widget_type ? [r.widget_type] : [])),
      ];
      for (const t of types) pointed.add(t);
      if (entry?.scope === 'widget' && types.length === 0)
        pointsAtAnyWidget = true;
      touched.push(
        [b.anchor, ...routes.flatMap((r) => [r.surface, r.widget_type ?? ''])]
          .join(' ')
          .toLowerCase()
      );
      if (
        routes.length > 0 &&
        routes.every((r) => r.kind === 'settings-drawer')
      ) {
        settingsOn =
          b.slot !== undefined ? `slot ${b.slot}` : (ref.type ?? null);
        if (settingsOn && lastSettings && settingsOn !== lastSettings)
          warn(
            `is a settings step on a different widget from the step before it, so the runner shuts that drawer and opens this one with no step showing it; add a step that clicks "widget.settings-opener" on this widget first.`
          );
      }
    }
    lastSettings = settingsOn;
    if (b.spawns) {
      slots.add(b.spawns.slot);
      slotTypes.set(b.spawns.slot, b.spawns.type);
      onStage.add(b.spawns.type);
    }
  });

  const onlyWholeBoard = steps.every((s) => s.tour?.anchor === 'board.whole');
  if (!pointsAtAnyWidget && !onlyWholeBoard)
    for (const type of staged)
      if (!pointed.has(type))
        warnings.push({
          message: `tour_widgets stages "${type}", but no step points at it; take it out, or add a step on it.`,
        });
  const kinds = new Set(
    (setup.materials ?? []).flatMap((m) => {
      const kind = (m as { kind?: unknown } | null)?.kind;
      return typeof kind === 'string' ? [kind] : [];
    })
  );
  for (const kind of kinds) {
    const tokens = MATERIAL_TOKENS[kind] ?? [kind];
    if (!touched.some((t) => tokens.some((token) => t.includes(token))))
      warnings.push({
        message: `materials: no step opens the ${kind}; take it out, or add the steps that use it.`,
      });
  }
  if (options.bookends)
    (options.bookends === 'error' ? errors : warnings).push(
      ...bookendProblems(steps)
    );

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
    live: LiveState;
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
  const best = mapped.reduce((a, r) =>
    (r.path?.length ?? 0) < (a.path?.length ?? 0) ? r : a
  );
  const path = best.path ?? [];
  const last = path[path.length - 1];
  if (!isOpen(mapped, ctx.clicked, ctx.visited))
    return fail(
      `"${b.anchor}" only shows once "${last}" is clicked, and no earlier step clicks it. The clicks from the board are: ${path.join(' → ')}.`
    );
  if (!isOpen(mapped, ctx.live.clicked, ctx.live.visited)) {
    const closer =
      mapped
        .map((r) => ctx.live.closedBy.get(r.surface))
        .find((c) => c !== undefined) ??
      ctx.live.closedBy.get(last) ??
      'an earlier step';
    warn(
      `"${b.anchor}" is on a panel that ${closer} closed, and no step after that opens it again; click "${last}" first.`
    );
  }
}

type Route = ReturnType<typeof routesOf>[number];

const isOpen = (
  mapped: readonly Route[],
  clicked: readonly Ref[],
  visited: ReadonlySet<string>
): boolean =>
  mapped.some((r) => {
    const path = r.path ?? [];
    const last = path[path.length - 1];
    return (
      !last ||
      (visited.has(r.surface) && !r.reveal) ||
      clicked.some((c) => sameControl(parseRef(last), c)) ||
      (r.opened_by ?? []).some((o) =>
        clicked.some((c) => sameControl(parseRef(o), c))
      )
    );
  });

interface LiveState {
  clicked: Ref[];
  visited: Set<string>;
  /** Dialog surfaces in the order steps went into them. */
  dialogs: string[];
  /** Step name that closed each surface or opener ref. */
  closedBy: Map<string, string>;
}

/** Undoes the opening of what a Close or Cancel shuts, and of every surface opened from inside it. */
function closeSurfaces(entry: AnchorEntry, by: string, live: LiveState) {
  const own = routesOf(entry)
    .filter((r) => r.kind !== 'shared' && live.visited.has(r.surface))
    .map((r) => r.surface);
  const innermost = [...live.dialogs]
    .reverse()
    .find((s) => live.visited.has(s));
  const targets =
    entry.closes !== 'own'
      ? [entry.closes as string]
      : own.length
        ? own
        : innermost
          ? [innermost]
          : [];
  const forget = new Set<string>();
  for (const target of targets) {
    const path =
      SURFACE_PATHS.get(target) ??
      (target === entry.closes ? entry.closes_path : undefined) ??
      [];
    const opener = path[path.length - 1];
    live.visited.delete(target);
    live.closedBy.set(target, by);
    if (!opener) continue;
    forget.add(opener);
    live.closedBy.set(opener, by);
    for (const [surface, inner] of SURFACE_PATHS) {
      const at = inner.indexOf(opener);
      if (at < 0) continue;
      if (live.visited.delete(surface)) live.closedBy.set(surface, by);
      for (const ref of inner.slice(at)) {
        forget.add(ref);
        live.closedBy.set(ref, by);
      }
    }
  }
  const refs = [...forget].map(parseRef);
  live.clicked = live.clicked.filter(
    (c) => !refs.some((r) => sameControl(r, c))
  );
  live.dialogs = live.dialogs.filter((s) => live.visited.has(s));
}

/** Whether an earlier click opened this anchor's list empty, so its rows are ones the tour added. */
const openedEmpty = (ref: Ref, clicked: readonly Ref[]): boolean =>
  clicked.some((c) => ANCHORS.get(c.id)?.opens_empty === ref.id.split('.')[0]);

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
